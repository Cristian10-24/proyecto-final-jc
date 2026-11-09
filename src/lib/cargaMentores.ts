import ExcelJS from "exceljs";
import type { ObjectId } from "mongodb";
import { horaCO } from "./ciudades";
import { collections } from "./db";
import { horaCOL } from "./edicion";
import { sinFormula } from "./evaluacion/resultados";
import { modoOrdenLlegada } from "./modoCupos";

// Fase 4 · Paso 24 · Carga de los mentores (SOLO LECTURA: aquí no se escribe nada).
// Por día, mentor y hora: cuántos proyectos tiene, con las horas de 1 o 2 proyectos marcadas y las horas sueltas (con
// huecos alrededor). Además, propuestas para juntar los proyectos de cada hora en menos mentores (cada uno con al menos
// 3 si alcanza): primero cambio de mentor en el MISMO bloque (el estudiante no cambia de hora); si no hay cupo, otro
// bloque de la misma hora («cambia la hora del estudiante»). Nunca otro día ni proyectos evaluados. El admin las aplica
// a mano en el Tablero.

export type HoraMentor = {
  hora: number; proyectos: number; asientos: number;
  /** 1 o 2 proyectos en la hora. */
  poca: boolean;
  /** Hora con proyectos sin proyectos en la hora anterior ni en la siguiente, habiendo otras horas ese día. */
  suelta: boolean;
};
export type FilaMentor = { mentorId: string; nombre: string; total: number; horas: HoraMentor[] };
export type Propuesta = {
  proyecto: { id: string; codigo: string; nombre: string; ciudad: string };
  de: { mentor: string; inicio: string }; a: { mentor: string; inicio: string };
  cambiaHora: boolean;
  /** Con el modo orden de llegada apagado: el asiento de destino es de otra ciudad. */
  otraCiudad: boolean;
};
export type HoraResumen = { hora: number; proyectos: number; mentoresAntes: number; mentoresDespues: number; propuestas: Propuesta[] };
export type CargaDia = { dia: string; horas: number[]; mentores: FilaMentor[]; resumen: HoraResumen[] };
export type CargaMentores = { dias: string[]; dia: CargaDia | null };

type AsientoC = { _id: ObjectId; inicio: Date; mentorId: string; ciudades: string[]; proyectoId: ObjectId | null };
type ProyectoC = { _id: ObjectId; codigo: string; nombre: string; ciudad: string };

export const MINIMO = 3;

/** Horas con proyectos de un mentor en el día → cuáles son sueltas. */
export function sueltas(horasConProyectos: number[]): Set<number> {
  const h = new Set(horasConProyectos);
  if (h.size < 2) return new Set();
  return new Set([...h].filter((x) => !h.has(x - 1) && !h.has(x + 1)));
}

/**
 * Propuestas para una hora (función pura). Se quedan los mentores con proyectos evaluados (no se mueven) y luego los
 * de más proyectos, hasta que su cupo alcanza para todos; los demás ceden sus proyectos.
 */
export function proponerHora(
  asientos: AsientoC[], proyectos: Map<string, ProyectoC>, evaluados: Set<string>, ordenLlegada: boolean, nombreMentor: (id: string) => string,
): { propuestas: Propuesta[]; mentoresAntes: number; mentoresDespues: number } {
  const porMentor = new Map<string, AsientoC[]>();
  for (const a of asientos) porMentor.set(a.mentorId, [...(porMentor.get(a.mentorId) ?? []), a]);
  const ocupados = (m: string) => (porMentor.get(m) ?? []).filter((a) => a.proyectoId);
  const conProyectos = [...porMentor.keys()].filter((m) => ocupados(m).length);
  const total = asientos.filter((a) => a.proyectoId).length;
  const nada = { propuestas: [], mentoresAntes: conProyectos.length, mentoresDespues: conProyectos.length };
  if (conProyectos.length < 2) return nada;
  const fijo = (m: string) => ocupados(m).some((a) => evaluados.has(String(a.proyectoId)));
  const orden = [...conProyectos].sort((x, y) => Number(fijo(y)) - Number(fijo(x)) || ocupados(y).length - ocupados(x).length || (porMentor.get(y)!.length - porMentor.get(x)!.length) || x.localeCompare(y));
  const quedan: string[] = [];
  let cupo = 0;
  for (const m of orden) {
    if (cupo >= total && !fijo(m)) break;
    quedan.push(m);
    cupo += porMentor.get(m)!.length;
  }
  if (quedan.length >= conProyectos.length) return nada;
  // Asientos libres de los que se quedan (se van ocupando a medida que se propone).
  const libres = quedan.flatMap((m) => porMentor.get(m)!.filter((a) => !a.proyectoId));
  const usados = new Set<string>();
  const propuestas: Propuesta[] = [];
  const salen = new Map<string, number>();
  const ceden = conProyectos.filter((m) => !quedan.includes(m));
  for (const m of ceden) {
    for (const a of ocupados(m).sort((x, y) => x.inicio.getTime() - y.inicio.getTime())) {
      const p = proyectos.get(String(a.proyectoId));
      if (!p || evaluados.has(String(a.proyectoId))) continue;
      const deSuCiudad = (x: AsientoC) => ordenLlegada || x.ciudades.includes(p.ciudad);
      const candidatos = libres.filter((x) => !usados.has(String(x._id)));
      const elegir = (f: (x: AsientoC) => boolean) => candidatos.filter(f).sort((x, y) => Number(deSuCiudad(y)) - Number(deSuCiudad(x)) || x.inicio.getTime() - y.inicio.getTime())[0];
      const destino = elegir((x) => x.inicio.getTime() === a.inicio.getTime()) ?? elegir(() => true);
      if (!destino) continue;
      usados.add(String(destino._id));
      salen.set(m, (salen.get(m) ?? 0) + 1);
      propuestas.push({
        proyecto: { id: String(p._id), codigo: p.codigo, nombre: p.nombre, ciudad: p.ciudad },
        de: { mentor: nombreMentor(m), inicio: a.inicio.toISOString() }, a: { mentor: nombreMentor(destino.mentorId), inicio: destino.inicio.toISOString() },
        cambiaHora: destino.inicio.getTime() !== a.inicio.getTime(), otraCiudad: !deSuCiudad(destino),
      });
    }
  }
  // Mentores con proyectos después de aplicar todas las propuestas.
  const despues = conProyectos.filter((m) => quedan.includes(m) || ocupados(m).length - (salen.get(m) ?? 0) > 0).length;
  return { propuestas, mentoresAntes: conProyectos.length, mentoresDespues: despues };
}

export async function cargaMentores(diaPedido?: string): Promise<CargaMentores> {
  const c = await collections();
  const dias = ((await c.asientos.distinct("dia")) as string[]).sort();
  const dia = diaPedido && dias.includes(diaPedido) ? diaPedido : dias[0];
  if (!dia) return { dias, dia: null };
  const asientos = await c.asientos.find({ dia }, { projection: { inicio: 1, mentorId: 1, ciudades: 1, proyectoId: 1 } }).sort({ inicio: 1, mentorId: 1 }).toArray() as AsientoC[];
  const ids = asientos.map((a) => a.proyectoId).filter((x): x is ObjectId => !!x);
  const [proys, evals, mentores, orden] = await Promise.all([
    c.proyectos.find({ _id: { $in: ids } }, { projection: { codigo: 1, nombre: 1, ciudad: 1 } }).toArray(),
    c.evalResultados.distinct("proyectoId", { proyectoId: { $in: ids }, noPresento: false }),
    c.mentores.find({}, { projection: { nombre: 1 } }).toArray(),
    modoOrdenLlegada(),
  ]);
  const proyectos = new Map(proys.map((p) => [String(p._id), p as ProyectoC]));
  const evaluados = new Set(evals.map(String));
  const nombres = new Map(mentores.map((m) => [m._id, m.nombre]));
  const nombre = (id: string) => nombres.get(id) ?? id;

  const porHora = new Map<number, AsientoC[]>();
  for (const a of asientos) { const h = horaCOL(a.inicio); porHora.set(h, [...(porHora.get(h) ?? []), a]); }
  const horas = [...porHora.keys()].sort((a, b) => a - b);

  const filas = new Map<string, FilaMentor>();
  for (const [h, lista] of porHora) for (const a of lista) {
    const f = filas.get(a.mentorId) ?? { mentorId: a.mentorId, nombre: nombre(a.mentorId), total: 0, horas: [] };
    filas.set(a.mentorId, f);
    let x = f.horas.find((y) => y.hora === h);
    if (!x) { x = { hora: h, proyectos: 0, asientos: 0, poca: false, suelta: false }; f.horas.push(x); }
    x.asientos++;
    if (a.proyectoId) { x.proyectos++; f.total++; }
  }
  for (const f of filas.values()) {
    f.horas.sort((a, b) => a.hora - b.hora);
    const s = sueltas(f.horas.filter((x) => x.proyectos).map((x) => x.hora));
    for (const x of f.horas) { x.poca = x.proyectos > 0 && x.proyectos < MINIMO; x.suelta = s.has(x.hora); }
  }
  const resumen = horas.map((h): HoraResumen => {
    const lista = porHora.get(h)!;
    const r = proponerHora(lista, proyectos, evaluados, orden, nombre);
    return { hora: h, proyectos: lista.filter((a) => a.proyectoId).length, ...r };
  });
  return {
    dias,
    dia: { dia, horas, mentores: [...filas.values()].filter((f) => f.total > 0).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), resumen },
  };
}

/** Excel de la carga de todos los días: una hoja «Carga» y una de «Propuestas». */
export async function cargaMentoresExcel(): Promise<Buffer> {
  const { dias } = await cargaMentores();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Proyecto final JC 2026";
  const carga = wb.addWorksheet("Carga");
  carga.addRow(["Día", "Mentor", "Hora COL", "Proyectos", "Asientos", "Marca"]).font = { bold: true };
  const prop = wb.addWorksheet("Propuestas");
  prop.addRow(["Día", "Hora COL", "Proyecto", "Código", "Ciudad", "De (mentor)", "Bloque actual", "A (mentor)", "Bloque nuevo", "Cambia la hora del estudiante", "Asiento de otra ciudad"]).font = { bold: true };
  for (const d of dias) {
    const c = (await cargaMentores(d)).dia;
    if (!c) continue;
    for (const f of c.mentores) for (const x of f.horas) if (x.proyectos)
      carga.addRow([d, sinFormula(f.nombre), `${x.hora}:00`, x.proyectos, x.asientos, [x.poca ? "1 o 2 proyectos" : "", x.suelta ? "Hora suelta" : ""].filter(Boolean).join(" · ")]);
    for (const h of c.resumen) for (const p of h.propuestas)
      prop.addRow([d, `${h.hora}:00`, sinFormula(p.proyecto.nombre), sinFormula(p.proyecto.codigo), sinFormula(p.proyecto.ciudad), sinFormula(p.de.mentor), horaCO(new Date(p.de.inicio)), sinFormula(p.a.mentor), horaCO(new Date(p.a.inicio)), p.cambiaHora ? "Sí" : "No", p.otraCiudad ? "Sí" : "No"]);
  }
  carga.columns.forEach((col, i) => { col.width = [12, 28, 10, 10, 10, 26][i]; });
  prop.columns.forEach((col, i) => { col.width = [12, 10, 34, 16, 14, 26, 14, 26, 14, 14, 14][i]; });
  for (const ws of [carga, prop]) ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

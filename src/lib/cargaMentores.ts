import ExcelJS from "exceljs";
import type { ObjectId } from "mongodb";
import { cambiarHora, type ResultadoAdmin } from "./admin";
import { horaCO } from "./ciudades";
import { collections } from "./db";
import { horaCOL } from "./edicion";
import { sinFormula } from "./evaluacion/resultados";
import { modoOrdenLlegada } from "./modoCupos";
import type { Actor } from "./types";

// Fase 4 · Paso 24 · Carga de los mentores y propuestas de cambio de mentor.
// REGLA FIJA: la hora del estudiante nunca cambia. Una propuesta solo pasa un proyecto a OTRO MENTOR en el MISMO
// bloque (mismo día y hora exacta), a un asiento libre de ese mentor (tener asiento en el bloque = estar disponible a
// esa hora según Horarios/Franjas). Nunca proyectos con evaluación guardada.
// Objetivos, en orden (gana el de número menor):
//   1. Juntar: en cada hora, la menor cantidad de mentores (cada uno con 3 o 4 proyectos, sin mentores con 1 o 2).
//   2. Evitar huecos: horas seguidas por mentor, no sueltas.
//   3. Equilibrar: repartir las horas entre los mentores disponibles del día.
// Calcular no escribe nada. «Aplicar» usa cambiarHora (la misma transacción de «Cambiar mentor» del Tablero).

export const MINIMO = 3;
export const NOTA = "Mismo horario para el estudiante; cambia el mentor y la sala.";

export type HoraMentor = { hora: number; proyectos: number; asientos: number; poca: boolean; suelta: boolean };
export type FilaMentor = { mentorId: string; nombre: string; total: number; horas: HoraMentor[] };
export type Motivo = "juntar" | "huecos" | "equilibrar";
export type Propuesta = {
  proyecto: { id: string; codigo: string; nombre: string; ciudad: string };
  /** Bloque (no cambia) y asientos de origen y destino. */
  inicio: string; desde: string; hacia: string;
  de: string; a: string; motivo: Motivo;
  /** Con el modo orden de llegada apagado: el asiento de destino es de otra ciudad. */
  otraCiudad: boolean;
};
/** `orden`: en qué orden aplicar las horas (1 = primero). Cada hora, aplicada en ese orden, deja el día mejor que antes;
 *  aplicar una hora antes de tiempo puede abrir un hueco y entonces las propuestas se recalculan distintas. */
export type HoraResumen = { hora: number; proyectos: number; mentoresAntes: number; mentoresDespues: number; propuestas: Propuesta[]; noSePuede: boolean; orden: number | null };
export type Indicadores = { mentores: number; horasPocas: number; horasSueltas: number; maximo: number; minimo: number };
export type CargaDia = {
  dia: string; horas: number[];
  antes: FilaMentor[]; despues: FilaMentor[];
  indicadores: { antes: Indicadores; despues: Indicadores };
  resumen: HoraResumen[];
};
export type CargaMentores = { dias: string[]; dia: CargaDia | null };

export type AsientoC = { _id: ObjectId; inicio: Date; mentorId: string; ciudades: string[]; proyectoId: ObjectId | null };
export type ProyectoC = { _id: ObjectId; codigo: string; nombre: string; ciudad: string };
type Estado = Map<string, string | null>;

/** Horas con proyectos de un mentor → cuáles son sueltas (sin la anterior ni la siguiente, habiendo otras). */
export function sueltas(horasConProyectos: number[]): Set<number> {
  const h = new Set(horasConProyectos);
  if (h.size < 2) return new Set();
  return new Set([...h].filter((x) => !h.has(x - 1) && !h.has(x + 1)));
}

/** Horas vacías dentro del tramo de cada mentor (6 y 8 sin la 7 = 1 hueco). */
export function huecos(porMentor: Map<string, Set<number>>): number {
  let n = 0;
  for (const hs of porMentor.values()) if (hs.size > 1) { const v = [...hs]; n += Math.max(...v) - Math.min(...v) + 1 - hs.size; }
  return n;
}

function* combinaciones<T>(xs: T[], k: number, desde = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) { yield acc; return; }
  for (let i = desde; i <= xs.length - (k - acc.length); i++) yield* combinaciones(xs, k, i + 1, [...acc, xs[i]!]);
}
const nCr = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; };
const MAX_COMBOS = 3000;
const menor = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!; return false; };

/**
 * Plan del día (función pura): estado final simulado. Cada proyecto que cambia de mentor queda en su MISMO bloque y en
 * un asiento que estaba libre al empezar (así cada propuesta se puede aplicar sola y en cualquier orden).
 */
export function planDia(asientos: AsientoC[], proyectos: Map<string, ProyectoC>, evaluados: Set<string>, ordenLlegada: boolean) {
  const seat = new Map(asientos.map((a) => [String(a._id), a]));
  const original: Estado = new Map(asientos.map((a) => [String(a._id), a.proyectoId ? String(a.proyectoId) : null]));
  const usable = (id: string, e: Estado) => original.get(id) === null || e.get(id) !== null;
  const porHora = new Map<number, AsientoC[]>();
  for (const a of asientos) { const h = horaCOL(a.inicio); porHora.set(h, [...(porHora.get(h) ?? []), a]); }
  const horas = [...porHora.keys()].sort((a, b) => a - b);
  const bloques = (h: number) => [...new Set(porHora.get(h)!.map((a) => a.inicio.getTime()))];
  const motivoDe = new Map<string, Motivo>();
  const pasoDe = new Map<number, number>(); // hora → número de su último cambio en la búsqueda
  let pasos = 0;

  const horasPorMentor = (e: Estado) => {
    const m = new Map<string, Set<number>>();
    for (const [id, p] of e) if (p) { const a = seat.get(id)!; const s = m.get(a.mentorId) ?? new Set<number>(); s.add(horaCOL(a.inicio)); m.set(a.mentorId, s); }
    return m;
  };
  const enHora = (h: number, e: Estado) => [...new Set(porHora.get(h)!.filter((a) => e.get(String(a._id))).map((a) => a.mentorId))];
  const fijos = (h: number, e: Estado) => [...new Set(porHora.get(h)!.filter((a) => { const p = e.get(String(a._id)); return !!p && evaluados.has(p); }).map((a) => a.mentorId))];

  /** Estado con la hora `h` en manos de los mentores K (cada proyecto en su bloque), o null si no alcanza. */
  function conK(h: number, K: Set<string>, e: Estado): Estado | null {
    const nuevo = new Map(e);
    for (const b of bloques(h)) {
      const del = porHora.get(h)!.filter((a) => a.inicio.getTime() === b);
      const carga = (m: string) => porHora.get(h)!.filter((a) => a.mentorId === m && nuevo.get(String(a._id))).length;
      for (const a of del.filter((x) => nuevo.get(String(x._id)) && !K.has(x.mentorId))) {
        const p = nuevo.get(String(a._id))!;
        if (evaluados.has(p)) return null;
        const ciudad = proyectos.get(p)?.ciudad ?? "";
        const propia = (x: AsientoC) => Number(ordenLlegada || x.ciudades.includes(ciudad));
        const destino = del.filter((x) => K.has(x.mentorId) && !nuevo.get(String(x._id)) && usable(String(x._id), nuevo))
          .sort((x, y) => propia(y) - propia(x) || carga(y.mentorId) - carga(x.mentorId) || x.mentorId.localeCompare(y.mentorId))[0];
        if (!destino) return null;
        nuevo.set(String(a._id), null);
        nuevo.set(String(destino._id), p);
      }
    }
    return nuevo;
  }

  const movidos = (e: Estado) => {
    const donde = new Map<string, string>();
    for (const [id, p] of e) if (p) donde.set(p, id);
    let n = 0;
    for (const [id, p] of original) if (p && donde.get(p) !== id) n++;
    return n;
  };
  /** Puntaje (menor es mejor), en el orden de los objetivos: mentores en la hora, huecos, reparto, movimientos. */
  const puntaje = (h: number, e: Estado): number[] => {
    const hm = horasPorMentor(e);
    return [enHora(h, e).length, huecos(hm), [...hm.values()].reduce((s, x) => s + x.size * x.size, 0), movidos(e)];
  };

  let estado: Estado = new Map(original);
  for (let pasada = 0; pasada < 4; pasada++) {
    let cambio = false;
    for (const h of horas) {
      const actual = enHora(h, estado);
      if (!actual.length) continue;
      const fijo = fijos(h, estado);
      const pool = [...new Set(porHora.get(h)!.map((a) => a.mentorId))].sort();
      const libresPool = pool.filter((m) => !fijo.includes(m));
      const maxBloque = Math.max(...bloques(h).map((b) => porHora.get(h)!.filter((a) => a.inicio.getTime() === b && estado.get(String(a._id))).length));
      const candidatos: Set<string>[] = [new Set(actual)];
      for (let k = Math.max(maxBloque, fijo.length, 1); k <= actual.length; k++) {
        const resto = k - fijo.length;
        if (nCr(libresPool.length, resto) <= MAX_COMBOS) for (const c of combinaciones(libresPool, resto)) candidatos.push(new Set([...fijo, ...c]));
        // Muchos mentores disponibles: los actuales y cambiar uno de ellos por otro.
        else for (const sale of actual) for (const entra of pool) if (!actual.includes(entra) && !fijo.includes(sale)) candidatos.push(new Set([...actual.filter((m) => m !== sale), entra]));
        if (k < actual.length && candidatos.slice(1).some((K) => K.size === k && conK(h, K, estado))) break;
      }
      let mejor = estado, mejorP = puntaje(h, estado);
      for (const K of candidatos) {
        const n = conK(h, K, estado);
        if (!n) continue;
        const p = puntaje(h, n);
        if (menor(p, mejorP)) { mejor = n; mejorP = p; }
      }
      if (mejor !== estado) {
        const antesP = puntaje(h, estado);
        const motivo: Motivo = mejorP[0]! < antesP[0]! ? "juntar" : mejorP[1]! < antesP[1]! ? "huecos" : "equilibrar";
        for (const a of porHora.get(h)!) { const p = mejor.get(String(a._id)); if (p && estado.get(String(a._id)) !== p) motivoDe.set(p, motivo); }
        estado = mejor;
        pasoDe.set(h, ++pasos);
        cambio = true;
      }
    }
    if (!cambio) break;
  }
  return { estado, original, seat, porHora, horas, motivoDe, pasoDe };
}

function filas(asientos: AsientoC[], e: Estado, nombre: (id: string) => string): FilaMentor[] {
  const out = new Map<string, FilaMentor>();
  for (const a of asientos) {
    const f = out.get(a.mentorId) ?? { mentorId: a.mentorId, nombre: nombre(a.mentorId), total: 0, horas: [] };
    out.set(a.mentorId, f);
    const h = horaCOL(a.inicio);
    let x = f.horas.find((y) => y.hora === h);
    if (!x) { x = { hora: h, proyectos: 0, asientos: 0, poca: false, suelta: false }; f.horas.push(x); }
    x.asientos++;
    if (e.get(String(a._id))) { x.proyectos++; f.total++; }
  }
  for (const f of out.values()) {
    f.horas.sort((a, b) => a.hora - b.hora);
    const s = sueltas(f.horas.filter((x) => x.proyectos).map((x) => x.hora));
    for (const x of f.horas) { x.poca = x.proyectos > 0 && x.proyectos < MINIMO; x.suelta = s.has(x.hora); }
  }
  return [...out.values()].filter((f) => f.total > 0).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

const indicadores = (f: FilaMentor[]): Indicadores => ({
  mentores: f.length,
  horasPocas: f.reduce((n, m) => n + m.horas.filter((x) => x.poca).length, 0),
  horasSueltas: f.reduce((n, m) => n + m.horas.filter((x) => x.suelta).length, 0),
  maximo: f.length ? Math.max(...f.map((m) => m.total)) : 0,
  minimo: f.length ? Math.min(...f.map((m) => m.total)) : 0,
});

/** Carga y propuestas de un día (pura): la usan la pantalla, el Excel y las pruebas. */
export function cargaDia(dia: string, asientos: AsientoC[], proyectos: Map<string, ProyectoC>, evaluados: Set<string>, ordenLlegada: boolean, nombre: (id: string) => string): CargaDia {
  const { estado, original, seat, porHora, horas, motivoDe, pasoDe } = planDia(asientos, proyectos, evaluados, ordenLlegada);
  const donde = new Map<string, string>();
  for (const [id, p] of estado) if (p) donde.set(p, id);
  const resumen = horas.map((h): HoraResumen => {
    const lista = porHora.get(h)!;
    const mentores = (e: Estado) => new Set(lista.filter((a) => e.get(String(a._id))).map((a) => a.mentorId));
    const propuestas: Propuesta[] = [];
    for (const a of lista) {
      const p = original.get(String(a._id));
      const hacia = p ? donde.get(p) : undefined;
      if (!p || !hacia || hacia === String(a._id)) continue;
      const destino = seat.get(hacia)!, pr = proyectos.get(p);
      if (!pr || destino.inicio.getTime() !== a.inicio.getTime() || original.get(hacia) !== null || evaluados.has(p)) continue; // regla fija
      propuestas.push({
        proyecto: { id: p, codigo: pr.codigo, nombre: pr.nombre, ciudad: pr.ciudad },
        inicio: a.inicio.toISOString(), desde: String(a._id), hacia,
        de: nombre(a.mentorId), a: nombre(destino.mentorId), motivo: motivoDe.get(p) ?? "juntar",
        otraCiudad: !ordenLlegada && !destino.ciudades.includes(pr.ciudad),
      });
    }
    propuestas.sort((x, y) => x.inicio.localeCompare(y.inicio) || x.proyecto.nombre.localeCompare(y.proyecto.nombre, "es"));
    const total = lista.filter((a) => original.get(String(a._id))).length;
    const despues = mentores(estado);
    const carga = (m: string) => lista.filter((a) => a.mentorId === m && estado.get(String(a._id))).length;
    // Quedan mentores con 1 o 2 y bastarían menos mentores si los proyectos pudieran cambiar de bloque.
    const noSePuede = total > 0 && despues.size > Math.ceil(total / 4) && [...despues].some((m) => carga(m) < MINIMO);
    return { hora: h, proyectos: total, mentoresAntes: mentores(original).size, mentoresDespues: despues.size, propuestas, noSePuede, orden: propuestas.length ? pasoDe.get(h) ?? 0 : null };
  });
  // Orden 1, 2, 3… según el orden en que la búsqueda cambió cada hora.
  [...resumen].filter((x) => x.orden !== null).sort((a, b) => a.orden! - b.orden!).forEach((x, i) => { x.orden = i + 1; });
  const antes = filas(asientos, original, nombre), desp = filas(asientos, estado, nombre);
  return { dia, horas, antes, despues: desp, indicadores: { antes: indicadores(antes), despues: indicadores(desp) }, resumen };
}

async function datosDia(dia: string) {
  const c = await collections();
  const asientos = await c.asientos.find({ dia }, { projection: { inicio: 1, mentorId: 1, ciudades: 1, proyectoId: 1 } }).sort({ inicio: 1, mentorId: 1 }).toArray() as AsientoC[];
  const ids = asientos.map((a) => a.proyectoId).filter((x): x is ObjectId => !!x);
  const [proys, evals, mentores, orden] = await Promise.all([
    c.proyectos.find({ _id: { $in: ids } }, { projection: { codigo: 1, nombre: 1, ciudad: 1 } }).toArray(),
    c.evalResultados.distinct("proyectoId", { proyectoId: { $in: ids }, noPresento: false }),
    c.mentores.find({}, { projection: { nombre: 1 } }).toArray(),
    modoOrdenLlegada(),
  ]);
  const nombres = new Map(mentores.map((m) => [m._id, m.nombre]));
  return cargaDia(dia, asientos, new Map(proys.map((p) => [String(p._id), p as ProyectoC])), new Set(evals.map(String)), orden, (id) => nombres.get(id) ?? id);
}

/** Se recalcula en cada lectura (los estudiantes siguen reservando). Solo lee. */
export async function cargaMentores(diaPedido?: string): Promise<CargaMentores> {
  const c = await collections();
  const dias = ((await c.asientos.distinct("dia")) as string[]).sort();
  const dia = diaPedido && dias.includes(diaPedido) ? diaPedido : dias[0];
  return { dias, dia: dia ? await datosDia(dia) : null };
}

/** Aplica UNA propuesta: el proyecto debe seguir en `desde` y `hacia` debe ser un asiento libre del MISMO bloque. */
export async function aplicarPropuesta(proyectoId: ObjectId, desde: ObjectId, hacia: ObjectId, actor: Actor): Promise<ResultadoAdmin> {
  const c = await collections();
  const [d, h] = await Promise.all([c.asientos.findOne({ _id: desde }), c.asientos.findOne({ _id: hacia })]);
  if (!d || !d.proyectoId?.equals(proyectoId)) return { ok: false, error: "cambio", mensaje: "El proyecto ya no está en ese asiento. Recalculamos las propuestas." };
  if (!h || h.dia !== d.dia || h.inicio.getTime() !== d.inicio.getTime() || h._id.equals(d._id)) return { ok: false, error: "datos", mensaje: "Solo se cambia de mentor en el mismo bloque: la hora del estudiante no cambia." };
  if (h.proyectoId) return { ok: false, error: "sin_cupo", mensaje: "Ese asiento ya no está libre. Recalculamos las propuestas." };
  // La misma lógica y transacción de «Cambiar mentor» del Tablero (mover.ts): no mueve evaluados y deja historial.
  // cambiarHora vuelve a exigir, dentro de la transacción, que el proyecto siga en `desde` y que `hacia` esté libre.
  return cambiarHora(proyectoId, d.inicio, { otraCiudad: true, motivo: `Carga de mentores. ${NOTA}`, asiento: hacia, desde }, actor);
}

/** Excel: Resumen (antes → después por día), Carga (antes), Propuestas y horas que no se pueden juntar. */
export async function cargaMentoresExcel(): Promise<Buffer> {
  const { dias } = await cargaMentores();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Proyecto final JC 2026";
  const res = wb.addWorksheet("Resumen");
  res.addRow(["Día", "Mentores activos (antes)", "Mentores activos (después)", "Horas con 1–2 (antes)", "Horas con 1–2 (después)", "Horas sueltas (antes)", "Horas sueltas (después)", "Máx. proyectos por mentor (antes)", "Máx. (después)", "Mín. (antes)", "Mín. (después)"]).font = { bold: true };
  const carga = wb.addWorksheet("Carga");
  carga.addRow(["Día", "Mentor", "Hora COL", "Proyectos", "Asientos", "Marca"]).font = { bold: true };
  const prop = wb.addWorksheet("Propuestas");
  prop.addRow(["Día", "Orden", "Bloque COL", "Proyecto", "Código", "Ciudad", "Mentor actual", "Mentor nuevo", "Objetivo", "Asiento de otra ciudad", "Nota"]).font = { bold: true };
  const noSe = wb.addWorksheet("No se puede juntar");
  noSe.addRow(["Día", "Hora COL", "Proyectos", "Mentores", "Nota"]).font = { bold: true };
  const OBJ: Record<Motivo, string> = { juntar: "Juntar", huecos: "Evitar huecos", equilibrar: "Equilibrar" };
  for (const d of dias) {
    const c = await datosDia(d);
    const [a, z] = [c.indicadores.antes, c.indicadores.despues];
    res.addRow([d, a.mentores, z.mentores, a.horasPocas, z.horasPocas, a.horasSueltas, z.horasSueltas, a.maximo, z.maximo, a.minimo, z.minimo]);
    for (const f of c.antes) for (const x of f.horas) if (x.proyectos)
      carga.addRow([d, sinFormula(f.nombre), `${x.hora}:00`, x.proyectos, x.asientos, [x.poca ? "1 o 2 proyectos" : "", x.suelta ? "Hora suelta" : ""].filter(Boolean).join(" · ")]);
    for (const h of c.resumen) {
      for (const p of h.propuestas)
        prop.addRow([d, h.orden ?? "", horaCO(new Date(p.inicio)), sinFormula(p.proyecto.nombre), sinFormula(p.proyecto.codigo), sinFormula(p.proyecto.ciudad), sinFormula(p.de), sinFormula(p.a), OBJ[p.motivo], p.otraCiudad ? "Sí" : "No", NOTA]);
      if (h.noSePuede) noSe.addRow([d, `${h.hora}:00`, h.proyectos, h.mentoresDespues, "No se puede juntar sin mover la hora"]);
    }
  }
  const anchos: Record<string, number[]> = { Resumen: [12, 14, 14, 14, 14, 14, 14, 14, 12, 12, 12], Carga: [12, 28, 10, 10, 10, 26], Propuestas: [12, 8, 12, 34, 16, 14, 26, 26, 14, 12, 52], "No se puede juntar": [12, 10, 10, 10, 40] };
  for (const ws of wb.worksheets) { ws.columns.forEach((col, i) => { col.width = anchos[ws.name]![i]; }); ws.views = [{ state: "frozen", ySplit: 1 }]; }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

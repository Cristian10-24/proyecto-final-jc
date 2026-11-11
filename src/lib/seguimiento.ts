import ExcelJS from "exceljs";
import type { Filter } from "mongodb";
import { scopeFilter, type SessionUser } from "./auth";
import { CIUDADES, horaCO, horaUY } from "./ciudades";
import { collections } from "./db";
import { diaCOL } from "./edicion";
import { enmascararNumero } from "./estudiante";
import { conteoComentarios } from "./comentarios";
import { sinFormula } from "./evaluacion/resultados";
import { modoOrdenLlegada, resumenModo } from "./modoCupos";
import type { Integrante, Proyecto } from "./types";
import { FILTRO_MONITOR } from "./permisos";

// Seguimiento (monitor: solo sus ciudades; coordinación y admin: todas), resumen y cronograma en Excel.

export type FilaSeguimiento = {
  /** Paso 22: para abrir sus comentarios; `comentarios` = cuántos tiene (sin los borrados). */
  id: string; comentarios: number;
  codigo: string; nombre: string; ciudad: string; grupo?: string; monitor: string | null;
  integrantes: { nombre: string; documento: string }[]; // documento enmascarado
  hora: string | null; // ISO
};

export async function seguimiento(user: Pick<SessionUser, "rol" | "ciudades">): Promise<FilaSeguimiento[]> {
  const { proyectos, asientos } = await collections();
  // Paso 21: los proyectos marcados «Sin proyecto» no cuentan en el seguimiento de inscripción.
  const lista = await proyectos.find({ ...(scopeFilter<Proyecto>(user) as Filter<Proyecto>), sinProyecto: { $exists: false } }, { projection: { codigo: 1, nombre: 1, ciudad: 1, grupo: 1, monitor: 1, integrantes: 1 } })
    .sort({ ciudad: 1, nombre: 1 }).toArray();
  const horas = new Map((await asientos.find({ proyectoId: { $in: lista.map((p) => p._id) } }, { projection: { proyectoId: 1, inicio: 1 } }).toArray())
    .map((a) => [String(a.proyectoId), a.inicio.toISOString()]));
  const nComent = await conteoComentarios(lista.map((p) => p._id));
  return lista.map((p) => ({
    id: String(p._id), comentarios: nComent.get(String(p._id)) ?? 0,
    codigo: p.codigo, nombre: p.nombre, ciudad: p.ciudad, ...(p.grupo ? { grupo: p.grupo } : {}), monitor: p.monitor ?? null,
    integrantes: p.integrantes.map((i) => ({ nombre: i.nombre, documento: enmascararNumero(i.documento) })),
    hora: horas.get(String(p._id)) ?? null,
  }));
}

export type ResumenCiudad = { ciudad: string; proyectos: number; conHora: number; asientosLibres: number; dias: string[] };
export type ResumenDia = { dia: string; capacidad: number; ocupados: number };

/** Avance por ciudad (de menor a mayor) y ocupación por día. Coordinación y admin. */
export async function resumen(): Promise<{ total: number; conHora: number; ciudades: ResumenCiudad[]; dias: ResumenDia[] }> {
  const { proyectos, asientos } = await collections();
  // Paso 21: los marcados «Sin proyecto» no cuentan (no tienen hora: tampoco suman en "con hora").
  const porCiudad = await proyectos.aggregate<{ _id: string; n: number }>([{ $match: { sinProyecto: { $exists: false } } }, { $group: { _id: "$ciudad", n: { $sum: 1 } } }]).toArray();
  const conHora = await asientos.aggregate<{ _id: string; n: number }>([
    { $match: { proyectoId: { $type: "objectId" } } },
    { $lookup: { from: "proyectos", localField: "proyectoId", foreignField: "_id", as: "p" } },
    { $group: { _id: { $first: "$p.ciudad" }, n: { $sum: 1 } } },
  ]).toArray();
  const libres = await asientos.aggregate<{ _id: string; n: number; dias: string[] }>([
    { $match: { proyectoId: null } }, { $unwind: "$ciudades" },
    { $group: { _id: "$ciudades", n: { $sum: 1 }, dias: { $addToSet: "$dia" } } },
  ]).toArray();
  const dias = await asientos.aggregate<{ _id: string; capacidad: number; ocupados: number }>([
    { $group: { _id: "$dia", capacidad: { $sum: 1 }, ocupados: { $sum: { $cond: [{ $eq: [{ $type: "$proyectoId" }, "objectId"] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  const ch = new Map(conHora.map((x) => [x._id, x.n]));
  let li = new Map<string, { n: number; dias: string[] }>(libres.map((x) => [x._id, x]));
  // Modo orden de llegada: los libres de una ciudad son, en cada día que presenta, lo que aún puede tomar
  // (mín. entre los libres del día y lo que le falta para su tope), sin mirar las etiquetas.
  if (await modoOrdenLlegada()) li = await libresOrdenLlegada();
  const ciudades = porCiudad.map((c): ResumenCiudad => ({
    ciudad: c._id, proyectos: c.n, conHora: ch.get(c._id) ?? 0, asientosLibres: li.get(c._id)?.n ?? 0, dias: (li.get(c._id)?.dias ?? []).sort(),
  })).sort((a, b) => a.conHora / a.proyectos - b.conHora / b.proyectos || a.ciudad.localeCompare(b.ciudad, "es"));
  return {
    total: ciudades.reduce((s, c) => s + c.proyectos, 0), conHora: ciudades.reduce((s, c) => s + c.conHora, 0),
    ciudades, dias: dias.map((d) => ({ dia: d._id, capacidad: d.capacidad, ocupados: d.ocupados })),
  };
}

async function libresOrdenLlegada(): Promise<Map<string, { n: number; dias: string[] }>> {
  const c = await collections();
  const [diasCfg, libresDia, ocupacion] = await Promise.all([
    c.dias.find({}).toArray(),
    c.asientos.aggregate<{ _id: string; n: number }>([{ $match: { proyectoId: null } }, { $group: { _id: "$dia", n: { $sum: 1 } } }]).toArray(),
    c.asientos.aggregate<{ _id: { dia: string; ciudad: string }; n: number }>([
      { $match: { proyectoId: { $type: "objectId" } } },
      { $lookup: { from: "proyectos", localField: "proyectoId", foreignField: "_id", as: "p", pipeline: [{ $project: { ciudad: 1 } }] } },
      { $unwind: "$p" },
      { $group: { _id: { dia: "$dia", ciudad: "$p.ciudad" }, n: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const out = new Map<string, { n: number; dias: string[] }>();
  for (const d of resumenModo(diasCfg, new Map(libresDia.map((x) => [x._id, x.n])), ocupacion.map((o) => ({ ...o._id, n: o.n }))))
    for (const k of d.ciudades) {
      if (!k.puedeTomar) continue;
      const x = out.get(k.ciudad) ?? { n: 0, dias: [] };
      x.n += k.puedeTomar; x.dias.push(d.dia);
      out.set(k.ciudad, x);
    }
  return out;
}

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const nombreHoja = (dia: string) => { const t = fmtDia.format(new Date(dia + "T12:00:00Z")).replace(/,/g, ""); return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 31); };

/** Correo para el Excel: sin espacios y en minúscula. */
const correoLimpio = (c?: string) => (c ?? "").replace(/\s+/g, "").toLowerCase();

/**
 * Cronograma en Excel: una hoja por día con hora (COL y UY), mentor (sala), monitor, ciudad, proyecto
 * e integrantes con celular. Solo coordinación y admin (permiso descargar_excel).
 * Con `datosPersonales` (solo admin, permiso descargar_datos_personales) agrega documento (como texto) y correo
 * de cada integrante, junto a su nombre y celular. Sin él, las columnas son las de siempre.
 */
export async function cronogramaExcel({ datosPersonales = false }: { datosPersonales?: boolean } = {}): Promise<Buffer> {
  const { asientos, proyectos, mentores, users } = await collections();
  const ocupados = await asientos.find({ proyectoId: { $type: "objectId" } }).sort({ inicio: 1, mentorId: 1 }).toArray();
  const proys = new Map((await proyectos.find({ _id: { $in: ocupados.map((a) => a.proyectoId!) } }).toArray()).map((p) => [String(p._id), p]));
  const nombresMentor = new Map((await mentores.find({}).toArray()).map((m) => [m._id, m.nombre]));
  const nombresMonitor = new Map((await users.find(FILTRO_MONITOR, { projection: { usuario: 1, nombre: 1 } }).toArray()).map((u) => [u.usuario, u.nombre]));
  const uruguay = new Set<string>(CIUDADES.filter((c) => c.pais === "UY").map((c) => c.nombre));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Proyecto final JC 2026";
  const porDia = new Map<string, typeof ocupados>();
  for (const a of ocupados) porDia.set(diaCOL(a.inicio), [...(porDia.get(diaCOL(a.inicio)) ?? []), a]);
  if (!porDia.size) wb.addWorksheet("Sin reservas").addRow(["Todavía no hay proyectos con hora."]);
  for (const [dia, lista] of porDia) {
    const ws = wb.addWorksheet(nombreHoja(dia));
    const base = ["Hora COL", "Hora UY", "Mentor (sala)", "Monitor", "Ciudad", "Proyecto", "Código"];
    const porIntegrante = (n: number) => datosPersonales
      ? [`Integrante ${n}`, `Documento ${n}`, `Celular ${n}`, `Correo ${n}`]
      : [`Integrante ${n}`, `Celular ${n}`];
    ws.addRow([...base, ...porIntegrante(1), ...porIntegrante(2)]).font = { bold: true };
    const datos = (i?: Integrante) => datosPersonales
      ? [sinFormula(i?.nombre ?? ""), sinFormula(i?.documento ?? ""), i?.celular ?? "", sinFormula(correoLimpio(i?.correo))]
      : [sinFormula(i?.nombre ?? ""), i?.celular ?? ""];
    for (const a of lista) {
      const p = proys.get(String(a.proyectoId));
      const [i1, i2] = p?.integrantes ?? [];
      ws.addRow([
        horaCO(a.inicio), p && uruguay.has(p.ciudad) ? horaUY(a.inicio) : "", nombresMentor.get(a.mentorId) ?? a.mentorId,
        p?.monitor ? nombresMonitor.get(p.monitor) ?? p.monitor : "Por asignar", p?.ciudad ?? "", sinFormula(p?.nombre ?? ""), p?.codigo ?? "",
        ...datos(i1), ...datos(i2),
      ]);
    }
    if (datosPersonales) for (const col of [9, 13]) ws.getColumn(col).numFmt = "@"; // documento como texto, nunca número
    const anchos = datosPersonales ? [11, 11, 26, 22, 14, 34, 16, 28, 16, 16, 30, 28, 16, 16, 30] : [11, 11, 26, 22, 14, 34, 16, 28, 16, 28, 16];
    ws.columns.forEach((c, i) => { c.width = anchos[i]; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

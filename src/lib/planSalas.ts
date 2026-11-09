import ExcelJS from "exceljs";
import { MongoServerError, type ClientSession } from "mongodb";
import type { HoraMentores } from "./agenda";
import { horaCO } from "./ciudades";
import { collections, transaccion } from "./db";
import { diaCOL, horaCOL, inicioUTC } from "./edicion";
import { clave, type ErrorFila } from "./importar/excel";
import { idMentor } from "./importar/mentores";
import type { LibroSalas } from "./importar/salas";
import { HOJAS_SALAS, planificar, type CambioAdmin, type Disponible, type MonitorFijo, type OrigenMonitor, type PlanSala, type Sala } from "./salas";
import type { Actor } from "./types";
import { FILTRO_MONITOR } from "./permisos";

// Plan de salas en la base: se calcula al importar el libro de salas y monitores (o al recalcular
// después de reimportar mentores) y el admin cambia el monitor de una sala. Todo deja changeLog.

type MonitorUsuario = { usuario: string; nombre: string };

/** Mentores de cada hora según los asientos (fuente de verdad: hoja Horarios importada). */
async function horasDeMentores(session?: ClientSession): Promise<HoraMentores[]> {
  const { asientos } = await collections();
  const m = new Map<string, HoraMentores>();
  for (const a of await asientos.find({}, { session, projection: { inicio: 1, mentorId: 1 } }).toArray()) {
    const dia = diaCOL(a.inicio), hora = horaCOL(a.inicio), k = `${dia}|${hora}`;
    const h = m.get(k) ?? { dia, hora, mentores: [] };
    if (!h.mentores.includes(a.mentorId)) h.mentores.push(a.mentorId);
    m.set(k, h);
  }
  return [...m.values()];
}

async function monitoresActivos(session?: ClientSession): Promise<MonitorUsuario[]> {
  const { users } = await collections();
  return users.find({ ...FILTRO_MONITOR, activo: true }, { session, projection: { _id: 0, usuario: 1, nombre: 1 } }).toArray() as Promise<MonitorUsuario[]>;
}

/** Usuario del monitor por nombre (sin tildes ni mayúsculas) o por usuario. */
export function buscarMonitor(textoMonitor: string, monitores: MonitorUsuario[]): string | { aviso: string } {
  const k = clave(textoMonitor), u = textoMonitor.trim().toLowerCase();
  const porUsuario = monitores.find((m) => m.usuario === u);
  if (porUsuario) return porUsuario.usuario;
  const porNombre = monitores.filter((m) => clave(m.nombre) === k);
  if (porNombre.length === 1) return porNombre[0]!.usuario;
  return { aviso: porNombre.length ? `Hay varios monitores llamados "${textoMonitor}": escribe su usuario.` : `No hay un monitor activo "${textoMonitor}".` };
}

/** Pasa los nombres del libro a usuarios y mentores de la base. Nombres de monitor sin usuario = aviso. */
function reconocer(libro: LibroSalas, monitores: MonitorUsuario[], mentores: Set<string>) {
  const errores: ErrorFila[] = [], avisos: ErrorFila[] = [];
  const importados: MonitorFijo[] = [], disponibilidad: Disponible[] = [];
  for (const f of libro.monitores) {
    const m = buscarMonitor(f.monitor, monitores);
    if (typeof m !== "string") { avisos.push({ hoja: HOJAS_SALAS.monitores, fila: f.fila, mensaje: `${m.aviso} La fila no se usa.` }); continue; }
    if (f.sala !== undefined) { importados.push({ fila: f.fila, dia: f.dia, hora: f.hora, sala: f.sala, monitor: m }); continue; }
    const mentorId = idMentor(f.mentor!);
    if (!mentores.has(mentorId)) { errores.push({ hoja: HOJAS_SALAS.monitores, fila: f.fila, mensaje: `No hay un mentor "${f.mentor}" (debe escribirse igual que en Horarios).` }); continue; }
    importados.push({ fila: f.fila, dia: f.dia, hora: f.hora, mentorId, monitor: m });
  }
  const sinUsuario = new Map<string, number>();
  const vistos = new Set<string>();
  for (const f of libro.disponibilidad) {
    const m = buscarMonitor(f.monitor, monitores);
    if (typeof m !== "string") { if (!sinUsuario.has(f.monitor)) sinUsuario.set(f.monitor, f.fila); continue; }
    const k = `${m}|${f.dia}|${f.hora}`;
    if (!vistos.has(k)) { vistos.add(k); disponibilidad.push({ monitor: m, dia: f.dia, hora: f.hora }); }
  }
  for (const [nombre, fila] of sinUsuario)
    avisos.push({ hoja: HOJAS_SALAS.disponibilidad, fila, mensaje: `No hay un monitor activo "${nombre}": su disponibilidad no se usa.` });
  return { importados, disponibilidad, errores, avisos };
}

export type ResumenPlan = {
  salas: number; horasSala: number; conMonitor: number; sinMonitor: number;
  porOrigen: Record<OrigenMonitor, number>;
  dias: { dia: string; horasSala: number; sinMonitor: number }[];
  cargaPorMonitor: { nombre: string; salas: number }[];
};

export type PreviaSalas = ResumenPlan & { errores: ErrorFila[]; avisos: ErrorFila[] };

function resumir(plan: PlanSala[], salas: Sala[], monitores: MonitorUsuario[]): ResumenPlan {
  const nombre = new Map(monitores.map((m) => [m.usuario, m.nombre]));
  const porOrigen: Record<OrigenMonitor, number> = { importado: 0, automatico: 0, admin: 0 };
  const dias = new Map<string, { dia: string; horasSala: number; sinMonitor: number }>();
  const carga = new Map<string, number>();
  for (const p of plan) {
    if (p.monitor && p.origen) porOrigen[p.origen]++;
    if (p.monitor) carga.set(p.monitor, (carga.get(p.monitor) ?? 0) + 1);
    const d = dias.get(p.dia) ?? { dia: p.dia, horasSala: 0, sinMonitor: 0 };
    d.horasSala++;
    if (!p.monitor) d.sinMonitor++;
    dias.set(p.dia, d);
  }
  const conMonitor = plan.filter((p) => p.monitor).length;
  return {
    salas: salas.length, horasSala: plan.length, conMonitor, sinMonitor: plan.length - conMonitor, porOrigen,
    dias: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    cargaPorMonitor: [...carga].map(([u, n]) => ({ nombre: nombre.get(u) ?? u, salas: n })).sort((a, b) => b.salas - a.salas || a.nombre.localeCompare(b.nombre, "es")),
  };
}

async function calcular(salas: Sala[], importados: MonitorFijo[], disponibilidad: Disponible[], session?: ClientSession, recalculo = false) {
  const { planSalas } = await collections();
  const monitores = await monitoresActivos(session);
  const activos = new Set(monitores.map((m) => m.usuario));
  const cambiosAdmin: CambioAdmin[] = (await planSalas.find({ origen: "admin" }, { session }).toArray())
    .filter((p) => !p.monitor || activos.has(p.monitor))
    .map((p) => ({ dia: p.dia, hora: p.hora, mentorId: p.mentorId, monitor: p.monitor }));
  const r = planificar({
    horas: await horasDeMentores(session), salas, cambiosAdmin, faltantesComoAviso: recalculo,
    importados: importados.filter((f) => activos.has(f.monitor)),
    disponibilidad: disponibilidad.filter((d) => activos.has(d.monitor)),
  });
  if (!r.plan.length && !r.errores.length) r.errores.push({ hoja: "", fila: 0, mensaje: "Todavía no hay mentores importados: importa primero mentores y disponibilidad." });
  return { ...r, monitores };
}

export async function previaSalas(libro: LibroSalas): Promise<PreviaSalas> {
  const { mentores } = await collections();
  const monitores = await monitoresActivos();
  const vacio = resumir([], libro.salas, monitores);
  if (libro.errores.length) return { ...vacio, errores: libro.errores, avisos: libro.avisos };
  const rec = reconocer(libro, monitores, new Set((await mentores.find({}, { projection: { _id: 1 } }).toArray()).map((m) => m._id)));
  if (rec.errores.length) return { ...vacio, errores: rec.errores, avisos: [...libro.avisos, ...rec.avisos] };
  const r = await calcular(libro.salas, rec.importados, rec.disponibilidad);
  return { ...resumir(r.plan, libro.salas, monitores), errores: r.errores, avisos: [...libro.avisos, ...rec.avisos, ...r.avisos] };
}

async function guardar(salas: Sala[], importados: MonitorFijo[], disponibilidad: Disponible[], actor: Actor, nota: string, recalculo = false) {
  const c = await collections();
  await transaccion(async (s) => {
    const r = await calcular(salas, importados, disponibilidad, s, recalculo);
    if (r.errores.length) throw new Error("errores");
    await c.salasConfig.replaceOne({ _id: "actual" }, { salas, importados, disponibilidad, actualizadoEn: new Date() }, { upsert: true, session: s });
    await c.planSalas.deleteMany({}, { session: s });
    if (r.plan.length) await c.planSalas.insertMany(r.plan, { session: s });
    const sin = r.plan.filter((p) => !p.monitor).length;
    await c.changeLog.insertOne({ accion: "importar", nuevo: `${nota}: ${salas.length} salas, ${r.plan.length} horas-sala, ${sin} sin monitor`, actor, fecha: new Date() }, { session: s });
  });
}

/** Guarda el libro de salas y monitores y rehace el plan. Falla ("errores") si el plan tiene errores. */
export async function aplicarSalas(libro: LibroSalas, actor: Actor) {
  const { mentores } = await collections();
  const rec = reconocer(libro, await monitoresActivos(), new Set((await mentores.find({}, { projection: { _id: 1 } }).toArray()).map((m) => m._id)));
  if (libro.errores.length || rec.errores.length) throw new Error("errores");
  await guardar(libro.salas, rec.importados, rec.disponibilidad, actor, "salas y monitores");
}

/** Rehace el plan con el último libro importado (por ejemplo, después de reimportar mentores). */
export async function recalcularPlan(actor: Actor): Promise<{ ok: true; avisos: ErrorFila[] } | { ok: false; error: "sin_salas" | "errores"; errores?: ErrorFila[] }> {
  const { salasConfig } = await collections();
  const cfg = await salasConfig.findOne({ _id: "actual" });
  if (!cfg) return { ok: false, error: "sin_salas" };
  const r = await calcular(cfg.salas, cfg.importados, cfg.disponibilidad, undefined, true);
  if (r.errores.length) return { ok: false, error: "errores", errores: r.errores };
  await guardar(cfg.salas, cfg.importados, cfg.disponibilidad, actor, "plan recalculado", true);
  return { ok: true, avisos: r.avisos };
}

export type FilaPlan = {
  id: string; dia: string; hora: number; horaTxt: string; sala: number; enlace: string;
  mentor: string; monitor: MonitorUsuario | null; origen: OrigenMonitor | null;
};

export type VistaPlan = {
  hayConfig: boolean;
  /** Los mentores por hora de los asientos ya no coinciden con el plan (se reimportaron mentores). */
  desactualizado: boolean;
  filas: FilaPlan[];
  monitores: MonitorUsuario[];
};

export async function verPlan(): Promise<VistaPlan> {
  const c = await collections();
  const [cfg, plan, mentores, monitores, horas] = await Promise.all([
    c.salasConfig.findOne({ _id: "actual" }), c.planSalas.find({}).sort({ dia: 1, hora: 1, sala: 1 }).toArray(),
    c.mentores.find({}).toArray(), monitoresActivos(), horasDeMentores(),
  ]);
  // Defensa en profundidad: solo se devuelve un enlace https, aunque la base se haya escrito por otro camino.
  const enlace = new Map((cfg?.salas ?? []).filter((s) => esHttps(s.enlace)).map((s) => [s.sala, s.enlace]));
  const nombreMentor = new Map(mentores.map((m) => [m._id, m.nombre]));
  const nombres = new Map((await c.users.find(FILTRO_MONITOR, { projection: { usuario: 1, nombre: 1 } }).toArray()).map((u) => [u.usuario, u.nombre]));
  const enAsientos = new Set(horas.flatMap((h) => h.mentores.map((m) => `${h.dia}|${h.hora}|${m}`)));
  const enPlan = new Set(plan.map((p) => `${p.dia}|${p.hora}|${p.mentorId}`));
  const desactualizado = !!cfg && (enAsientos.size !== enPlan.size || [...enPlan].some((x) => !enAsientos.has(x)));
  return {
    hayConfig: !!cfg, desactualizado, monitores: monitores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    filas: plan.map((p) => ({
      id: p._id, dia: p.dia, hora: p.hora, horaTxt: horaCO(inicioUTC(p.dia, p.hora)), sala: p.sala, enlace: enlace.get(p.sala) ?? "",
      mentor: nombreMentor.get(p.mentorId) ?? p.mentorId,
      monitor: p.monitor ? { usuario: p.monitor, nombre: nombres.get(p.monitor) ?? p.monitor } : null, origen: p.origen,
    })),
  };
}

export function esHttps(x: string): boolean {
  try { return new URL(x).protocol === "https:"; } catch { return false; }
}

/** Texto que una hoja de cálculo podría tomar como fórmula (= + - @) va con apóstrofo, por si se pasa a CSV. */
const celda = (x: string) => (/^[=+\-@]/.test(x) ? `'${x}` : x);

const describir = (p: PlanSala, nombre: string | null) => `${p.dia} ${horaCO(inicioUTC(p.dia, p.hora))} · Sala ${p.sala} · ${nombre ?? "sin monitor"}`;

/** El admin cambia (o quita, con null) el monitor de una sala en una hora. El índice único impide dos salas a la vez. */
export async function cambiarMonitorSala(id: string, monitor: string | null, actor: Actor):
  Promise<{ ok: true } | { ok: false; error: "no_existe" | "monitor_invalido" | "ocupado"; sala?: number }> {
  const c = await collections();
  let r: Awaited<ReturnType<typeof cambiarMonitorSala>> = { ok: true };
  try {
    // Cambio y changeLog juntos, y el monitor se revisa activo en la misma transacción.
    await transaccion(async (s) => {
      const p = await c.planSalas.findOne({ _id: id }, { session: s });
      if (!p) { r = { ok: false, error: "no_existe" }; return; }
      const usuarios = await monitoresActivos(s);
      if (monitor && !usuarios.some((u) => u.usuario === monitor)) { r = { ok: false, error: "monitor_invalido" }; return; }
      if (p.monitor === monitor) { r = { ok: true }; return; }
      const u = await c.planSalas.updateOne({ _id: id, monitor: p.monitor }, { $set: { monitor, origen: "admin" } }, { session: s });
      if (!u.matchedCount) { r = { ok: false, error: "no_existe" }; return; }
      const nombre = new Map(usuarios.map((x) => [x.usuario, x.nombre]));
      await c.changeLog.insertOne({
        accion: "monitor_sala", anterior: describir(p, p.monitor ? nombre.get(p.monitor) ?? p.monitor : null),
        nuevo: describir(p, monitor ? nombre.get(monitor)! : null), actor, fecha: new Date(),
      }, { session: s });
      r = { ok: true };
    });
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000) {
      const p = await c.planSalas.findOne({ _id: id });
      const otra = p && (await c.planSalas.findOne({ dia: p.dia, hora: p.hora, monitor }));
      return { ok: false, error: "ocupado", ...(otra ? { sala: otra.sala } : {}) };
    }
    throw e;
  }
  return r;
}

/** Plan de salas en Excel: Día, Hora, Sala, Enlace, Mentor y Monitor. */
export async function planSalasExcel(): Promise<Buffer> {
  const v = await verPlan();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Proyecto final JC 2026";
  const ws = wb.addWorksheet("Plan de salas");
  ws.addRow(["Día", "Hora COL", "Sala", "Enlace", "Mentor", "Monitor"]).font = { bold: true };
  if (!v.filas.length) ws.addRow(["Todavía no hay plan de salas: importa el libro de salas y monitores."]);
  for (const f of v.filas) ws.addRow([f.dia, f.horaTxt, f.sala, f.enlace, celda(f.mentor), celda(f.monitor?.nombre ?? "Sin monitor")]);
  ws.columns.forEach((col, i) => { col.width = [12, 12, 7, 40, 28, 28][i]; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

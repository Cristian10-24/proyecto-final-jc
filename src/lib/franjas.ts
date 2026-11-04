import { MongoServerError, ObjectId } from "mongodb";
import { BLOQUES_POR_HORA, MINUTOS_BLOQUE, horaCOL, inicioUTC } from "./edicion";
import { horaCO } from "./ciudades";
import { collections, transaccion } from "./db";
import { recalcularPlan } from "./planSalas";
import { CambioReglas, etiquetaGrupo, reetiquetar } from "./reglasCupos";
import type { Actor, Asiento } from "./types";

// Franjas y mentores (Paso 17b, prototipo 5b): por día y hora, qué mentores atienden (1 mentor = 4 bloques de 15 min),
// ocupación y libres por ciudad. El admin agrega un mentor a una hora (crea sus 4 asientos y reetiqueta los libres
// del día con sus reglas) o lo quita si sus asientos de esa hora están libres. Después se recalcula el plan de salas.
// Lo editado aquí manda hasta la próxima importación de Horarios, que lo reemplaza (con aviso en la vista previa).

export type FranjaEditada = { _id: string; dia: string; hora: number; mentorId: string; accion: "agregar" | "quitar"; en: Date; por: string };

export type HoraFranja = {
  hora: number; etiqueta: string;
  mentores: { id: string; nombre: string; ocupados: number }[];
  total: number; ocupados: number; libres: number;
  libresPorCiudad: { etiqueta: string; n: number }[];
};
export type DatosFranjas = {
  dia: string; dias: string[];
  totales: { total: number; ocupados: number; libres: number };
  horas: HoraFranja[];
  mentores: { id: string; nombre: string }[];
  /** Cambios de este día hechos en pantalla (mandan hasta la próxima importación de Horarios). */
  editadas: number;
  /** Salas del plan (un mentor por sala y hora); null si aún no se importó el libro de salas. */
  salas: number | null;
};

const etiquetaHora = (dia: string, h: number) => `${horaCO(inicioUTC(dia, h))} – ${horaCO(inicioUTC(dia, h + 1))}`;

export async function datosFranjas(diaPedido?: string): Promise<DatosFranjas> {
  const c = await collections();
  const todos = await c.asientos.find({}, { projection: { dia: 1, inicio: 1 } }).toArray();
  const dias = [...new Set(todos.map((a) => a.dia))].sort();
  const dia = diaPedido && dias.includes(diaPedido) ? diaPedido : dias[0] ?? "";
  // Las horas de la edición: todas las que tienen mentores algún día (las de 0 mentores ese día "no se ofrecen").
  const horasEdicion = [...new Set(todos.map((a) => horaCOL(a.inicio)))].sort((a, b) => a - b);
  const [asientos, mentores, editadas, cfg] = await Promise.all([
    c.asientos.find({ dia }).toArray(),
    c.mentores.find({}, { projection: { nombre: 1 } }).toArray(),
    c.franjasEditadas.countDocuments({ dia }),
    c.salasConfig.findOne({ _id: "actual" }, { projection: { salas: 1 } }),
  ]);
  const nombre = new Map(mentores.map((m) => [m._id, m.nombre]));
  const horas: HoraFranja[] = horasEdicion.map((h) => {
    const as = asientos.filter((a) => horaCOL(a.inicio) === h);
    const porMentor = new Map<string, number>();
    for (const a of as) porMentor.set(a.mentorId, (porMentor.get(a.mentorId) ?? 0) + (a.proyectoId ? 1 : 0));
    const libres = as.filter((a) => !a.proyectoId);
    const porCiudad = new Map<string, number>();
    for (const a of libres) porCiudad.set(etiquetaGrupo(a.ciudades), (porCiudad.get(etiquetaGrupo(a.ciudades)) ?? 0) + 1);
    return {
      hora: h, etiqueta: etiquetaHora(dia, h),
      mentores: [...porMentor].map(([id, ocupados]) => ({ id, nombre: nombre.get(id) ?? id, ocupados })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      total: as.length, ocupados: as.length - libres.length, libres: libres.length,
      libresPorCiudad: [...porCiudad].map(([etiqueta, n]) => ({ etiqueta, n })).sort((a, b) => b.n - a.n),
    };
  });
  const ocupados = asientos.filter((a) => a.proyectoId).length;
  return {
    dia, dias, horas, editadas,
    totales: { total: asientos.length, ocupados, libres: asientos.length - ocupados },
    mentores: mentores.map((m) => ({ id: m._id, nombre: m.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    salas: cfg ? cfg.salas.length : null,
  };
}

export type ResultadoFranja =
  | { ok: true; aviso?: string }
  | { ok: false; error: "no_existe" | "duplicado" | "sin_salas" | "ocupado" | "reglas" | "cambio"; mensaje: string; proyectos?: { codigo: string; nombre: string; hora: string }[] };

class FallaFranja extends Error { constructor(readonly r: Extract<ResultadoFranja, { ok: false }>) { super(r.error); } }

/** Tras cambiar mentores: rehace el plan de salas con el último libro (si hay). Si no se puede, queda el aviso. */
async function recalcularSalas(actor: Actor): Promise<string | undefined> {
  // El cambio de mentores ya quedó guardado: si el recálculo falla (p. ej., otro recálculo a la vez), solo avisa.
  const r = await recalcularPlan(actor).catch(() => null);
  if (r && (r.ok || r.error === "sin_salas")) return undefined;
  return "El plan de salas no se pudo recalcular solo: revísalo en Salas («Recalcular plan»).";
}

async function registrar(s: import("mongodb").ClientSession, dia: string, hora: number, mentorId: string, nombre: string, accion: "agregar" | "quitar", actor: Actor) {
  const c = await collections(), ahora = new Date();
  await c.franjasEditadas.replaceOne({ _id: `${dia}|${hora}|${mentorId}` }, { dia, hora, mentorId, accion, en: ahora, por: actor.usuario ?? actor.rol }, { upsert: true, session: s });
  await c.changeLog.insertOne({ accion: "franjas", nuevo: `${dia} ${etiquetaHora(dia, hora)}: ${accion === "agregar" ? "+" : "−"} ${nombre}`, actor, fecha: ahora }, { session: s });
}

/** Agrega un mentor a una hora: crea sus 4 asientos, reetiqueta los libres del día con sus reglas y recalcula las salas. */
export async function agregarMentor(dia: string, hora: number, mentorId: string, actor: Actor): Promise<ResultadoFranja> {
  const c = await collections();
  const [mentor, cfgSalas, enHora, existeDia] = await Promise.all([
    c.mentores.findOne({ _id: mentorId }),
    c.salasConfig.findOne({ _id: "actual" }, { projection: { salas: 1 } }),
    c.asientos.distinct("mentorId", { dia, inicio: { $gte: inicioUTC(dia, hora), $lt: inicioUTC(dia, hora + 1) } }),
    c.asientos.findOne({ dia }, { projection: { _id: 1 } }),
  ]);
  if (!mentor || !existeDia) return { ok: false, error: "no_existe", mensaje: "Ese mentor o ese día no existen." };
  if (enHora.includes(mentorId)) return { ok: false, error: "duplicado", mensaje: `${mentor.nombre} ya está a esa hora.` };
  if (cfgSalas && enHora.length + 1 > cfgSalas.salas.length)
    return { ok: false, error: "sin_salas", mensaje: `A esa hora ya hay ${enHora.length} mentores y solo ${cfgSalas.salas.length} salas.` };
  try {
    await transaccion(async (s) => {
      const nuevos: Asiento[] = Array.from({ length: BLOQUES_POR_HORA }, (_, b) => ({ _id: new ObjectId(), dia, inicio: inicioUTC(dia, hora, b * MINUTOS_BLOQUE), mentorId, ciudades: [], proyectoId: null }));
      // Escribir el mismo documento del día hace chocar dos transacciones simultáneas: Mongo reintenta la segunda,
      // que ya ve los asientos de la primera. Luego se vuelve a contar: así dos admins no pasan del número de salas.
      await c.dias.updateOne({ _id: dia }, { $set: { franjasEn: new Date() }, $setOnInsert: { ciudades: [] } }, { upsert: true, session: s });
      await c.asientos.insertMany(nuevos, { session: s });
      if (cfgSalas) {
        const n = (await c.asientos.distinct("mentorId", { dia, inicio: { $gte: inicioUTC(dia, hora), $lt: inicioUTC(dia, hora + 1) } }, { session: s })).length;
        if (n > cfgSalas.salas.length) throw new FallaFranja({ ok: false, error: "sin_salas", mensaje: `A esa hora ya hay ${n - 1} mentores y solo ${cfgSalas.salas.length} salas.` });
      }
      const plan = await reetiquetar(s, dia, (await c.dias.findOne({ _id: dia }, { session: s }))?.ciudades ?? []);
      if (plan.errores.length) throw new FallaFranja({ ok: false, error: "reglas", mensaje: plan.errores.join(" ") });
      await registrar(s, dia, hora, mentorId, mentor.nombre, "agregar", actor);
    });
  } catch (e) {
    if (e instanceof FallaFranja) return e.r;
    if (e instanceof CambioReglas) return { ok: false, error: "cambio", mensaje: "Alguien reservó una hora mientras se guardaba. Inténtalo otra vez." };
    if (e instanceof MongoServerError && e.code === 11000) return { ok: false, error: "duplicado", mensaje: `${mentor.nombre} ya está a esa hora.` };
    throw e;
  }
  const aviso = await recalcularSalas(actor);
  return { ok: true, ...(aviso ? { aviso } : {}) };
}

/** Quita un mentor de una hora, solo si sus asientos de esa hora están libres; si no, dice qué proyectos mover. */
export async function quitarMentor(dia: string, hora: number, mentorId: string, actor: Actor): Promise<ResultadoFranja> {
  const c = await collections();
  const [mentor, suyos] = await Promise.all([
    c.mentores.findOne({ _id: mentorId }),
    c.asientos.find({ dia, mentorId, inicio: { $gte: inicioUTC(dia, hora), $lt: inicioUTC(dia, hora + 1) } }).toArray(),
  ]);
  if (!suyos.length) return { ok: false, error: "no_existe", mensaje: "Ese mentor no está a esa hora." };
  const ocupados = suyos.filter((a) => a.proyectoId);
  if (ocupados.length) {
    const ps = await c.proyectos.find({ _id: { $in: ocupados.map((a) => a.proyectoId!) } }, { projection: { codigo: 1, nombre: 1 } }).toArray();
    ocupados.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    const hora_ = new Map(ocupados.map((a) => [String(a.proyectoId), horaCO(a.inicio)]));
    const orden = ocupados.map((a) => String(a.proyectoId));
    ps.sort((a, b) => orden.indexOf(String(a._id)) - orden.indexOf(String(b._id)));
    return {
      ok: false, error: "ocupado", mensaje: `${mentor?.nombre ?? mentorId} tiene ${ocupados.length} proyecto${ocupados.length === 1 ? "" : "s"} a esa hora: muévelos primero (Tablero u Horarios).`,
      proyectos: ps.map((p) => ({ codigo: p.codigo, nombre: p.nombre, hora: hora_.get(String(p._id)) ?? "" })),
    };
  }
  try {
    await transaccion(async (s) => {
      // Solo si siguen libres (nadie reservó mientras tanto).
      const r = await c.asientos.deleteMany({ _id: { $in: suyos.map((a) => a._id) }, proyectoId: null }, { session: s });
      if (r.deletedCount !== suyos.length) throw new CambioReglas();
      const plan = await reetiquetar(s, dia, (await c.dias.findOne({ _id: dia }, { session: s }))?.ciudades ?? []);
      if (plan.errores.length) throw new FallaFranja({ ok: false, error: "reglas", mensaje: `Sin ese mentor no alcanzan los cupos de las reglas del día: ${plan.errores.join(" ")} Baja los cupos en Reglas de cupos primero.` });
      await registrar(s, dia, hora, mentorId, mentor?.nombre ?? mentorId, "quitar", actor);
    });
  } catch (e) {
    if (e instanceof FallaFranja) return e.r;
    if (e instanceof CambioReglas) return { ok: false, error: "cambio", mensaje: "Alguien reservó una hora de ese mentor mientras se quitaba. Revisa otra vez." };
    throw e;
  }
  const aviso = await recalcularSalas(actor);
  return { ok: true, ...(aviso ? { aviso } : {}) };
}

/** Cambios de franjas hechos en pantalla (todos los días), para avisar antes de importar Horarios. */
export async function franjasEditadas(): Promise<number> {
  return (await collections()).franjasEditadas.countDocuments({});
}

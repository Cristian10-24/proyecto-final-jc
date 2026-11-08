import { MongoServerError, type ClientSession } from "mongodb";
import { ciudadesDelDia, ciudadesExplicitas, TODAS } from "./agenda";
import { collections, transaccion } from "./db";
import type { Actor, DiaConfig } from "./types";

// Fase 4 · Modo «orden de llegada». Con el interruptor encendido, cualquier asiento libre de un día lo toma cualquier
// ciudad habilitada ese día (las etiquetas `asientos.ciudades` se ignoran; no se borran ni cambian). El único límite
// es el TOPE de cada ciudad en el día: su «Máximo del día» o, sin él, sus «Cupos reservados». Sin tope: la ciudad de
// sobrante, la que no tiene cupos y las que presentan por «Todas».
// La ocupación (proyectos de la ciudad con asiento ese día) se calcula siempre de los datos reales: no hay contadores
// que mantener. Para que dos reservas simultáneas no pasen el tope, cada una escribe primero el candado de su ciudad y
// día dentro de la transacción: MongoDB aborta una por conflicto de escritura y la reintenta con la ocupación nueva.

/** true si el modo orden de llegada está encendido. Sin documento = apagado (la app como antes). */
export async function modoOrdenLlegada(session?: ClientSession): Promise<boolean> {
  const c = await collections();
  return (await c.ajustes.findOne({ _id: "modoCupos" }, { session }))?.ordenLlegada === true;
}

/** Tope de la ciudad ese día, o null si no tiene (sobrante, sin cupos, por «Todas» o sin fila). */
export function topeCiudad(cfg: Pick<DiaConfig, "ciudades">, ciudad: string): number | null {
  if (ciudad === TODAS) return null;
  const fila = cfg.ciudades.find((c) => c.ciudad === ciudad);
  if (!fila || fila.sobrante) return null;
  return fila.max ?? fila.cupos ?? null;
}

/** Proyectos de la ciudad con asiento, por día (de los datos reales). */
export async function ocupacionCiudad(ciudad: string, session?: ClientSession): Promise<Map<string, number>> {
  const c = await collections();
  // En orden (no en paralelo): dentro de una transacción la sesión no admite operaciones simultáneas.
  const ids = (await c.proyectos.find({ ciudad }, { session, projection: { _id: 1 } }).toArray()).map((p) => p._id);
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const filas = await c.asientos.aggregate<{ _id: string; n: number }>([
    { $match: { proyectoId: { $in: ids } } },
    { $group: { _id: "$dia", n: { $sum: 1 } } },
  ], { session }).toArray();
  for (const f of filas) out.set(f._id, f.n);
  return out;
}

const idCandado = (dia: string, ciudad: string) => `${dia}|${ciudad}`;

/** Crea el candado si no existe (fuera de una transacción; ignora el duplicado si otro lo creó a la vez). */
export async function asegurarCandado(dia: string, ciudad: string): Promise<void> {
  const c = await collections();
  try { await c.candadosCupo.insertOne({ _id: idCandado(dia, ciudad), v: 0 }); }
  catch (e) { if (!(e instanceof MongoServerError && e.code === 11000)) throw e; }
}

export class SinCandado extends Error { constructor(readonly dia: string, readonly ciudad: string) { super("sin_candado"); } }

/** Dentro de la transacción: escribe el candado (debe existir; si no, SinCandado para crearlo fuera y repetir). */
export async function tocarCandado(s: ClientSession, dia: string, ciudad: string): Promise<void> {
  const c = await collections();
  const r = await c.candadosCupo.updateOne({ _id: idCandado(dia, ciudad) }, { $inc: { v: 1 } }, { session: s });
  if (r.matchedCount === 0) throw new SinCandado(dia, ciudad);
}

/** Corre `fn` en una transacción; si le faltaba un candado, lo crea fuera y la repite (hasta 3 veces). */
export async function conCandado(fn: (s: ClientSession) => Promise<void>): Promise<void> {
  for (let i = 0; ; i++) {
    try { return await transaccion(fn); }
    catch (e) {
      if (!(e instanceof SinCandado) || i >= 2) throw e;
      await asegurarCandado(e.dia, e.ciudad);
    }
  }
}

/** Dentro de la transacción: tope vigente de la ciudad ese día (null si el modo está apagado o no tiene tope). */
export async function topeVigente(s: ClientSession, dia: string, ciudad: string): Promise<number | null> {
  if (!(await modoOrdenLlegada(s))) return null;
  const cfg = await (await collections()).dias.findOne({ _id: dia }, { session: s });
  return cfg ? topeCiudad(cfg, ciudad) : null;
}

/**
 * Dentro de la transacción de mover (después de tomar el asiento nuevo): con el modo encendido, si el proyecto llega a
 * un día distinto y su ciudad tiene tope, escribe el candado (choca con las reservas simultáneas) y dice si la ciudad
 * quedó por encima del tope. Con el modo apagado, o en el mismo día, siempre false.
 */
export async function quedaSobreTope(s: ClientSession, ciudad: string, diaAnterior: string | null, diaNuevo: string): Promise<boolean> {
  if (diaAnterior === diaNuevo) return false;
  const tope = await topeVigente(s, diaNuevo, ciudad);
  if (tope === null) return false;
  await tocarCandado(s, diaNuevo, ciudad);
  return ((await ocupacionCiudad(ciudad, s)).get(diaNuevo) ?? 0) > tope;
}

/** Para las pantallas (fuera de transacción): tope y ocupación de la ciudad ese día, o null si no aplica. */
export async function topeDeDia(ciudad: string, dia: string): Promise<{ tope: number; lleva: number } | null> {
  if (!(await modoOrdenLlegada())) return null;
  const cfg = await (await collections()).dias.findOne({ _id: dia });
  const tope = cfg ? topeCiudad(cfg, ciudad) : null;
  if (tope === null) return null;
  return { tope, lleva: (await ocupacionCiudad(ciudad)).get(dia) ?? 0 };
}

// ---- Resumen para la tarjeta de Reglas ----

export type ResumenCiudadModo = { ciudad: string; tope: number | null; lleva: number; puedeTomar: number; habilitada: boolean };
export type ResumenDiaModo = { dia: string; libres: number; ciudades: ResumenCiudadModo[] };
export type EstadoModo = { ordenLlegada: boolean; actualizadoEn: string | null; actualizadoPor: string | null; dias: ResumenDiaModo[] };

/** Pura: por día y ciudad, tope, cuántos lleva y cuántos puede tomar todavía (mín. entre lo que le falta y los libres). */
export function resumenModo(
  dias: DiaConfig[],
  libresPorDia: Map<string, number>,
  ocupacion: { dia: string; ciudad: string; n: number }[],
): ResumenDiaModo[] {
  const explicitas = ciudadesExplicitas(dias);
  return [...dias].sort((a, b) => a._id.localeCompare(b._id)).map((d) => {
    const libres = libresPorDia.get(d._id) ?? 0;
    const habilitadas = [...ciudadesDelDia(d.ciudades, d._id, explicitas).keys()];
    const conReservas = ocupacion.filter((o) => o.dia === d._id).map((o) => o.ciudad);
    const nombres = [...new Set([...habilitadas, ...conReservas])].sort((a, b) => a.localeCompare(b, "es"));
    return {
      dia: d._id, libres,
      ciudades: nombres.map((ciudad) => {
        const habilitada = habilitadas.includes(ciudad);
        const tope = habilitada ? topeCiudad(d, ciudad) : null;
        const lleva = ocupacion.find((o) => o.dia === d._id && o.ciudad === ciudad)?.n ?? 0;
        const puedeTomar = !habilitada ? 0 : tope === null ? libres : Math.max(0, Math.min(libres, tope - lleva));
        return { ciudad, tope, lleva, puedeTomar, habilitada };
      }),
    };
  });
}

/** Estado del interruptor y resumen por día y ciudad (libres = asientos libres que aún no empiezan). */
export async function estadoModo(ahora = new Date()): Promise<EstadoModo> {
  const c = await collections();
  const [ajuste, dias, libres, ocupacion] = await Promise.all([
    c.ajustes.findOne({ _id: "modoCupos" }),
    c.dias.find({}).toArray(),
    c.asientos.aggregate<{ _id: string; n: number }>([{ $match: { proyectoId: null, inicio: { $gt: ahora } } }, { $group: { _id: "$dia", n: { $sum: 1 } } }]).toArray(),
    c.asientos.aggregate<{ _id: { dia: string; ciudad: string }; n: number }>([
      { $match: { proyectoId: { $type: "objectId" } } },
      { $lookup: { from: "proyectos", localField: "proyectoId", foreignField: "_id", as: "p", pipeline: [{ $project: { ciudad: 1 } }] } },
      { $unwind: "$p" },
      { $group: { _id: { dia: "$dia", ciudad: "$p.ciudad" }, n: { $sum: 1 } } },
    ]).toArray(),
  ]);
  return {
    ordenLlegada: ajuste?.ordenLlegada === true,
    actualizadoEn: ajuste?.actualizadoEn.toISOString() ?? null,
    actualizadoPor: ajuste?.actualizadoPor ?? null,
    dias: resumenModo(dias, new Map(libres.map((x) => [x._id, x.n])), ocupacion.map((o) => ({ ...o._id, n: o.n }))),
  };
}

/** Enciende o apaga el modo (solo admin). Al encender crea los candados de cada día y ciudad. Deja changeLog. */
export async function cambiarModo(ordenLlegada: boolean, actor: Actor): Promise<void> {
  const c = await collections(), ahora = new Date();
  if (ordenLlegada) {
    const dias = await c.dias.find({}).toArray();
    const explicitas = ciudadesExplicitas(dias);
    for (const d of dias) for (const ciudad of ciudadesDelDia(d.ciudades, d._id, explicitas).keys()) await asegurarCandado(d._id, ciudad);
  }
  await transaccion(async (s) => {
    const antes = await modoOrdenLlegada(s);
    await c.ajustes.replaceOne({ _id: "modoCupos" }, { ordenLlegada, actualizadoEn: ahora, actualizadoPor: actor.usuario ?? actor.rol }, { upsert: true, session: s });
    await c.changeLog.insertOne({ accion: "modo_cupos", anterior: antes ? "orden de llegada" : "por etiquetas", nuevo: ordenLlegada ? "orden de llegada" : "por etiquetas", actor, fecha: ahora }, { session: s });
  });
}

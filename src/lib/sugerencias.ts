import { MongoServerError, ObjectId, type Filter } from "mongodb";
import { horaCO } from "./ciudades";
import { collections, transaccion } from "./db";
import { diaCOL } from "./edicion";
import { Falla, moverProyecto, type CambioSugerido } from "./evaluacion/monitor";
import type { Actor, Asiento } from "./types";

// Bandeja de cambios sugeridos (Paso 14): el monitor sugiere un cambio especial (otro día, otra ciudad, después de la
// clausura) y el admin lo aprueba eligiendo el bloque nuevo (cualquier día; con advertencia si no es de su ciudad o
// su ciudad no presenta ese día) o lo rechaza con un motivo. Aprobar mueve el proyecto en la misma transacción que
// marca la sugerencia (dos admins a la vez: solo uno la resuelve). Todo deja changeLog.

const etiqueta = (inicio: Date) => `${diaCOL(inicio)} ${horaCO(inicio)}`;

export type FilaSugerencia = {
  id: string; proyectoId: string; codigo: string; proyecto: string; ciudad: string; integrantes: string[];
  /** Hora actual del proyecto (null si ya no tiene) y su mentor. */
  hora: { inicio: string; mentor: string } | null;
  monitor: string; detalle: string; motivo: string; creadoEn: string;
  estado: CambioSugerido["estado"]; resueltoPor?: string; resueltoEn?: string; nuevo?: string; respuesta?: string;
};

/** Pendientes (más antiguas primero) y las últimas 15 resueltas. */
export async function bandeja(): Promise<{ pendientes: FilaSugerencia[]; resueltas: FilaSugerencia[] }> {
  const c = await collections();
  const [pend, res] = await Promise.all([
    c.cambiosSugeridos.find({ estado: "pendiente" }).sort({ creadoEn: 1 }).toArray(),
    c.cambiosSugeridos.find({ estado: { $ne: "pendiente" } }).sort({ resueltoEn: -1 }).limit(15).toArray(),
  ]);
  const todas = [...pend, ...res], ids = todas.map((x) => x.proyectoId);
  const [proyectos, asientos, usuarios] = await Promise.all([
    c.proyectos.find({ _id: { $in: ids } }, { projection: { codigo: 1, nombre: 1, ciudad: 1, integrantes: 1 } }).toArray(),
    c.asientos.find({ proyectoId: { $in: ids } }).toArray(),
    c.users.find({ usuario: { $in: [...new Set(todas.flatMap((x) => [x.creadoPor, x.resueltoPor ?? ""]))] } }, { projection: { usuario: 1, nombre: 1 } }).toArray(),
  ]);
  const mentores = new Map((await c.mentores.find({ _id: { $in: asientos.map((a) => a.mentorId) } }).toArray()).map((m) => [m._id, m.nombre]));
  const p = new Map(proyectos.map((x) => [String(x._id), x])), a = new Map(asientos.map((x) => [String(x.proyectoId), x]));
  const nombre = new Map(usuarios.map((u) => [u.usuario, u.nombre]));
  const fila = (x: CambioSugerido): FilaSugerencia => {
    const pr = p.get(String(x.proyectoId)), as = a.get(String(x.proyectoId));
    return {
      id: String(x._id), proyectoId: String(x.proyectoId), codigo: pr?.codigo ?? "", proyecto: pr?.nombre ?? "(proyecto borrado)", ciudad: pr?.ciudad ?? "",
      integrantes: pr?.integrantes.map((i) => i.nombre) ?? [],
      hora: as ? { inicio: as.inicio.toISOString(), mentor: mentores.get(as.mentorId) ?? as.mentorId } : null,
      monitor: nombre.get(x.creadoPor) ?? x.creadoPor, detalle: x.detalle, motivo: x.motivo, creadoEn: x.creadoEn.toISOString(), estado: x.estado,
      ...(x.resueltoPor ? { resueltoPor: nombre.get(x.resueltoPor) ?? x.resueltoPor } : {}), ...(x.resueltoEn ? { resueltoEn: x.resueltoEn.toISOString() } : {}),
      ...(x.nuevo ? { nuevo: x.nuevo } : {}), ...(x.respuesta ? { respuesta: x.respuesta } : {}),
    };
  };
  return { pendientes: pend.map(fila), resueltas: res.map(fila) };
}

export async function pendientes(): Promise<number> {
  return (await collections()).cambiosSugeridos.countDocuments({ estado: "pendiente" });
}

type ErrorSugerencia = { error: "no_existe" | "ya_resuelta" | "sin_hora" | "sin_cupo" | "ya_evaluado" | "cambio" | "misma_hora" };
class Resuelta extends Error {}

/**
 * Aprueba: mueve el proyecto al bloque `inicio` (primero un asiento de su ciudad; con `otraCiudad`, cualquiera libre)
 * y marca la sugerencia como aprobada, todo en una transacción. Vale cualquier día de la edición, también uno en
 * que su ciudad no presenta o después de su clausura (la pantalla lo advierte).
 */
export async function aprobar(id: string, inicio: Date, otraCiudad: boolean, actor: Actor & { usuario: string }): Promise<{ ok: true; nuevo: string } | ErrorSugerencia> {
  if (!ObjectId.isValid(id)) return { error: "no_existe" };
  const c = await collections();
  const sug = await c.cambiosSugeridos.findOne({ _id: new ObjectId(id) });
  if (!sug) return { error: "no_existe" };
  if (sug.estado !== "pendiente") return { error: "ya_resuelta" };
  const [p, viejo] = await Promise.all([c.proyectos.findOne({ _id: sug.proyectoId }, { projection: { ciudad: 1 } }), c.asientos.findOne({ proyectoId: sug.proyectoId })]);
  if (!p) return { error: "no_existe" };
  if (!viejo) return { error: "sin_hora" };
  if (viejo.inicio.getTime() === inicio.getTime()) return { error: "misma_hora" };
  const filtros: Filter<Asiento>[] = [{ inicio, ciudades: p.ciudad }, ...(otraCiudad ? [{ inicio }] : [])];
  const ahora = new Date();
  let nuevo = "";
  try {
    await transaccion(async (s) => {
      // Reclamar la sugerencia primero: si otro admin la resolvió, aquí se detiene.
      const tomada = await c.cambiosSugeridos.findOneAndUpdate({ _id: sug._id, estado: "pendiente" },
        { $set: { estado: "aprobado", resueltoPor: actor.usuario, resueltoEn: ahora } }, { session: s });
      if (!tomada) throw new Resuelta();
      const a = await moverProyecto(s, sug.proyectoId, viejo._id, filtros, actor.usuario, ahora);
      const ajeno = !a.ciudades.includes(p.ciudad);
      nuevo = `${etiqueta(a.inicio)} · ${a.mentorId}${ajeno ? ` · asiento de ${a.ciudades.join(" + ") || "(sin ciudad)"}` : ""}`;
      await c.cambiosSugeridos.updateOne({ _id: sug._id }, { $set: { nuevo } }, { session: s });
      await c.changeLog.insertOne({
        proyectoId: sug.proyectoId, accion: "cambiar_hora", anterior: `${etiqueta(viejo.inicio)} · ${viejo.mentorId}`, nuevo,
        motivo: `Sugerencia del monitor: ${sug.detalle} (${sug.motivo})`, actor, fecha: ahora,
      }, { session: s });
      await c.changeLog.insertOne({ proyectoId: sug.proyectoId, accion: "aprobar_cambio", anterior: sug.detalle, nuevo, actor, fecha: ahora }, { session: s });
    });
  } catch (e) {
    if (e instanceof Resuelta) return { error: "ya_resuelta" };
    if (e instanceof Falla) return { error: e.codigo };
    if (e instanceof MongoServerError && e.code === 11000) return { error: "sin_cupo" };
    throw e;
  }
  return { ok: true, nuevo };
}

/** Rechaza con un motivo (lo ve el monitor). La hora no cambia. */
export async function rechazar(id: string, motivo: string, actor: Actor & { usuario: string }): Promise<{ ok: true } | ErrorSugerencia> {
  if (!ObjectId.isValid(id)) return { error: "no_existe" };
  const c = await collections(), ahora = new Date();
  let r: ErrorSugerencia | null = null;
  await transaccion(async (s) => {
    const sug = await c.cambiosSugeridos.findOneAndUpdate({ _id: new ObjectId(id), estado: "pendiente" },
      { $set: { estado: "rechazado", respuesta: motivo, resueltoPor: actor.usuario, resueltoEn: ahora } }, { session: s });
    if (!sug) { r = (await c.cambiosSugeridos.countDocuments({ _id: new ObjectId(id) }, { session: s })) ? { error: "ya_resuelta" } : { error: "no_existe" }; return; }
    await c.changeLog.insertOne({ proyectoId: sug.proyectoId, accion: "rechazar_cambio", anterior: sug.detalle, motivo, actor, fecha: ahora }, { session: s });
  });
  return r ?? { ok: true };
}

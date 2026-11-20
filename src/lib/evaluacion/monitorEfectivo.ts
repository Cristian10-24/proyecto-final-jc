import type { ClientSession, ObjectId } from "mongodb";
import { collections } from "../db";

// Monitor por proyecto (rama feature/monitor-por-proyecto). El monitor de un proyecto en su presentación es el de su
// bloque (plan de salas: día + hora + mentor), salvo que el admin haya asignado a mano otro monitor SOLO para ese
// proyecto (colección nueva y opcional `monitorExcepciones`). La excepción vale solo para la reserva con la que se
// creó (mismo día, hora de inicio y mentor): si el proyecto se reprograma, deja de aplicar sola. Sin excepciones,
// todo se comporta exactamente igual que antes. La sala, el enlace, el mentor y la reserva nunca cambian.

export type ExcepcionMonitor = {
  _id?: ObjectId;
  proyectoId: ObjectId;
  /** Reserva para la que vale: día (AAAA-MM-DD, Colombia), inicio exacto del asiento y su mentor. */
  dia: string;
  horaInicio: Date;
  mentorId: string;
  /** Usuario del monitor asignado a mano. */
  monitorId: string;
  motivo?: string;
  creadoPor: string;
  creadoEn: Date;
};

type AsientoRef = { inicio: Date; mentorId: string; proyectoId?: ObjectId | null };

/** ¿La excepción vale para esta reserva? (mismo proyecto, misma hora de inicio y mismo mentor). */
export const vigente = (e: Pick<ExcepcionMonitor, "proyectoId" | "horaInicio" | "mentorId"> | null | undefined, a: AsientoRef): boolean =>
  !!e && !!a.proyectoId && String(e.proyectoId) === String(a.proyectoId) && e.horaInicio.getTime() === a.inicio.getTime() && e.mentorId === a.mentorId;

/**
 * Monitor efectivo de un proyecto en su reserva actual: la excepción si existe y está vigente; si no, el monitor del
 * bloque (el del plan de salas, o null = «Sin monitor»). `manual` = viene de una excepción del admin.
 */
export function monitorEfectivo(a: AsientoRef, delBloque: string | null, excepcion?: ExcepcionMonitor | null): { monitor: string | null; manual: boolean } {
  if (excepcion && vigente(excepcion, a)) return { monitor: excepcion.monitorId, manual: true };
  return { monitor: delBloque, manual: false };
}

/** Excepciones VIGENTES de estos asientos, por id de proyecto. Sin asientos o sin excepciones: mapa vacío. */
export async function excepcionesDe(asis: readonly AsientoRef[], session?: ClientSession): Promise<Map<string, ExcepcionMonitor>> {
  const ids = asis.flatMap((a) => (a.proyectoId ? [a.proyectoId] : []));
  if (!ids.length) return new Map();
  const { monitorExcepciones } = await collections();
  const lista = await monitorExcepciones.find({ proyectoId: { $in: ids } }, session ? { session } : {}).toArray();
  if (!lista.length) return new Map();
  const asientoDe = new Map(asis.flatMap((a) => (a.proyectoId ? [[String(a.proyectoId), a] as const] : [])));
  return new Map(lista.filter((e) => vigente(e, asientoDe.get(String(e.proyectoId)) ?? { inicio: new Date(NaN), mentorId: "" })).map((e) => [String(e.proyectoId), e]));
}

/** Proyectos que este monitor tiene asignados a mano, con su asiento actual (solo las excepciones vigentes). */
export async function excepcionesDelMonitor(usuario: string) {
  const { monitorExcepciones, asientos } = await collections();
  const lista = await monitorExcepciones.find({ monitorId: usuario }).toArray();
  if (!lista.length) return [];
  const asis = await asientos.find({ proyectoId: { $in: lista.map((e) => e.proyectoId) } }).toArray();
  const asientoDe = new Map(asis.map((a) => [String(a.proyectoId), a]));
  return lista.flatMap((e) => {
    const a = asientoDe.get(String(e.proyectoId));
    return a && vigente(e, a) ? [{ excepcion: e, asiento: a }] : [];
  });
}

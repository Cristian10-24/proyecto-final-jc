import { ObjectId, type Filter } from "mongodb";
import { scopeFilter, type SessionUser } from "./auth";
import { collections } from "./db";
import { puede, type RolUsuario } from "./permisos";
import type { Proyecto } from "./types";

// Fase 4 · Paso 22 · Comentarios de seguimiento en un proyecto (colección nueva `comentarios`; el proyecto no se toca).
// El monitor escribe en los proyectos de sus ciudades; coordinación y admin, en todos (para responderle). Cada uno edita
// o borra solo los suyos (borrar = ocultar con `borradoEn`). Texto plano: se guarda tal cual (React lo escapa al mostrarlo).

export type Comentario = {
  _id: ObjectId; proyectoId: ObjectId;
  autor: string; autorNombre: string; rol: RolUsuario;
  texto: string; creadoEn: Date; editadoEn?: Date; borradoEn?: Date;
  /** Textos anteriores al editar (no se pierde lo que coordinación ya leyó). */
  anteriores?: { texto: string; hasta: Date }[];
};
export type ComentarioVista = { id: string; autorNombre: string; rol: RolUsuario; texto: string; creadoEn: string; editadoEn?: string; tuyo: boolean };

export const MAX_COMENTARIO = 1000;
/** Topes de volumen: comentarios visibles de un autor en un proyecto, y los que se muestran (los más recientes). */
export const MAX_POR_AUTOR = 50;
export const MAX_LISTA = 200;

/** Texto plano: NFC, sin caracteres de control (salvo saltos de línea), sin espacios al final de cada línea y con a lo
 *  sumo una línea en blanco seguida. */
export function limpiarComentario(t: string): string {
  return t.normalize("NFC").replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "")
    .split("\n").map((l) => l.replace(/\s+$/u, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

type Falla = { ok: false; error: "no_existe" | "datos" | "ajeno" | "sin_permiso"; mensaje: string };
const falla = (error: Falla["error"], mensaje: string): Falla => ({ ok: false, error, mensaje });

/** El proyecto existe y está en el alcance del usuario (monitor: sus ciudades). */
async function visible(user: Pick<SessionUser, "rol" | "rolesExtra" | "ciudades">, pid: ObjectId) {
  const { proyectos } = await collections();
  return proyectos.findOne({ _id: pid, ...(scopeFilter<Proyecto>(user) as Filter<Proyecto>) }, { projection: { _id: 1 } });
}

function texto(t: string): string | Falla {
  const limpio = limpiarComentario(t);
  if (!limpio) return falla("datos", "Escribe el comentario.");
  if (limpio.length > MAX_COMENTARIO) return falla("datos", `El comentario es muy largo (máximo ${MAX_COMENTARIO} caracteres).`);
  return limpio;
}

export async function listarComentarios(user: SessionUser, pid: ObjectId): Promise<{ ok: true; comentarios: ComentarioVista[]; puedeEscribir: boolean } | Falla> {
  if (!(await visible(user, pid))) return falla("no_existe", "Ese proyecto no existe o no es de tus ciudades.");
  const { comentarios } = await collections();
  const lista = (await comentarios.find({ proyectoId: pid, borradoEn: { $exists: false } }, { projection: { anteriores: 0 } }).sort({ creadoEn: -1 }).limit(MAX_LISTA).toArray()).reverse();
  return {
    ok: true, puedeEscribir: puede(user, "comentar_proyectos"),
    comentarios: lista.map((c) => ({
      id: String(c._id), autorNombre: c.autorNombre, rol: c.rol, texto: c.texto, creadoEn: c.creadoEn.toISOString(),
      ...(c.editadoEn ? { editadoEn: c.editadoEn.toISOString() } : {}), tuyo: c.autor === user.usuario,
    })),
  };
}

export async function crearComentario(user: SessionUser, pid: ObjectId, t: string): Promise<{ ok: true; id: string } | Falla> {
  if (!puede(user, "comentar_proyectos")) return falla("sin_permiso", "No puedes escribir comentarios.");
  const limpio = texto(t);
  if (typeof limpio !== "string") return limpio;
  if (!(await visible(user, pid))) return falla("no_existe", "Ese proyecto no existe o no es de tus ciudades.");
  const { comentarios } = await collections();
  if ((await comentarios.countDocuments({ proyectoId: pid, autor: user.usuario, borradoEn: { $exists: false } })) >= MAX_POR_AUTOR)
    return falla("datos", `Ya tienes ${MAX_POR_AUTOR} comentarios en este proyecto. Edita o borra alguno.`);
  const _id = new ObjectId();
  await comentarios.insertOne({ _id, proyectoId: pid, autor: user.usuario, autorNombre: user.nombre, rol: user.rol, texto: limpio, creadoEn: new Date() });
  // Si el admin unió (eliminó) el proyecto en este instante, el comentario no queda huérfano: se quita y se avisa.
  if (!(await visible(user, pid))) {
    await comentarios.deleteOne({ _id });
    return falla("no_existe", "Ese proyecto cambió mientras escribías (se unió a otro). Ábrelo otra vez.");
  }
  return { ok: true, id: String(_id) };
}

/** Editar o borrar: solo el autor, en un proyecto que todavía ve, y un comentario que no esté borrado. */
async function propio(user: SessionUser, pid: ObjectId, id: ObjectId, cambio: object | object[]): Promise<{ ok: true } | Falla> {
  if (!puede(user, "comentar_proyectos")) return falla("sin_permiso", "No puedes cambiar comentarios.");
  if (!(await visible(user, pid))) return falla("no_existe", "Ese proyecto no existe o no es de tus ciudades.");
  const { comentarios } = await collections();
  const r = await comentarios.updateOne({ _id: id, proyectoId: pid, autor: user.usuario, borradoEn: { $exists: false } }, Array.isArray(cambio) ? cambio : { $set: cambio });
  if (r.matchedCount) return { ok: true };
  const c = await comentarios.findOne({ _id: id, proyectoId: pid, borradoEn: { $exists: false } }, { projection: { autor: 1 } });
  return c ? falla("ajeno", "Solo puedes cambiar tus propios comentarios.") : falla("no_existe", "Ese comentario ya no existe.");
}

export async function editarComentario(user: SessionUser, pid: ObjectId, id: ObjectId, t: string): Promise<{ ok: true } | Falla> {
  const limpio = texto(t);
  if (typeof limpio !== "string") return limpio;
  // En un pipeline: el texto anterior pasa a `anteriores` en la misma escritura atómica.
  const ahora = new Date();
  return propio(user, pid, id, [{ $set: {
    anteriores: { $concatArrays: [{ $ifNull: ["$anteriores", []] }, [{ texto: "$texto", hasta: ahora }]] },
    texto: { $literal: limpio }, editadoEn: ahora,
  } }]);
}

export async function borrarComentario(user: SessionUser, pid: ObjectId, id: ObjectId): Promise<{ ok: true } | Falla> {
  return propio(user, pid, id, { borradoEn: new Date() });
}

/** Comentarios visibles por proyecto (para el indicador «Con comentarios»). */
export async function conteoComentarios(ids: ObjectId[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const { comentarios } = await collections();
  const r = await comentarios.aggregate<{ _id: ObjectId; n: number }>([
    { $match: { proyectoId: { $in: ids }, borradoEn: { $exists: false } } },
    { $group: { _id: "$proyectoId", n: { $sum: 1 } } },
  ]).toArray();
  return new Map(r.map((x) => [String(x._id), x.n]));
}

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import type { Actor } from "./types";
import { z } from "zod";
import { collections, transaccion } from "./db";
import { clave } from "./importar/excel";
import { idMentor } from "./importar/mentores";
import { ROLES, type RolUsuario } from "./permisos";
import type { User } from "./types";
import { cleanSpaces, normalizeCity } from "./validation/name";

// Gestión de usuarios (monitores, coordinación y administración). La usan la página "Usuarios" y `npm run monitor:add`.

export const COSTO_BCRYPT = 12;
export const hashClave = (clave: string) => bcrypt.hash(clave, COSTO_BCRYPT);

/** Clave temporal legible (sin 0/O, 1/l/I). */
export function generarClave(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join("");
}

const ciudadesSchema = z.array(z.string().max(80)).max(20).transform((cs) => [...new Set(cs.map(normalizeCity).filter(Boolean))]);
export const claveSchema = z.string().min(8, "La clave debe tener al menos 8 caracteres.").max(100);

export const NuevoUsuario = z
  .object({
    usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "Usuario: 3 a 40 caracteres, solo letras, números, punto, guion o guion bajo."),
    nombre: z.string().transform(cleanSpaces).pipe(z.string().min(3, "Escribe el nombre completo.").max(80)),
    rol: z.enum(ROLES),
    ciudades: ciudadesSchema.default([]),
    correo: z.string().trim().toLowerCase().max(120).regex(/^([^\s@]+@[^\s@]+\.[^\s@]+)?$/, "El correo no es válido.").optional(),
    clave: claveSchema.optional(),
  })
  .strict();

// Un monitor sin ciudades es válido: solo acompaña sus salas en las presentaciones (Fase 2); en la inscripción no ve a nadie.
export const EdicionUsuario = z
  .object({
    nombre: z.string().transform(cleanSpaces).pipe(z.string().min(3, "Escribe el nombre completo.").max(80)).optional(),
    rol: z.enum(ROLES).optional(),
    ciudades: ciudadesSchema.optional(),
    activo: z.boolean().optional(),
    correo: z.string().trim().toLowerCase().max(120).regex(/^([^\s@]+@[^\s@]+\.[^\s@]+)?$/, "El correo no es válido.").optional(),
  })
  .strict();

/** El mentor se reconoce por su nombre, escrito igual que en la hoja Horarios. */
export const mentorIdDe = (rol: RolUsuario, nombre: string) => (rol === "mentor" ? idMentor(nombre) : undefined);

/** Distancia de edición entre dos textos (para sugerir nombres). */
function distancia(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Hasta 3 nombres parecidos a `nombre` (sin tildes ni mayúsculas): los que comparten alguna palabra
 * o se escriben casi igual, del más al menos parecido.
 */
export function parecidos(nombre: string, candidatos: string[]): string[] {
  const k = clave(nombre), palabras = new Set(k.split(" ").filter((p) => p.length > 2));
  return candidatos
    .map((c) => { const kc = clave(c); return { c, comunes: kc.split(" ").filter((p) => palabras.has(p)).length, d: distancia(k, kc) }; })
    .filter((x) => x.comunes > 0 || x.d <= Math.max(2, Math.floor(k.length / 4)))
    .sort((x, y) => y.comunes - x.comunes || x.d - y.d)
    .slice(0, 3).map((x) => x.c);
}

/** Revisa el mentor de un usuario: que exista en Horarios (si ya se importó) y que no lo tenga otro usuario. */
export async function errorMentor(mentorId: string | undefined, excepto?: ObjectId, nombre = mentorId ?? ""): Promise<string | null> {
  if (!mentorId) return null;
  const { mentores, users } = await collections();
  if ((await mentores.estimatedDocumentCount()) && !(await mentores.findOne({ _id: mentorId }))) {
    const cerca = parecidos(nombre, (await mentores.find({}, { projection: { nombre: 1 } }).toArray()).map((m) => m.nombre));
    return `No hay un mentor "${nombre}" en la hoja Horarios.${cerca.length ? ` ¿Quisiste decir ${cerca.map((n) => `"${n}"`).join(", ").replace(/, ([^,]*)$/, " o $1")}?` : ""} Escríbelo igual que allí.`;
  }
  if (await users.findOne({ mentorId, ...(excepto ? { _id: { $ne: excepto } } : {}) }))
    return "Ya hay un usuario para ese mentor.";
  return null;
}

/**
 * Restablecer la clave: la dada o una temporal nueva. Cierra sus sesiones abiertas y deja changeLog (sin la clave).
 * Devuelve la clave UNA sola vez; en la base queda solo el hash.
 */
export async function restablecerClave(id: ObjectId, claveDada: string | undefined, actor: Actor): Promise<{ clave: string; usuario: User } | null> {
  const { users, changeLog } = await collections();
  const clave = claveDada ?? generarClave(), hash = await hashClave(clave);
  let u: User | null = null;
  // La clave y su registro, juntos: nunca queda una clave cambiada sin changeLog.
  await transaccion(async (s) => {
    u = await users.findOneAndUpdate({ _id: id }, { $set: { passwordHash: hash, actualizadoEn: new Date() }, $inc: { tokenVersion: 1 } }, { returnDocument: "after", session: s });
    if (u) await changeLog.insertOne({ accion: "restablecer_clave", nuevo: `${u.usuario} (${claveDada ? "clave asignada" : "clave temporal"})`, actor, fecha: new Date() }, { session: s });
  });
  const hecho = u as User | null;
  return hecho ? { clave, usuario: hecho } : null;
}

/** Lo que se muestra de un usuario (nunca el hash). */
export function vistaUsuario(u: User) {
  return {
    id: u._id.toHexString(), usuario: u.usuario, nombre: u.nombre, rol: u.rol, correo: u.correo ?? "",
    ciudades: u.rol === "monitor" ? u.ciudades : [], activo: u.activo,
  };
}
export type VistaUsuario = ReturnType<typeof vistaUsuario>;

/** Primer mensaje de error legible de un ZodError. */
export const mensajeZod = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";

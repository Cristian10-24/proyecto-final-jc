import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "./db";
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

/** El monitor necesita al menos una ciudad; coordinación y administración ven todas. */
function conCiudades<T extends { rol?: string; ciudades?: string[] }>(v: T, ctx: z.RefinementCtx) {
  if (v.rol === "monitor" && v.ciudades !== undefined && v.ciudades.length === 0)
    ctx.addIssue({ code: "custom", path: ["ciudades"], message: "Un monitor necesita al menos una ciudad." });
}

export const NuevoUsuario = z
  .object({
    usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "Usuario: 3 a 40 caracteres, solo letras, números, punto, guion o guion bajo."),
    nombre: z.string().transform(cleanSpaces).pipe(z.string().min(3, "Escribe el nombre completo.").max(80)),
    rol: z.enum(ROLES),
    ciudades: ciudadesSchema.default([]),
    clave: claveSchema.optional(),
  })
  .strict()
  .superRefine(conCiudades);

export const EdicionUsuario = z
  .object({
    nombre: z.string().transform(cleanSpaces).pipe(z.string().min(3, "Escribe el nombre completo.").max(80)).optional(),
    rol: z.enum(ROLES).optional(),
    ciudades: ciudadesSchema.optional(),
    activo: z.boolean().optional(),
  })
  .strict()
  .superRefine(conCiudades);

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

/** Lo que se muestra de un usuario (nunca el hash). */
export function vistaUsuario(u: User) {
  return {
    id: u._id.toHexString(), usuario: u.usuario, nombre: u.nombre, rol: u.rol,
    ciudades: u.rol === "monitor" ? u.ciudades : [], activo: u.activo,
  };
}
export type VistaUsuario = ReturnType<typeof vistaUsuario>;

/** Primer mensaje de error legible de un ZodError. */
export const mensajeZod = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";

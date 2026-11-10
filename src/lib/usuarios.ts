import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import type { Actor } from "./types";
import { z } from "zod";
import { collections, transaccion } from "./db";
import { clave } from "./importar/excel";
import { idMentor } from "./importar/mentores";
import { leerCelular } from "./importar/proyectos";
import { ROL_TXT, ROLES, ROLES_EXTRA, rolesDe, tieneRol, type RolExtra, type RolUsuario } from "./permisos";
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
    celular: z.string().trim().max(30).optional(),
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
    celular: z.string().trim().max(30).optional(),
    correo: z.string().trim().toLowerCase().max(120).regex(/^([^\s@]+@[^\s@]+\.[^\s@]+)?$/, "El correo no es válido.").optional(),
  })
  .strict();

/** El mentor se reconoce por su nombre, escrito igual que en la hoja Horarios (Paso 26: también si es mentor como rol adicional). */
export const mentorIdDe = (roles: RolUsuario | readonly RolUsuario[], nombre: string) => ([roles].flat().includes("mentor") ? idMentor(nombre) : undefined);

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
    id: u._id.toHexString(), usuario: u.usuario, nombre: u.nombre, rol: u.rol, correo: u.correo ?? "", celular: u.celular ?? "",
    rolesExtra: rolesDe(u).filter((r) => r !== u.rol) as RolExtra[],
    ciudades: tieneRol(u, "monitor") ? u.ciudades : [], activo: u.activo,
  };
}
export type VistaUsuario = ReturnType<typeof vistaUsuario>;

/**
 * Fase 5 · Celular de un usuario, con la misma normalización del importador (+57 para Colombia).
 * "" = borrarlo; igual al guardado = se conserva tal cual (un dato viejo mal escrito no impide editar lo demás).
 */
export function celularUsuario(crudo: string | undefined, previo?: string): { celular?: string } | { error: string } {
  if (crudo === undefined) return previo ? { celular: previo } : {};
  const t = crudo.trim();
  if (!t) return {};
  if (previo && t === previo) return { celular: previo };
  const c = leerCelular(t);
  if (!c) return {};
  return "error" in c ? { error: `El celular ${c.error}.` } : { celular: c.celular };
}

/** Primer mensaje de error legible de un ZodError. */
export const mensajeZod = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";

/* ------------------------------------------------------------- Paso 26 · roles adicionales */

export const RolesExtraEntrada = z.object({ rolesExtra: z.array(z.enum(ROLES_EXTRA)).max(ROLES_EXTRA.length) }).strict();

export type ResultadoRoles = { ok: true; usuario: User } | { ok: false; error: "no_existe" | "propio" | "admin" | "mentor" | "cambio"; mensaje: string };

const textoRoles = (rs: readonly RolUsuario[]) => (rs.length ? rs.map((r) => ROL_TXT[r]).join(" + ") : "ninguno");

/**
 * Agregar o quitar roles adicionales a un usuario (solo el admin, nunca a sí mismo, nunca «Administración»).
 * Escribe solo `rolesExtra` (y `mentorId` si gana o pierde el rol de mentor) de ESE usuario, con su changeLog, en una
 * transacción que exige que nadie lo haya cambiado mientras tanto. La sesión se relee en cada petición: aplica al instante.
 */
export async function cambiarRolesExtra(id: ObjectId, pedidos: readonly RolExtra[], actor: Actor & { id: string }): Promise<ResultadoRoles> {
  if (String(id) === actor.id) return { ok: false, error: "propio", mensaje: "No puedes cambiar tus propios roles." };
  const { users, changeLog } = await collections();
  const actual = await users.findOne({ _id: id });
  if (!actual) return { ok: false, error: "no_existe", mensaje: "Ese usuario ya no existe." };
  if (actual.rol === "admin") return { ok: false, error: "admin", mensaje: "Administración ya tiene todos los permisos: no lleva roles adicionales." };
  // Sin repetidos y sin el rol principal (ya lo tiene); en el orden de la lista de roles.
  const nuevos = ROLES_EXTRA.filter((r) => pedidos.includes(r) && r !== actual.rol);
  const antes = (actual.rolesExtra ?? []).filter((r) => (ROLES_EXTRA as readonly string[]).includes(r));
  if (nuevos.join() === ROLES_EXTRA.filter((r) => antes.includes(r)).join()) return { ok: true, usuario: actual };
  const mentorId = mentorIdDe([actual.rol, ...nuevos], actual.nombre);
  if (mentorId && mentorId !== actual.mentorId) {
    const err = await errorMentor(mentorId, actual._id, actual.nombre);
    if (err) return { ok: false, error: "mentor", mensaje: err };
  }
  let hecho: User | null = null;
  try {
    await transaccion(async (s) => {
      // Solo si sigue como se leyó (mismo rol principal y mismos roles adicionales).
      hecho = await users.findOneAndUpdate(
        { _id: id, rol: actual.rol, ...(actual.rolesExtra ? { rolesExtra: actual.rolesExtra } : { rolesExtra: { $exists: false } }) },
        { $set: { rolesExtra: nuevos, actualizadoEn: new Date(), ...(mentorId ? { mentorId } : {}), ...(tieneRol({ rol: actual.rol, rolesExtra: nuevos }, "monitor") ? {} : { ciudades: [] }) }, ...(mentorId ? {} : { $unset: { mentorId: "" } }) },
        { returnDocument: "after", session: s },
      );
      if (hecho) await changeLog.insertOne({
        accion: "roles_usuario", anterior: `${actual.usuario}: ${textoRoles(antes)}`, nuevo: `${actual.usuario}: ${textoRoles(nuevos)}`, actor: { rol: actor.rol, ...(actor.usuario ? { usuario: actor.usuario } : {}) }, fecha: new Date(),
      }, { session: s });
    });
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: number }).code === 11000) return { ok: false, error: "mentor", mensaje: "Ya hay otro usuario para ese mentor." };
    throw e;
  }
  const u = hecho as User | null;
  return u ? { ok: true, usuario: u } : { ok: false, error: "cambio", mensaje: "Alguien cambió este usuario mientras tanto. Recarga la lista." };
}

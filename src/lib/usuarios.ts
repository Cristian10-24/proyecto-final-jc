import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { ROLES } from "./permisos";
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

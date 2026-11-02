import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId, type Filter } from "mongodb";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { collections } from "./db";
import { puede, type Permiso } from "./permisos";
import type { User } from "./types";

// Sesión de monitor/coordinación/admin: cookie httpOnly con { uid, ver, exp } firmado con HMAC.
// En cada petición se vuelve a leer el usuario: desactivarlo, cambiar su rol o sus ciudades aplica de inmediato,
// y al restablecer la clave se sube tokenVersion, lo que cierra las sesiones abiertas.

export const SESSION_COOKIE = "pfjc_session";
export const SESSION_DAYS = 7;

export type SessionUser = Pick<User, "usuario" | "nombre" | "rol" | "ciudades"> & { id: string };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Falta SESSION_SECRET (mínimo 16 caracteres)");
  return s;
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function createToken(userId: string, version = 0): string {
  const data = Buffer.from(JSON.stringify({ uid: userId, ver: version, exp: Date.now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${data}.${sign(data)}`;
}

function readToken(token: string | undefined): { uid: string; ver: number } | null {
  if (!token) return null;
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const a = Buffer.from(mac), b = Buffer.from(sign(data));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, ver, exp } = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof uid === "string" && ObjectId.isValid(uid) && exp > Date.now() ? { uid, ver: Number(ver) || 0 } : null;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
};

/** Usuario de la sesión actual, o null. Sirve en páginas y en route handlers. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const t = readToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!t) return null;
  const { users } = await collections();
  const u = await users.findOne({ _id: new ObjectId(t.uid), activo: true }, { projection: { passwordHash: 0 } });
  if (u && (u.tokenVersion ?? 0) !== t.ver) return null; // clave restablecida: sesión vieja
  return u ? { id: u._id.toHexString(), usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.ciudades } : null;
}

/** Filtro obligatorio en toda consulta de proyectos: el monitor solo ve sus ciudades. */
export function scopeFilter<T extends { ciudad: string }>(user: Pick<SessionUser, "rol" | "ciudades">): Filter<T> {
  return puede(user.rol, "ver_todas_las_ciudades") ? {} : ({ ciudad: { $in: user.ciudades } } as Filter<T>);
}

/**
 * Exige sesión (y un permiso, si se indica). Uso en route handlers:
 *   const g = await exigir("subir_lista"); if (g.error) return g.error;
 */
export async function exigir(permiso?: Permiso): Promise<{ user: SessionUser; error?: undefined } | { user?: undefined; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "sesion" }, { status: 401 }) };
  if (permiso && !puede(user.rol, permiso)) return { error: NextResponse.json({ error: "sin_permiso" }, { status: 403 }) };
  return { user };
}

/** Rechaza mutaciones que vengan de otro sitio (complementa SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // mismo origen en navegadores que no la envían
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookieOptions, createToken, exigir, SESSION_COOKIE, sameOrigin } from "@/lib/auth";
import { claveSchema, mensajeZod, restablecerClave } from "@/lib/usuarios";

const Body = z.object({ clave: claveSchema.optional() }).strict();

/**
 * Restablecer o asignar la clave (solo administración). Sin `clave`, se genera una temporal.
 * La clave se devuelve UNA sola vez; en la base queda solo el hash bcrypt. Cierra las sesiones abiertas de ese
 * usuario y deja changeLog (sin la clave).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: mensajeZod(parsed.error) }, { status: 400 });

  const r = await restablecerClave(new ObjectId(id), parsed.data.clave, { rol: g.user.rol, usuario: g.user.usuario });
  if (!r) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  const res = NextResponse.json({ clave: r.clave });
  // Si es la propia cuenta, renueva la cookie para no cerrar esta sesión.
  if (id === g.user.id) res.cookies.set(SESSION_COOKIE, createToken(id, r.usuario.tokenVersion ?? 0), cookieOptions);
  return res;
}

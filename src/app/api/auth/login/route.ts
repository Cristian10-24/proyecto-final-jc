import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookieOptions, createToken, SESSION_COOKIE, sameOrigin } from "@/lib/auth";
import { collections } from "@/lib/db";
import { inicioPorRol } from "@/lib/permisos";
import { bloqueado, clientIp, contar, MENSAJE_BLOQUEO } from "@/lib/rateLimit";

const Body = z.object({ usuario: z.string().trim().min(1).max(60), clave: z.string().min(1).max(200) }).strict();

// Hash de relleno: compara aunque el usuario no exista, para que tarde lo mismo.
const DUMMY = "$2b$12$tOZ4cd2R1Af92e2ela.09OF6H3OvahSBjTGFOmjePaj2sEb4lxTf2";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  if (await bloqueado("login", clientIp(req))) return NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });

  const { users } = await collections();
  const user = await users.findOne({ usuario: parsed.data.usuario.toLowerCase(), activo: true });
  const ok = await bcrypt.compare(parsed.data.clave, user?.passwordHash ?? DUMMY);
  if (!user || !ok) {
    await contar("login", clientIp(req));
    return NextResponse.json({ error: "credenciales" }, { status: 401 });
  }

  // Coordinación y administración entran al resumen; los monitores, a su grupo.
  const res = NextResponse.json({ ok: true, destino: inicioPorRol(user) });
  res.cookies.set(SESSION_COOKIE, createToken(user._id.toHexString(), user.tokenVersion ?? 0), cookieOptions);
  return res;
}

import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { cambiarRolesExtra, mensajeZod, RolesExtraEntrada, vistaUsuario } from "@/lib/usuarios";
import { IdParams } from "@/lib/validation/id";

/**
 * Paso 26 · Roles adicionales de un usuario (solo administración). Reemplaza la lista completa: lo que no venga se
 * quita. Nunca «Administración», nunca a uno mismo. Deja changeLog con antes y después; aplica en la siguiente petición.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;
  const p = IdParams.safeParse(await params);
  const parsed = RolesExtraEntrada.safeParse(await req.json().catch(() => null));
  if (!p.success || !parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: parsed.success ? "Datos inválidos." : mensajeZod(parsed.error) }, { status: 400 });
  const r = await cambiarRolesExtra(p.data.id, parsed.data.rolesExtra, { rol: g.user.rol, usuario: g.user.usuario, id: g.user.id });
  if (!r.ok) return NextResponse.json(r, { status: r.error === "no_existe" ? 404 : 409 });
  return NextResponse.json({ usuario: vistaUsuario(r.usuario) });
}

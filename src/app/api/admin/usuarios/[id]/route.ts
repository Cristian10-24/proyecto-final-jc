import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { collections } from "@/lib/db";
import { EdicionUsuario, mensajeZod, vistaUsuario } from "@/lib/usuarios";

/** Editar nombre, rol, ciudades o activo (solo administración). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const parsed = EdicionUsuario.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: mensajeZod(parsed.error) }, { status: 400 });
  const cambios = parsed.data;

  const { users } = await collections();
  const actual = await users.findOne({ _id: new ObjectId(id) });
  if (!actual) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  // Nadie puede quitarse a sí mismo la administración ni desactivarse (evita quedarse sin acceso).
  if (id === g.user.id && ((cambios.rol && cambios.rol !== "admin") || cambios.activo === false))
    return NextResponse.json({ error: "propio", mensaje: "No puedes quitarte el rol de administración ni desactivar tu propia cuenta." }, { status: 409 });

  const rol = cambios.rol ?? actual.rol;
  const ciudades = rol === "monitor" ? (cambios.ciudades ?? actual.ciudades) : [];
  if (rol === "monitor" && ciudades.length === 0)
    return NextResponse.json({ error: "datos_invalidos", mensaje: "Un monitor necesita al menos una ciudad." }, { status: 400 });

  const set = {
    ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
    ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
    rol, ciudades, actualizadoEn: new Date(),
  };
  // Desactivar también invalida las sesiones abiertas (por si luego se reactiva).
  await users.updateOne({ _id: actual._id }, { $set: set, ...(cambios.activo === false ? { $inc: { tokenVersion: 1 } } : {}) });
  const u = await users.findOne({ _id: actual._id });
  return NextResponse.json({ usuario: vistaUsuario(u!) });
}

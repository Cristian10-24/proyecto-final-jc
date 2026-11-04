import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { collections } from "@/lib/db";
import { EdicionUsuario, errorMentor, mensajeZod, mentorIdDe, vistaUsuario } from "@/lib/usuarios";

const Params = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }).strict();

/** Editar nombre, rol, ciudades o activo (solo administración). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;

  const p = Params.safeParse(await params);
  if (!p.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const { id } = p.data;
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

  const mentorId = mentorIdDe(rol, cambios.nombre ?? actual.nombre);
  const errM = mentorId !== actual.mentorId ? await errorMentor(mentorId, actual._id, cambios.nombre ?? actual.nombre) : null;
  if (errM) return NextResponse.json({ error: "mentor", mensaje: errM }, { status: 409 });
  const set = {
    ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
    ...(cambios.activo !== undefined ? { activo: cambios.activo } : {}),
    ...(cambios.correo ? { correo: cambios.correo } : {}),
    rol, ciudades, actualizadoEn: new Date(), ...(mentorId ? { mentorId } : {}),
  };
  // Desactivar también invalida las sesiones abiertas (por si luego se reactiva).
  try { await users.updateOne({ _id: actual._id }, { $set: set, ...(mentorId && cambios.correo !== "" ? {} : { $unset: { ...(mentorId ? {} : { mentorId: "" }), ...(cambios.correo === "" ? { correo: "" } : {}) } }), ...(cambios.activo === false ? { $inc: { tokenVersion: 1 } } : {}) }); } catch (e) {
  if (e instanceof Error && "code" in e && (e as { code?: number }).code === 11000)
    return NextResponse.json({ error: "duplicado", mensaje: "Ese usuario o ese mentor ya existe (alguien lo guardó al mismo tiempo). Recarga la lista." }, { status: 409 });
  throw e;
  }
  const u = await users.findOne({ _id: actual._id });
  return NextResponse.json({ usuario: vistaUsuario(u!) });
}

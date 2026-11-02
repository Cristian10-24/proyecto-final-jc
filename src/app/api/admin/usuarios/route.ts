import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { collections } from "@/lib/db";
import { generarClave, hashClave, mensajeZod, NuevoUsuario, vistaUsuario } from "@/lib/usuarios";

/** Lista de usuarios + ciudades disponibles (solo administración). */
export async function GET() {
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;
  const { users } = await collections();
  const todos = await users.find({}, { projection: { passwordHash: 0 } }).sort({ rol: 1, usuario: 1 }).toArray();
  return NextResponse.json({ usuarios: todos.map(vistaUsuario), ciudades: [...NOMBRES_CIUDADES].sort((a, b) => a.localeCompare(b, "es")) });
}

/** Crear usuario. Si no se da clave, se genera una. La clave se devuelve una sola vez. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;

  const parsed = NuevoUsuario.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: mensajeZod(parsed.error) }, { status: 400 });
  const { usuario, nombre, rol, ciudades, clave: claveDada } = parsed.data;

  const { users } = await collections();
  if (await users.findOne({ usuario })) return NextResponse.json({ error: "duplicado", mensaje: `Ya existe el usuario "${usuario}".` }, { status: 409 });

  const clave = claveDada ?? generarClave();
  const now = new Date();
  const doc = {
    _id: new ObjectId(), usuario, nombre, rol, ciudades: rol === "monitor" ? ciudades : [],
    activo: true, passwordHash: await hashClave(clave), tokenVersion: 0, creadoEn: now, actualizadoEn: now,
  };
  await users.insertOne(doc);
  return NextResponse.json({ usuario: vistaUsuario(doc), clave }, { status: 201 });
}

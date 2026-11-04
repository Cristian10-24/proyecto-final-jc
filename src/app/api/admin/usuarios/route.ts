import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { collections } from "@/lib/db";
import { revisionNombres } from "@/lib/usuariosExcel";
import { generarClave, hashClave, errorMentor, mensajeZod, mentorIdDe, NuevoUsuario, vistaUsuario } from "@/lib/usuarios";

/** Lista de usuarios, ciudades disponibles y revisión de nombres (solo administración). */
export async function GET() {
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;
  const { users } = await collections();
  const todos = await users.find({}, { projection: { passwordHash: 0 } }).sort({ rol: 1, usuario: 1 }).toArray();
  return NextResponse.json({ usuarios: todos.map(vistaUsuario), ciudades: [...NOMBRES_CIUDADES].sort((a, b) => a.localeCompare(b, "es")), revision: await revisionNombres() });
}

/** Crear usuario. Si no se da clave, se genera una. La clave se devuelve una sola vez. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("gestionar_usuarios");
  if (g.error) return g.error;

  const parsed = NuevoUsuario.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: mensajeZod(parsed.error) }, { status: 400 });
  const { usuario, nombre, rol, ciudades, correo, clave: claveDada } = parsed.data;

  const { users } = await collections();
  if (await users.findOne({ usuario })) return NextResponse.json({ error: "duplicado", mensaje: `Ya existe el usuario "${usuario}".` }, { status: 409 });

  const errM = await errorMentor(mentorIdDe(rol, nombre), undefined, nombre);
  if (errM) return NextResponse.json({ error: "mentor", mensaje: errM }, { status: 409 });

  const clave = claveDada ?? generarClave();
  const now = new Date();
  const doc = {
    _id: new ObjectId(), usuario, nombre, rol, ciudades: rol === "monitor" ? ciudades : [], ...(correo ? { correo } : {}), ...(rol === "mentor" ? { mentorId: mentorIdDe(rol, nombre) } : {}),
    activo: true, passwordHash: await hashClave(clave), tokenVersion: 0, creadoEn: now, actualizadoEn: now,
  };
  // Dos admins a la vez con el mismo usuario o mentor: el índice único lo frena; 409 en vez de 500.
  try { await users.insertOne(doc); } catch (e) {
  if (e instanceof Error && "code" in e && (e as { code?: number }).code === 11000)
    return NextResponse.json({ error: "duplicado", mensaje: "Ese usuario o ese mentor ya existe (alguien lo guardó al mismo tiempo). Recarga la lista." }, { status: 409 });
  throw e;
  }
  return NextResponse.json({ usuario: vistaUsuario(doc), clave }, { status: 201 });
}

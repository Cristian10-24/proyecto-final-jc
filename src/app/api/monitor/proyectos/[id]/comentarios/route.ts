import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { borrarComentario, crearComentario, editarComentario, listarComentarios, MAX_COMENTARIO } from "@/lib/comentarios";
import { IdParams } from "@/lib/validation/id";

// Paso 22 · Comentarios de seguimiento de un proyecto. Leer y escribir: monitor (sus ciudades), coordinación y admin
// (todos). Editar y borrar: cada uno solo los suyos.

// El límite real se aplica después de limpiar el texto; aquí se corta lo absurdo antes de procesarlo.
const Texto = z.string().max(MAX_COMENTARIO * 2);
const IdComentario = z.string().regex(/^[a-f0-9]{24}$/).transform((s) => new ObjectId(s));
const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear"), texto: Texto }).strict(),
  z.object({ accion: z.literal("editar"), comentario: IdComentario, texto: Texto }).strict(),
  z.object({ accion: z.literal("borrar"), comentario: IdComentario }).strict(),
]);
const ESTADO: Record<string, number> = { no_existe: 404, datos: 400, ajeno: 403, sin_permiso: 403 };

const id = async (params: Promise<{ id: string }>) => { const r = IdParams.safeParse(await params); return r.success ? r.data.id : null; };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigir("ver_seguimiento");
  if (g.error) return g.error;
  const pid = await id(params);
  if (!pid) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const r = await listarComentarios(g.user, pid);
  return NextResponse.json(r, { status: r.ok ? 200 : ESTADO[r.error] ?? 400 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("comentar_proyectos");
  if (g.error) return g.error;
  const pid = await id(params);
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!pid || !parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const a = parsed.data;
  const r = a.accion === "crear" ? await crearComentario(g.user, pid, a.texto)
    : a.accion === "editar" ? await editarComentario(g.user, pid, a.comentario, a.texto)
    : await borrarComentario(g.user, pid, a.comentario);
  return NextResponse.json(r, { status: r.ok ? 200 : ESTADO[r.error] ?? 400 });
}

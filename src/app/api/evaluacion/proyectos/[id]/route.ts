import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { BorradorSchema, FormularioSchema } from "@/lib/evaluacion/criterios";
import { detalleEvaluacion, guardarBorrador, guardarEvaluacion, marcarAsistencia } from "@/lib/evaluacion/datos";

type Ctx = { params: Promise<{ id: string }> };

const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("guardar"), formulario: FormularioSchema }).strict(),
  z.object({ accion: z.literal("borrador"), formulario: BorradorSchema }).strict(),
  z.object({ accion: z.literal("no_presento"), i: z.number().int().min(0).max(1) }).strict(),
  z.object({ accion: z.literal("presente"), i: z.number().int().min(0).max(1) }).strict(),
]);

const ESTADO: Record<string, number> = { no_existe: 404, sin_hora: 404, otro_mentor: 403, solo_lectura: 403, integrantes: 409, todos_no_presento: 409, faltan: 400 };

/** Detalle para evaluar: integrantes, lo guardado, el borrador (si es más nuevo) y los criterios. */
export async function GET(_req: Request, { params }: Ctx) {
  const g = await exigir(["evaluar", "ver_evaluaciones"]);
  if (g.error) return g.error;
  const r = await detalleEvaluacion(g.user, (await params).id);
  return NextResponse.json(r, { status: "error" in r ? ESTADO[r.error] ?? 400 : 200 });
}

/** Guardar evaluación, borrador automático, "No se presentó" y "Deshacer". Solo el mentor del proyecto; deja changeLog. */
export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("evaluar");
  if (g.error) return g.error;
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const { id } = await params, a = parsed.data;
  const r = a.accion === "guardar" ? await guardarEvaluacion(g.user, id, a.formulario)
    : a.accion === "borrador" ? await guardarBorrador(g.user, id, a.formulario)
    : await marcarAsistencia(g.user, id, a.i, a.accion === "no_presento");
  return NextResponse.json(r, { status: "error" in r ? ESTADO[r.error] ?? 400 : 200 });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { esDia } from "@/lib/edicion";
import { criterios, listaEvaluaciones } from "@/lib/evaluacion/datos";

const Filtro = z.object({
  dia: z.string().refine(esDia).optional(),
  mentor: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
}).strict();

/** Proyectos a evaluar con su resultado. Mentor: solo los suyos; coordinación y admin: de cualquier mentor. */
export async function GET(req: Request) {
  const g = await exigir(["evaluar", "ver_evaluaciones"]);
  if (g.error) return g.error;
  const parsed = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json({ filas: await listaEvaluaciones(g.user, parsed.data), criterios: await criterios() });
}

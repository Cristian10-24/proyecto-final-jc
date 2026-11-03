import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { CriteriosSchema } from "@/lib/evaluacion/criterios";
import { guardarCriterios } from "@/lib/evaluacion/resultados";

/** Guardar los criterios de Excelente (coordinación y admin). Cambian el resultado mostrado de todos; deja changeLog. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("editar_criterios");
  if (g.error) return g.error;
  const parsed = CriteriosSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Parte A entre 0 y 100 %, Parte B entre 0 y 4." }, { status: 400 });
  await guardarCriterios(parsed.data, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json({ ok: true, criterios: parsed.data });
}

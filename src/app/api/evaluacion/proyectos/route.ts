import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { jsonLectura, leer } from "@/lib/postEvento";
import { esDia } from "@/lib/edicion";
import { criterios, listaEvaluaciones, mentoresConProyectos } from "@/lib/evaluacion/datos";
import { puede } from "@/lib/permisos";

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
  const user = g.user, filtro = parsed.data;
  return jsonLectura(await leer("listaEvaluaciones", [user, filtro], async () => {
    const [filas, crit, mentores] = await Promise.all([
      listaEvaluaciones(user, filtro), criterios(),
      puede(user, "ver_evaluaciones") ? mentoresConProyectos() : Promise.resolve(null),
    ]);
    return { filas, criterios: crit, ...(mentores ? { mentores } : {}) };
  }));
}

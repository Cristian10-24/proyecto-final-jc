import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { reporteDia } from "@/lib/evaluacion/resultados";
import { FiltroReporteSchema } from "../filtro";

/** Reporte del día (oficial, solo lectura): todas las ciudades, por estudiantes y proyectos; sin día = acumulado. */
export async function GET(req: Request) {
  const g = await exigir("ver_evaluaciones");
  if (g.error) return g.error;
  const f = FiltroReporteSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await reporteDia(f.data.dia ?? null), { headers: { "Cache-Control": "no-store" } });
}

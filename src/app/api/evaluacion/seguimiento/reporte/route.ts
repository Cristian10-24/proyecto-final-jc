import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { jsonLectura, leer } from "@/lib/postEvento";
import { reporteDia } from "@/lib/evaluacion/resultados";
import { FiltroReporteSchema } from "../filtro";

/** Reporte del día (oficial, solo lectura): todas las ciudades, por estudiantes y proyectos; sin día = acumulado. */
export async function GET(req: Request) {
  const g = await exigir("ver_evaluaciones");
  if (g.error) return g.error;
  // Siempre trae todas las ciudades: también exige verlas (hoy coordinación y admin tienen los dos permisos).
  const t = await exigir("ver_todas_las_ciudades");
  if (t.error) return t.error;
  const f = FiltroReporteSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const dia = f.data.dia ?? null;
  return jsonLectura(await leer("reporteDia", [dia], () => reporteDia(dia)), { "Cache-Control": "no-store" });
}

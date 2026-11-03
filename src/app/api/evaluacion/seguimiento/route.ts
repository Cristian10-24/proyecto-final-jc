import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { seguimiento } from "@/lib/evaluacion/resultados";
import { FiltroSeguimientoSchema } from "./filtro";

/** Seguimiento general: todas las tablas del prototipo, filtrables por día y ciudad (coordinación y admin). */
export async function GET(req: Request) {
  const g = await exigir("ver_evaluaciones");
  if (g.error) return g.error;
  const f = FiltroSeguimientoSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await seguimiento(f.data));
}

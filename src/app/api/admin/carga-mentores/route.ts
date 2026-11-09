import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { cargaMentores } from "@/lib/cargaMentores";
import { esDia } from "@/lib/edicion";

const Filtro = z.object({ dia: z.string().refine(esDia).optional() }).strict();

/** Paso 24 · Carga de los mentores de un día y propuestas de redistribución (solo lectura; admin y coordinación). */
export async function GET(req: Request) {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;
  const f = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await cargaMentores(f.data.dia));
}

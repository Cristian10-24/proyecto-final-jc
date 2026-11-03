import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { esDia } from "@/lib/edicion";
import { datosTablero } from "@/lib/tableroHorarios";

const Filtro = z.object({ dia: z.string().refine(esDia).optional() }).strict();

/** Tablero de horarios de un día (admin y coordinación). Mover y liberar usan POST /api/admin/proyectos/[id]. */
export async function GET(req: Request) {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;
  const f = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await datosTablero(f.data.dia));
}

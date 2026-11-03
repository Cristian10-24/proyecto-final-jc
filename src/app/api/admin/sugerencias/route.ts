import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { bandeja } from "@/lib/sugerencias";

const SinQuery = z.object({}).strict();

/** Bandeja de cambios sugeridos por los monitores: pendientes y últimas resueltas (solo administración). */
export async function GET(req: Request) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  if (!SinQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams)).success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await bandeja());
}

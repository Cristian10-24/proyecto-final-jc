import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { buscarTablero } from "@/lib/tableroHorarios";

const Query = z.object({ q: z.string().trim().min(2).max(80) }).strict();

/** Paso 25 · Buscador del Tablero (admin y coordinación): dónde está cada proyecto. No devuelve documentos. */
export async function GET(req: Request) {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json({ resultados: await buscarTablero(parsed.data.q, { documentoParcial: puede(g.user.rol, "cambiar_horario") }) });
}

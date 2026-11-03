import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { listaSalas } from "@/lib/evaluacion/monitor";

const Filtro = z.object({}).strict();

/** Salas del monitor (día, hora, sala, mentor y enlace) y los proyectos de cada una, de cualquier ciudad. */
export async function GET(req: Request) {
  const g = await exigir("monitorear_salas");
  if (g.error) return g.error;
  if (!Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams)).success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await listaSalas(g.user));
}

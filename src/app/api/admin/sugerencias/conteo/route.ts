import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { pendientes } from "@/lib/sugerencias";

/** Cuántas sugerencias esperan respuesta (para el contador del menú del admin). */
export async function GET(req?: Request) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  if (req && !z.object({}).strict().safeParse(Object.fromEntries(new URL(req.url).searchParams)).success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json({ pendientes: await pendientes() });
}

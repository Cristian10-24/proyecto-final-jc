import { NextResponse } from "next/server";
import { z } from "zod";
import { bloquesLibres } from "@/lib/admin";
import { exigir } from "@/lib/auth";
import { esDia } from "@/lib/edicion";
import { IdParams } from "@/lib/validation/id";

const Query = z.object({ dia: z.string().refine(esDia) }).strict();

/** Bloques libres de un día para mover el proyecto: los de su ciudad y, marcados, los que solo tienen asientos de otras. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = IdParams.safeParse(await params);
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success || !parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const r = await bloquesLibres(p.data.id, parsed.data.dia);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "sin_proyecto" }, { status: 404 });
}

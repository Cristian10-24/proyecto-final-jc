import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bloquesLibres } from "@/lib/admin";
import { exigir } from "@/lib/auth";
import { esDia } from "@/lib/edicion";

const Query = z.object({ dia: z.string().refine(esDia), otra: z.enum(["0", "1"]).default("0") }).strict();

/** Bloques libres de un día para mover el proyecto (de su ciudad, o de cualquiera con otra=1). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const { id } = await params;
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!ObjectId.isValid(id) || !parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const r = await bloquesLibres(new ObjectId(id), parsed.data.dia, parsed.data.otra === "1");
  return r ? NextResponse.json(r) : NextResponse.json({ error: "sin_proyecto" }, { status: 404 });
}

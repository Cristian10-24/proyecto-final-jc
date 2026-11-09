import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { mentoresLibres } from "@/lib/cambioMentor";
import { IdParams } from "@/lib/validation/id";

/** Paso 25 · Mentores con asiento libre en el bloque exacto del proyecto, con su carga (solo admin, solo lectura). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = IdParams.safeParse(await params);
  if (!p.success || new URL(req.url).searchParams.size) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const r = await mentoresLibres(p.data.id);
  return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: r.error === "sin_proyecto" ? 404 : 409 });
}

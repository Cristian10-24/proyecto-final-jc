import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { invalidarLecturas } from "@/lib/postEvento";

// Modo post-evento · botón «Actualizar»: descarta la caché de lecturas para que la siguiente lectura recalcule.
// No toca la base. Cualquier usuario con sesión (es lo mismo que antes hacía el refresco de cada minuto).
// Sin EVENTO_CERRADO no hace nada (no hay caché).
const Cuerpo = z.object({}).strict();

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir();
  if (g.error) return g.error;
  if (!Cuerpo.safeParse(await req.json().catch(() => ({}))).success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  invalidarLecturas();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

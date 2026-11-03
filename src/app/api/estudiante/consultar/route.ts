import { NextResponse } from "next/server";
import { z } from "zod";
import { consultar } from "@/lib/estudiante";
import { intentar, MENSAJE_BLOQUEO } from "@/lib/rateLimit";
import { cuerpoInvalido, documentoSchema, guardia, noEncontrado } from "@/lib/rutaEstudiante";

const Body = z.object({ documento: documentoSchema }).strict();

/**
 * El estudiante entra con su documento (o el de su pareja). Devuelve solo lo permitido (ver
 * src/lib/estudiante.ts). Límites: por documento (todos los intentos) y por IP (solo fallos).
 */
export async function POST(req: Request) {
  const g = await guardia(req);
  if (g.error) return g.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(g.ip);
  const { documento } = parsed.data;
  if (await intentar("documento", documento)) return NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 });

  const vista = await consultar(documento);
  if (!vista) return noEncontrado(g.ip);
  return NextResponse.json(vista);
}

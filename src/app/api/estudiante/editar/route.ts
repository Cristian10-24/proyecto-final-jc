import { NextResponse } from "next/server";
import { z } from "zod";
import { editarDesdePortal } from "@/lib/edicionEstudiante";
import { intentar, MENSAJE_BLOQUEO } from "@/lib/rateLimit";
import { cuerpoInvalido, documentoSchema, guardia, noEncontrado } from "@/lib/rutaEstudiante";

// El largo real se revisa después de limpiar el texto; aquí se corta lo absurdo.
const Body = z.object({
  documento: documentoSchema,
  nombre: z.string().max(400),
  descripcion: z.string().max(2000),
  version: z.iso.datetime(),
}).strict();

const ESTADO: Record<string, number> = { datos: 400, evaluado: 409, cambio: 409, no_inscrito: 403 };

/**
 * Paso 23 · El estudiante cambia el nombre y la descripción de su proyecto. Sin sesión: el documento identifica al
 * proyecto. Límites: por documento (cuentan todos los intentos) y por IP (fallos). Se guarda en el historial.
 */
export async function POST(req: Request) {
  const g = await guardia(req);
  if (g.error) return g.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(g.ip, "Revisa el nombre y la descripción.");
  const { documento, ...entrada } = parsed.data;
  if (await intentar("documento", documento)) return NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 });
  const r = await editarDesdePortal(documento, entrada);
  if (r.ok) return NextResponse.json(r);
  if (r.error === "sin_proyecto") return noEncontrado(g.ip);
  return NextResponse.json(r, { status: ESTADO[r.error] ?? 400 });
}

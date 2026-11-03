import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "./auth";
import { estadoPortal } from "./portal";
import { bloqueado, clientIp, contar, MENSAJE_BLOQUEO } from "./rateLimit";
import { normalizeDocumento } from "./validation/name";

// Piezas comunes de las rutas del estudiante (sin sesión: el documento identifica al proyecto).

export const documentoSchema = z.string().max(30).transform(normalizeDocumento).pipe(z.string().min(5).max(15));

export const MENSAJE_CERRADO = "La elección de horario está cerrada.";

/** Origen, portal abierto e IP no bloqueada. Devuelve la IP o la respuesta de error. */
export async function guardia(req: Request): Promise<{ ip: string; error?: undefined } | { error: NextResponse }> {
  if (!sameOrigin(req)) return { error: NextResponse.json({ error: "origen" }, { status: 403 }) };
  const e = estadoPortal();
  if (e.estado !== "abierto") return { error: NextResponse.json({ error: e.estado === "antes" ? "aun_no_abre" : "cerrado", mensaje: MENSAJE_CERRADO, ...(e.estado === "antes" ? { abre: e.abre } : {}) }, { status: 403 }) };
  const ip = clientIp(req);
  if (await bloqueado("ip", ip)) return { error: NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 }) };
  return { ip };
}

/** Cuerpo inválido: cuenta como fallo de la IP. */
export async function cuerpoInvalido(ip: string, mensaje = "Revisa el número de documento.") {
  await contar("ip", ip);
  return NextResponse.json({ error: "datos_invalidos", mensaje }, { status: 400 });
}

/** Documento inexistente: cuenta como fallo de la IP. */
export async function noEncontrado(ip: string) {
  await contar("ip", ip);
  return NextResponse.json({ error: "sin_proyecto", mensaje: "No encontramos un proyecto con ese documento." }, { status: 404 });
}

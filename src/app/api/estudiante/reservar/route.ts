import { NextResponse } from "next/server";
import { z } from "zod";
import { contar, intentar, MENSAJE_BLOQUEO } from "@/lib/rateLimit";
import { MENSAJES_RESERVA, reservar } from "@/lib/reservas";
import { cuerpoInvalido, documentoSchema, guardia } from "@/lib/rutaEstudiante";

const Body = z
  .object({
    documento: documentoSchema,
    inicio: z.iso.datetime(),
  })
  .strict();

const ESTADO: Record<string, number> = { sin_proyecto: 404, ya_tiene_hora: 409, sin_cupo: 409, bloque_pasado: 409, dia_no_disponible: 403, aun_no_abre: 403 };

/**
 * El estudiante reserva un bloque con su documento. Sin sesión ni cookie: el documento identifica al
 * proyecto. Límites: por documento (cuentan todos los intentos, de forma atómica) y por IP (solo fallos:
 * cuerpo inválido o documento inexistente). Solo responde lo mínimo: no da datos de otros proyectos.
 */
export async function POST(req: Request) {
  const g = await guardia(req);
  if (g.error) return g.error;
  const { ip } = g;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(ip, "Revisa el documento y la hora.");
  const { documento, inicio } = parsed.data;

  if (await intentar("documento", documento)) return NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 });

  const r = await reservar(documento, new Date(inicio));
  if (r.ok) return NextResponse.json({ ok: true, inicio: r.inicio.toISOString(), dia: r.dia });
  if (r.error === "sin_proyecto") await contar("ip", ip);
  return NextResponse.json(
    { error: r.error, mensaje: MENSAJES_RESERVA[r.error] }, // la hora existente se ve con /consultar
    { status: ESTADO[r.error] ?? 400 },
  );
}

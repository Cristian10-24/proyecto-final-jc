import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/auth";
import { studentPortalOpen } from "@/lib/portal";
import { bloqueado, clientIp, contar, intentar, MENSAJE_BLOQUEO } from "@/lib/rateLimit";
import { MENSAJES_RESERVA, reservar } from "@/lib/reservas";
import { normalizeDocumento } from "@/lib/validation/name";

const Body = z
  .object({
    documento: z.string().max(30).transform(normalizeDocumento).pipe(z.string().min(5).max(15)),
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
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  if (!studentPortalOpen()) return NextResponse.json({ error: "cerrado", mensaje: "La elección de horario está cerrada." }, { status: 403 });
  const ip = clientIp(req);
  if (await bloqueado("ip", ip)) return NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    await contar("ip", ip);
    return NextResponse.json({ error: "datos_invalidos", mensaje: "Revisa el documento y la hora." }, { status: 400 });
  }
  const { documento, inicio } = parsed.data;

  if (await intentar("documento", documento)) return NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 });

  const r = await reservar(documento, new Date(inicio));
  if (r.ok) return NextResponse.json({ ok: true, inicio: r.inicio.toISOString(), dia: r.dia });
  if (r.error === "sin_proyecto") await contar("ip", ip);
  return NextResponse.json(
    { error: r.error, mensaje: MENSAJES_RESERVA[r.error], ...(r.inicio ? { inicio: r.inicio.toISOString() } : {}) },
    { status: ESTADO[r.error] ?? 400 },
  );
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { consultar } from "@/lib/estudiante";
import { intentar, MENSAJE_BLOQUEO } from "@/lib/rateLimit";
import { estadoCiudad } from "@/lib/reglasCupos";
import { MENSAJE_NO_INSCRITO, noInscrito } from "@/lib/sinProyecto";
import { cuerpoInvalido, documentoSchema, guardia, MENSAJE_CERRADO, noEncontrado } from "@/lib/rutaEstudiante";

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
  if (!vista) {
    // Paso 21: participante sin proyecto o proyecto marcado. Ya contó para el límite por documento.
    if (await noInscrito(documento)) return NextResponse.json({ error: "no_inscrito", mensaje: MENSAJE_NO_INSCRITO }, { status: 403 });
    return noEncontrado(g.ip);
  }
  // Quien ya tiene hora la sigue viendo; quien no, ve si las inscripciones de su ciudad cerraron o aún no abren.
  if (!vista.hora) {
    const e = await estadoCiudad(vista.proyecto.ciudad);
    if (e.estado === "cerrado") return NextResponse.json({ error: "cerrado", mensaje: MENSAJE_CERRADO, cierre: e.cierre }, { status: 403 });
    if (e.estado === "antes") return NextResponse.json({ error: "aun_no_abre", mensaje: MENSAJE_CERRADO, abre: e.abre }, { status: 403 });
  }
  return NextResponse.json(vista);
}

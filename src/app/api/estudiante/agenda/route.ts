import { NextResponse } from "next/server";
import { z } from "zod";
import { esDia } from "@/lib/edicion";
import { agenda } from "@/lib/estudiante";
import { cuerpoInvalido, documentoSchema, guardia, noEncontrado } from "@/lib/rutaEstudiante";

const Body = z.object({ documento: documentoSchema, dia: z.string().refine(esDia).optional() }).strict();

/**
 * Días habilitados para la ciudad del estudiante (sin `dia`) o bloques libres de 15 min de un día.
 * Sin mentores ni conteos: solo disponible o no. No suma al límite por documento (no muestra datos
 * personales); un documento inexistente sí suma como fallo de la IP.
 */
export async function POST(req: Request) {
  const g = await guardia(req);
  if (g.error) return g.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(g.ip);

  const r = await agenda(parsed.data.documento, parsed.data.dia);
  if ("error" in r) {
    if (r.error === "sin_proyecto") return noEncontrado(g.ip);
    // Sin la hora: esta ruta no cuenta para el límite por documento, así que no da datos del proyecto.
    if (r.error === "ya_tiene_hora") return NextResponse.json({ error: r.error, mensaje: "Tu proyecto ya tiene una hora elegida." }, { status: 409 });
    return NextResponse.json({ error: r.error, mensaje: "Ese día no está habilitado para tu ciudad." }, { status: 403 });
  }
  return NextResponse.json(r);
}

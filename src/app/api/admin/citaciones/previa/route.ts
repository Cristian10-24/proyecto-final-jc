import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { TIPOS_CITACION } from "@/lib/citaciones/contenido";
import { entornoCitaciones } from "@/lib/citaciones/google";
import { vistaPrevia } from "@/lib/citaciones/registro";
import { esDia } from "@/lib/edicion";

// Fase 5 · Paso 29 · Vista previa de una citación (solo admin): los eventos tal como se enviarían. En modo prueba ya
// muestra el correo de prueba como único invitado. Solo lee; no llama a Google.

const Consulta = z.object({ dia: z.string().refine(esDia), tipo: z.enum(TIPOS_CITACION), clave: z.string().min(1).max(100) }).strict();

export async function GET(req: Request) {
  const g = await exigir("citar");
  if (g.error) return g.error;
  const p = Consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const { estado, correoPrueba } = entornoCitaciones();
  // Variable de prueba mal escrita: no se muestra como si fuera un envío real.
  if (estado.error) return NextResponse.json({ error: "configuracion", mensaje: estado.error }, { status: 409 });
  const v = await vistaPrevia(p.data.dia, p.data.tipo, p.data.clave, correoPrueba);
  if (!v) return NextResponse.json({ error: "no_existe", mensaje: "Ya no tiene nada que citar este día." }, { status: 404 });
  return NextResponse.json({
    nombre: v.citacion.nombre, detalle: v.citacion.detalle, avisos: v.citacion.avisos,
    ...(v.citacion.bloqueo ? { bloqueo: v.citacion.bloqueo } : {}), eventos: v.eventos, prueba: correoPrueba,
  });
}

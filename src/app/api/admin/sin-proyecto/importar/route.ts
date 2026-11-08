import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { leerLibro } from "@/lib/importar/excel";
import { aplicarSinProyecto, leerSinProyecto, previaSinProyecto } from "@/lib/sinProyecto";

const MAX_BYTES = 2 * 1024 * 1024;
const Campos = z.object({ modo: z.enum(["previa", "confirmar"]) }).strict();

/**
 * Paso 21 · Cargar participantes «Sin proyecto» desde Excel (solo admin). Se envía dos veces el mismo archivo:
 * "previa" no escribe (nuevos, ya registrados, en un proyecto y errores por fila); "confirmar" guarda solo los nuevos.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  // Antes de leer el cuerpo: un archivo grande no llega a la memoria.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "muy_grande", mensaje: "El archivo pesa más de 2 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const parsed = Campos.safeParse({ modo: form?.get("modo") });
  if (!parsed.success || !(archivo instanceof File)) return NextResponse.json({ error: "datos_invalidos", mensaje: "Elige un archivo .xlsx." }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "muy_grande", mensaje: "El archivo pesa más de 2 MB." }, { status: 413 });
  let wb;
  try {
    wb = await leerLibro(await archivo.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "archivo_invalido", mensaje: "No se pudo leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo otra vez." }, { status: 400 });
  }
  const { validos, ...previa } = await previaSinProyecto(await leerSinProyecto(wb));
  if (parsed.data.modo === "previa" || !validos.length) return NextResponse.json({ previa, aplicado: false });
  const r = await aplicarSinProyecto(validos, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json({ previa, aplicado: true, ...r });
}

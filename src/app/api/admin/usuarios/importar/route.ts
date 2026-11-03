import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { leerLibro } from "@/lib/importar/excel";
import { aplicarUsuarios, CambioUsuarios, leerUsuarios, previaUsuarios } from "@/lib/usuariosExcel";

const MAX_BYTES = 2 * 1024 * 1024;
const Campos = z.object({ modo: z.enum(["previa", "confirmar"]) }).strict();

/**
 * Cargar usuarios desde Excel (solo administración). Se envía dos veces el mismo archivo: "previa" devuelve qué se
 * crea, qué se actualiza y los errores por fila sin escribir; "confirmar" aplica solo si no hay errores y devuelve las
 * claves temporales de los nuevos (una sola vez).
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("gestionar_usuarios");
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
  const { existentes, ...previa } = await previaUsuarios(leerUsuarios(wb), g.user.id);
  if (parsed.data.modo === "previa" || previa.errores.length) return NextResponse.json({ previa, aplicado: false });
  try {
    const claves = await aplicarUsuarios({ ...previa, existentes }, g.user.usuario);
    return NextResponse.json({ previa, aplicado: true, claves });
  } catch (e) {
    // Otro admin creó el mismo usuario o mentor, o cambió a alguien, mientras tanto (índices únicos o filtro).
    if (e instanceof CambioUsuarios || (e instanceof Error && "code" in e && (e as { code?: number }).code === 11000))
      return NextResponse.json({ error: "conflicto", mensaje: "Alguien creó uno de estos usuarios mientras tanto. Revisa la vista previa otra vez." }, { status: 409 });
    throw e;
  }
}

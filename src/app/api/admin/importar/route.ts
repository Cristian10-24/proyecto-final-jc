import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { aplicarMentores, aplicarProyectos, previaMentores, previaProyectos } from "@/lib/importar/aplicar";
import { leerLibro } from "@/lib/importar/excel";
import { leerLibroMentores } from "@/lib/importar/mentores";
import { leerLibroProyectos } from "@/lib/importar/proyectos";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel corta los cuerpos de más de 4,5 MB

const Campos = z.object({ tipo: z.enum(["proyectos", "mentores"]), modo: z.enum(["previa", "confirmar"]) }).strict();

/**
 * Importar un Excel (solo administración). Se envía dos veces el mismo archivo:
 * modo "previa" devuelve totales y errores por fila sin escribir; modo "confirmar" aplica,
 * y solo si no hay errores.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("importar");
  if (g.error) return g.error;

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const parsed = Campos.safeParse({ tipo: form?.get("tipo"), modo: form?.get("modo") });
  if (!parsed.success || !(archivo instanceof File)) return NextResponse.json({ error: "datos_invalidos", mensaje: "Elige un archivo .xlsx." }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "muy_grande", mensaje: "El archivo pesa más de 4 MB." }, { status: 413 });
  const { tipo, modo } = parsed.data;

  let wb;
  try {
    wb = await leerLibro(await archivo.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "archivo_invalido", mensaje: "No se pudo leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo otra vez." }, { status: 400 });
  }
  const actor = { rol: g.user.rol, usuario: g.user.usuario };

  if (tipo === "proyectos") {
    const { proyectos, errores } = leerLibroProyectos(wb);
    const previa = await previaProyectos(proyectos, errores);
    if (modo === "previa" || previa.errores.length) return NextResponse.json({ tipo, previa, aplicado: false });
    await aplicarProyectos(proyectos, actor);
    return NextResponse.json({ tipo, previa, aplicado: true });
  }

  const libro = leerLibroMentores(wb);
  const previa = await previaMentores(libro);
  if (modo === "previa" || previa.errores.length) return NextResponse.json({ tipo, previa, aplicado: false });
  try {
    await aplicarMentores(libro, actor);
  } catch (e) {
    if (e instanceof Error && e.message === "conflictos")
      return NextResponse.json({ error: "conflictos", mensaje: "Alguien reservó una hora que el archivo quita. Revisa la vista previa otra vez." }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ tipo, previa, aplicado: true });
}

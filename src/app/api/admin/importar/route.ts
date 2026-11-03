import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { aplicarMentores, aplicarProyectos, previaMentores, previaProyectos } from "@/lib/importar/aplicar";
import { leerLibro } from "@/lib/importar/excel";
import { leerLibroMentores } from "@/lib/importar/mentores";
import { CAMPOS, leerLibroProyectos, type Campo } from "@/lib/importar/proyectos";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel corta los cuerpos de más de 4,5 MB

const CAMPOS_PROYECTO = CAMPOS.map((c) => c.campo) as [Campo, ...Campo[]];
// Mapa manual (solo proyectos): campo → encabezado elegido por el admin en la vista previa.
const Mapa = z.partialRecord(z.enum(CAMPOS_PROYECTO), z.string().max(200));
const Campos = z
  .object({
    tipo: z.enum(["proyectos", "mentores"]),
    modo: z.enum(["previa", "confirmar"]),
    mapa: z.string().max(5000).optional().transform((s, ctx) => {
      if (!s) return {};
      try { return Mapa.parse(JSON.parse(s)); } catch { ctx.addIssue({ code: "custom", message: "mapa inválido" }); return z.NEVER; }
    }),
  })
  .strict();

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
  const mapaCrudo = form?.get("mapa");
  const parsed = Campos.safeParse({ tipo: form?.get("tipo"), modo: form?.get("modo"), ...(typeof mapaCrudo === "string" ? { mapa: mapaCrudo } : {}) });
  if (!parsed.success || !(archivo instanceof File)) return NextResponse.json({ error: "datos_invalidos", mensaje: "Elige un archivo .xlsx." }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "muy_grande", mensaje: "El archivo pesa más de 4 MB." }, { status: 413 });
  const { tipo, modo, mapa } = parsed.data;

  let wb;
  try {
    wb = await leerLibro(await archivo.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "archivo_invalido", mensaje: "No se pudo leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo otra vez." }, { status: 400 });
  }
  const actor = { rol: g.user.rol, usuario: g.user.usuario };

  if (tipo === "proyectos") {
    const lectura = leerLibroProyectos(wb, mapa);
    const { asignaciones, ...previa } = await previaProyectos(lectura);
    if (modo === "previa" || previa.errores.length) return NextResponse.json({ tipo, previa, aplicado: false });
    await aplicarProyectos(lectura.proyectos, asignaciones, actor);
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

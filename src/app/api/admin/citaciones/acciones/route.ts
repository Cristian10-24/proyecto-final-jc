import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { TIPOS_CITACION } from "@/lib/citaciones/contenido";
import { entornoCitaciones } from "@/lib/citaciones/google";
import { cancelar, citarVarias, marcarCitado, type Resultado } from "@/lib/citaciones/registro";
import { esDia } from "@/lib/edicion";

// Fase 5 · Paso 29 · Acciones de citación (solo admin, mismo origen): citar o actualizar, cancelar, marcar como citado
// (sin evento) una lista de hasta 10 filas, o marcar todas las del día y pestaña. «Citar todos los pendientes» lo arma el
// navegador en lotes de 10 contra esta misma ruta. Cliente de Google y modo prueba salen SOLO de entornoCitaciones().

// Un lote de 10 con reintentos ante límites de la API puede tardar: margen amplio (Vercel lo limita al plan).
export const maxDuration = 300;

const MAX_LOTE = 10;
const Base = { tipo: z.enum(TIPOS_CITACION), dia: z.string().refine(esDia, "Día inválido.") };
const Claves = z.array(z.string().min(1).max(100)).min(1).max(MAX_LOTE);
const Cuerpo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("citar"), ...Base, claves: Claves }).strict(),
  z.object({ accion: z.literal("cancelar"), ...Base, claves: Claves }).strict(),
  z.object({ accion: z.literal("marcar"), ...Base, claves: Claves }).strict(),
  z.object({ accion: z.literal("marcar_todos"), ...Base }).strict(),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("citar");
  if (g.error) return g.error;
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: p.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  const { estado, cliente, correoPrueba } = entornoCitaciones();
  // Variable de prueba mal escrita: no se hace nada (ni siquiera marcar), para no tratar como real lo que era una prueba.
  if (estado.error) return NextResponse.json({ error: "configuracion", mensaje: estado.error }, { status: 409 });
  const actor = { rol: g.user.rol, usuario: g.user.usuario };
  const { accion, tipo, dia } = p.data;

  if (accion === "marcar" || accion === "marcar_todos") {
    const r = await marcarCitado(tipo, dia, accion === "marcar" ? [...new Set(p.data.claves)] : "todos", actor, correoPrueba);
    return NextResponse.json({ resultados: [...r.marcados, ...r.omitidos] });
  }
  if (!cliente) return NextResponse.json({ error: "no_conectado", mensaje: "Google Calendar no está conectado: no se envía nada." }, { status: 503 });
  const claves = [...new Set(p.data.claves)];
  let resultados: Resultado[];
  if (accion === "citar") resultados = await citarVarias(tipo, dia, claves, actor, { cliente, correoPrueba });
  else {
    resultados = [];
    for (const clave of claves) {
      try { resultados.push(await cancelar(tipo, dia, clave, actor, { cliente, correoPrueba })); } catch {
        resultados.push({ clave, nombre: clave, ok: false, error: "google", mensaje: "Error inesperado; se siguió con las demás." });
      }
    }
  }
  return NextResponse.json({ resultados });
}

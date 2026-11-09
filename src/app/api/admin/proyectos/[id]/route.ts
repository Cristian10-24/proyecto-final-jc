import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { anularEvaluacion, asignarMonitor, cambiarHora, historial, liberar } from "@/lib/admin";
import { exigir, sameOrigin } from "@/lib/auth";
import { revertirEdicion } from "@/lib/edicionEstudiante";
import { marcarSinProyecto, quitarMarca } from "@/lib/sinProyecto";
import { IdParams } from "@/lib/validation/id";

const motivo = z.string().trim().max(300).default("");
const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("liberar"), motivo }).strict(),
  // `asiento`: un asiento concreto de ese bloque (cambiar de mentor desde el tablero).
  z.object({ accion: z.literal("cambiar"), inicio: z.iso.datetime(), otraCiudad: z.boolean().default(false), motivo, asiento: z.string().regex(/^[a-f0-9]{24}$/).optional(),
    // Modo orden de llegada: el admin confirmó que quiere pasar el tope de la ciudad ese día.
    confirmarTope: z.boolean().default(false),
    // Paso 24: el admin confirmó cambiar una presentación por empezar (menos de 30 min) o en curso.
    confirmarEnCurso: z.boolean().default(false) }).strict(),
  z.object({ accion: z.literal("monitor"), monitor: z.string().trim().max(40).nullable() }).strict(),
  // Salida de emergencia: anular la evaluación (motivo obligatorio).
  // `version`: el actualizadoEn de la evaluación que vio el admin (si cambió, no se anula).
  z.object({ accion: z.literal("anular"), motivo: z.string().trim().min(3, "Escribe el motivo.").max(300), version: z.iso.datetime().optional() }).strict(),
  // Paso 21: marcar (solo sin hora) o quitar la marca «Sin proyecto».
  z.object({ accion: z.literal("sin_proyecto"), motivo }).strict(),
  z.object({ accion: z.literal("quitar_sin_proyecto") }).strict(),
  // Paso 23: revertir un cambio de nombre y descripción hecho por el estudiante (entrada del historial).
  z.object({ accion: z.literal("revertir"), cambio: z.string().regex(/^[a-f0-9]{24}$/) }).strict(),
]);

const id = async (params: Promise<{ id: string }>) => { const r = IdParams.safeParse(await params); return r.success ? r.data.id : null; };

/** Historial de cambios del proyecto (administración; coordinación lo ve en el tablero, en solo lectura). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;
  const pid = await id(params);
  if (!pid) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json({ historial: await historial(pid) });
}

/** Liberar o cambiar la hora de un proyecto, o asignarle monitor. Todo queda en changeLog. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const pid = await id(params);
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!pid || !parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const actor = { rol: g.user.rol, usuario: g.user.usuario };
  const a = parsed.data;
  const r = a.accion === "anular" ? await anularEvaluacion(pid, a.motivo, actor, a.version)
    : a.accion === "liberar" ? await liberar(pid, a.motivo, actor)
    : a.accion === "sin_proyecto" ? await marcarSinProyecto(pid, a.motivo, actor)
    : a.accion === "quitar_sin_proyecto" ? await quitarMarca(pid, actor)
    : a.accion === "revertir" ? await revertirEdicion(pid, new ObjectId(a.cambio), actor)
    : a.accion === "cambiar" ? await cambiarHora(pid, new Date(a.inicio), { otraCiudad: a.otraCiudad, motivo: a.motivo, confirmarTope: a.confirmarTope, confirmarEnCurso: a.confirmarEnCurso, ...(a.asiento ? { asiento: new ObjectId(a.asiento) } : {}) }, actor)
    : await asignarMonitor(pid, a.monitor || null, actor);
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === "sin_proyecto" || r.error === "no_existe" ? 404 : 409 });
}

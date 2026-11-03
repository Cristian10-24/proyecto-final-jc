import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { anularEvaluacion, asignarMonitor, cambiarHora, historial, liberar } from "@/lib/admin";
import { exigir, sameOrigin } from "@/lib/auth";
import { IdParams } from "@/lib/validation/id";

const motivo = z.string().trim().max(300).default("");
const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("liberar"), motivo }).strict(),
  // `asiento`: un asiento concreto de ese bloque (cambiar de mentor desde el tablero).
  z.object({ accion: z.literal("cambiar"), inicio: z.iso.datetime(), otraCiudad: z.boolean().default(false), motivo, asiento: z.string().regex(/^[a-f0-9]{24}$/).optional() }).strict(),
  z.object({ accion: z.literal("monitor"), monitor: z.string().trim().max(40).nullable() }).strict(),
  // Salida de emergencia: anular la evaluación (motivo obligatorio).
  // `version`: el actualizadoEn de la evaluación que vio el admin (si cambió, no se anula).
  z.object({ accion: z.literal("anular"), motivo: z.string().trim().min(3, "Escribe el motivo.").max(300), version: z.iso.datetime().optional() }).strict(),
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
    : a.accion === "cambiar" ? await cambiarHora(pid, new Date(a.inicio), { otraCiudad: a.otraCiudad, motivo: a.motivo, ...(a.asiento ? { asiento: new ObjectId(a.asiento) } : {}) }, actor)
    : await asignarMonitor(pid, a.monitor || null, actor);
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === "sin_proyecto" ? 404 : 409 });
}

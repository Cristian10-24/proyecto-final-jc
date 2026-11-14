import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { cambiarMonitorSala, recalcularPlan, verPlan } from "@/lib/planSalas";
import { volverAutomatico } from "@/lib/planSalasFijo";

const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("monitor"), id: z.string().regex(/^\d{4}-\d{2}-\d{2}\|\d{1,2}\|\d{1,2}$/), monitor: z.string().trim().min(1).max(40).nullable() }).strict(),
  z.object({ accion: z.literal("recalcular") }).strict(),
  z.object({ accion: z.literal("automatico"), dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
]);

/** Plan de salas: sala, enlace, mentor y monitor por hora (solo administración). */
export async function GET() {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  return NextResponse.json(await verPlan());
}

/** Cambiar el monitor de una sala, recalcular el plan o volver a automático las salas fijas de un día. Todo queda en changeLog. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const actor = { rol: g.user.rol, usuario: g.user.usuario };
  const a = parsed.data;
  const r = a.accion === "monitor" ? await cambiarMonitorSala(a.id, a.monitor, actor)
    : a.accion === "automatico" ? await volverAutomatico(a.dia, actor)
    : await recalcularPlan(actor);
  return NextResponse.json(r, { status: r.ok ? 200 : r.error === "no_existe" || r.error === "sin_salas" || r.error === "sin_fijos" ? 404 : 409 });
}

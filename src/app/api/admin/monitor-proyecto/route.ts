import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { asignarMonitorProyecto, monitoresPorProyecto, quitarMonitorProyecto } from "@/lib/monitorProyecto";

// Monitor por proyecto (solo administración: cambiar_horario). GET: proyectos de un día con su monitor del bloque y su
// excepción, y los monitores activos. POST: asignar a mano el monitor de un proyecto o quitar la excepción. changeLog.

const Filtro = z.object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();
const id = z.string().regex(/^[a-f0-9]{24}$/);
const Accion = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("asignar"), proyectoId: id, monitor: z.string().trim().min(1).max(80),
    motivo: z.string().transform((s) => s.trim()).pipe(z.string().max(300)).optional(), confirmar: z.boolean().optional(),
  }).strict(),
  z.object({ accion: z.literal("quitar"), proyectoId: id }).strict(),
]);

const ESTADO: Record<string, number> = { no_existe: 404, sin_hora: 409, monitor: 409, igual: 409, franja: 409, aviso: 409, cambio: 409, sin_excepcion: 409 };

export async function GET(req: Request) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const f = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await monitoresPorProyecto(f.data.dia), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const a = parsed.data;
  const r = a.accion === "asignar"
    ? await asignarMonitorProyecto(g.user, a.proyectoId, a.monitor, a.motivo || undefined, a.confirmar === true)
    : await quitarMonitorProyecto(g.user, a.proyectoId);
  return NextResponse.json(r, { status: "error" in r ? ESTADO[r.error] ?? 400 : 200 });
}

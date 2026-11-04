import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { esDia } from "@/lib/edicion";
import { agregarMentor, datosFranjas, quitarMentor } from "@/lib/franjas";

// Franjas y mentores (Paso 17b): admin y coordinación ven; solo admin agrega o quita mentores de una hora.

const Consulta = z.object({ dia: z.string().refine(esDia).optional() }).strict();
const Cuerpo = z.object({
  accion: z.enum(["agregar", "quitar"]),
  dia: z.string().refine(esDia, "Día inválido."),
  hora: z.number().int().min(0).max(23),
  mentorId: z.string().min(1).max(100),
}).strict();

export async function GET(req: Request) {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;
  const p = Consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await datosFranjas(p.data.dia));
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: p.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  const actor = { rol: g.user.rol, usuario: g.user.usuario };
  const { accion, dia, hora, mentorId } = p.data;
  const r = accion === "agregar" ? await agregarMentor(dia, hora, mentorId, actor) : await quitarMentor(dia, hora, mentorId, actor);
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}

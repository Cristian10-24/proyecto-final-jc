import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { guardarCierre } from "@/lib/reglasCupos";

// Cierre de inscripciones por ciudad (solo admin): horas antes del primer bloque y, si hace falta, una fecha a mano.
const Cuerpo = z.object({
  horasAntes: z.number().int().min(0).max(24 * 30),
  porCiudad: z.record(z.string().refine((c) => NOMBRES_CIUDADES.includes(c)), z.iso.datetime().nullable()),
}).strict();

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Revisa las horas y las fechas." }, { status: 400 });
  await guardarCierre(p.data.horasAntes, Object.fromEntries(Object.entries(p.data.porCiudad).map(([k, v]) => [k, v ? new Date(v) : null])), { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json({ ok: true });
}

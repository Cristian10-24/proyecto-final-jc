import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { asignacionesMonitores } from "@/lib/vistas/monitores";

// Fase 6 · «Monitores» (solo lectura): coordinación y admin (ver_todas_las_ciudades). Monitor y mentor: 403; sin
// sesión: 401. Sin datos personales de estudiantes.
const Filtro = z.object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();

export async function GET(req: Request) {
  const g = await exigir("ver_todas_las_ciudades");
  if (g.error) return g.error;
  const f = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await asignacionesMonitores(f.data.dia), { headers: { "Cache-Control": "no-store" } });
}

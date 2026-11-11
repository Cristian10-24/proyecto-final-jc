import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { misProyectos } from "@/lib/misProyectos";

// Solo lectura. Monitor: el permiso de «Mis salas» (monitorear_salas) y solo sus salas; coordinación y admin
// (ver_todas_las_ciudades): todos. Mentor: 403.
const Filtro = z.object({
  dia: z.union([z.literal("todos"), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  ciudad: z.string().trim().min(1).max(60).optional(),
  sala: z.coerce.number().int().min(1).max(999).optional(),
  monitor: z.string().trim().min(1).max(80).optional(),
  q: z.string().max(80).optional(),
}).strict();

export async function GET(req: Request) {
  const g = await exigir(["monitorear_salas", "ver_todas_las_ciudades"]);
  if (g.error) return g.error;
  const f = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await misProyectos(g.user, f.data), { headers: { "Cache-Control": "no-store" } });
}

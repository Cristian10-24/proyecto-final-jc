import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { jsonLectura, leer } from "@/lib/postEvento";
import { miCiudad } from "@/lib/vistas/miCiudad";

// Fase 6 · «Mi ciudad» (solo lectura): el monitor (monitorear_salas) ve los proyectos con hora de SUS ciudades y solo
// el estado de evaluación. Coordinación, admin y mentor: 403 (no son monitores). Sin sesión: 401.
const Filtro = z.object({ ciudad: z.string().trim().min(1).max(60).optional() }).strict();

export async function GET(req: Request) {
  const g = await exigir("monitorear_salas");
  if (g.error) return g.error;
  const f = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const user = g.user, ciudad = f.data.ciudad;
  const r = await leer("miCiudad", [user, ciudad ?? null], () => miCiudad(user, ciudad));
  if ("error" in r.datos) return NextResponse.json({ error: "sin_permiso" }, { status: 403 });
  return jsonLectura(r, { "Cache-Control": "no-store" });
}

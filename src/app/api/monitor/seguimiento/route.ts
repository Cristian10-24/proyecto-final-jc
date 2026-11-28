import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { jsonLectura, leer } from "@/lib/postEvento";
import { seguimiento } from "@/lib/seguimiento";

/** Proyectos de las ciudades del monitor (coordinación y admin: todas) con su estado: eligió o falta. */
export async function GET() {
  const g = await exigir("ver_seguimiento");
  if (g.error) return g.error;
  const user = g.user;
  return jsonLectura(await leer("seguimientoMonitor", [user], async () => ({ proyectos: await seguimiento(user) })));
}

import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { collections } from "@/lib/db";
import { FILTRO_MONITOR } from "@/lib/permisos";

/** Ciudades y monitores activos para el formulario de proyecto (Tablero → "Nuevo proyecto"). Solo admin. */
export async function GET(req: Request) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  if (new URL(req.url).searchParams.size) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const monitores = await (await collections()).users.find({ ...FILTRO_MONITOR, activo: true }, { projection: { usuario: 1, nombre: 1, ciudades: 1 } }).sort({ nombre: 1 }).toArray();
  return NextResponse.json({
    ciudades: [...NOMBRES_CIUDADES].sort((a, b) => a.localeCompare(b, "es")),
    monitores: monitores.map((m) => ({ usuario: m.usuario, nombre: m.nombre, ciudades: m.ciudades })),
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { listarProyectos } from "@/lib/admin";
import { exigir, sameOrigin } from "@/lib/auth";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { collections } from "@/lib/db";
import { crearProyecto } from "@/lib/gestionProyectos";
import { ProyectoEntrada } from "@/lib/validation/proyectoEntrada";

const Query = z
  .object({
    q: z.string().trim().max(80).optional(),
    ciudad: z.enum(NOMBRES_CIUDADES as [string, ...string[]]).optional(),
    estado: z.enum(["con_hora", "sin_hora", "sin_monitor"]).optional(),
  })
  .strict();

/** Tablero del admin: proyectos con su hora, mentor y monitor, más la lista de monitores. */
export async function GET(req: Request) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const parsed = Query.safeParse(Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== "")));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const { users } = await collections();
  const monitores = await users.find({ rol: "monitor", activo: true }, { projection: { usuario: 1, nombre: 1, ciudades: 1 } }).sort({ nombre: 1 }).toArray();
  return NextResponse.json({
    proyectos: await listarProyectos(parsed.data),
    monitores: monitores.map((m) => ({ usuario: m.usuario, nombre: m.nombre, ciudades: m.ciudades })),
    ciudades: [...NOMBRES_CIUDADES].sort((a, b) => a.localeCompare(b, "es")),
  });
}

/** Nuevo proyecto (solo admin): queda sin hora; el estudiante entra al portal y elige. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const parsed = ProyectoEntrada.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Revisa los datos del formulario." }, { status: 400 });
  const r = await crearProyecto(parsed.data, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json(r, { status: r.ok ? 201 : r.error === "datos" ? 400 : 409 });
}

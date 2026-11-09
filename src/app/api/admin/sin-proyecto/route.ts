import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { collections } from "@/lib/db";
import { convertirEnProyecto } from "@/lib/gestionProyectos";
import { agregarParticipante, listarSinProyecto, quitarParticipante } from "@/lib/sinProyecto";
import { IdParams } from "@/lib/validation/id";
import { FILTRO_MONITOR } from "@/lib/permisos";

// Paso 21 · «Sin proyecto» (solo admin): lista, agregar uno, quitar uno cargado por error y convertir en proyecto.

const Id = IdParams.shape.id;
const Accion = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("agregar"),
    participante: z.object({
      nombre: z.string().trim().min(1).max(120),
      documento: z.string().trim().min(1).max(30),
      ciudad: z.enum(NOMBRES_CIUDADES as [string, ...string[]]),
      celular: z.string().trim().max(30).optional(),
      correo: z.string().trim().max(120).optional(),
      monitor: z.string().trim().min(1).max(40).nullable().optional(),
    }).strict(),
  }).strict(),
  z.object({ accion: z.literal("quitar"), id: Id }).strict(),
  z.object({
    accion: z.literal("convertir"), id: Id,
    nombre: z.string().trim().min(1).max(160), descripcion: z.string().trim().max(1000).optional(),
    ruta: z.enum(["Básica", "Avanzada"]).nullable().optional(),
  }).strict(),
]);
const ESTADO: Record<string, number> = { datos: 400, no_existe: 404, en_proyecto: 409, repetido: 409, cambio: 409, documento: 409, sin_proyecto: 409 };

export async function GET() {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const { users } = await collections();
  const monitores = await users.find({ ...FILTRO_MONITOR, activo: true }, { projection: { usuario: 1, nombre: 1, ciudades: 1 } }).sort({ nombre: 1 }).toArray();
  return NextResponse.json({
    ...(await listarSinProyecto()),
    monitores: monitores.map((m) => ({ usuario: m.usuario, nombre: m.nombre, ciudades: m.ciudades })),
    ciudades: [...NOMBRES_CIUDADES].sort((a, b) => a.localeCompare(b, "es")),
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Revisa los datos del formulario." }, { status: 400 });
  const actor = { rol: g.user.rol, usuario: g.user.usuario };
  const a = parsed.data;
  const r = a.accion === "agregar" ? await agregarParticipante(a.participante, actor)
    : a.accion === "quitar" ? await quitarParticipante(a.id, actor)
    : await convertirEnProyecto(a.id, { nombre: a.nombre, descripcion: a.descripcion, ruta: a.ruta }, actor);
  return NextResponse.json(r, { status: r.ok ? 200 : ESTADO[r.error] ?? 400 });
}

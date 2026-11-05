import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { agregarIntegrante, datosProyecto, editarProyecto, separarPareja } from "@/lib/gestionProyectos";
import { IdParams } from "@/lib/validation/id";
import { IntegranteEntrada, ProyectoEntrada, Version } from "@/lib/validation/proyectoEntrada";

// Gestión manual de un proyecto (solo admin): datos completos para editar, editar, separar pareja y agregar integrante.

const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("editar"), proyecto: ProyectoEntrada, version: Version, confirmarCiudad: z.boolean().optional() }).strict(),
  z.object({ accion: z.literal("separar"), queda: z.union([z.literal(0), z.literal(1)]), nombreNuevo: z.string().trim().max(160).optional(), version: Version }).strict(),
  z.object({ accion: z.literal("agregar"), integrante: IntegranteEntrada, version: Version, unir: z.boolean().optional(), conservar: z.enum(["este", "otro"]).optional() }).strict(),
]);
const ESTADO: Record<string, number> = { no_existe: 404, datos: 400, documento: 409, evaluado: 409, cambio: 409, confirmar_ciudad: 409, confirmar_union: 409 };

const id = async (params: Promise<{ id: string }>) => { const r = IdParams.safeParse(await params); return r.success ? r.data.id : null; };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const pid = await id(params);
  if (!pid || new URL(req.url).searchParams.size) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const d = await datosProyecto(pid);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "no_existe" }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const pid = await id(params);
  const parsed = Accion.safeParse(await req.json().catch(() => null));
  if (!pid || !parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const actor = { rol: g.user.rol, usuario: g.user.usuario };
  const a = parsed.data;
  const r = a.accion === "editar" ? await editarProyecto(pid, a.proyecto, { version: a.version, confirmarCiudad: a.confirmarCiudad }, actor)
    : a.accion === "separar" ? await separarPareja(pid, { queda: a.queda, nombreNuevo: a.nombreNuevo, version: a.version }, actor)
    : await agregarIntegrante(pid, a.integrante, { version: a.version, unir: a.unir, conservar: a.conservar }, actor);
  return NextResponse.json(r, { status: r.ok ? 200 : ESTADO[r.error] ?? 400 });
}

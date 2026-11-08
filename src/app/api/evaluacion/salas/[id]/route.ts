import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { MOTIVOS_INASISTENCIA } from "@/lib/evaluacion/criterios";
import { anotar, detalleSala, reprogramar, sugerirCambio } from "@/lib/evaluacion/monitor";

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }).strict();
const SinQuery = z.object({}).strict();
const invalido = () => NextResponse.json({ error: "datos_invalidos" }, { status: 400 });

const texto = (min: number, max: number) => z.string().transform((s) => s.trim()).pipe(z.string().min(min).max(max));
const Accion = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("anotar"), i: z.number().int().min(0).max(1),
    asistencia: z.enum(["si", "no"]).nullable(), motivo: z.enum(MOTIVOS_INASISTENCIA).nullable(), observacion: texto(0, 1000),
  }).strict(),
  z.object({ accion: z.literal("reprogramar"), asiento: z.string().regex(/^[a-f0-9]{24}$/), motivo: texto(3, 300) }).strict(),
  z.object({ accion: z.literal("sugerir"), detalle: texto(3, 300), motivo: texto(3, 300) }).strict(),
]);

const ESTADO: Record<string, number> = { no_existe: 404, sin_hora: 404, otra_sala: 403, integrantes: 409, sin_cupo: 409, ya_evaluado: 409, cambio: 409, ya_sugerido: 409, tope: 409 };

/** Ficha del proyecto para el monitor de su sala: contacto, asistencia, motivo, observación y sugerencia pendiente. */
export async function GET(req: Request, { params }: Ctx) {
  const g = await exigir("monitorear_salas");
  if (g.error) return g.error;
  const p = Params.safeParse(await params);
  if (!p.success || !SinQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams)).success) return invalido();
  const r = await detalleSala(g.user, p.data.id);
  return NextResponse.json(r, { status: "error" in r ? ESTADO[r.error] ?? 400 : 200 });
}

/** Anotar asistencia y observación, reprogramar a un cupo libre de su ciudad o sugerir un cambio especial. Deja changeLog. */
export async function POST(req: Request, { params }: Ctx) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("monitorear_salas");
  if (g.error) return g.error;
  const parsed = Accion.safeParse(await req.json().catch(() => null)), p = Params.safeParse(await params);
  if (!parsed.success || !p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const { id } = p.data, a = parsed.data;
  const r = a.accion === "anotar" ? await anotar(g.user, id, a.i, { asistencia: a.asistencia, motivo: a.motivo, observacion: a.observacion })
    : a.accion === "reprogramar" ? await reprogramar(g.user, id, a.asiento, a.motivo)
    : await sugerirCambio(g.user, id, a.detalle, a.motivo);
  return NextResponse.json(r, { status: "error" in r ? ESTADO[r.error] ?? 400 : 200 });
}

import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { aplicarPropuesta, cargaMentores } from "@/lib/cargaMentores";
import { esDia } from "@/lib/edicion";

const Filtro = z.object({ dia: z.string().refine(esDia).optional() }).strict();
const Id = z.string().regex(/^[a-f0-9]{24}$/).transform((s) => new ObjectId(s));
const Aplicar = z.object({ accion: z.literal("aplicar"), proyecto: Id, desde: Id, hacia: Id }).strict();
const ESTADO: Record<string, number> = { datos: 400, sin_proyecto: 404 };

/** Paso 24 · Carga de los mentores de un día y propuestas (se recalculan en cada lectura; admin y coordinación). */
export async function GET(req: Request) {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;
  const f = Filtro.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await cargaMentores(f.data.dia));
}

/** Aplica una propuesta: mismo bloque, otro mentor (solo admin; misma transacción de «Cambiar mentor»). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = Aplicar.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const r = await aplicarPropuesta(p.data.proyecto, p.data.desde, p.data.hacia, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json(r, { status: r.ok ? 200 : ESTADO[r.error] ?? 409 });
}

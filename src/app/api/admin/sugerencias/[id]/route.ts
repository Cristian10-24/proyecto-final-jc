import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { aprobar, rechazar } from "@/lib/sugerencias";

const Params = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }).strict();
const Accion = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aprobar"), inicio: z.iso.datetime(), otraCiudad: z.boolean().default(false), confirmarTope: z.boolean().default(false) }).strict(),
  z.object({ accion: z.literal("rechazar"), motivo: z.string().transform((s) => s.trim()).pipe(z.string().min(3).max(300)) }).strict(),
]);
const ESTADO: Record<string, number> = { no_existe: 404, sin_hora: 409, ya_resuelta: 409, sin_cupo: 409, ya_evaluado: 409, cambio: 409, misma_hora: 409, tope: 409 };

/** Aprobar (eligiendo el bloque nuevo) o rechazar (con motivo) una sugerencia. Todo deja changeLog. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = Params.safeParse(await params), a = Accion.safeParse(await req.json().catch(() => null));
  if (!p.success || !a.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const actor = { rol: g.user.rol, usuario: g.user.usuario };
  const r = a.data.accion === "aprobar" ? await aprobar(p.data.id, new Date(a.data.inicio), a.data.otraCiudad, actor, a.data.confirmarTope) : await rechazar(p.data.id, a.data.motivo, actor);
  return NextResponse.json(r, { status: "error" in r ? ESTADO[r.error] ?? 400 : 200 });
}

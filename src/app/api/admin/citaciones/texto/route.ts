import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { guardarTenEnCuenta } from "@/lib/citaciones/registro";

// Fase 5 · Paso 29 · Texto «Ten en cuenta» de las citaciones de participantes (solo admin, mismo origen, changeLog).
// Cambiarlo deja como «Desactualizado» lo ya citado a participantes: se reenvía con «Actualizar».

const Cuerpo = z.object({ texto: z.string().max(4000) }).strict();

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("citar");
  if (g.error) return g.error;
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Texto inválido (máximo 4000 caracteres)." }, { status: 400 });
  const r = await guardarTenEnCuenta(p.data.texto, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}

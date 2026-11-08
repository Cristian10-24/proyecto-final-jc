import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { cambiarModo, estadoModo } from "@/lib/modoCupos";

// Fase 4 · Modo orden de llegada (solo admin): ver el interruptor con el tope, lo que lleva y lo que puede tomar cada
// ciudad por día, y encenderlo o apagarlo. No cambia asientos ni reservas: solo el documento `ajustes/modoCupos`.

const Cuerpo = z.object({ ordenLlegada: z.boolean() }).strict();

export async function GET() {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  return NextResponse.json(await estadoModo());
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  await cambiarModo(p.data.ordenLlegada, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json({ ok: true, ...(await estadoModo()) });
}

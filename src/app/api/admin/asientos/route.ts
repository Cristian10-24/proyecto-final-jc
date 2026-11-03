import { NextResponse } from "next/server";
import { z } from "zod";
import { reetiquetar, resumenAsientos } from "@/lib/admin";
import { exigir, sameOrigin } from "@/lib/auth";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { esDia } from "@/lib/edicion";

const dia = z.string().refine(esDia);
const Query = z.object({ dia }).strict();
const Reetiquetar = z
  .object({
    dia,
    desde: z.string().max(200),
    hacia: z.array(z.enum(NOMBRES_CIUDADES as [string, ...string[]])).min(1).max(NOMBRES_CIUDADES.length),
    cantidad: z.number().int().min(1).max(5000),
  })
  .strict();

/** Asientos de un día por grupo de ciudades (libres / ocupados). */
export async function GET(req: Request) {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  return NextResponse.json(await resumenAsientos(parsed.data.dia));
}

/** Reetiquetar asientos libres de un día: pasar `cantidad` del grupo `desde` a las ciudades `hacia`. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const parsed = Reetiquetar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Datos inválidos." }, { status: 400 });
  const { dia: d, desde, hacia, cantidad } = parsed.data;
  const r = await reetiquetar(d, desde, [...new Set(hacia)], cantidad, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}

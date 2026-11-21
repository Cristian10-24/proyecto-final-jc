import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { seguimientoV2 } from "@/lib/evaluacion/resultados";
import { FiltroSeguimientoV2Schema } from "./filtro";

/** Seguimiento general v2 (coordinación y admin, solo lectura): cifras de los dos modos con día, ciudad, ruta,
 *  modalidad y búsqueda; listas largas solo del modo pedido. Solo nombres: nunca documento, correo ni celular. */
export async function GET(req: Request) {
  const g = await exigir("ver_evaluaciones");
  if (g.error) return g.error;
  const f = FiltroSeguimientoV2Schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const { modo, q, ...resto } = f.data;
  return NextResponse.json(await seguimientoV2({ ...resto, ...(q ? { q } : {}) }, new Date(), modo ?? "est"), { headers: { "Cache-Control": "no-store" } });
}

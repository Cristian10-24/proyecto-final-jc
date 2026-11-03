import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { cuposReprogramar } from "@/lib/evaluacion/monitor";

type Ctx = { params: Promise<{ id: string }> };
const Params = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }).strict();
const SinQuery = z.object({}).strict();
const invalido = () => NextResponse.json({ error: "datos_invalidos" }, { status: 400 });

/** Cupos libres para reprogramar: de la ciudad del estudiante, en sus días habilitados y aún no empezados. */
export async function GET(req: Request, { params }: Ctx) {
  const g = await exigir("monitorear_salas");
  if (g.error) return g.error;
  const p = Params.safeParse(await params);
  if (!p.success || !SinQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams)).success) return invalido();
  const r = await cuposReprogramar(g.user, p.data.id);
  return NextResponse.json(r, { status: "error" in r ? (r.error === "otra_sala" ? 403 : 404) : 200 });
}

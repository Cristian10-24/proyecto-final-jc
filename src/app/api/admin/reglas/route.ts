import { NextResponse } from "next/server";
import { z } from "zod";
import { TODAS } from "@/lib/agenda";
import { exigir, sameOrigin } from "@/lib/auth";
import { CIUDADES, NOMBRES_CIUDADES } from "@/lib/ciudades";
import { collections } from "@/lib/db";
import { esDia } from "@/lib/edicion";
import { aplicarReglas, cierres, previaReglas } from "@/lib/reglasCupos";

// Reglas de cupos por día (Paso 17, solo admin): ver, vista previa y aplicar (solo reetiqueta asientos libres).

const Ciudad = z.object({
  ciudad: z.string().refine((c) => c === TODAS || NOMBRES_CIUDADES.includes(c), "Ciudad no reconocida."),
  minimo: z.number().int().min(0).max(5000).nullable(),
  maximo: z.number().int().min(0).max(5000).nullable(),
  sobrante: z.boolean(),
  abre: z.iso.datetime().nullable(),
}).strict();
const Cuerpo = z.object({ accion: z.enum(["previa", "aplicar"]), dia: z.string().refine(esDia), ciudades: z.array(Ciudad).max(15) }).strict();

export async function GET() {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const c = await collections();
  const [dias, porDia, cierre] = await Promise.all([
    c.dias.find({}).sort({ _id: 1 }).toArray(),
    c.asientos.aggregate<{ _id: string; total: number; ocupados: number }>([
      { $group: { _id: "$dia", total: { $sum: 1 }, ocupados: { $sum: { $cond: [{ $eq: [{ $type: "$proyectoId" }, "objectId"] }, 1, 0] } } } },
    ]).toArray(),
    cierres(),
  ]);
  const cfg = new Map(dias.map((d) => [d._id, d]));
  return NextResponse.json({
    dias: porDia.sort((a, b) => a._id.localeCompare(b._id)).map((x) => {
      const d = cfg.get(x._id);
      return {
        dia: x._id, capacidad: x.total, ocupados: x.ocupados,
        ciudades: (d?.ciudades ?? []).map((k) => ({ ciudad: k.ciudad, minimo: k.cupos, maximo: k.max ?? null, sobrante: k.sobrante, abre: k.abre?.toISOString() ?? null })),
        ...(d?.editadoEn ? { editadoEn: d.editadoEn.toISOString(), editadoPor: d.editadoPor } : {}),
      };
    }),
    ciudades: [...NOMBRES_CIUDADES, TODAS],
    clausuras: Object.fromEntries(CIUDADES.map((k) => [k.nombre, k.clausura])),
    cierre,
  });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  const p = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos", mensaje: p.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  const cupos = p.data.ciudades.map((x) => ({ ciudad: x.ciudad, cupos: x.minimo, max: x.maximo, sobrante: x.sobrante, abre: x.abre ? new Date(x.abre) : null }));
  if (p.data.accion === "previa") return NextResponse.json({ plan: await previaReglas(p.data.dia, cupos) });
  const r = await aplicarReglas(p.data.dia, cupos, { rol: g.user.rol, usuario: g.user.usuario });
  return NextResponse.json(r, { status: r.ok ? 200 : 409 });
}

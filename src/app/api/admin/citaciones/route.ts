import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { TIPOS_CITACION } from "@/lib/citaciones/contenido";
import { entornoCitaciones } from "@/lib/citaciones/google";
import { esPendiente, filasDelDia, textoTenEnCuenta } from "@/lib/citaciones/registro";
import { collections } from "@/lib/db";
import { esDia } from "@/lib/edicion";

// Fase 5 · Paso 29 · Citaciones (solo admin): estado de la conexión con Google, días con proyectos y filas del día por
// pestaña (participantes, mentores, monitores). Solo lee. Nunca devuelve secretos: solo «conectado» y el correo de prueba.

const Consulta = z.object({ dia: z.string().refine(esDia).optional(), tipo: z.enum(TIPOS_CITACION).optional() }).strict();

export async function GET(req: Request) {
  const g = await exigir("citar");
  if (g.error) return g.error;
  const p = Consulta.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const { estado, correoPrueba } = entornoCitaciones();
  const { asientos } = await collections();
  const dias = (await asientos.aggregate<{ _id: string; proyectos: number }>([
    { $match: { proyectoId: { $type: "objectId" } } },
    { $group: { _id: "$dia", proyectos: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray()).map((d) => ({ dia: d._id, proyectos: d.proyectos }));
  const tenEnCuenta = await textoTenEnCuenta();
  if (!p.data.dia) return NextResponse.json({ estado, dias, tenEnCuenta });
  const tipo = p.data.tipo ?? "participante";
  const filas = await filasDelDia(p.data.dia, tipo, correoPrueba);
  const pendientes = filas.filter((f) => esPendiente(f, correoPrueba)).map((f) => f.clave);
  return NextResponse.json({ estado, dias, tenEnCuenta, dia: p.data.dia, tipo, filas, pendientes });
}

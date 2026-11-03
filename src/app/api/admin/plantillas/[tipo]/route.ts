import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir } from "@/lib/auth";
import { plantilla } from "@/lib/importar/plantillas";

const Tipo = z.object({ tipo: z.enum(["proyectos", "mentores", "salas", "usuarios"]) }).strict();

/** Descarga la plantilla vacía de proyectos, mentores, salas y monitores, o usuarios (solo administración). */
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const g = await exigir("importar");
  if (g.error) return g.error;
  const parsed = Tipo.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const { tipo } = parsed.data;
  return new NextResponse(new Uint8Array(await plantilla(tipo)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plantilla-${tipo}-pfjc-2026.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

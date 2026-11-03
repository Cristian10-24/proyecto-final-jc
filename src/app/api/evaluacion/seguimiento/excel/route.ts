import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { excelResultados } from "@/lib/evaluacion/resultados";
import { FiltroSeguimientoSchema } from "../filtro";

/** Excel de resultados (solo exportar): una fila por estudiante y una hoja por tabla. Lleva datos de contacto completos. */
export async function GET(req: Request) {
  const g = await exigir("descargar_excel");
  if (g.error) return g.error;
  const f = FiltroSeguimientoSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!f.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const nombre = ["resultados-pfjc-2026", f.data.dia, f.data.ciudad?.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "")].filter(Boolean).join("-");
  return new NextResponse(new Uint8Array(await excelResultados(f.data)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

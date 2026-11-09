import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { cargaMentoresExcel } from "@/lib/cargaMentores";

/** Paso 24 · Carga de los mentores y propuestas en Excel, todos los días (coordinación y admin). */
export async function GET() {
  const g = await exigir("descargar_excel");
  if (g.error) return g.error;
  return new NextResponse(new Uint8Array(await cargaMentoresExcel()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="carga_mentores_2026.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { cronogramaExcel } from "@/lib/seguimiento";

/** Cronograma en Excel, una hoja por día (coordinación y admin). Documento y correo solo para administración. */
export async function GET() {
  const g = await exigir("descargar_excel");
  if (g.error) return g.error;
  return new NextResponse(new Uint8Array(await cronogramaExcel({ datosPersonales: puede(g.user, "descargar_datos_personales") })), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="cronograma_proyecto_final_2026.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

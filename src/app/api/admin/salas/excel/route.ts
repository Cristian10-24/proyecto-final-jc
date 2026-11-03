import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { planSalasExcel } from "@/lib/planSalas";

/** Plan de salas en Excel: Día, Hora, Sala, Enlace, Mentor y Monitor (solo administración). */
export async function GET() {
  const g = await exigir("cambiar_horario");
  if (g.error) return g.error;
  return new NextResponse(new Uint8Array(await planSalasExcel()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plan_de_salas_2026.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

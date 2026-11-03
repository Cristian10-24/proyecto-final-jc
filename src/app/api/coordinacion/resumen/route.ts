import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { resumen } from "@/lib/seguimiento";

/** Avance por ciudad y ocupación por día (coordinación y admin). */
export async function GET() {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;
  return NextResponse.json(await resumen());
}

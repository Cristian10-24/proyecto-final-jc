import { redirect } from "next/navigation";
import TableroPanel from "@/components/TableroPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Tablero · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Tablero de horarios: el admin mueve y libera; coordinación lo ve en solo lectura.
export default async function TableroPage({ searchParams }: { searchParams: Promise<{ dia?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "ver_resumen")) redirect(inicioPorRol(user));
  // Paso 24: «Carga de mentores» abre el Tablero en un día (?dia=AAAA-MM-DD).
  const { dia } = await searchParams;
  return <TableroPanel user={user} diaInicial={typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : ""} />;
}

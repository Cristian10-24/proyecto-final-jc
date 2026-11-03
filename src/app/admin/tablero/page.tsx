import { redirect } from "next/navigation";
import TableroPanel from "@/components/TableroPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Tablero · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Tablero de horarios: el admin mueve y libera; coordinación lo ve en solo lectura.
export default async function TableroPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "ver_resumen")) redirect(inicioPorRol(user.rol));
  return <TableroPanel user={user} />;
}

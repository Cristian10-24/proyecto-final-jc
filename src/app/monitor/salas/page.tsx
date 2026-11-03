import { redirect } from "next/navigation";
import MonitorPanel from "@/components/evaluacion/MonitorPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Mis salas · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Presentaciones: el monitor ve solo los estudiantes de sus salas asignadas (de cualquier ciudad).
export default async function MonitorSalasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "monitorear_salas")) redirect(inicioPorRol(user.rol));
  return <MonitorPanel user={user} />;
}

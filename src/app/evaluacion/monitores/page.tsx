import { redirect } from "next/navigation";
import MonitoresPanel from "@/components/evaluacion/vistas/MonitoresPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Monitores · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Fase 6 · Asignaciones de monitores (solo lectura): coordinación y admin. Los botones de Salas solo para quien puede
// cambiar el plan (admin), sin cambiar ningún permiso.
export default async function MonitoresPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "ver_todas_las_ciudades")) redirect(inicioPorRol(user));
  return <MonitoresPanel user={user} admin={puede(user, "cambiar_horario")} />;
}

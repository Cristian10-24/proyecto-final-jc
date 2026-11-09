import { redirect } from "next/navigation";
import SinProyectoPanel from "@/components/SinProyectoPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Sin proyecto · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Paso 21 · Participantes sin proyecto y proyectos marcados «Sin proyecto» (solo admin).
export default async function SinProyectoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "cambiar_horario")) redirect(inicioPorRol(user));
  return <SinProyectoPanel user={user} />;
}

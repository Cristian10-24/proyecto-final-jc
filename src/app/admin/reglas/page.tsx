import { redirect } from "next/navigation";
import ReglasPanel from "@/components/ReglasPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Reglas de cupos · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Editor de reglas de cupos y cierre de inscripciones (solo admin).
export default async function ReglasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "cambiar_horario")) redirect(inicioPorRol(user.rol));
  return <ReglasPanel user={user} />;
}

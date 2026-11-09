import { redirect } from "next/navigation";
import MentorPanel from "@/components/evaluacion/MentorPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Evaluaciones · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Mis evaluaciones: el mentor evalúa sus proyectos; coordinación y admin ven la de cualquier mentor (solo lectura).
export default async function MentorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "evaluar") && !puede(user, "ver_evaluaciones")) redirect(inicioPorRol(user));
  return <MentorPanel user={user} />;
}

import { redirect } from "next/navigation";
import SeguimientoGeneral from "@/components/evaluacion/SeguimientoGeneral";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Seguimiento general · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Seguimiento general de la evaluación (coordinación y admin): tablas del prototipo, Excel de resultados y criterios.
export default async function SeguimientoGeneralPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "ver_evaluaciones")) redirect(inicioPorRol(user.rol));
  return <SeguimientoGeneral user={user} />;
}

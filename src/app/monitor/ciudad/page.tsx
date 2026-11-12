import { redirect } from "next/navigation";
import MiCiudadPanel from "@/components/evaluacion/vistas/MiCiudadPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Mi ciudad · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Fase 6 · Solo lectura, solo monitores: los proyectos con hora de sus ciudades y solo su estado de evaluación.
export default async function MiCiudadPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "monitorear_salas")) redirect(inicioPorRol(user));
  return <MiCiudadPanel user={user} />;
}

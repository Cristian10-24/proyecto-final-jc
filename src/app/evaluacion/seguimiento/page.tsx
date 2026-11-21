import { redirect } from "next/navigation";
import SeguimientoV2 from "@/components/evaluacion/seguimiento/SeguimientoV2";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Seguimiento general · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Seguimiento general v2 (coordinación y admin): seis sub-secciones, filtros y «Contar por» en la URL, Excel de
// resultados (igual que antes) y criterios editables (misma ruta).
export default async function SeguimientoGeneralPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "ver_evaluaciones")) redirect(inicioPorRol(user));
  return <SeguimientoV2 user={user} />;
}

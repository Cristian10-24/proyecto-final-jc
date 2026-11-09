import { redirect } from "next/navigation";
import CargaMentoresPanel from "@/components/CargaMentoresPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Carga de mentores · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Paso 24 · Carga de los mentores y propuestas de redistribución (solo lectura; admin y coordinación).
export default async function CargaMentoresPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "ver_resumen")) redirect(inicioPorRol(user.rol));
  return <CargaMentoresPanel user={user} />;
}

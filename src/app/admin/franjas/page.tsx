import { redirect } from "next/navigation";
import FranjasPanel from "@/components/FranjasPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Franjas y mentores · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Franjas y mentores: admin edita; coordinación solo mira.
export default async function FranjasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "ver_resumen")) redirect(inicioPorRol(user));
  return <FranjasPanel user={user} puedeEditar={puede(user, "cambiar_horario")} />;
}

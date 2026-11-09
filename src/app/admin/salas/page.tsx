import { redirect } from "next/navigation";
import SalasPanel from "@/components/SalasPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Salas · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function SalasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "cambiar_horario")) redirect(inicioPorRol(user));
  return <SalasPanel user={user} />;
}

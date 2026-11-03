import { redirect } from "next/navigation";
import SalasPanel from "@/components/SalasPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Salas · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function SalasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "cambiar_horario")) redirect(inicioPorRol(user.rol));
  return <SalasPanel user={user} />;
}

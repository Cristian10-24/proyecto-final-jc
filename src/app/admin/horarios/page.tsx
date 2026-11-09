import { redirect } from "next/navigation";
import HorariosPanel from "@/components/HorariosPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Horarios · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "cambiar_horario")) redirect(inicioPorRol(user));
  return <HorariosPanel user={user} />;
}

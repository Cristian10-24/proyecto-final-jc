import { redirect } from "next/navigation";
import UsersPanel from "@/components/UsersPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Usuarios · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "gestionar_usuarios")) redirect(inicioPorRol(user.rol));
  return <UsersPanel user={user} />;
}

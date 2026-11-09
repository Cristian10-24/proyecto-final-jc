import { redirect } from "next/navigation";
import ImportPanel from "@/components/ImportPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Importar · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "importar")) redirect(inicioPorRol(user));
  return <ImportPanel user={user} />;
}

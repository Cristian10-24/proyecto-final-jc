import { redirect } from "next/navigation";
import ResumenPanel from "@/components/ResumenPanel";
import { getCurrentUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";

export const metadata = { title: "Coordinación · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Resumen por ciudad y por día, y descarga del cronograma.
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "ver_resumen")) redirect("/monitor");
  return <ResumenPanel user={user} />;
}

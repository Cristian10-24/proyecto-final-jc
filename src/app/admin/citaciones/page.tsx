import { redirect } from "next/navigation";
import CitacionesPanel from "@/components/CitacionesPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Citaciones · Administración · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Fase 5 · Paso 29 · Citaciones por Google Calendar (solo admin).
export default async function CitacionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "citar")) redirect(inicioPorRol(user));
  return <CitacionesPanel user={user} />;
}

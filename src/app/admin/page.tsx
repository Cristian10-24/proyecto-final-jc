import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";

export const metadata = { title: "Coordinación · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Resumen por día y ciudad: se construye en el Día 6 del plan.
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "ver_resumen")) redirect("/monitor");
  return (
    <AppShell user={user} active="resumen">
      <h1 style={{ font: "800 28px/1.1 var(--font)", margin: "8px 0" }}>Resumen</h1>
      <p style={{ color: "var(--muted)" }}>Aquí verás los cupos por día y ciudad cuando se importen los proyectos y los mentores.</p>
    </AppShell>
  );
}

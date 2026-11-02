import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Seguimiento · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Quién ya eligió hora y pendientes para WhatsApp: se construye en el Día 6 del plan.
export default async function MonitorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user} active="seguimiento">
      <h1 style={{ font: "800 28px/1.1 var(--font)", margin: "8px 0" }}>Seguimiento</h1>
      <p style={{ color: "var(--muted)" }}>Aquí verás qué proyectos de tus ciudades ya eligieron hora y cuáles faltan.</p>
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import SeguimientoPanel from "@/components/SeguimientoPanel";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Seguimiento · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Quién ya eligió hora y quién falta (monitor: sus ciudades; coordinación y admin: todas).
export default async function MonitorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <SeguimientoPanel user={user} />;
}

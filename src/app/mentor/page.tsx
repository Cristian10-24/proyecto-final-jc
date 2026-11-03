import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";
import s from "@/components/HorariosPanel.module.css";

export const metadata = { title: "Mis evaluaciones · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Inicio del mentor. La agenda y la pantalla de evaluar llegan con la vista del mentor (Paso 11).
export default async function MentorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user.rol, "evaluar")) redirect(inicioPorRol(user.rol));
  return (
    <AppShell user={user} active="evaluaciones">
      <div className={s.kicker}>Mentor</div>
      <h1 className={s.title}>Mis evaluaciones</h1>
      <p className={s.lead}>Aquí verás los proyectos que tienes asignados para evaluar.</p>
    </AppShell>
  );
}

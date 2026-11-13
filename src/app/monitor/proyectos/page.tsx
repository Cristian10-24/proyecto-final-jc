import { redirect } from "next/navigation";
import MisProyectosVista from "@/components/evaluacion/vistas/MisProyectosVista";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Mis proyectos · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Fase 6 · Entrega B: «Mis proyectos» fusiona «Mis salas». El monitor ve sus salas y entra a «Gestionar»; coordinación
// y admin ven todos, con el filtro «Monitor», sin «Gestionar» (mismos permisos de antes).
export default async function MisProyectosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "monitorear_salas") && !puede(user, "ver_todas_las_ciudades")) redirect(inicioPorRol(user));
  return <MisProyectosVista user={user} />;
}

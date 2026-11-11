import { redirect } from "next/navigation";
import MisProyectosPanel from "@/components/evaluacion/MisProyectosPanel";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol, puede } from "@/lib/permisos";

export const metadata = { title: "Mis proyectos · Proyecto final · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

// Solo lectura: el monitor ve los proyectos de sus salas; coordinación y admin, todos.
export default async function MisProyectosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!puede(user, "monitorear_salas") && !puede(user, "ver_todas_las_ciudades")) redirect(inicioPorRol(user));
  return <MisProyectosPanel user={user} />;
}

import { redirect } from "next/navigation";
import DetalleProyecto from "@/components/evaluacion/vistas/DetalleProyecto";
import ShellVistas from "@/components/evaluacion/vistas/ShellVistas";
import { Vacio } from "@/components/evaluacion/vistas/Estados";
import { getCurrentUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";

export const metadata = { title: "Proyecto · Mis proyectos · Jóvenes creaTIvos" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// Fase 6 · Entrega B · Detalle de un proyecto para el monitor de su sala (reemplaza la ficha en ventana). Sin sesión:
// al login. Quien no es monitor o un id inválido: «No tienes acceso». Si es monitor, la ruta de la ficha decide (403 si
// el proyecto no está en sus salas).
export default async function DetalleProyectoPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!puede(user, "monitorear_salas") || !/^[a-f0-9]{24}$/.test(id))
    return (
      <ShellVistas user={user} active="proyectos">
        <Vacio titulo="No tienes acceso a este proyecto." texto="Solo el monitor de la sala de este proyecto puede abrirlo." accion={{ texto: "Volver a Mis proyectos", href: "/monitor/proyectos" }} />
      </ShellVistas>
    );
  return <DetalleProyecto user={user} id={id} />;
}

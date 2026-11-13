import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Fase 6 · Entrega B: «Mis salas» se fusionó con «Mis proyectos». La dirección vieja sigue funcionando (enlaces y
// favoritos) y lleva a la nueva; allí se revisan sesión y permisos como siempre.
export default function MisSalasPage() {
  redirect("/monitor/proyectos");
}

import Portal from "@/components/portal/Portal";
import { estadoPortal } from "@/lib/portal";

export const dynamic = "force-dynamic";

// Portal del estudiante: documento → datos → día → hora → confirmar. Las pantallas "aún no abren" y
// "cerradas" van dentro del portal (el estado se lee en cada petición).
export default function Home() {
  return <Portal estado={estadoPortal()} />;
}

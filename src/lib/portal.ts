// Estado del portal del estudiante, por variables de entorno (todas opcionales):
//   STUDENT_PORTAL_ENABLED=false       → cerrado sin más (interruptor de emergencia).
//   STUDENT_PORTAL_OPENS_AT=<ISO UTC>  → antes de esa fecha, "aún no abre" con la fecha de apertura.
//   STUDENT_PORTAL_CLOSES_AT=<ISO UTC> → desde esa fecha, "cerrado".

export type EstadoPortal = { estado: "abierto" } | { estado: "antes"; abre: string } | { estado: "cerrado" };

function fecha(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function estadoPortal(ahora = new Date()): EstadoPortal {
  if (process.env.STUDENT_PORTAL_ENABLED === "false") return { estado: "cerrado" };
  const abre = fecha(process.env.STUDENT_PORTAL_OPENS_AT);
  const cierra = fecha(process.env.STUDENT_PORTAL_CLOSES_AT);
  if (cierra && ahora >= cierra) return { estado: "cerrado" };
  if (abre && ahora < abre) return { estado: "antes", abre: abre.toISOString() };
  return { estado: "abierto" };
}

export function studentPortalOpen(): boolean {
  return estadoPortal().estado === "abierto";
}

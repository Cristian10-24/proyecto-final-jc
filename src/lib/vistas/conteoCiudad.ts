// Fase 6 · «Mi ciudad» (opción B, solo de pantalla): las tarjetas y la barra cuentan ESTUDIANTES (una pareja suma 2) y
// al tocar una tarjeta se listan los proyectos con al menos un integrante en ese estado. Funciones puras (sin base ni
// navegador): las usa MiCiudadPanel y se prueban en tests/vistasConteo.test.ts.

export type EstadoInt = "evaluado" | "pendiente" | "ausente";
export type FilaConteo = { inicio: string; estado: EstadoInt; integrantes: { estado: EstadoInt }[] };
export type FiltroEstado = "todos" | EstadoInt;

/** Estudiantes por estado. Siempre total = evaluado + pendiente + ausente. */
export function contarEstudiantes(filas: readonly FilaConteo[]) {
  const n = { total: 0, evaluado: 0, pendiente: 0, ausente: 0, proyectos: filas.length };
  for (const f of filas) for (const i of f.integrantes) { n[i.estado]++; n.total++; }
  return n;
}

/** Proyectos con al menos un integrante en ese estado («todos» = todos). Una pareja mixta sale en dos filtros. */
export const filtrarPorEstado = <T extends FilaConteo>(filas: readonly T[], e: FiltroEstado): T[] =>
  e === "todos" ? [...filas] : filas.filter((f) => f.integrantes.some((i) => i.estado === e));

/** «Pendientes primero»: los que tienen algún integrante pendiente, luego el resto; en cada grupo por día y hora. */
export function ordenar<T extends FilaConteo>(filas: readonly T[], orden: "pendientes" | "hora"): T[] {
  const pend = (f: T) => (f.integrantes.some((i) => i.estado === "pendiente") ? 0 : 1);
  return [...filas].sort((a, b) => (orden === "pendientes" ? pend(a) - pend(b) : 0) || a.inicio.localeCompare(b.inicio));
}

/**
 * Chips extra de una pareja con estados distintos: «1 ausente» y/o «1 pendiente», solo para los estados que no dice ya
 * el chip principal del proyecto. Proyecto individual o pareja con el mismo estado: ninguno.
 */
export function chipsExtra(f: FilaConteo): string[] {
  const estados = new Set(f.integrantes.map((i) => i.estado));
  if (estados.size < 2) return [];
  const out: string[] = [];
  for (const [e, txt] of [["ausente", "ausente"], ["pendiente", "pendiente"]] as const) {
    const n = f.integrantes.filter((i) => i.estado === e).length;
    if (n && f.estado !== e) out.push(`${n} ${n === 1 ? txt : `${txt}s`}`);
  }
  return out;
}

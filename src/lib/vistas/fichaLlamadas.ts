import type { Asistencia } from "../evaluacion/monitor";
import type { MotivoInasistencia } from "../evaluacion/criterios";

// Fase 6 · Entrega B · Paso 3: las MISMAS llamadas que hacía la ficha del monitor (MonitorHoja), ahora desde la página
// de detalle /monitor/proyectos/[id]. Rutas y cuerpos sin cambios: tests/fichaLlamadas.db.test.ts los fija.

export type Nota = { asistencia: Asistencia | null; motivo: MotivoInasistencia | null; observacion: string };

export const urlFicha = (id: string) => `/api/evaluacion/salas/${id}`;
export const urlCupos = (id: string) => `/api/evaluacion/salas/${id}/cupos`;
/** Lista del monitor (sus salas y «Tus sugerencias de cambio»). */
export const urlSalas = "/api/evaluacion/salas";

/** Asistencia, motivo y observación de un integrante. Al marcar «Sí» el motivo va null (como siempre). */
export const cuerpoAnotar = (i: number, n: Nota) =>
  ({ accion: "anotar", i, asistencia: n.asistencia, motivo: n.asistencia === "si" ? null : n.motivo, observacion: n.observacion });
export const cuerpoReprogramar = (asiento: string, motivo: string) => ({ accion: "reprogramar", asiento, motivo });
export const cuerpoSugerir = (detalle: string, motivo: string) => ({ accion: "sugerir", detalle, motivo });

/** Marcó «No» sin motivo: solo se muestra el aviso «Falta registrar el motivo…»; se puede guardar igual (como siempre). */
export const faltaMotivo = (n: Nota) => n.asistencia === "no" && !n.motivo;
export const mismaNota = (a: Nota, b: Nota) => a.asistencia === b.asistencia && a.motivo === b.motivo && a.observacion.trim() === b.observacion.trim();

/** «Volver»: la lista con sus filtros; solo acepta una ruta propia de la lista (nunca otro dominio ni «javascript:»). */
export function urlVolver(guardada: string | null): string {
  return guardada && /^\/monitor\/proyectos(\?[^#]*)?$/.test(guardada) && !guardada.startsWith("//") ? guardada : "/monitor/proyectos";
}

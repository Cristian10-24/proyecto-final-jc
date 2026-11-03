// Datos fijos de la edición 2026. Las horas se guardan en UTC; Colombia es UTC-5 todo el año (sin horario de verano).

export const AÑO_EDICION = 2026;
export const MINUTOS_BLOQUE = 15;
export const BLOQUES_POR_HORA = 60 / MINUTOS_BLOQUE;
const OFFSET_COL_H = 5;

/** dia 'YYYY-MM-DD' + hora y minuto en Colombia → instante UTC. */
export function inicioUTC(dia: string, hora: number, minuto = 0): Date {
  const [y, m, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, hora + OFFSET_COL_H, minuto));
}

/** Instante → día calendario en Colombia ('YYYY-MM-DD'). */
export function diaCOL(d: Date): string {
  return new Date(d.getTime() - OFFSET_COL_H * 3600_000).toISOString().slice(0, 10);
}

/** Instante → hora en Colombia (0–23). */
export function horaCOL(d: Date): number {
  return new Date(d.getTime() - OFFSET_COL_H * 3600_000).getUTCHours();
}

export const esDia = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

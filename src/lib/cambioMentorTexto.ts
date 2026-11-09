// Paso 25 · Tipos y texto de «Cambiar mentor (mismo bloque)», sin dependencias del servidor (los usa la pantalla).

export type CargaMentor = { enHora: number; enDia: number; total: number };
export type OpcionMentor = CargaMentor & { asiento: string; mentor: string; ciudades: string[]; deSuCiudad: boolean };
export type MentoresLibres =
  | { ok: true; inicio: string; mentor: string; bloqueo: "con_datos" | null; enCurso: boolean; opciones: OpcionMentor[] }
  | { ok: false; error: "sin_proyecto" | "sin_hora" };

/** "Mentor B · 2 en esta hora · 5 este día · 9 en total". */
export function etiquetaCarga(o: Pick<OpcionMentor, "mentor" | "enHora" | "enDia" | "total">): string {
  return `${o.mentor} · ${o.enHora} en esta hora · ${o.enDia} este día · ${o.total} en total`;
}

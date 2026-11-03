// Ciudades de la edición 2026 (ADR 0005 de PROYECTOFINALJC). Las horas se guardan en UTC y se muestran
// en hora de Colombia; para Uruguay se muestran ambas: "6:15 p. m. COL · 8:15 p. m. UY".

export type Pais = "CO" | "EC" | "PA" | "UY";

// clausura: día de clausura de la ciudad; solo se presenta ANTES de ese día (ADR 0005).
export const CIUDADES = [
  { codigo: "CLO", nombre: "Cali", pais: "CO", clausura: "2026-11-14" },
  { codigo: "CTG", nombre: "Cartagena", pais: "CO", clausura: "2026-11-19" },
  { codigo: "BAQ", nombre: "Barranquilla", pais: "CO", clausura: "2026-11-21" },
  { codigo: "MED", nombre: "Medellín", pais: "CO", clausura: "2026-11-24" },
  { codigo: "GYE", nombre: "Guayaquil", pais: "EC", clausura: "2026-11-27" },
  { codigo: "QTO", nombre: "Quito", pais: "EC", clausura: "2026-11-28" },
  { codigo: "BOG", nombre: "Bogotá D.C.", pais: "CO", clausura: "2026-12-01" },
  { codigo: "COL", nombre: "Colonia", pais: "UY", clausura: "2026-12-03" },
  { codigo: "PAY", nombre: "Paysandú", pais: "UY", clausura: "2026-12-05" },
  { codigo: "PTY", nombre: "Panamá", pais: "PA", clausura: "2026-12-05" },
] as const satisfies readonly { codigo: string; nombre: string; pais: Pais; clausura: string }[];

/** true si la ciudad todavía puede presentar ese día ('YYYY-MM-DD'). */
export function presentaAntesDeClausura(ciudad: string, dia: string): boolean {
  const c = CIUDADES.find((x) => x.nombre === ciudad);
  return !!c && dia < c.clausura;
}

export type CodigoCiudad = (typeof CIUDADES)[number]["codigo"];

export const NOMBRES_CIUDADES: string[] = CIUDADES.map((c) => c.nombre);

const opcHora = { hour: "numeric", minute: "2-digit", hour12: true } as const;
const fmtCO = new Intl.DateTimeFormat("es-CO", { ...opcHora, timeZone: "America/Bogota" });
const fmtUY = new Intl.DateTimeFormat("es-CO", { ...opcHora, timeZone: "America/Montevideo" });
const limpiar = (s: string) => s.replace(/\s+/g, " ");

export const horaCO = (d: Date) => limpiar(fmtCO.format(d));
export const horaUY = (d: Date) => limpiar(fmtUY.format(d));

/** Hora para mostrar: COL siempre; UY también cuando la ciudad es de Uruguay. */
export function horaParaCiudad(d: Date, pais: Pais): string {
  return pais === "UY" ? `${horaCO(d)} COL · ${horaUY(d)} UY` : `${horaCO(d)} COL`;
}

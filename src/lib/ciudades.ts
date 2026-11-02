// Ciudades de la edición 2026 (ADR 0005 de PROYECTOFINALJC). Las horas se guardan en UTC y se muestran
// en hora de Colombia; para Uruguay se muestran ambas: "6:15 p. m. COL · 8:15 p. m. UY".

export type Pais = "CO" | "EC" | "PA" | "UY";

export const CIUDADES = [
  { codigo: "CLO", nombre: "Cali", pais: "CO" },
  { codigo: "CTG", nombre: "Cartagena", pais: "CO" },
  { codigo: "BAQ", nombre: "Barranquilla", pais: "CO" },
  { codigo: "MED", nombre: "Medellín", pais: "CO" },
  { codigo: "GYE", nombre: "Guayaquil", pais: "EC" },
  { codigo: "QTO", nombre: "Quito", pais: "EC" },
  { codigo: "BOG", nombre: "Bogotá D.C.", pais: "CO" },
  { codigo: "COL", nombre: "Colonia", pais: "UY" },
  { codigo: "PAY", nombre: "Paysandú", pais: "UY" },
  { codigo: "PTY", nombre: "Panamá", pais: "PA" },
] as const satisfies readonly { codigo: string; nombre: string; pais: Pais }[];

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

import { CIUDADES, horaCO, horaUY } from "@/lib/ciudades";
import type { Resultado } from "@/lib/evaluacion/criterios";
import s from "./Evaluacion.module.css";

// Formatos compartidos por la lista del mentor y la pantalla de evaluar.

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
/** 'YYYY-MM-DD' → "Jueves 12 de noviembre". */
export const fechaLarga = (dia: string) => { const t = fmtDia.format(new Date(dia + "T12:00:00Z")).replace(",", ""); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Hora COL; también UY si la ciudad es de Uruguay. */
export function horaTxt(iso: string, ciudad: string): string {
  const d = new Date(iso);
  return CIUDADES.find((c) => c.nombre === ciudad)?.pais === "UY" ? `${horaCO(d)} COL · ${horaUY(d)} UY` : horaCO(d);
}

const CLASE: Record<Resultado, string> = {
  Excelente: "ev-c-Excelente", Aprobado: "ev-c-Aprobado", Incompleto: "ev-c-Incompleto", "No se presentó": "ev-c-NoSePresento", Pendiente: "ev-c-Pendiente",
};
/** Chip de resultado con los colores del prototipo (clases globales de tema-evaluacion.css). */
export const claseResultado = (r: Resultado) => `ev-chip ${CLASE[r]}`;
export const claseGrande = (r: Resultado) => s[`big_${r === "No se presentó" ? "NoSePresento" : r}`];

export const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`);
export const uno = (x: number | null) => (x === null ? "—" : x.toLocaleString("es-CO", { maximumFractionDigits: 1 }));

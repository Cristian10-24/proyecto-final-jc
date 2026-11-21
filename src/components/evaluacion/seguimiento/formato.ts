import type { Modo } from "@/lib/evaluacion/seguimientoV2";

// Seguimiento v2 · formatos de pantalla (puros, con pruebas en tests/seguimientoVistas.test.ts).

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (d: string) => new Date(d + "T12:00:00Z");

/** '2026-11-21' → "21 nov". */
export const diaCorto = (d: string) => `${fecha(d).getUTCDate()} ${MES_C[fecha(d).getUTCMonth()]}`;
/** '2026-11-21' → "Sábado 21 nov". */
export const diaSemana = (d: string) => `${DIAS[fecha(d).getUTCDay()]} ${diaCorto(d)}`;
/** '2026-11-21' → "Sábado 21 de noviembre". */
export const diaLargo = (d: string) => `${DIAS[fecha(d).getUTCDay()]} ${fecha(d).getUTCDate()} de ${MESES[fecha(d).getUTCMonth()]}`;
/** '2026-11-21' → "Sábado 21 de noviembre de 2026". */
export const diaAnio = (d: string) => `${diaLargo(d)} de ${fecha(d).getUTCFullYear()}`;

/** Número con separador de miles de Colombia. */
export const N = (x: number) => x.toLocaleString("es-CO");
/** Fracción 0–1 → "38 %"; null → "—". */
export const P = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)} %`);
/** Entero 0–100 de una fracción (para posiciones y deltas). */
export const pc = (x: number | null | undefined) => (x === null || x === undefined ? 0 : Math.round(x * 100));
/** Un decimal con coma: 2.46 → "2,5"; null → "—". */
export const nf = (x: number | null | undefined, d = 1) => (x === null || x === undefined || Number.isNaN(x) ? "—" : (Math.round(x * 10 ** d) / 10 ** d).toString().replace(".", ","));

/** "estudiante(s)" / "proyecto(s)". */
export const uni = (modo: Modo, n: number, may = false) => {
  const s = n === 1 ? (modo === "est" ? "estudiante" : "proyecto") : (modo === "est" ? "estudiantes" : "proyectos");
  return may ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};
export const otro = (m: Modo): Modo => (m === "est" ? "proy" : "est");

/** Números en palabras del reporte («Siete ciudades»). */
const PALABRAS = ["Cero", "Una", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez", "Once", "Doce"];
export const ciudadesTxt = (n: number) => `${PALABRAS[n] ?? n} ${n === 1 ? "ciudad" : "ciudades"}`;

/** Cambio frente al día anterior: índice del último día ≤ hoy; texto «+N hoy», «−3 pts hoy» o «+N el 18 nov». */
export function delta(valores: number[], dias: string[], hoy: string, pct = false): string | null {
  let i = -1;
  for (let k = 0; k < dias.length; k++) if (dias[k] <= hoy) i = k;
  if (i < 0) return null;
  const d = valores[i] - (i > 0 ? valores[i - 1] : 0), signo = d >= 0 ? "+" : "−", abs = Math.abs(d);
  const cuando = dias[i] === hoy ? "hoy" : `el ${diaCorto(dias[i])}`;
  return pct ? `${signo}${abs} ${abs === 1 ? "pt" : "pts"} ${cuando}` : `${signo}${N(abs)} ${cuando}`;
}

/** «hace N min» del refresco. */
export const haceTxt = (ms: number) => { const m = Math.floor(ms / 60_000); return m < 1 ? "hace menos de 1 min" : `hace ${m} min`; };

// ---- Estado en la URL ----

export const SECCIONES = [["resumen", "Resumen"], ["reporte", "Reporte del día"], ["resultados", "Resultados"], ["inasistencias", "Inasistencias"], ["mentores", "Mentores y monitores"], ["criterios", "Criterios"]] as const;
export type Seccion = (typeof SECCIONES)[number][0];
export type EstadoUrl = { seccion: Seccion; dia: string; ciudad: string; ruta: string; modalidad: string; q: string; modo: Modo; repDia: string };
export const ESTADO_VACIO: EstadoUrl = { seccion: "resumen", dia: "", ciudad: "", ruta: "", modalidad: "", q: "", modo: "est", repDia: "" };

export function leerUrl(search: string): EstadoUrl {
  const p = new URLSearchParams(search), g = (k: string) => p.get(k) ?? "";
  const sec = g("seccion");
  return {
    seccion: (SECCIONES.some(([k]) => k === sec) ? sec : "resumen") as Seccion,
    dia: /^\d{4}-\d{2}-\d{2}$/.test(g("dia")) ? g("dia") : "", ciudad: g("ciudad").slice(0, 60),
    ruta: ["Básica", "Avanzada"].includes(g("ruta")) ? g("ruta") : "", modalidad: ["individual", "pareja"].includes(g("modalidad")) ? g("modalidad") : "",
    q: g("q").slice(0, 60), modo: g("modo") === "proy" ? "proy" : "est", repDia: /^\d{4}-\d{2}-\d{2}$/.test(g("rdia")) || g("rdia") === "todos" ? g("rdia") : "",
  };
}

export function escribirUrl(e: EstadoUrl): string {
  const p = new URLSearchParams();
  if (e.seccion !== "resumen") p.set("seccion", e.seccion);
  for (const k of ["dia", "ciudad", "ruta", "modalidad", "q"] as const) if (e[k].trim()) p.set(k, e[k].trim());
  if (e.modo === "proy") p.set("modo", "proy");
  if (e.repDia) p.set("rdia", e.repDia);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Parámetros de la lectura (los filtros fijos y el modo). */
export function consulta(e: EstadoUrl): string {
  const p = new URLSearchParams();
  for (const k of ["dia", "ciudad", "ruta", "modalidad", "q"] as const) if (e[k].trim()) p.set(k, e[k].trim());
  if (e.modo === "proy") p.set("modo", "proy");
  return p.toString();
}

export const nFiltros = (e: Pick<EstadoUrl, "dia" | "ciudad" | "ruta" | "modalidad" | "q">) => [e.dia, e.ciudad, e.ruta, e.modalidad, e.q.trim()].filter(Boolean).length;

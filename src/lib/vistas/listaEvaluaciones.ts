import { diaCOL, horaCOL } from "../edicion";
import type { Resultado } from "../evaluacion/criterios";
import type { FilaEvaluacion } from "../evaluacion/datos";
import { coincide } from "./formato";

// Vistas del mentor · «Mis evaluaciones» (mentor) y «Evaluaciones» (coordinación y admin), prototipos 01, 02 y 04.
// Funciones puras sobre la lectura de siempre (GET /api/evaluacion/proyectos): filtros en la URL, resumen, estado y
// agrupación por día y bloque de sala. Sin base ni navegador. Sin reloj: nada depende de la hora actual salvo el día
// por defecto (hoy, si hay presentaciones hoy).

export type EstadoEval = "" | "pendientes" | "evaluados" | "ausentes" | "destacados" | "sinMotivo";
/** `dia`: "" = por defecto (hoy si hay; si no, todas), "todos" o AAAA-MM-DD. `mentor` = id; `monitor` = nombre o "sin". */
export type FiltrosEval = { dia: string; estado: EstadoEval; ciudad: string; mentor: string; monitor: string; q: string };
export const FILTROS_EVAL_VACIOS: FiltrosEval = { dia: "", estado: "", ciudad: "", mentor: "", monitor: "", q: "" };
const ESTADOS: readonly EstadoEval[] = ["", "pendientes", "evaluados", "ausentes", "destacados", "sinMotivo"];

/** Opciones del filtro Estado: las del prototipo + la de hoy «Inasistencias sin motivo registrado». */
export const OPCIONES_ESTADO: { valor: EstadoEval; texto: string }[] = [
  { valor: "", texto: "Todos los estados" }, { valor: "pendientes", texto: "Pendientes" }, { valor: "evaluados", texto: "Evaluados" },
  { valor: "ausentes", texto: "No se presentó" }, { valor: "destacados", texto: "Destacados" },
  { valor: "sinMotivo", texto: "Inasistencias sin motivo registrado" },
];

/** Lee los filtros de la query string (valores desconocidos se ignoran; texto acotado). */
export function leerFiltrosEval(search: string): FiltrosEval {
  const p = new URLSearchParams(search);
  const t = (k: string, max = 80) => (p.get(k) ?? "").slice(0, max);
  const dia = t("dia", 10), estado = t("estado", 12) as EstadoEval;
  return {
    dia: dia === "todos" || /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : "",
    estado: ESTADOS.includes(estado) ? estado : "",
    ciudad: t("ciudad", 60), mentor: t("mentor", 80), monitor: t("monitor", 120), q: t("q"),
  };
}

/** Query string con solo los filtros no vacíos ("" si no hay ninguno). */
export function escribirFiltrosEval(f: FiltrosEval): string {
  const p = new URLSearchParams();
  for (const k of ["dia", "estado", "ciudad", "mentor", "monitor", "q"] as const) if (f[k]) p.set(k, f[k]);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Día aplicado: el elegido; si no, hoy si hay presentaciones hoy; si no, todas las fechas (como la lista de hoy). */
export const diaEval = (f: FiltrosEval, dias: readonly string[], hoy = diaCOL(new Date())) => f.dia || (dias.includes(hoy) ? hoy : "todos");

const SIN_MONITOR = "sin";

/** Día, ciudad, mentor, monitor y búsqueda (nombres, emprendimiento y código, como hoy). Sin el estado. */
export function filtrarBaseEval(filas: readonly FilaEvaluacion[], f: FiltrosEval, dia: string): FilaEvaluacion[] {
  return filas.filter((x) => (dia === "todos" || x.dia === dia) && (!f.ciudad || x.ciudad === f.ciudad)
    && (!f.mentor || x.mentorId === f.mentor)
    && (!f.monitor || (f.monitor === SIN_MONITOR ? !x.monitor : x.monitor?.nombre === f.monitor))
    && coincide([...x.integrantes.map((i) => i.nombre), x.proyecto, x.codigo], f.q));
}

const evaluado = (r: Resultado) => r !== "Pendiente" && r !== "No se presentó";

/** Estado (la fila entra si algún integrante cumple; «Evaluados» y «Destacados» listan todo lo evaluado así marcado). */
export function filtrarEstadoEval(filas: readonly FilaEvaluacion[], e: EstadoEval): FilaEvaluacion[] {
  if (!e) return [...filas];
  return filas.filter((x) => {
    const r = x.integrantes.map((i) => i.res);
    if (e === "pendientes") return r.includes("Pendiente");
    if (e === "evaluados") return r.some(evaluado);
    if (e === "ausentes") return r.includes("No se presentó");
    if (e === "destacados") return x.destacado;
    return x.integrantes.some((i) => i.res === "No se presentó" && !i.motivo); // el motivo lo registra el monitor
  });
}

/** Resumen por persona (como hoy): evaluados (no Pendiente ni No se presentó), no se presentaron y pendientes. */
export function resumenEval(filas: readonly FilaEvaluacion[]) {
  const personas = filas.flatMap((f) => f.integrantes);
  const ausentes = personas.filter((x) => x.res === "No se presentó").length;
  const pendientes = personas.filter((x) => x.res === "Pendiente").length;
  const total = personas.length, evaluados = total - ausentes - pendientes;
  return { estudiantes: total, evaluados, ausentes, pendientes, pct: total ? Math.round(((evaluados + ausentes) / total) * 100) : 0 };
}

/** Botón de la fila: coordinación y admin «Ver»; el mentor «Evaluar» si alguien está pendiente, si no «Revisar». */
export function accionFila(f: Pick<FilaEvaluacion, "integrantes">, soloLectura: boolean): "Evaluar" | "Revisar" | "Ver" {
  if (soloLectura) return "Ver";
  return f.integrantes.some((i) => i.res === "Pendiente") ? "Evaluar" : "Revisar";
}

// ---- Agrupación: por día y, dentro del día, por bloque (horas seguidas de la misma sala, mentor y monitor) ----

export type BloqueEval = { clave: string; sala: number | null; enlace: string | null; mentorId: string; monitor: FilaEvaluacion["monitor"]; desde: number; hasta: number; filas: FilaEvaluacion[] };
export type DiaEval = { dia: string; bloques: BloqueEval[] };

export function agruparEval(filas: readonly FilaEvaluacion[]): DiaEval[] {
  const orden = [...filas].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.integrantes[0]!.nombre.localeCompare(b.integrantes[0]!.nombre, "es"));
  const dias: DiaEval[] = [];
  const abiertos = new Map<string, BloqueEval>();
  for (const f of orden) {
    let d = dias.at(-1);
    if (!d || d.dia !== f.dia) dias.push((d = { dia: f.dia, bloques: [] }));
    const hora = horaCOL(new Date(f.inicio));
    const k = `${f.dia}|${f.sala ?? "-"}|${f.mentorId}|${f.monitor?.nombre ?? ""}`;
    const b = abiertos.get(k);
    if (b && hora <= b.hasta) { b.filas.push(f); b.hasta = Math.max(b.hasta, hora + 1); continue; }
    const nuevo: BloqueEval = { clave: `${k}|${hora}`, sala: f.sala ?? null, enlace: f.enlace ?? null, mentorId: f.mentorId, monitor: f.monitor ?? null, desde: hora, hasta: hora + 1, filas: [f] };
    abiertos.set(k, nuevo);
    d.bloques.push(nuevo);
  }
  for (const d of dias) d.bloques.sort((a, b) => a.desde - b.desde || (a.sala ?? 99) - (b.sala ?? 99));
  return dias;
}

/** Monitores de las filas (sin repetir, por nombre): opciones del filtro «Monitor»; `sin` si algún bloque no tiene. */
export function monitoresEval(filas: readonly FilaEvaluacion[]): { nombres: string[]; hayVacios: boolean } {
  return {
    nombres: [...new Set(filas.flatMap((f) => (f.monitor ? [f.monitor.nombre] : [])))].sort((a, b) => a.localeCompare(b, "es")),
    hayVacios: filas.some((f) => !f.monitor),
  };
}

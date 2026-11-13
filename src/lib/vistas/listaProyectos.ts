import { diaCOL, horaCOL } from "../edicion";
import { estadoPersona, type Resultado } from "../evaluacion/criterios";
import type { FilaSala, SalaMonitor } from "../evaluacion/monitor";
import type { MiProyecto, MonitorRef } from "../misProyectos";
import { puede } from "../permisos";
import { coincide } from "./formato";

// Fase 6 · Entrega B · «Mis proyectos» fusionada (lista). Funciones puras: une las dos lecturas que ya existen (la de
// «Mis salas»: asistencia, resultado, motivo, destacado y sugerencia; la de «Mis proyectos»: celulares, mentor, sala,
// enlace y hora UY), agrupa por bloque de sala, filtra y guarda los filtros en la URL. Sin base ni navegador.

export type IntegranteLista = {
  nombre: string; celular: string | null;
  /** Solo para el monitor (de «Mis salas»); coordinación y admin no los reciben. */
  res?: Resultado; asistencia?: "si" | "no" | null; motivo?: string;
};
export type FilaLista = {
  id: string; codigo: string; dia: string; inicio: string; hora: number; horaTxt: string; horaUY: string | null;
  ciudad: string; ruta?: string; proyecto: string; sala: number | null; enlace: string | null;
  mentorId: string; mentor: { nombre: string; celular: string | null }; monitor: MonitorRef | null;
  integrantes: IntegranteLista[]; destacado: boolean; sugerencia: boolean;
};

const horaTxtDe = (iso: string) => {
  const d = new Date(iso), h = horaCOL(d), m = d.getUTCMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
};

/** Coordinación y admin: solo la lectura de «Mis proyectos» (sin asistencia ni resultados). */
export function desdeMisProyectos(mis: readonly MiProyecto[]): FilaLista[] {
  return mis.map((p) => ({
    id: p.id, codigo: p.codigo, dia: p.dia, inicio: p.inicio, hora: horaCOL(new Date(p.inicio)), horaTxt: p.horaCOL, horaUY: p.horaUY,
    ciudad: p.ciudad, proyecto: p.proyecto, sala: p.sala, enlace: p.enlace, mentorId: "", mentor: p.mentor, monitor: p.monitor,
    integrantes: p.integrantes.map((i) => ({ nombre: i.nombre, celular: i.celular })), destacado: false, sugerencia: false,
  }));
}

/**
 * Monitor: la fila sale de «Mis salas» (la que manda: es la que tiene la asistencia) y se completa con «Mis proyectos»
 * por id de proyecto. Si en ese instante una lectura no trae el proyecto, lo que falta queda «Sin registrar».
 */
export function unirLecturas(filas: readonly FilaSala[], salas: readonly SalaMonitor[], mis: readonly MiProyecto[]): FilaLista[] {
  const porId = new Map(mis.map((p) => [p.id, p]));
  const salaDe = new Map(salas.map((s) => [`${s.dia}|${s.hora}|${s.mentorId}`, s]));
  return filas.map((f) => {
    const m = porId.get(f.id);
    const hora = horaCOL(new Date(f.inicio));
    const s = salaDe.get(`${f.dia}|${hora}|${f.mentorId}`);
    return {
      id: f.id, codigo: f.codigo, dia: f.dia, inicio: f.inicio, hora, horaTxt: m?.horaCOL ?? horaTxtDe(f.inicio), horaUY: m?.horaUY ?? null,
      ciudad: f.ciudad, ...(f.ruta ? { ruta: f.ruta } : {}), proyecto: f.proyecto,
      sala: s?.sala ?? m?.sala ?? null, enlace: s?.enlace ?? m?.enlace ?? null,
      mentorId: f.mentorId, mentor: { nombre: s?.mentor ?? m?.mentor.nombre ?? f.mentorId, celular: m?.mentor.celular ?? null }, monitor: null,
      integrantes: f.integrantes.map((x, k) => ({
        nombre: x.nombre, celular: m?.integrantes[k]?.celular ?? null, res: x.res, asistencia: x.asistencia, ...(x.motivo ? { motivo: x.motivo } : {}),
      })),
      destacado: f.destacado, sugerencia: f.sugerencia,
    };
  }).sort((a, b) => a.inicio.localeCompare(b.inicio) || a.proyecto.localeCompare(b.proyecto, "es"));
}

// ---- Estado de asistencia (mismas reglas que «Mis salas»: estadoPersona) ----

export type EstadoAsis = "evaluado" | "presente" | "ausente" | "pendiente";
export function estadoAsistencia(i: IntegranteLista): EstadoAsis {
  if (i.res === "Excelente" || i.res === "Aprobado") return "evaluado";
  return estadoPersona({ res: i.res ?? "Pendiente", presente: i.asistencia === "si", ausente: i.asistencia === "no" });
}
export const TEXTO_ASIS: Record<EstadoAsis, string> = { evaluado: "Evaluado", presente: "Se presentó", ausente: "No se presentó", pendiente: "Pendiente" };
/** Para el fondo de la fila (estadoFila) y el resumen: «Evaluado» cuenta como que se presentó. */
export const comoPersona = (i: IntegranteLista) => ({ res: i.res ?? ("Pendiente" as Resultado), presente: i.asistencia === "si", ausente: i.asistencia === "no" });

/** Resumen del día, como «Mis salas»: una persona por integrante. */
export function resumen(filas: readonly FilaLista[]) {
  let presentes = 0, ausentes = 0, total = 0;
  for (const f of filas) for (const i of f.integrantes) {
    total++;
    const e = estadoPersona(comoPersona(i));
    if (e === "presente") presentes++; else if (e === "ausente") ausentes++;
  }
  return { proyectos: filas.length, estudiantes: total, presentes, ausentes, pendientes: total - presentes - ausentes, pct: total ? Math.round(((presentes + ausentes) / total) * 100) : 0 };
}

// ---- Filtros (viven en la URL) ----

export type EstadoFiltro = "" | "pendientes" | "presentes" | "ausentes" | "sinMotivo";
/** Ajuste 3: «Mentor» (nombre) reemplaza a «Sala»; un `sala` viejo en la URL se ignora. */
export type Filtros = { dia: string; ciudad: string; mentor: string; estado: EstadoFiltro; monitor: string; q: string; vista: "" | "todos" };
export const FILTROS_VACIOS: Filtros = { dia: "", ciudad: "", mentor: "", estado: "", monitor: "", q: "", vista: "" };
const ESTADOS: readonly EstadoFiltro[] = ["", "pendientes", "presentes", "ausentes", "sinMotivo"];

/** Lee los filtros de la query string (valores desconocidos se ignoran; texto acotado). */
export function leerFiltros(search: string): Filtros {
  const p = new URLSearchParams(search);
  const t = (k: string, max = 80) => (p.get(k) ?? "").slice(0, max);
  const dia = t("dia", 10);
  const estado = t("estado", 12) as EstadoFiltro;
  return {
    dia: dia === "todos" || /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : "",
    ciudad: t("ciudad", 60), mentor: t("mentor", 80),
    estado: ESTADOS.includes(estado) ? estado : "", monitor: t("monitor", 80), q: t("q"),
    vista: p.get("vista") === "todos" ? "todos" : "",
  };
}
/** Query string con solo los filtros no vacíos ("" si no hay ninguno). */
export function escribirFiltros(f: Filtros): string {
  const p = new URLSearchParams();
  for (const k of ["vista", "dia", "ciudad", "mentor", "estado", "monitor", "q"] as const) if (f[k]) p.set(k, f[k]);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Día aplicado: el de la URL; si no, hoy si hay presentaciones hoy; si no, el primer día. */
export const diaAplicado = (f: Filtros, dias: readonly string[], hoy = diaCOL(new Date())) => f.dia || (dias.includes(hoy) ? hoy : dias[0] ?? "todos");

/** Día, ciudad, mentor, monitor y búsqueda (nombre, código, proyecto y ciudad, como «Mis salas»). Sin el estado. */
export function filtrarBase(filas: readonly FilaLista[], f: Filtros, dia: string): FilaLista[] {
  return filas.filter((x) => (dia === "todos" || x.dia === dia) && (!f.ciudad || x.ciudad === f.ciudad)
    && (!f.mentor || x.mentor.nombre === f.mentor)
    && (!f.monitor || (f.monitor === "sin" ? !x.monitor : x.monitor?.usuario === f.monitor))
    && coincide([...x.integrantes.map((i) => i.nombre), x.proyecto, x.codigo, x.ciudad], f.q));
}
/** Estado (como «Mis salas»): la fila entra si algún integrante cumple. */
export function filtrarEstado(filas: readonly FilaLista[], e: EstadoFiltro): FilaLista[] {
  if (!e) return [...filas];
  return filas.filter((x) => x.integrantes.some((i) => {
    const p = estadoPersona(comoPersona(i));
    return e === "pendientes" ? p === "pendiente" : e === "presentes" ? p === "presente" : e === "ausentes" ? p === "ausente" : p === "ausente" && !i.motivo;
  }));
}

// ---- Bloques de sala (horas seguidas de la misma sala y mentor, por día) ----

export type BloqueLista = { clave: string; dia: string; sala: number | null; desde: number; hasta: number; mentor: FilaLista["mentor"]; enlace: string | null; monitor: MonitorRef | null; filas: FilaLista[] };

export function agruparBloques(filas: readonly FilaLista[]): BloqueLista[] {
  const orden = [...filas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const abiertos = new Map<string, BloqueLista>();
  const out: BloqueLista[] = [];
  for (const f of orden) {
    const k = `${f.dia}|${f.sala ?? "-"}|${f.mentorId || f.mentor.nombre}|${f.monitor?.usuario ?? ""}`;
    const b = abiertos.get(k);
    if (b && f.hora <= b.hasta) { b.filas.push(f); b.hasta = Math.max(b.hasta, f.hora + 1); continue; }
    const nuevo: BloqueLista = { clave: `${k}|${f.hora}`, dia: f.dia, sala: f.sala, desde: f.hora, hasta: f.hora + 1, mentor: f.mentor, enlace: f.enlace, monitor: f.monitor, filas: [f] };
    abiertos.set(k, nuevo);
    out.push(nuevo);
  }
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || a.desde - b.desde || (a.sala ?? 99) - (b.sala ?? 99));
}

// ---- Vista: monitor con coordinación (o admin) como rol adicional ----

type ConRolesLista = Parameters<typeof puede>[0];
/**
 * Qué lista ve cada quien (solo pantalla; las lecturas y permisos son los de siempre):
 * - solo monitor: sus salas con «Gestionar», sin selector;
 * - coordinación o admin sin el rol monitor: todos los proyectos sin «Gestionar», sin selector;
 * - monitor que además puede ver todas las ciudades: selector «Mis salas» (por defecto) / «Todos los proyectos».
 */
export function modoLista(user: ConRolesLista, vista: Filtros["vista"]): { selector: boolean; todos: boolean } {
  const monitor = puede(user, "monitorear_salas"), todas = puede(user, "ver_todas_las_ciudades");
  if (monitor && todas) return { selector: true, todos: vista === "todos" };
  return { selector: false, todos: !monitor };
}

/** Mentores de los bloques visibles del día (y de la ciudad elegida), en orden alfabético: opciones del filtro «Mentor». */
export function mentoresDisponibles(filas: readonly FilaLista[], dia: string, ciudad: string): string[] {
  const n = filas.filter((x) => (dia === "todos" || x.dia === dia) && (!ciudad || x.ciudad === ciudad)).map((x) => x.mentor.nombre);
  return [...new Set(n)].sort((a, b) => a.localeCompare(b, "es"));
}

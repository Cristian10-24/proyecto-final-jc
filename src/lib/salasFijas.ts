import type { ErrorFila } from "./importar/excel";
import { idMentor } from "./importar/mentores";
import type { FilaPlanLeida } from "./importar/salas";
import { HOJAS_SALAS, type MonitorFijo, type PlanSala, type Sala, type SalaFija } from "./salas";

// Funciones puras de la hoja «Plan de salas» (sala fija por mentor y hora): validación de filas y vista previa.
// No tocan la base; planSalasFijo.ts les pasa lo que lee. Horas de Colombia (0–23).

const H = HOJAS_SALAS.plan;
const k = (...p: (string | number)[]) => p.join("|");
const cuando = (dia: string, hora: number) => `el ${dia} a las ${hora}:00`;

export type FijaLeida = SalaFija & { fila: number };

export type ContextoPlan = {
  /** Salas de la hoja Salas del mismo archivo (todas con enlace https: el lector ya lo exige). */
  salas: Set<number>;
  /** ¿El mentor tiene asientos ese día a esa hora? */
  activo: (dia: string, hora: number, mentorId: string) => boolean;
  /** Usuario del monitor activo, o el motivo por el que no se reconoce. */
  monitor: (texto: string) => string | { aviso: string };
};

/** Valida cada fila: sala de la hoja Salas, mentor activo, sin repetir mentor ni sala en la hora, monitor activo y en una sola sala. */
export function validarFilasPlan(filas: FilaPlanLeida[], ctx: ContextoPlan): { fijas: FijaLeida[]; errores: ErrorFila[] } {
  const fijas: FijaLeida[] = [], errores: ErrorFila[] = [];
  const mentorEn = new Map<string, number>(), salaEn = new Map<string, number>(), monitorEn = new Map<string, number>();
  for (const f of filas) {
    const err = (mensaje: string) => errores.push({ hoja: H, fila: f.fila, mensaje });
    const mentorId = idMentor(f.mentor);
    if (!ctx.salas.has(f.sala)) { err(`La sala ${f.sala} no está en la hoja Salas (con su enlace https).`); continue; }
    if (!ctx.activo(f.dia, f.hora, mentorId)) { err(`${f.mentor} no está activo ${cuando(f.dia, f.hora)} (revisa Horarios o Franjas).`); continue; }
    const kM = k(f.dia, f.hora, mentorId), kS = k(f.dia, f.hora, f.sala);
    if (mentorEn.has(kM)) { err(`${f.mentor} ya tiene sala ${cuando(f.dia, f.hora)} (fila ${mentorEn.get(kM)}).`); continue; }
    if (salaEn.has(kS)) { err(`La sala ${f.sala} ya tiene otro mentor ${cuando(f.dia, f.hora)} (fila ${salaEn.get(kS)}).`); continue; }
    let monitor: string | null = null;
    if (f.monitor) {
      const m = ctx.monitor(f.monitor);
      if (typeof m !== "string") { err(m.aviso); continue; }
      const kO = k(f.dia, f.hora, m);
      if (monitorEn.has(kO)) { err(`Ese monitor ya está en otra sala ${cuando(f.dia, f.hora)} (fila ${monitorEn.get(kO)}).`); continue; }
      monitorEn.set(kO, f.fila);
      monitor = m;
    }
    mentorEn.set(kM, f.fila);
    salaEn.set(kS, f.fila);
    fijas.push({ fila: f.fila, dia: f.dia, hora: f.hora, mentorId, sala: f.sala, monitor });
  }
  return { fijas, errores };
}

/**
 * Filas de la hoja Monitores de los días del plan: la hoja Plan de salas manda. Una fila que repite el monitor del plan
 * no se usa (ya está); una que lo contradice (otro monitor, o monitor donde el plan deja la sala sin monitor) es error.
 * Las de mentores sin fila en el plan se usan como siempre.
 */
export function combinarMonitores(fijas: SalaFija[], monitores: MonitorFijo[]): { importados: MonitorFijo[]; errores: ErrorFila[] } {
  const porMentor = new Map(fijas.map((f) => [k(f.dia, f.hora, f.mentorId), f]));
  const porSala = new Map(fijas.map((f) => [k(f.dia, f.hora, f.sala), f]));
  const importados: MonitorFijo[] = [], errores: ErrorFila[] = [];
  for (const m of monitores) {
    const f = m.mentorId !== undefined ? porMentor.get(k(m.dia, m.hora, m.mentorId)) : porSala.get(k(m.dia, m.hora, m.sala!));
    if (!f) { importados.push(m); continue; }
    if (f.monitor === m.monitor) continue;
    errores.push({ hoja: HOJAS_SALAS.monitores, fila: m.fila, mensaje: `No coincide con la hoja Plan de salas ${cuando(m.dia, m.hora)} (sala ${f.sala}: ${f.monitor ? "otro monitor" : "sin monitor"}). Corrige una de las dos.` });
  }
  return { importados, errores };
}

export type CambioSala = { dia: string; hora: number; mentor: string; de: number | null; a: number };
export type CambioEntreHoras = { dia: string; mentor: string; hora: number; de: number; a: number };
export type SalasMonitor = { usuario: string; nombre: string; salas: number[]; bloques: number };
export type SinFila = { dia: string; hora: number; mentor: string; sala: number };
export type Descartado = { dia: string; hora: number; sala: number; mentor: string; monitor: string };
export type EnlaceCambia = { sala: number; antes: string | null; despues: string };

export type ResumenPlanFijo = {
  dias: string[];
  diasSinCambios: string[];
  filasFijadas: number;
  cambiosSala: CambioSala[];
  cambiosEntreHoras: CambioEntreHoras[];
  salasPorMonitor: SalasMonitor[];
  sinFila: SinFila[];
  descartados: Descartado[];
  enlacesCambian: EnlaceCambia[];
  /** Cambia el enlace de una sala que ya existía (afecta también los días que no se tocan): pide confirmación aparte. */
  confirmarEnlaces: boolean;
  /** Filas de Monitores o Disponibilidad de días que no están en Plan de salas (no se usan). */
  ignoradas: number;
};

/** Bloques (día, hora, mentor) cuya sala cambia entre el plan actual y el nuevo. Un bloque nuevo tiene `de: null`. */
export function bloquesQueCambian(actual: PlanSala[], nuevo: PlanSala[]): { dia: string; hora: number; mentorId: string; de: number | null; a: number }[] {
  const antes = new Map(actual.map((p) => [k(p.dia, p.hora, p.mentorId), p.sala]));
  return nuevo
    .filter((p) => antes.get(k(p.dia, p.hora, p.mentorId)) !== p.sala)
    .map((p) => ({ dia: p.dia, hora: p.hora, mentorId: p.mentorId, de: antes.get(k(p.dia, p.hora, p.mentorId)) ?? null, a: p.sala }))
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.hora - b.hora || a.a - b.a);
}

/** Enlaces nuevos o distintos de la hoja Salas frente a los guardados. */
export function enlacesQueCambian(actuales: Sala[], nuevas: Sala[]): EnlaceCambia[] {
  const antes = new Map(actuales.map((s) => [s.sala, s.enlace]));
  return nuevas.filter((s) => antes.get(s.sala) !== s.enlace).map((s) => ({ sala: s.sala, antes: antes.get(s.sala) ?? null, despues: s.enlace }));
}

export type EntradaResumen = {
  dias: string[];
  diasSinCambios: string[];
  fijas: SalaFija[];
  actual: PlanSala[];
  nuevo: PlanSala[];
  salasActuales: Sala[];
  salasNuevas: Sala[];
  nombreMentor: (id: string) => string;
  nombreMonitor: (usuario: string) => string;
  ignoradas: number;
};

export function resumirPlanFijo(e: EntradaResumen): ResumenPlanFijo {
  const nm = e.nombreMentor;
  const cambiosEntreHoras: CambioEntreHoras[] = [];
  const porMentorDia = new Map<string, PlanSala[]>();
  for (const p of e.nuevo) porMentorDia.set(k(p.dia, p.mentorId), [...(porMentorDia.get(k(p.dia, p.mentorId)) ?? []), p]);
  for (const lista of porMentorDia.values()) {
    const ord = lista.sort((a, b) => a.hora - b.hora);
    for (let i = 1; i < ord.length; i++)
      if (ord[i]!.hora === ord[i - 1]!.hora + 1 && ord[i]!.sala !== ord[i - 1]!.sala)
        cambiosEntreHoras.push({ dia: ord[i]!.dia, mentor: nm(ord[i]!.mentorId), hora: ord[i]!.hora, de: ord[i - 1]!.sala, a: ord[i]!.sala });
  }
  const carga = new Map<string, { salas: Set<number>; bloques: number }>();
  for (const p of e.nuevo) {
    if (!p.monitor) continue;
    const c = carga.get(p.monitor) ?? { salas: new Set<number>(), bloques: 0 };
    c.salas.add(p.sala); c.bloques++;
    carga.set(p.monitor, c);
  }
  const enlacesCambian = enlacesQueCambian(e.salasActuales, e.salasNuevas);
  const orden = <T extends { dia: string; hora: number }>(xs: T[]) => xs.sort((a, b) => a.dia.localeCompare(b.dia) || a.hora - b.hora);
  return {
    dias: e.dias,
    diasSinCambios: e.diasSinCambios,
    filasFijadas: e.fijas.length,
    cambiosSala: bloquesQueCambian(e.actual, e.nuevo).map((c) => ({ dia: c.dia, hora: c.hora, mentor: nm(c.mentorId), de: c.de, a: c.a })),
    cambiosEntreHoras: orden(cambiosEntreHoras),
    salasPorMonitor: [...carga].map(([usuario, c]) => ({ usuario, nombre: e.nombreMonitor(usuario), salas: [...c.salas].sort((a, b) => a - b), bloques: c.bloques }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    sinFila: orden(e.nuevo.filter((p) => !p.fijo).map((p) => ({ dia: p.dia, hora: p.hora, mentor: nm(p.mentorId), sala: p.sala }))),
    descartados: orden(e.actual.filter((p) => p.origen === "admin").map((p) => ({ dia: p.dia, hora: p.hora, sala: p.sala, mentor: nm(p.mentorId), monitor: p.monitor ? e.nombreMonitor(p.monitor) : "Sin monitor" }))),
    enlacesCambian,
    confirmarEnlaces: enlacesCambian.some((x) => x.antes !== null),
    ignoradas: e.ignoradas,
  };
}

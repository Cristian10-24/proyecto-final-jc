import type { HoraMentores } from "./agenda";
import type { ErrorFila } from "./importar/excel";

// Funciones puras del plan de salas: no tocan la base. Una sala = un mentor en una hora; el monitor
// acompaña la sala esa hora. Las horas son de Colombia (0–23).

export const HOJAS_SALAS = { salas: "Salas", monitores: "Monitores", disponibilidad: "Disponibilidad monitores" } as const;
export const MAX_SALAS = 7;

export type Sala = { sala: number; enlace: string };
export type OrigenMonitor = "importado" | "automatico" | "admin";

/** Fila de la hoja Monitores ya reconocida: la sala o el mentor, y el usuario del monitor. */
export type MonitorFijo = { fila: number; dia: string; hora: number; sala?: number; mentorId?: string; monitor: string };
export type Disponible = { monitor: string; dia: string; hora: number };
/** Cambio manual del admin que se conserva al recalcular, si la sala sigue existiendo. */
export type CambioAdmin = { dia: string; hora: number; mentorId: string; monitor: string | null };

export type PlanSala = { _id: string; dia: string; hora: number; sala: number; mentorId: string; monitor: string | null; origen: OrigenMonitor | null };

export const idSala = (dia: string, hora: number, sala: number) => `${dia}|${hora}|${sala}`;
const k = (...p: (string | number)[]) => p.join("|");

/**
 * Sala de cada mentor en cada hora. El mentor que sigue de la hora anterior conserva su sala; los
 * demás toman la sala que ya usaron ese día si está libre, y si no, la de número más bajo.
 * Error si en una hora hay más mentores que salas.
 */
export function asignarSalas(horas: HoraMentores[], salas: number[]): { salaDe: Map<string, number>; errores: ErrorFila[] } {
  const orden = [...salas].sort((a, b) => a - b);
  const salaDe = new Map<string, number>(), errores: ErrorFila[] = [];
  const porDia = new Map<string, HoraMentores[]>();
  for (const h of horas) porDia.set(h.dia, [...(porDia.get(h.dia) ?? []), h]);
  for (const [dia, lista] of [...porDia].sort(([a], [b]) => a.localeCompare(b))) {
    const usada = new Map<string, number>(); // última sala de cada mentor en el día
    let anterior: { hora: number; sala: Map<string, number> } | null = null;
    for (const h of [...lista].sort((a, b) => a.hora - b.hora)) {
      const mentores = [...new Set(h.mentores)].sort();
      if (mentores.length > orden.length) {
        errores.push({ hoja: HOJAS_SALAS.salas, fila: 0, mensaje: `El ${dia} a las ${h.hora}:00 hay ${mentores.length} mentores y solo ${orden.length} salas.` });
        continue;
      }
      const ocupadas = new Set<number>(), actual = new Map<string, number>();
      const tomar = (m: string, s: number) => { ocupadas.add(s); actual.set(m, s); usada.set(m, s); salaDe.set(k(dia, h.hora, m), s); };
      const siguen = anterior?.hora === h.hora - 1 ? anterior.sala : new Map<string, number>();
      for (const m of mentores) { const s = siguen.get(m); if (s !== undefined) tomar(m, s); }
      for (const m of mentores) {
        if (actual.has(m)) continue;
        const antes = usada.get(m);
        tomar(m, antes !== undefined && !ocupadas.has(antes) ? antes : orden.find((s) => !ocupadas.has(s))!);
      }
      anterior = { hora: h.hora, sala: actual };
    }
  }
  return { salaDe, errores };
}

export type EntradaPlan = {
  horas: HoraMentores[];
  salas: Sala[];
  importados: MonitorFijo[];
  disponibilidad: Disponible[];
  cambiosAdmin: CambioAdmin[];
  /** Al recalcular: una fila importada cuya hora o sala ya no existe es aviso (se ignora), no error. */
  faltantesComoAviso?: boolean;
};

/**
 * Plan completo: salas por mentor y hora, y un monitor por sala. Primero lo importado (hoja Monitores),
 * luego los cambios del admin que sigan valiendo, y al final lo automático con la hoja Disponibilidad:
 * el monitor de la hora anterior sigue en su sala salvo que otro disponible tenga 2 salas menos;
 * si no, gana el disponible con menos salas. Nadie queda en dos salas a la misma hora.
 */
export function planificar(e: EntradaPlan): { plan: PlanSala[]; errores: ErrorFila[]; avisos: ErrorFila[] } {
  const { salaDe, errores } = asignarSalas(e.horas, e.salas.map((s) => s.sala));
  const avisos: ErrorFila[] = [];
  const plan = new Map<string, PlanSala>(), porMentor = new Map<string, PlanSala>();
  for (const [clave, sala] of salaDe) {
    const [dia, hora, mentorId] = clave.split("|") as [string, string, string];
    const p: PlanSala = { _id: idSala(dia, +hora, sala), dia, hora: +hora, sala, mentorId, monitor: null, origen: null };
    plan.set(p._id, p);
    porMentor.set(k(dia, hora, mentorId), p);
  }
  const ocupado = new Set<string>(), carga = new Map<string, number>();
  const poner = (p: PlanSala, monitor: string | null, origen: OrigenMonitor) => {
    p.monitor = monitor; p.origen = origen;
    if (monitor) { ocupado.add(k(monitor, p.dia, p.hora)); carga.set(monitor, (carga.get(monitor) ?? 0) + 1); }
  };

  const H = HOJAS_SALAS.monitores;
  for (const f of e.importados) {
    const err = (mensaje: string) => errores.push({ hoja: H, fila: f.fila, mensaje });
    const p = f.sala !== undefined ? plan.get(idSala(f.dia, f.hora, f.sala)) : porMentor.get(k(f.dia, f.hora, f.mentorId!));
    if (!p && e.faltantesComoAviso) { avisos.push({ hoja: H, fila: f.fila, mensaje: `Esa sala ya no existe el ${f.dia} a las ${f.hora}:00 (cambiaron los horarios): la fila no se usa.` }); continue; }
    if (!p) { err(f.sala !== undefined ? `La sala ${f.sala} no tiene mentor el ${f.dia} a las ${f.hora}:00.` : `Ese mentor no está disponible el ${f.dia} a las ${f.hora}:00.`); continue; }
    if (p.origen) { err(`La sala ${p.sala} del ${f.dia} a las ${f.hora}:00 ya tiene otro monitor en el archivo.`); continue; }
    if (ocupado.has(k(f.monitor, f.dia, f.hora))) { err(`Ese monitor ya tiene otra sala el ${f.dia} a las ${f.hora}:00.`); continue; }
    poner(p, f.monitor, "importado");
  }
  for (const c of e.cambiosAdmin) {
    const p = porMentor.get(k(c.dia, c.hora, c.mentorId));
    if (!p) continue; // esa sala ya no existe
    if (p.origen || (c.monitor && ocupado.has(k(c.monitor, c.dia, c.hora)))) {
      avisos.push({ hoja: "", fila: 0, mensaje: `Se descarta un cambio manual del ${c.dia} a las ${c.hora}:00 (sala ${p.sala}): el archivo asigna otro monitor.` });
      continue;
    }
    poner(p, c.monitor, "admin");
  }

  const disponible = new Set(e.disponibilidad.map((d) => k(d.monitor, d.dia, d.hora)));
  const monitores = [...new Set(e.disponibilidad.map((d) => d.monitor))].sort();
  const libres = (dia: string, hora: number) => monitores.filter((m) => disponible.has(k(m, dia, hora)) && !ocupado.has(k(m, dia, hora)));
  const orden = [...plan.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.hora - b.hora || a.sala - b.sala);
  for (let i = 0; i < orden.length;) {
    const { dia, hora } = orden[i]!;
    const deLaHora: PlanSala[] = [];
    while (i < orden.length && orden[i]!.dia === dia && orden[i]!.hora === hora) deLaHora.push(orden[i++]!);
    const pendientes = deLaHora.filter((p) => !p.origen);
    // Primero, continuidad: el de la hora anterior en la misma sala, si la carga no queda muy desigual.
    for (const p of pendientes) {
      const previo = plan.get(idSala(dia, hora - 1, p.sala))?.monitor;
      const candidatos = libres(dia, hora);
      if (!previo || !candidatos.includes(previo)) continue;
      const menor = Math.min(...candidatos.filter((m) => m !== previo).map((m) => carga.get(m) ?? 0));
      if ((carga.get(previo) ?? 0) - menor < 2) poner(p, previo, "automatico");
    }
    for (const p of pendientes) {
      if (p.origen) continue;
      const m = libres(dia, hora).sort((a, b) => (carga.get(a) ?? 0) - (carga.get(b) ?? 0))[0];
      if (m) poner(p, m, "automatico");
    }
  }
  return { plan: orden, errores, avisos };
}

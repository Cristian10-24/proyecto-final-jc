// Fase 6 · «Monitores» (asignaciones, solo lectura): funciones puras sobre el plan de salas de un día. Sin base ni
// navegador; se prueban en tests/vistasBloques.test.ts. Horas en hora Colombia (entero 0–23, como planSalas.hora).

/** Una hora de una sala con al menos un proyecto: quién la cubre y qué proyectos tiene (minuto 0, 15, 30 o 45). */
export type Celda = { hora: number; sala: number; mentorId: string; monitor: string | null; proyectos: { minuto: number; nombre: string }[] };

/** Horas seguidas de la misma sala y mentor (y del mismo monitor). `hasta` es la hora en que termina (exclusiva). */
export type Bloque = {
  monitor: string | null; sala: number; mentorId: string; desde: number; hasta: number;
  proyectos: { hora: number; minuto: number; nombre: string }[];
};

/** Une las horas seguidas de la misma sala, mentor y monitor en un bloque, ordenado por hora. */
export function unirBloques(celdas: readonly Celda[]): Bloque[] {
  const orden = [...celdas].sort((a, b) => (a.monitor ?? "").localeCompare(b.monitor ?? "") || a.sala - b.sala || a.mentorId.localeCompare(b.mentorId) || a.hora - b.hora);
  const out: Bloque[] = [];
  for (const c of orden) {
    const ult = out.at(-1);
    const proyectos = [...c.proyectos].sort((x, y) => x.minuto - y.minuto).map((p) => ({ hora: c.hora, minuto: p.minuto, nombre: p.nombre }));
    if (ult && ult.monitor === c.monitor && ult.sala === c.sala && ult.mentorId === c.mentorId && ult.hasta === c.hora) {
      ult.hasta = c.hora + 1;
      ult.proyectos.push(...proyectos);
    } else out.push({ monitor: c.monitor, sala: c.sala, mentorId: c.mentorId, desde: c.hora, hasta: c.hora + 1, proyectos });
  }
  return out.sort((a, b) => a.desde - b.desde || a.sala - b.sala);
}

/** Bloques de cada monitor (null = «Sin monitor»), en orden de hora. */
export function porMonitor(bloques: readonly Bloque[]): Map<string | null, Bloque[]> {
  const m = new Map<string | null, Bloque[]>();
  for (const b of bloques) m.set(b.monitor, [...(m.get(b.monitor) ?? []), b]);
  for (const l of m.values()) l.sort((a, b) => a.desde - b.desde);
  return m;
}

/** Total del monitor: horas cubiertas y proyectos («4 h · 15 proyectos»). */
export const totales = (bloques: readonly Bloque[]) => ({
  horas: bloques.reduce((s, b) => s + (b.hasta - b.desde), 0),
  proyectos: bloques.reduce((s, b) => s + b.proyectos.length, 0),
});

export type SinMargen = { monitor: string; de: Bloque; a: Bloque; ultimo: { hora: number; minuto: number } };

/**
 * Cambios de sala sin margen: el último proyecto de un bloque es a las :45 de su última hora y el siguiente bloque
 * del MISMO monitor, en OTRA sala, empieza a la hora en punto siguiente.
 */
export function cambiosSinMargen(bloques: readonly Bloque[]): SinMargen[] {
  const out: SinMargen[] = [];
  for (const [monitor, lista] of porMonitor(bloques)) {
    if (monitor === null) continue;
    for (let i = 0; i + 1 < lista.length; i++) {
      const de = lista[i]!, a = lista[i + 1]!;
      const ultimo = de.proyectos.at(-1);
      if (ultimo && ultimo.hora === de.hasta - 1 && ultimo.minuto === 45 && a.desde === de.hasta && a.sala !== de.sala)
        out.push({ monitor, de, a, ultimo: { hora: ultimo.hora, minuto: ultimo.minuto } });
    }
  }
  return out.sort((x, y) => x.a.desde - y.a.desde || x.monitor.localeCompare(y.monitor));
}

/** Bloques sin monitor (solo los que tienen proyectos, porque las celdas ya los traen así). */
export const salasSinMonitor = (bloques: readonly Bloque[]) => bloques.filter((b) => b.monitor === null);

/** "8 a. m." para la cabecera de la cuadrícula. */
export const horaCorta = (h: number) => `${h % 12 || 12} ${h < 12 ? "a. m." : "p. m."}`;
/** "8:00 a. m."; con minutos: "10:45 a. m.". */
export const horaLarga = (h: number, minuto = 0) => `${h % 12 || 12}:${String(minuto).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
/** Rango del bloque: "8:00 a 9:00 a. m." (mismo período) o "11:00 a. m. a 12:00 p. m.". */
export function rangoHoras(desde: number, hasta: number): string {
  const p = (h: number) => (h % 24 < 12 ? "a. m." : "p. m.");
  const a = `${desde % 12 || 12}:00`, b = `${hasta % 12 || 12}:00`;
  return p(desde) === p(hasta) ? `${a} a ${b} ${p(hasta)}` : `${a} ${p(desde)} a ${b} ${p(hasta)}`;
}

/**
 * Bloque de la sala donde está el proyecto: las horas seguidas del mismo día, sala y mentor alrededor de `hora`
 * (de la lista de salas del monitor). null si esa hora no está en la lista.
 */
export function bloqueDeSala(salas: readonly { dia: string; hora: number; sala: number; mentor: string }[], dia: string, sala: number, mentor: string, hora: number): { desde: number; hasta: number } | null {
  const horas = new Set(salas.filter((s) => s.dia === dia && s.sala === sala && s.mentor === mentor).map((s) => s.hora));
  if (!horas.has(hora)) return null;
  let desde = hora, hasta = hora + 1;
  while (horas.has(desde - 1)) desde--;
  while (horas.has(hasta)) hasta++;
  return { desde, hasta };
}

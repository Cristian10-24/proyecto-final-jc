import { BLOQUES_POR_HORA, horaCOL, inicioUTC, MINUTOS_BLOQUE } from "./edicion";
import { NOMBRES_CIUDADES, presentaAntesDeClausura } from "./ciudades";
import type { Asiento, CupoCiudad, DiaConfig } from "./types";

/**
 * En la hoja Cupos, "Todas" = las ciudades SIN días asignados explícitamente en ninguna fila de Cupos,
 * y solo antes de su clausura. Una ciudad con filas propias ve únicamente esos días.
 */
export const TODAS = "Todas";

/** Ciudades con al menos una fila propia (no "Todas") en la configuración de días. */
export function ciudadesExplicitas(dias: Iterable<{ ciudades: CupoCiudad[] }>): Set<string> {
  const out = new Set<string>();
  for (const d of dias) for (const c of d.ciudades) if (c.ciudad !== TODAS) out.add(c.ciudad);
  return out;
}

export function expandirCiudades(ciudad: string, dia: string, explicitas: Set<string>): string[] {
  return ciudad === TODAS ? NOMBRES_CIUDADES.filter((c) => !explicitas.has(c) && presentaAntesDeClausura(c, dia)) : [ciudad];
}

// Funciones puras de agenda: no tocan la base. El importador y las rutas las usan.

/** Mentores disponibles en una hora de un día (hora de Colombia, 0–23). */
export type HoraMentores = { dia: string; hora: number; mentores: string[] };

export type AsientoNuevo = { dia: string; inicio: Date; mentorId: string; ciudades: string[] };

/**
 * Reparte `total` puestos en orden entre grupos con una cuota cada uno, en proporción a lo largo del
 * orden (Bresenham): en cada puesto gana el grupo más atrasado respecto a su parte ideal. Así cada
 * hora del día recibe su parte de cada ciudad y al final cada grupo tiene exactamente su cuota.
 * Devuelve el índice del grupo para cada puesto.
 */
export function repartoProporcional(total: number, cuotas: number[]): number[] {
  const suma = cuotas.reduce((a, b) => a + b, 0);
  if (suma !== total) throw new Error(`Las cuotas (${suma}) no suman el total (${total})`);
  const asignados = cuotas.map(() => 0);
  const out: number[] = [];
  for (let k = 1; k <= total; k++) {
    let mejor = -1, mejorDeficit = -Infinity;
    cuotas.forEach((q, g) => {
      if (asignados[g]! >= q) return;
      const deficit = (q * k) / total - asignados[g]!;
      if (deficit > mejorDeficit + 1e-9 || (Math.abs(deficit - mejorDeficit) <= 1e-9 && q > cuotas[mejor]!)) {
        mejor = g;
        mejorDeficit = deficit;
      }
    });
    asignados[mejor]!++;
    out.push(mejor);
  }
  return out;
}

/**
 * Grupos de un día: cada ciudad recibe sus cupos (mínimo). Lo que quede va primero a la ciudad de sobrante, hasta
 * su máximo (sin máximo, todo); después, a las demás que tengan un máximo mayor que sus cupos, en orden, hasta su
 * máximo. Lo que aún quede va a un grupo sin ciudad (el admin lo reetiqueta después). Si la ciudad de sobrante es
 * "Todas", ese resto es libre. El último grupo es el de sobrante (o el sin ciudad, si no hay sobrante).
 */
export function gruposDelDia(cupos: CupoCiudad[], asientosDelDia: number, dia: string, explicitas: Set<string>): { ciudades: string[]; cuota: number }[] {
  const sobrantes = cupos.filter((c) => c.sobrante);
  if (sobrantes.length > 1) throw new Error(`Solo una ciudad puede llevar el sobrante (hay ${sobrantes.length})`);
  const fijos = cupos.filter((c) => !c.sobrante);
  const sinCupos = fijos.find((c) => c.cupos === null);
  if (sinCupos) throw new Error(`${sinCupos.ciudad} no tiene cupos: escribe un número o márcala como sobrante`);
  const sumaFijos = fijos.reduce((a, c) => a + c.cupos!, 0);
  const minimo = sobrantes[0]?.cupos ?? 0;
  if (sumaFijos + minimo > asientosDelDia) throw new Error(`Los cupos (${sumaFijos + minimo}) superan los asientos del día (${asientosDelDia})`);
  const bajo = cupos.find((c) => c.max != null && c.max < (c.cupos ?? 0));
  if (bajo) throw new Error(`El máximo de ${bajo.ciudad} (${bajo.max}) es menor que sus cupos (${bajo.cupos})`);
  let queda = asientosDelDia - sumaFijos - minimo;
  const sob = sobrantes[0];
  const extraSob = sob ? Math.min(queda, (sob.max ?? Infinity) - minimo) : 0;
  queda -= extraSob;
  const grupos = fijos.map((c) => {
    const extra = Math.min(queda, Math.max(0, (c.max ?? c.cupos!) - c.cupos!));
    queda -= extra;
    return { ciudades: [c.ciudad], cuota: c.cupos! + extra };
  });
  if (!sob) return [...grupos, { ciudades: [], cuota: queda }];
  const resto = { ciudades: expandirCiudades(sob.ciudad, dia, explicitas), cuota: minimo + extraSob };
  return [...grupos, ...(queda > 0 ? [{ ciudades: [], cuota: queda }] : []), resto];
}

/** Asientos de una edición: 4 bloques de 15 min por mentor y hora, con las ciudades repartidas por hora. */
export function generarAsientos(horas: HoraMentores[], cuposPorDia: Map<string, CupoCiudad[]>): AsientoNuevo[] {
  const porDia = new Map<string, AsientoNuevo[]>();
  const orden = [...horas].sort((a, b) => a.dia.localeCompare(b.dia) || a.hora - b.hora);
  for (const h of orden) {
    const lista = porDia.get(h.dia) ?? [];
    for (let b = 0; b < BLOQUES_POR_HORA; b++)
      for (const m of h.mentores) lista.push({ dia: h.dia, inicio: inicioUTC(h.dia, h.hora, b * MINUTOS_BLOQUE), mentorId: m, ciudades: [] });
    porDia.set(h.dia, lista);
  }
  const out: AsientoNuevo[] = [];
  const explicitas = ciudadesExplicitas([...cuposPorDia.values()].map((ciudades) => ({ ciudades })));
  for (const [dia, lista] of porDia) {
    const grupos = gruposDelDia(cuposPorDia.get(dia) ?? [], lista.length, dia, explicitas);
    const asignacion = repartoProporcional(lista.length, grupos.map((g) => g.cuota));
    lista.forEach((a, i) => out.push({ ...a, ciudades: grupos[asignacion[i]!]!.ciudades }));
  }
  return out;
}

/** Resumen por día y ciudad, para la vista previa ("(sin ciudad)" si un asiento no tiene ninguna). */
export function resumenPorDia(asientos: { dia: string; ciudades: string[] }[]) {
  const dias = new Map<string, { dia: string; asientos: number; porCiudad: Record<string, number> }>();
  for (const a of asientos) {
    const d = dias.get(a.dia) ?? { dia: a.dia, asientos: 0, porCiudad: {} };
    d.asientos++;
    const k = a.ciudades.length ? a.ciudades.join(" + ") : "(sin ciudad)";
    d.porCiudad[k] = (d.porCiudad[k] ?? 0) + 1;
    dias.set(a.dia, d);
  }
  return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Ciudades que presentan un día, con su apertura: las de sus filas propias y, por "Todas", las que no
 * tienen días asignados en ninguna parte (`explicitas`, de toda la configuración).
 */
export function ciudadesDelDia(cupos: CupoCiudad[], dia: string, explicitas: Set<string>): Map<string, Date | null> {
  const out = new Map<string, Date | null>();
  for (const c of cupos) if (c.ciudad !== TODAS) out.set(c.ciudad, c.abre);
  for (const c of cupos) if (c.ciudad === TODAS) for (const x of expandirCiudades(TODAS, dia, explicitas)) out.set(x, c.abre);
  return out;
}

/** Días en los que presenta una ciudad, en orden. */
export function diasPorCiudad(dias: DiaConfig[], ciudad: string): string[] {
  const explicitas = ciudadesExplicitas(dias);
  return dias.filter((d) => ciudadesDelDia(d.ciudades, d._id, explicitas).has(ciudad)).map((d) => d._id).sort();
}

/** true si la ciudad presenta ese día y su apertura ya pasó (o no tiene). `explicitas`: de toda la configuración. */
export function puedeElegir(dia: DiaConfig | undefined, ciudad: string, ahora: Date, explicitas: Set<string>): boolean {
  if (!dia) return false;
  const c = ciudadesDelDia(dia.ciudades, dia._id, explicitas);
  if (!c.has(ciudad)) return false;
  const abre = c.get(ciudad);
  return !abre || abre.getTime() <= ahora.getTime();
}

/** Bloques (inicio) con al menos un asiento libre para la ciudad, futuros y en orden. Sin conteos.
 *  `ciudad` null (modo orden de llegada): cualquier asiento libre, sin mirar su etiqueta. */
export function horasDisponibles(asientos: Pick<Asiento, "inicio" | "ciudades" | "proyectoId">[], ciudad: string | null, ahora: Date): Date[] {
  const vistos = new Map<number, Date>();
  for (const a of asientos)
    if (!a.proyectoId && (ciudad === null || a.ciudades.includes(ciudad)) && a.inicio.getTime() > ahora.getTime()) vistos.set(a.inicio.getTime(), a.inicio);
  return [...vistos.keys()].sort((x, y) => x - y).map((t) => vistos.get(t)!);
}

/** Agrupa bloques por hora de Colombia, para mostrar "8 a. m.: 8:00 · 8:15 · 8:45". */
export function agruparPorHora(bloques: Date[]): { hora: number; bloques: Date[] }[] {
  const grupos: { hora: number; bloques: Date[] }[] = [];
  for (const b of bloques) {
    const h = horaCOL(b);
    const g = grupos[grupos.length - 1];
    if (g && g.hora === h) g.bloques.push(b);
    else grupos.push({ hora: h, bloques: [b] });
  }
  return grupos;
}

/** Asientos por hora (COL) y por grupo de ciudades: para revisar el reparto. */
export function repartoPorHora(asientos: Pick<AsientoNuevo, "inicio" | "ciudades">[]): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  for (const a of asientos) {
    const h = horaCOL(a.inicio);
    const r = out.get(h) ?? {};
    const k = a.ciudades.length ? a.ciudades.join(" + ") : "(sin ciudad)";
    r[k] = (r[k] ?? 0) + 1;
    out.set(h, r);
  }
  return out;
}

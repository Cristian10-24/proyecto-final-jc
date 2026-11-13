import type { SessionUser } from "../auth";
import { horaCO } from "../ciudades";
import { collections } from "../db";
import { diaCOL, horaCOL } from "../edicion";
import { calc } from "../evaluacion/criterios";
import { criterios, idEval, salasDe } from "../evaluacion/datos";

// Fase 6 · «Mi ciudad» (monitor, solo lectura): los proyectos de SUS ciudades que ya tienen día y hora (los que no
// tienen hora no aparecen; tampoco los «Sin proyecto»), de todos los días, con SOLO el estado de cada integrante.
// Privacidad: cada fila se arma campo por campo (nunca con spread). Nunca salen notas, resultado (Excelente,
// Aprobado…), retroalimentación, porcentajes, observaciones ni motivos del monitor, documento ni correo.

export type EstadoMiCiudad = "evaluado" | "pendiente" | "ausente";
export type IntegranteMiCiudad = { nombre: string; celular: string | null; estado: EstadoMiCiudad };
export type FilaMiCiudad = {
  /** Monitor de la sala a esa hora (plan de salas): solo su nombre; null = «Sin monitor». */
  id: string; proyecto: string; dia: string; inicio: string; hora: string; sala: number | null; monitor: string | null;
  estado: EstadoMiCiudad; integrantes: IntegranteMiCiudad[];
};
export type VistaMiCiudad = { ciudades: string[]; ciudad: string | null; filas: FilaMiCiudad[] };

/** Ciudades del monitor (las de su usuario, sin importar otros roles): nunca datos de otras ciudades. */
export const ciudadesDelMonitor = (user: Pick<SessionUser, "ciudades">) =>
  [...new Set(user.ciudades ?? [])].sort((a, b) => a.localeCompare(b, "es"));

/**
 * Estado de una persona: Evaluado (evaluación guardada: Aprobado o Excelente), No se presentó (el mentor lo marcó, o
 * el monitor marcó «No» sin evaluación guardada) o Pendiente (el resto, también Incompleto o un borrador).
 */
export function estadoIntegrante(res: string, asistenciaMonitor: "si" | "no" | null | undefined): EstadoMiCiudad {
  if (res === "Excelente" || res === "Aprobado") return "evaluado";
  if (res === "No se presentó" || asistenciaMonitor === "no") return "ausente";
  return "pendiente";
}

/** Del proyecto (como `estadoFila`): Evaluado si alguno lo está, No se presentó si nadie se presentó, si no Pendiente. */
export function estadoProyecto(estados: EstadoMiCiudad[]): EstadoMiCiudad {
  if (estados.includes("evaluado")) return "evaluado";
  if (estados.length && estados.every((e) => e === "ausente")) return "ausente";
  return "pendiente";
}

export async function miCiudad(user: Pick<SessionUser, "ciudades">, pedida?: string): Promise<VistaMiCiudad | { error: "ciudad" }> {
  const ciudades = ciudadesDelMonitor(user);
  if (pedida !== undefined && !ciudades.includes(pedida)) return { error: "ciudad" };
  const ciudad = pedida ?? ciudades[0] ?? null;
  if (!ciudad) return { ciudades, ciudad: null, filas: [] };

  const { proyectos, asientos, evalResultados, evalMonitor, planSalas, users } = await collections();
  const lista = await proyectos.find({ ciudad, sinProyecto: { $exists: false } }, { projection: { nombre: 1, integrantes: 1 } }).toArray();
  const ids = lista.map((p) => p._id);
  // Solo los que tienen hora: un asiento con este proyecto.
  const asis = await asientos.find({ proyectoId: { $in: ids } }, { projection: { proyectoId: 1, inicio: 1, mentorId: 1 } }).toArray();
  const pIds = asis.map((a) => a.proyectoId!);
  const [evals, notas, plan, crit, salaDe] = await Promise.all([
    // Solo lo que usa calc() para el estado (nunca sale en la respuesta).
    evalResultados.find({ proyectoId: { $in: pIds } }, { projection: { a: 1, b: 1, noPresento: 1 } }).toArray(),
    evalMonitor.find({ proyectoId: { $in: pIds } }, { projection: { asistencia: 1 } }).toArray(),
    // Solo el plan de los días y mentores de estos proyectos (no lee el de otras ciudades).
    planSalas.find({ dia: { $in: [...new Set(asis.map((a) => diaCOL(a.inicio)))] }, mentorId: { $in: [...new Set(asis.map((a) => a.mentorId))] } }, { projection: { dia: 1, hora: 1, mentorId: 1, monitor: 1 } }).toArray(),
    criterios(), salasDe(asis),
  ]);
  // Monitor de la sala a esa hora: el del plan de salas (día + hora + mentor), con su nombre.
  const claves = new Set(asis.map((a) => `${diaCOL(a.inicio)}|${horaCOL(a.inicio)}|${a.mentorId}`));
  const monitorDe = new Map(plan.filter((x) => x.monitor && claves.has(`${x.dia}|${x.hora}|${x.mentorId}`)).map((x) => [`${x.dia}|${x.hora}|${x.mentorId}`, x.monitor!]));
  // Solo el nombre; un monitor desactivado o sin usuario sale como «Sin monitor».
  const nombres = new Map((await users.find({ usuario: { $in: [...new Set(monitorDe.values())] }, activo: true }, { projection: { usuario: 1, nombre: 1 } }).toArray())
    .map((u) => [u.usuario, u.nombre]));
  const porId = new Map(lista.map((p) => [String(p._id), p]));
  const ev = new Map(evals.map((e) => [e._id, e]));
  const asistencia = new Map(notas.map((n) => [n._id, n.asistencia]));

  const filas: FilaMiCiudad[] = [];
  for (const a of asis) {
    const p = porId.get(String(a.proyectoId));
    if (!p) continue;
    const integrantes: IntegranteMiCiudad[] = p.integrantes.map((x) => {
      const clave = idEval(p._id, x.documento);
      return {
        nombre: x.nombre,
        celular: x.celular?.trim() || null,
        estado: estadoIntegrante(calc(ev.get(clave), crit).res, asistencia.get(clave)),
      };
    });
    filas.push({
      id: String(p._id),
      proyecto: p.nombre,
      dia: diaCOL(a.inicio),
      inicio: a.inicio.toISOString(),
      hora: horaCO(a.inicio),
      sala: salaDe(a).sala ?? null,
      monitor: (() => { const u = monitorDe.get(`${diaCOL(a.inicio)}|${horaCOL(a.inicio)}|${a.mentorId}`); return u ? nombres.get(u) ?? null : null; })(),
      estado: estadoProyecto(integrantes.map((x) => x.estado)),
      integrantes,
    });
  }
  filas.sort((x, y) => x.inicio.localeCompare(y.inicio) || x.proyecto.localeCompare(y.proyecto, "es"));
  return { ciudades, ciudad, filas };
}

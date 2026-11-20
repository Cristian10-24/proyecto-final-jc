import { ObjectId } from "mongodb";
import type { SessionUser } from "./auth";
import { horaCO } from "./ciudades";
import { limpiarComentario } from "./comentarios";
import { collections, transaccion } from "./db";
import { diaCOL, horaCOL, inicioUTC } from "./edicion";
import { excepcionesDe, monitorEfectivo, vigente } from "./evaluacion/monitorEfectivo";
import { FILTRO_MONITOR } from "./permisos";
import type { Asiento } from "./types";

// Monitor por proyecto · lado del admin (rama feature/monitor-por-proyecto). Solo el admin (permiso cambiar_horario)
// asigna a mano el monitor de UN proyecto, distinto del de su bloque, o quita esa excepción. Solo cambia el monitor:
// sala, enlace, mentor, reserva, evaluaciones y notas del monitor quedan iguales. Vale también para proyectos que ya
// se presentaron. Cada cambio deja changeLog con antes y después y escribe en el asiento (sube `rev`), así choca con
// una anotación del monitor o una reprogramación al mismo tiempo.

export type RefMonitor = { usuario: string; nombre: string };
export type ProyectoMonitor = {
  id: string; nombre: string; inicio: string; hora: number; minuto: number; mentorId: string;
  /** Monitor de la sala a esa hora (plan de salas); null = sin monitor. */
  bloque: RefMonitor | null;
  /** Excepción vigente del admin (si la hay). */
  excepcion: { monitor: RefMonitor; motivo?: string } | null;
};
export type VistaMonitorProyecto = { dia: string; proyectos: ProyectoMonitor[]; monitores: RefMonitor[] };

/** Los proyectos con hora de un día, con su monitor del bloque y su excepción, y los monitores activos para elegir. */
export async function monitoresPorProyecto(dia: string): Promise<VistaMonitorProyecto> {
  const c = await collections();
  const [asis, plan, activos] = await Promise.all([
    c.asientos.find({ dia, proyectoId: { $type: "objectId" } }, { projection: { inicio: 1, mentorId: 1, proyectoId: 1 } }).sort({ inicio: 1 }).toArray(),
    c.planSalas.find({ dia }, { projection: { hora: 1, mentorId: 1, monitor: 1 } }).toArray(),
    c.users.find({ $and: [FILTRO_MONITOR, { activo: true }] }, { projection: { usuario: 1, nombre: 1 } }).toArray(),
  ]);
  const [nombres, excs] = await Promise.all([
    c.proyectos.find({ _id: { $in: asis.map((a) => a.proyectoId!) } }, { projection: { nombre: 1 } }).toArray(),
    excepcionesDe(asis),
  ]);
  const delBloque = new Map(plan.flatMap((p) => (p.monitor ? [[`${p.hora}|${p.mentorId}`, p.monitor] as const] : [])));
  const usuarios = [...new Set([...delBloque.values(), ...[...excs.values()].map((e) => e.monitorId)])];
  const nombreDe = new Map((await c.users.find({ usuario: { $in: usuarios } }, { projection: { usuario: 1, nombre: 1 } }).toArray()).map((u) => [u.usuario, u.nombre]));
  const ref = (u: string): RefMonitor => ({ usuario: u, nombre: nombreDe.get(u) ?? u });
  const nombreP = new Map(nombres.map((p) => [String(p._id), p.nombre]));
  return {
    dia,
    proyectos: asis.map((a) => {
      const b = delBloque.get(`${horaCOL(a.inicio)}|${a.mentorId}`), e = excs.get(String(a.proyectoId));
      return {
        id: String(a.proyectoId), nombre: nombreP.get(String(a.proyectoId)) ?? "Proyecto", inicio: a.inicio.toISOString(),
        hora: horaCOL(a.inicio), minuto: a.inicio.getUTCMinutes(), mentorId: a.mentorId,
        bloque: b ? ref(b) : null,
        excepcion: e ? { monitor: ref(e.monitorId), ...(e.motivo ? { motivo: e.motivo } : {}) } : null,
      };
    }),
    monitores: activos.map((u) => ({ usuario: u.usuario, nombre: u.nombre })).sort((x, y) => x.nombre.localeCompare(y.nombre, "es")),
  };
}

export type ErrorMonitorProyecto = {
  error: "no_existe" | "sin_hora" | "monitor" | "igual" | "franja" | "aviso" | "cambio" | "sin_excepcion";
  mensaje: string;
};
class Cambio extends Error {}
const falla = (error: ErrorMonitorProyecto["error"], mensaje: string): ErrorMonitorProyecto => ({ error, mensaje });
const etiqueta = (u: string | null, nombre?: string) => (u ? `${nombre ?? u} (${u})` : "Sin monitor");

/** Monitores efectivos de los proyectos de esa hora (día + hora), con su sala, para revisar choques. */
async function ocupacionHora(a: Asiento) {
  const c = await collections();
  const dia = diaCOL(a.inicio), hora = horaCOL(a.inicio);
  const [otros, plan] = await Promise.all([
    c.asientos.find({ proyectoId: { $type: "objectId", $ne: a.proyectoId }, inicio: { $gte: inicioUTC(dia, hora), $lt: inicioUTC(dia, hora + 1) } }).toArray(),
    c.planSalas.find({ dia, hora }).toArray(),
  ]);
  const excs = await excepcionesDe(otros);
  const salaDe = new Map(plan.map((p) => [p.mentorId, p]));
  return {
    plan,
    proyectos: otros.map((o) => ({ asiento: o, sala: salaDe.get(o.mentorId)?.sala ?? null, monitor: monitorEfectivo(o, salaDe.get(o.mentorId)?.monitor ?? null, excs.get(String(o.proyectoId))).monitor })),
  };
}

/**
 * Asigna a mano el monitor de un proyecto (solo para su reserva actual). Error si ese monitor ya tiene otro proyecto
 * que empieza a la misma hora exacta (misma franja de 15 minutos) en otra sala; si solo tiene otra sala en esa hora,
 * pide confirmar (`aviso`) y con `confirmar` guarda.
 */
export async function asignarMonitorProyecto(user: SessionUser, proyectoId: string, monitor: string, motivoTexto: string | undefined, confirmar: boolean): Promise<{ ok: true } | ErrorMonitorProyecto> {
  // Motivo en una sola línea, sin caracteres de control ni invisibles (como los comentarios).
  const motivo = motivoTexto ? limpiarComentario(motivoTexto).replace(/\s+/g, " ").slice(0, 300) || undefined : undefined;
  if (!ObjectId.isValid(proyectoId)) return falla("no_existe", "Ese proyecto no existe.");
  const c = await collections(), _id = new ObjectId(proyectoId);
  const [p, a, u] = await Promise.all([
    c.proyectos.findOne({ _id }, { projection: { nombre: 1 } }),
    c.asientos.findOne({ proyectoId: _id }),
    c.users.findOne({ $and: [FILTRO_MONITOR, { usuario: monitor, activo: true }] }, { projection: { usuario: 1, nombre: 1 } }),
  ]);
  if (!p) return falla("no_existe", "Ese proyecto no existe.");
  if (!a) return falla("sin_hora", "Ese proyecto no tiene día ni hora: no hay monitor que cambiar.");
  if (!u) return falla("monitor", "Ese monitor no existe o está desactivado.");
  const dia = diaCOL(a.inicio), hora = horaCOL(a.inicio);
  const bloque = await c.planSalas.findOne({ dia, hora, mentorId: a.mentorId });
  const delBloque = bloque?.monitor ?? null;
  if (monitor === delBloque) return falla("igual", `${u.nombre} ya es el monitor del bloque. Para volver a él, usa «Quitar excepción».`);

  const ocup = await ocupacionHora(a);
  const choque = ocup.proyectos.find((x) => x.monitor === monitor && x.asiento.inicio.getTime() === a.inicio.getTime());
  if (choque) {
    const otro = await c.proyectos.findOne({ _id: choque.asiento.proyectoId! }, { projection: { nombre: 1 } });
    return falla("franja", `${u.nombre} ya tiene «${otro?.nombre ?? "otro proyecto"}» a las ${horaCO(a.inicio)}${choque.sala !== null ? ` en la Sala ${choque.sala}` : ""}. Elige otro monitor.`);
  }
  const planOtra = ocup.plan.find((x) => x.monitor === monitor && x.mentorId !== a.mentorId);
  const proyOtra = ocup.proyectos.find((x) => x.monitor === monitor && x.asiento.mentorId !== a.mentorId);
  if ((planOtra || proyOtra) && !confirmar) {
    const sala = planOtra?.sala ?? proyOtra?.sala ?? null;
    return falla("aviso", `${u.nombre} tiene ${sala !== null ? `la Sala ${sala}` : "otra sala"} en esa hora, pero no en esta franja de 15 minutos. ¿Guardar igual?`);
  }

  const ahora = new Date();
  try {
    await transaccion(async (s) => {
      // La reserva sigue igual (mismo asiento, hora y mentor); escribir en él choca con una anotación o reprogramación.
      const sigue = await c.asientos.findOneAndUpdate({ _id: a._id, proyectoId: _id, inicio: a.inicio, mentorId: a.mentorId }, { $inc: { rev: 1 } }, { session: s, projection: { _id: 1 } });
      if (!sigue) throw new Cambio();
      const previa = await c.monitorExcepciones.findOne({ proyectoId: _id }, { session: s });
      const antes = monitorEfectivo(a, delBloque, vigente(previa, a) ? previa : null).monitor;
      const nombreAntes = antes ? (await c.users.findOne({ usuario: antes }, { projection: { nombre: 1 }, session: s }))?.nombre : undefined;
      await c.monitorExcepciones.replaceOne({ proyectoId: _id }, {
        proyectoId: _id, dia, horaInicio: a.inicio, mentorId: a.mentorId, monitorId: u.usuario,
        ...(motivo ? { motivo } : {}), creadoPor: user.usuario, creadoEn: ahora,
      }, { upsert: true, session: s });
      await c.changeLog.insertOne({
        proyectoId: _id, accion: "monitor_proyecto", fecha: ahora, actor: { rol: user.rol, usuario: user.usuario },
        anterior: `${etiqueta(antes, nombreAntes)}${vigente(previa, a) ? " · asignado a mano" : " · monitor del bloque"}`,
        nuevo: `${etiqueta(u.usuario, u.nombre)} · asignado a mano · ${dia} ${horaCO(a.inicio)}`,
        ...(motivo ? { motivo } : {}),
      }, { session: s });
    });
  } catch (e) {
    if (e instanceof Cambio) return falla("cambio", "El proyecto cambió de hora mientras tanto. Vuelve a abrir el bloque.");
    throw e;
  }
  return { ok: true };
}

/** Quita la excepción: el proyecto vuelve al monitor de su bloque. */
export async function quitarMonitorProyecto(user: SessionUser, proyectoId: string): Promise<{ ok: true } | ErrorMonitorProyecto> {
  if (!ObjectId.isValid(proyectoId)) return falla("no_existe", "Ese proyecto no existe.");
  const c = await collections(), _id = new ObjectId(proyectoId), ahora = new Date();
  let sin = false;
  await transaccion(async (s) => {
    sin = false;
    const e = await c.monitorExcepciones.findOne({ proyectoId: _id }, { session: s });
    if (!e) { sin = true; return; }
    const a = await c.asientos.findOneAndUpdate({ proyectoId: _id }, { $inc: { rev: 1 } }, { session: s, projection: { inicio: 1, mentorId: 1, proyectoId: 1 } });
    const bloque = a ? await c.planSalas.findOne({ dia: diaCOL(a.inicio), hora: horaCOL(a.inicio), mentorId: a.mentorId }, { session: s }) : null;
    const usuarios = [e.monitorId, ...(bloque?.monitor ? [bloque.monitor] : [])];
    const nombre = new Map((await c.users.find({ usuario: { $in: usuarios } }, { projection: { usuario: 1, nombre: 1 }, session: s }).toArray()).map((x) => [x.usuario, x.nombre]));
    await c.monitorExcepciones.deleteOne({ _id: e._id }, { session: s });
    await c.changeLog.insertOne({
      proyectoId: _id, accion: "monitor_proyecto", fecha: ahora, actor: { rol: user.rol, usuario: user.usuario },
      anterior: `${etiqueta(e.monitorId, nombre.get(e.monitorId))} · asignado a mano${a && vigente(e, a) ? "" : " (ya sin efecto)"}`,
      nuevo: a ? `${etiqueta(bloque?.monitor ?? null, bloque?.monitor ? nombre.get(bloque.monitor) : undefined)} · monitor del bloque` : "Sin hora",
    }, { session: s });
  });
  return sin ? falla("sin_excepcion", "Ese proyecto no tiene monitor asignado a mano.") : { ok: true };
}

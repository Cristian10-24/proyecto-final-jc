import type { ClientSession } from "mongodb";
import { collections, transaccion } from "./db";
import type { ErrorFila } from "./importar/excel";
import type { LibroSalas } from "./importar/salas";
import { bloquesConDatos, buscarMonitor, calcular, diaDesde, horasDeMentores, monitoresActivos, reconocer, resumir, type PreviaSalas } from "./planSalas";
import { HOJAS_SALAS, type Disponible, type MonitorFijo, type PlanSala, type SalaFija } from "./salas";
import { bloquesQueCambian, combinarMonitores, resumirPlanFijo, validarFilasPlan } from "./salasFijas";
import type { Actor } from "./types";

// Hoja «Plan de salas»: el admin fija la sala (y el monitor) de cada mentor en cada hora. SOLO se tocan los días que
// trae el archivo: el plan de los demás días, sus monitores y su configuración quedan exactamente igual. Las hojas
// Monitores y Disponibilidad del mismo libro valen solo para esos días; la hoja Salas actualiza los enlaces.
// Reservas, evaluaciones, asistencia y proyectos no se tocan. Todo deja changeLog (importar_plan_salas).

const k = (...p: (string | number)[]) => p.join("|");
const sinFila = <T extends { fila?: number }>(x: T): Omit<T, "fila"> => { const { fila: _f, ...resto } = x; return resto; };

type Preparado = {
  previa: PreviaSalas;
  escribir?: {
    dias: string[];
    plan: PlanSala[];
    cfg: { salas: LibroSalas["salas"]; importados: MonitorFijo[]; disponibilidad: Disponible[]; fijos: SalaFija[] };
    antes: string;
    despues: string;
  };
};

function resumenDias(plan: PlanSala[], dias: string[]): string {
  return dias.map((d) => {
    const del = plan.filter((p) => p.dia === d);
    const salas = new Set(del.map((p) => p.sala)).size;
    return `${d}: ${del.length} horas-sala en ${salas} salas, ${del.filter((p) => !p.monitor).length} sin monitor, ${del.filter((p) => p.fijo).length} fijas`;
  }).join(" · ");
}

/** Lee todo lo necesario y arma la vista previa (y, si no hay errores, lo que se escribiría). Solo lee. */
async function preparar(libro: LibroSalas, session?: ClientSession): Promise<Preparado> {
  const c = await collections();
  const monitores = await monitoresActivos(session);
  const nombreMon = new Map(monitores.map((m) => [m.usuario, m.nombre]));
  const filas = libro.plan ?? [];
  const D = new Set(filas.map((f) => f.dia));
  const dias = [...D].sort();
  const vacio = resumir([], libro.salas, monitores);
  if (libro.errores.length) return { previa: { ...vacio, errores: libro.errores, avisos: libro.avisos } };

  // En secuencia: dentro de una transacción, una sesión no admite operaciones en paralelo.
  const cfg = await c.salasConfig.findOne({ _id: "actual" }, { session });
  const planActual = await c.planSalas.find({}, { session }).toArray();
  const mentoresDocs = await c.mentores.find({}, { session, projection: { nombre: 1 } }).toArray();
  const horas = await horasDeMentores(session);
  const nombreMentor = new Map(mentoresDocs.map((m) => [m._id, m.nombre]));
  const activos = new Set(horas.flatMap((h) => h.mentores.map((m) => k(h.dia, h.hora, m))));
  const errores: ErrorFila[] = [], avisos: ErrorFila[] = [...libro.avisos];

  // 0) Días que ya pasaron (hora de Colombia): no se reacomodan.
  const hoy = diaDesde();
  if (hoy) for (const f of filas.filter((x) => x.dia < hoy))
    errores.push({ hoja: HOJAS_SALAS.plan, fila: f.fila, mensaje: `El ${f.dia} ya pasó: el plan de salas de días pasados no se cambia.` });

  // 1) Filas del plan.
  const v = validarFilasPlan(filas, {
    salas: new Set(libro.salas.map((s) => s.sala)),
    activo: (dia, hora, mentorId) => activos.has(k(dia, hora, mentorId)),
    monitor: (t) => {
      const m = buscarMonitor(t, monitores);
      return typeof m === "string" ? m : { aviso: m.aviso.replace("No hay un monitor activo", "No hay un usuario monitor activo") };
    },
  });
  errores.push(...v.errores);

  // 2) Monitores y Disponibilidad: solo los días del plan; lo demás no se usa.
  const ignoradas = libro.monitores.filter((f) => !D.has(f.dia)).length + libro.disponibilidad.filter((f) => !D.has(f.dia)).length;
  if (ignoradas) avisos.push({ hoja: "", fila: 0, mensaje: `${ignoradas} filas de Monitores o Disponibilidad monitores son de días que no están en Plan de salas: no se usan.` });
  const libroD: LibroSalas = { ...libro, monitores: libro.monitores.filter((f) => D.has(f.dia)), disponibilidad: libro.disponibilidad.filter((f) => D.has(f.dia)) };
  const rec = reconocer(libroD, monitores, new Set(mentoresDocs.map((m) => m._id)));
  errores.push(...rec.errores);
  avisos.push(...rec.avisos);
  const comb = combinarMonitores(v.fijas, rec.importados);
  errores.push(...comb.errores);
  const dispD = libro.conDisponibilidad ? rec.disponibilidad : (cfg?.disponibilidad ?? []).filter((d) => D.has(d.dia));

  // 3) Salas: las que se usan en días que no se tocan deben seguir en la hoja.
  const nuevas = new Set(libro.salas.map((s) => s.sala));
  const usadasFuera = new Map<number, Set<string>>();
  for (const p of planActual) if (!D.has(p.dia) && !nuevas.has(p.sala)) usadasFuera.set(p.sala, (usadasFuera.get(p.sala) ?? new Set()).add(p.dia));
  for (const [sala, ds] of usadasFuera)
    errores.push({ hoja: HOJAS_SALAS.salas, fila: 0, mensaje: `Falta la sala ${sala}: se usa el ${[...ds].sort().join(", ")}, que no está en Plan de salas. Agrégala con su enlace.` });

  // 4) Plan nuevo de esos días (sin cambios manuales: el archivo manda).
  const r = await calcular(libro.salas, comb.importados, dispD, session, false, { dias: D, fijas: v.fijas, sinCambiosAdmin: true });
  errores.push(...r.errores);
  avisos.push(...r.avisos);

  // 5) Protección: un bloque con evaluación guardada o asistencia marcada no cambia de sala.
  const actualD = planActual.filter((p) => D.has(p.dia));
  const conDatos = await bloquesConDatos(D, session);
  const filaDe = new Map(v.fijas.map((f) => [k(f.dia, f.hora, f.mentorId), f.fila]));
  for (const x of bloquesQueCambian(actualD, r.plan)) {
    if (x.de === null || !conDatos.has(k(x.dia, x.hora, x.mentorId))) continue;
    errores.push({ hoja: HOJAS_SALAS.plan, fila: filaDe.get(k(x.dia, x.hora, x.mentorId)) ?? 0, mensaje: `No se puede pasar a ${nombreMentor.get(x.mentorId) ?? x.mentorId} de la sala ${x.de} a la ${x.a} el ${x.dia} a las ${x.hora}:00: ese bloque ya tiene evaluación guardada o asistencia marcada.` });
  }

  const diasSinCambios = [...new Set([...planActual.map((p) => p.dia), ...horas.map((h) => h.dia)])].filter((d) => !D.has(d)).sort();
  const planFijo = resumirPlanFijo({
    dias, diasSinCambios, fijas: v.fijas, actual: actualD, nuevo: r.plan, salasActuales: cfg?.salas ?? [], salasNuevas: libro.salas,
    nombreMentor: (id) => nombreMentor.get(id) ?? id, nombreMonitor: (u) => nombreMon.get(u) ?? u, ignoradas,
  });
  if (planFijo.sinFila.length) avisos.push({ hoja: HOJAS_SALAS.plan, fila: 0, mensaje: `${planFijo.sinFila.length} bloques de mentores activos no traen fila: reciben una sala libre automática (ver la lista).` });
  if (planFijo.descartados.length) avisos.push({ hoja: "", fila: 0, mensaje: `Se descartan ${planFijo.descartados.length} cambios manuales de monitor de esos días: manda el archivo (ver la lista).` });
  if (planFijo.confirmarEnlaces) avisos.push({ hoja: HOJAS_SALAS.salas, fila: 0, mensaje: "Cambia el enlace de una sala que ya existía: también cambia en los días que no se tocan. Se pide una confirmación aparte." });

  const previa: PreviaSalas = { ...resumir(r.plan, libro.salas, monitores), errores, avisos, planFijo };
  if (errores.length) return { previa };
  const fueraD = <T extends { dia: string }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !D.has(x.dia));
  return {
    previa,
    escribir: {
      dias, plan: r.plan,
      cfg: {
        salas: libro.salas,
        importados: [...fueraD(cfg?.importados), ...comb.importados],
        disponibilidad: [...fueraD(cfg?.disponibilidad), ...dispD],
        fijos: [...fueraD(cfg?.fijos), ...v.fijas.map(sinFila)],
      },
      antes: resumenDias(actualD, dias),
      despues: `${resumenDias(r.plan, dias)} · ${planFijo.cambiosSala.length} bloques cambian de sala${planFijo.enlacesCambian.length ? ` · enlaces: ${planFijo.enlacesCambian.map((e) => `sala ${e.sala}${e.antes ? " cambia" : " nueva"}`).join(", ")}` : ""}`,
    },
  };
}

/** Vista previa del libro con hoja Plan de salas. No escribe nada. */
export async function previaPlanFijo(libro: LibroSalas): Promise<PreviaSalas> {
  return (await preparar(libro)).previa;
}

export class FallaPlanFijo extends Error {
  constructor(readonly motivo: "errores" | "confirmar_enlaces") { super(motivo); }
}

/**
 * Aplica el plan fijo en una transacción: vuelve a revisar todo (si algo cambió desde la vista previa, falla con
 * "errores"), exige `confirmarEnlaces` si cambia el enlace de una sala que ya existía, reemplaza el plan SOLO de los
 * días del archivo y guarda la configuración mezclada (lo de los demás días se conserva).
 */
export async function aplicarPlanFijo(libro: LibroSalas, actor: Actor, confirmarEnlaces = false): Promise<PreviaSalas> {
  const c = await collections();
  let previa: PreviaSalas | null = null;
  await transaccion(async (s) => {
    const p = await preparar(libro, s);
    previa = p.previa;
    if (!p.escribir) throw new FallaPlanFijo("errores");
    if (p.previa.planFijo?.confirmarEnlaces && !confirmarEnlaces) throw new FallaPlanFijo("confirmar_enlaces");
    const w = p.escribir;
    await c.planSalas.deleteMany({ dia: { $in: w.dias } }, { session: s });
    if (w.plan.length) await c.planSalas.insertMany(w.plan, { session: s });
    await c.salasConfig.replaceOne({ _id: "actual" }, { ...w.cfg, actualizadoEn: new Date() }, { upsert: true, session: s });
    await c.changeLog.insertOne({ accion: "importar_plan_salas", anterior: w.antes, nuevo: w.despues, actor, fecha: new Date() }, { session: s });
  });
  return previa!;
}

export type ResultadoAutomatico = { ok: true } | { ok: false; error: "sin_fijos" | "pasado" | "errores"; errores?: ErrorFila[] };

/**
 * «Volver a automático» de un día: quita sus salas fijas y recalcula SOLO ese día. Los monitores que fijaba el archivo
 * se conservan por mentor y hora (pasan a la hoja Monitores guardada); los bloques con evaluación o asistencia
 * conservan su sala y monitor. Deja changeLog plan_salas_automatico.
 */
export async function volverAutomatico(dia: string, actor: Actor): Promise<ResultadoAutomatico> {
  const c = await collections();
  const hoy = diaDesde();
  if (hoy && dia < hoy) return { ok: false, error: "pasado" };
  let r: ResultadoAutomatico = { ok: true };
  try {
    await transaccion(async (s) => {
      const cfg = await c.salasConfig.findOne({ _id: "actual" }, { session: s });
      const delDia = (cfg?.fijos ?? []).filter((f) => f.dia === dia);
      if (!cfg || !delDia.length) { r = { ok: false, error: "sin_fijos" }; return; }
      const dias = new Set([dia]);
      const antes = await c.planSalas.find({ dia }, { session: s }).toArray();
      const conDatos = await bloquesConDatos(dias, s);
      const protegidas: SalaFija[] = antes.filter((p) => conDatos.has(k(p.dia, p.hora, p.mentorId)))
        .map((p) => ({ dia: p.dia, hora: p.hora, mentorId: p.mentorId, sala: p.sala, monitor: p.monitor, origen: p.origen, protegido: true }));
      const yaImportado = new Set(cfg.importados.filter((f) => f.dia === dia && f.mentorId).map((f) => k(f.dia, f.hora, f.mentorId!)));
      const importados: MonitorFijo[] = [
        ...cfg.importados,
        ...delDia.filter((f) => f.monitor && !yaImportado.has(k(f.dia, f.hora, f.mentorId))).map((f) => ({ fila: 0, dia: f.dia, hora: f.hora, mentorId: f.mentorId, monitor: f.monitor! })),
      ];
      const calc = await calcular(cfg.salas, importados, cfg.disponibilidad, s, true, { dias, fijas: protegidas });
      if (calc.errores.length) { r = { ok: false, error: "errores", errores: calc.errores }; throw new FallaPlanFijo("errores"); }
      const fijos = (cfg.fijos ?? []).filter((f) => f.dia !== dia);
      await c.planSalas.deleteMany({ dia }, { session: s });
      if (calc.plan.length) await c.planSalas.insertMany(calc.plan, { session: s });
      await c.salasConfig.updateOne({ _id: "actual" }, fijos.length ? { $set: { fijos, importados, actualizadoEn: new Date() } } : { $set: { importados, actualizadoEn: new Date() }, $unset: { fijos: "" } }, { session: s });
      await c.changeLog.insertOne({
        accion: "plan_salas_automatico", anterior: resumenDias(antes, [dia]),
        nuevo: `${resumenDias(calc.plan, [dia])} · ${bloquesQueCambian(antes, calc.plan).length} bloques cambian de sala`, actor, fecha: new Date(),
      }, { session: s });
    });
  } catch (e) {
    if (e instanceof FallaPlanFijo && !r.ok) return r;
    throw e;
  }
  return r;
}

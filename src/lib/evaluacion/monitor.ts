import { MongoServerError, ObjectId, type Filter } from "mongodb";
import { ciudadesExplicitas, diasPorCiudad, puedeElegir } from "../agenda";
import type { SessionUser } from "../auth";
import { horaCO } from "../ciudades";
import { collections, transaccion } from "../db";
import { diaCOL, horaCOL, inicioUTC } from "../edicion";
import { enmascararNumero } from "../estudiante";
import { puede } from "../permisos";
import type { Actor, Asiento, Ruta } from "../types";
import { primerNombre, type MotivoInasistencia } from "./criterios";
import { criterios, idEval, resultados, salasDe, type ResultadoIntegrante } from "./datos";

// Vista del monitor en las presentaciones (Paso 12). El monitor ve SOLO los proyectos de sus salas asignadas
// (plan de salas: día, hora y mentor), de cualquier ciudad. Ahí ve el contacto, marca si cada integrante se
// presentó, registra el motivo de inasistencia y una observación, reprograma a un cupo libre de la ciudad del
// estudiante en sus días habilitados o, fuera de eso, sugiere el cambio (el admin lo resuelve en el Paso 14).
// Todo deja changeLog. Sus anotaciones van en `evaluacion_monitor` y no cambian el resultado del mentor.

export type Asistencia = "si" | "no";
export type EvalMonitor = {
  _id: string; // `${proyectoId}|${documento}`, igual que la evaluación
  proyectoId: ObjectId;
  documento: string;
  asistencia: Asistencia | null;
  motivo: MotivoInasistencia | null;
  observacion: string;
  actualizadoEn: Date;
  actualizadoPor: string;
};
export type CambioSugerido = {
  _id?: ObjectId;
  proyectoId: ObjectId;
  /** Hora que tenía al sugerir ("2026-11-12 8:15 a. m."). */
  anterior: string;
  detalle: string;
  motivo: string;
  estado: "pendiente" | "aprobado" | "rechazado";
  creadoPor: string;
  creadoEn: Date;
};

const actorDe = (u: SessionUser): Actor => ({ rol: u.rol, usuario: u.usuario });
const etiqueta = (inicio: Date) => `${diaCOL(inicio)} ${horaCO(inicio)}`;

/** Salas del monitor (día, hora y mentor de cada una). Sin el permiso, ninguna. */
async function salasDelMonitor(user: SessionUser) {
  if (!puede(user.rol, "monitorear_salas")) return [];
  const { planSalas } = await collections();
  return planSalas.find({ monitor: user.usuario }).sort({ dia: 1, hora: 1, sala: 1 }).toArray();
}

/** ¿El asiento cae en una sala de este monitor? (mismo día, hora y mentor). */
async function esDeSuSala(user: SessionUser, a: Pick<Asiento, "inicio" | "mentorId">): Promise<boolean> {
  if (!puede(user.rol, "monitorear_salas")) return false;
  const { planSalas } = await collections();
  return !!(await planSalas.findOne({ dia: diaCOL(a.inicio), hora: horaCOL(a.inicio), mentorId: a.mentorId, monitor: user.usuario }, { projection: { _id: 1 } }));
}

export type IntegranteSala = ResultadoIntegrante & { asistencia: Asistencia | null };
export type FilaSala = {
  id: string; codigo: string; proyecto: string; ciudad: string; ruta?: Ruta;
  dia: string; inicio: string; mentorId: string; pareja: boolean;
  integrantes: IntegranteSala[]; destacado: boolean; sugerencia: boolean;
};
export type SalaMonitor = { dia: string; hora: number; inicio: string; sala: number; mentorId: string; mentor: string; enlace?: string };

/** Sus salas por día y hora (también las que no tienen estudiantes) y los proyectos de cada una. */
export async function listaSalas(user: SessionUser): Promise<{ salas: SalaMonitor[]; filas: FilaSala[] }> {
  const plan = await salasDelMonitor(user);
  if (!plan.length) return { salas: [], filas: [] };
  const c = await collections();
  // Asientos ocupados en la hora de cada sala, con el mentor de esa sala.
  const asis = await c.asientos.find({
    proyectoId: { $type: "objectId" },
    $or: plan.map((p) => ({ mentorId: p.mentorId, inicio: { $gte: inicioUTC(p.dia, p.hora), $lt: inicioUTC(p.dia, p.hora + 1) } })),
  }).sort({ inicio: 1 }).toArray();
  const ids = asis.map((a) => a.proyectoId!);
  const [lista, evals, notas, sugeridos, mentores, crit, salaDe] = await Promise.all([
    c.proyectos.find({ _id: { $in: ids } }).toArray(),
    c.evalResultados.find({ proyectoId: { $in: ids } }).toArray(),
    c.evalMonitor.find({ proyectoId: { $in: ids } }).toArray(),
    c.cambiosSugeridos.find({ proyectoId: { $in: ids }, estado: "pendiente" }, { projection: { proyectoId: 1 } }).toArray(),
    c.mentores.find({ _id: { $in: [...new Set(plan.map((p) => p.mentorId))] } }).toArray(),
    criterios(), salasDe(plan.map((p) => ({ inicio: inicioUTC(p.dia, p.hora), mentorId: p.mentorId }))),
  ]);
  const nombre = new Map(mentores.map((m) => [m._id, m.nombre]));
  const salas: SalaMonitor[] = plan.map((p) => {
    const inicio = inicioUTC(p.dia, p.hora), enlace = salaDe({ inicio, mentorId: p.mentorId }).enlace;
    return { dia: p.dia, hora: p.hora, inicio: inicio.toISOString(), sala: p.sala, mentorId: p.mentorId, mentor: nombre.get(p.mentorId) ?? p.mentorId, ...(enlace ? { enlace } : {}) };
  });
  const porId = new Map(lista.map((p) => [String(p._id), p]));
  const ev = new Map(evals.map((e) => [e._id, e]));
  const nota = new Map(notas.map((n) => [n._id, n]));
  const conSugerencia = new Set(sugeridos.map((x) => String(x.proyectoId)));
  const filas: FilaSala[] = [];
  for (const a of asis) {
    const p = porId.get(String(a.proyectoId));
    if (!p) continue;
    filas.push({
      id: String(p._id), codigo: p.codigo, proyecto: p.nombre, ciudad: p.ciudad, ...(p.ruta ? { ruta: p.ruta } : {}),
      dia: diaCOL(a.inicio), inicio: a.inicio.toISOString(), mentorId: a.mentorId, pareja: p.integrantes.length > 1,
      integrantes: resultados(p, ev, p._id, crit, nota).map((x, i) => ({ ...x, asistencia: nota.get(idEval(p._id, p.integrantes[i]!.documento))?.asistencia ?? null })),
      destacado: p.integrantes.some((x) => ev.get(idEval(p._id, x.documento))?.destacado),
      sugerencia: conSugerencia.has(String(p._id)),
    });
  }
  filas.sort((x, y) => x.inicio.localeCompare(y.inicio) || x.integrantes[0]!.nombre.localeCompare(y.integrantes[0]!.nombre, "es"));
  return { salas, filas };
}

type ErrorSala = { error: "no_existe" | "sin_hora" | "otra_sala" };

/** El proyecto y su asiento, solo si está en una sala del monitor. */
async function cargar(user: SessionUser, proyectoId: string) {
  if (!ObjectId.isValid(proyectoId)) return { error: "no_existe" } as ErrorSala;
  const { proyectos, asientos } = await collections();
  const _id = new ObjectId(proyectoId);
  const [p, asiento] = await Promise.all([proyectos.findOne({ _id }), asientos.findOne({ proyectoId: _id })]);
  if (!p) return { error: "no_existe" } as ErrorSala;
  if (!asiento) return { error: "sin_hora" } as ErrorSala;
  if (!(await esDeSuSala(user, asiento))) return { error: "otra_sala" } as ErrorSala;
  return { p, asiento };
}

export type DetalleSala = {
  id: string; codigo: string; proyecto: string; descripcion?: string; ciudad: string; ruta?: Ruta;
  dia: string; inicio: string; mentor: string; sala?: number; enlace?: string;
  integrantes: (IntegranteSala & {
    documento: string; correo?: string; celular?: string;
    observacion: string; retro?: string;
  })[];
  /** Ya hay una evaluación guardada: no se reprograma (se perdería o quedaría con otro mentor). */
  evaluado: boolean;
  sugerencia: { detalle: string; motivo: string; creadoEn: string } | null;
};

export async function detalleSala(user: SessionUser, proyectoId: string): Promise<DetalleSala | ErrorSala> {
  const r = await cargar(user, proyectoId);
  if ("error" in r) return r;
  const { p, asiento } = r;
  const c = await collections();
  const [evals, notas, sugerencia, mentor, crit, salaDe] = await Promise.all([
    c.evalResultados.find({ proyectoId: p._id }).toArray(),
    c.evalMonitor.find({ proyectoId: p._id }).toArray(),
    c.cambiosSugeridos.findOne({ proyectoId: p._id, estado: "pendiente" }),
    c.mentores.findOne({ _id: asiento.mentorId }),
    criterios(), salasDe([asiento]),
  ]);
  const ev = new Map(evals.map((e) => [e._id, e]));
  const nota = new Map(notas.map((n) => [n._id, n]));
  return {
    id: String(p._id), codigo: p.codigo, proyecto: p.nombre, ...(p.descripcion ? { descripcion: p.descripcion } : {}),
    ciudad: p.ciudad, ...(p.ruta ? { ruta: p.ruta } : {}),
    dia: diaCOL(asiento.inicio), inicio: asiento.inicio.toISOString(), mentor: mentor?.nombre ?? asiento.mentorId, ...salaDe(asiento),
    integrantes: resultados(p, ev, p._id, crit, nota).map((x, i) => {
      const it = p.integrantes[i]!, k = idEval(p._id, it.documento), e = ev.get(k), n = nota.get(k);
      const retro = e && !e.noPresento ? [e.fortaleza, e.mejora].filter(Boolean).join(" · ") : "";
      return {
        ...x, asistencia: n?.asistencia ?? null, observacion: n?.observacion ?? "",
        // Contacto completo para llamar o escribir; el documento sigue enmascarado (no es contacto).
        documento: enmascararNumero(it.documento), ...(it.correo ? { correo: it.correo } : {}), ...(it.celular ? { celular: it.celular } : {}),
        ...(retro ? { retro } : {}),
      };
    }),
    evaluado: evals.some((e) => !e.noPresento),
    sugerencia: sugerencia ? { detalle: sugerencia.detalle, motivo: sugerencia.motivo, creadoEn: sugerencia.creadoEn.toISOString() } : null,
  };
}

export type Nota = { asistencia: Asistencia | null; motivo: MotivoInasistencia | null; observacion: string };

/** "Guardar" de un integrante: si se presentó, motivo de inasistencia y observación. No toca la evaluación del mentor. */
class FueraDeSala extends Error {}

export async function anotar(user: SessionUser, proyectoId: string, i: number, nota: Nota): Promise<{ ok: true } | ErrorSala | { error: "integrantes" }> {
  const r = await cargar(user, proyectoId);
  if ("error" in r) return r;
  const x = r.p.integrantes[i];
  if (!x) return { error: "integrantes" };
  // Quien se presentó no lleva motivo de inasistencia.
  const motivo = nota.asistencia === "si" ? null : nota.motivo;
  const c = await collections(), ahora = new Date();
  try {
    await transaccion(async (s) => {
      // Sigue en el mismo asiento (y por tanto en su sala); escribir en él choca con una reprogramación simultánea.
      if (!(await c.asientos.findOneAndUpdate({ _id: r.asiento._id, proyectoId: r.p._id }, { $inc: { rev: 1 } }, { session: s, projection: { _id: 1 } }))) throw new FueraDeSala();
      await c.evalMonitor.updateOne({ _id: idEval(r.p._id, x.documento) }, {
        $set: { asistencia: nota.asistencia, motivo, observacion: nota.observacion, actualizadoEn: ahora, actualizadoPor: user.usuario },
        $setOnInsert: { proyectoId: r.p._id, documento: x.documento },
      }, { upsert: true, session: s });
      const asis = nota.asistencia === "si" ? "se presentó" : nota.asistencia === "no" ? "no se presentó" : "asistencia sin marcar";
      await c.changeLog.insertOne({
        proyectoId: r.p._id, accion: "nota_monitor", actor: actorDe(user), fecha: ahora,
        nuevo: [`${primerNombre(x.nombre)}: ${asis}`, motivo, nota.observacion ? "con observación" : null].filter(Boolean).join(" · "),
      }, { session: s });
    });
  } catch (e) {
    if (e instanceof FueraDeSala) return { error: "otra_sala" };
    throw e;
  }
  return { ok: true };
}

export type CupoLibre = { id: string; inicio: string; mentor: string };

/** Días en que el monitor puede reprogramar directamente: los habilitados para la ciudad del estudiante y ya abiertos. */
async function diasPermitidos(ciudad: string, ahora: Date): Promise<string[]> {
  const { dias } = await collections();
  const todos = await dias.find({}).toArray();
  const explicitas = ciudadesExplicitas(todos);
  return diasPorCiudad(todos, ciudad).filter((d) => puedeElegir(todos.find((x) => x._id === d), ciudad, ahora, explicitas));
}

const filtroLibre = (ciudad: string, dias: string[], ahora: Date): Filter<Asiento> =>
  ({ proyectoId: null, ciudades: ciudad, dia: { $in: dias }, inicio: { $gt: ahora } });

/** Cupos libres para reprogramar: de la ciudad del estudiante, en sus días habilitados y aún no empezados. */
export async function cuposReprogramar(user: SessionUser, proyectoId: string): Promise<{ ciudad: string; cupos: CupoLibre[] } | ErrorSala> {
  const r = await cargar(user, proyectoId);
  if ("error" in r) return r;
  const ahora = new Date(), c = await collections();
  const libres = await c.asientos.find(filtroLibre(r.p.ciudad, await diasPermitidos(r.p.ciudad, ahora), ahora)).sort({ inicio: 1, mentorId: 1 }).toArray();
  const nombre = new Map((await c.mentores.find({ _id: { $in: [...new Set(libres.map((a) => a.mentorId))] } }).toArray()).map((m) => [m._id, m.nombre]));
  return {
    ciudad: r.p.ciudad,
    cupos: libres.map((a) => ({ id: String(a._id), inicio: a.inicio.toISOString(), mentor: nombre.get(a.mentorId) ?? a.mentorId }))
      .sort((x, y) => x.inicio.localeCompare(y.inicio) || x.mentor.localeCompare(y.mentor, "es")),
  };
}

class Falla extends Error { constructor(readonly codigo: "sin_cupo" | "ya_evaluado" | "cambio") { super(codigo); } }

/**
 * Reprograma a un cupo libre (de su ciudad, día habilitado, futuro). En una transacción: libera el asiento
 * actual, toma el nuevo y deja changeLog. Como el prototipo, quien estaba como "No se presentó" vuelve a
 * Pendiente (y la asistencia que marcó el monitor se borra; motivo y observación quedan). El borrador del
 * mentor anterior se descarta. Si ya hay una evaluación guardada, no se reprograma.
 */
export async function reprogramar(user: SessionUser, proyectoId: string, asientoId: string, motivo: string): Promise<{ ok: true; inicio: string; mentor: string; sigueEnTusSalas: boolean } | ErrorSala | { error: "sin_cupo" | "ya_evaluado" | "cambio" }> {
  const r = await cargar(user, proyectoId);
  if ("error" in r) return r;
  if (!ObjectId.isValid(asientoId)) return { error: "sin_cupo" };
  const { p, asiento: viejo } = r;
  const ahora = new Date(), c = await collections();
  const dias = await diasPermitidos(p.ciudad, ahora);
  let nuevo: Asiento | null = null;
  try {
    await transaccion(async (s) => {
      if (await c.evalResultados.findOne({ proyectoId: p._id, noPresento: false }, { session: s, projection: { _id: 1 } })) throw new Falla("ya_evaluado");
      // El asiento actual tiene que seguir siendo el mismo (nadie lo movió mientras tanto).
      const suelto = await c.asientos.findOneAndUpdate({ _id: viejo._id, proyectoId: p._id }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } }, { session: s });
      if (!suelto) throw new Falla("cambio");
      nuevo = await c.asientos.findOneAndUpdate({ _id: new ObjectId(asientoId), ...filtroLibre(p.ciudad, dias, ahora) },
        { $set: { proyectoId: p._id, reservadoEn: ahora } }, { session: s, returnDocument: "after" });
      if (!nuevo) throw new Falla("sin_cupo");
      await c.evalResultados.deleteMany({ proyectoId: p._id }, { session: s }); // solo quedaban "No se presentó"
      await c.evalMonitor.updateMany({ proyectoId: p._id }, { $set: { asistencia: null, actualizadoEn: ahora, actualizadoPor: user.usuario } }, { session: s });
      await c.evalBorradores.deleteOne({ _id: String(p._id) }, { session: s });
      await c.changeLog.insertOne({
        proyectoId: p._id, accion: "cambiar_hora", anterior: `${etiqueta(viejo.inicio)} · ${viejo.mentorId}`,
        nuevo: `${etiqueta(nuevo.inicio)} · ${nuevo.mentorId}`, motivo, actor: actorDe(user), fecha: ahora,
      }, { session: s });
    });
  } catch (e) {
    if (e instanceof Falla) return { error: e.codigo };
    // Un estudiante reservó ese mismo asiento en el mismo instante.
    if (e instanceof MongoServerError && e.code === 11000) return { error: "sin_cupo" };
    throw e;
  }
  const n = nuevo as Asiento | null;
  if (!n) return { error: "sin_cupo" };
  const mentor = await c.mentores.findOne({ _id: n.mentorId });
  return { ok: true, inicio: n.inicio.toISOString(), mentor: mentor?.nombre ?? n.mentorId, sigueEnTusSalas: await esDeSuSala(user, n) };
}

/** Cambio especial (otro día, otra ciudad, después de la clausura): queda pendiente para el admin (Paso 14). */
export async function sugerirCambio(user: SessionUser, proyectoId: string, detalle: string, motivo: string): Promise<{ ok: true } | ErrorSala | { error: "ya_sugerido" }> {
  const r = await cargar(user, proyectoId);
  if ("error" in r) return r;
  const c = await collections(), ahora = new Date();
  try {
    await transaccion(async (s) => {
      await c.cambiosSugeridos.insertOne({
        proyectoId: r.p._id, anterior: etiqueta(r.asiento.inicio), detalle, motivo, estado: "pendiente", creadoPor: user.usuario, creadoEn: ahora,
      }, { session: s });
      await c.changeLog.insertOne({ proyectoId: r.p._id, accion: "sugerir_cambio", anterior: etiqueta(r.asiento.inicio), nuevo: detalle, motivo, actor: actorDe(user), fecha: ahora }, { session: s });
    });
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000) return { error: "ya_sugerido" };
    throw e;
  }
  return { ok: true };
}

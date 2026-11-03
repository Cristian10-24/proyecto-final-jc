import { ObjectId, type ClientSession } from "mongodb";
import type { SessionUser } from "../auth";
import { collections, transaccion } from "../db";
import { diaCOL, horaCOL } from "../edicion";
import { enmascararNumero } from "../estudiante";
import { puede } from "../permisos";
import { esHttps } from "../planSalas";
import type { Actor, Proyecto, Ruta } from "../types";
import {
  calc, CRITERIOS_DEFECTO, faltantes, primerNombre,
  type Borrador, type Criterios, type Formulario, type PartesA, type PartesB, type Resultado,
} from "./criterios";

// Evaluación en la base. Una evaluación por integrante (como el prototipo): en pareja la Parte A, el cierre
// y el destacado se copian a los dos; la Parte B y "No se presentó" son de cada uno.
// El mentor solo evalúa los proyectos cuyo asiento es suyo; coordinación y admin solo leen.
// El borrador no cuenta para el resultado: sigue Pendiente hasta "Guardar evaluación".

export type EvalResultado = {
  _id: string; // `${proyectoId}|${documento}`
  proyectoId: ObjectId;
  documento: string;
  mentorId: string;
  a: PartesA;
  b: PartesB;
  destacado: boolean;
  fortaleza: string;
  mejora: string;
  percepcion: string;
  noPresento: boolean;
  noPresentoEn?: Date;
  actualizadoEn: Date;
  actualizadoPor: string;
};
export type EvalBorrador = { _id: string; usuario: string; datos: Borrador; actualizadoEn: Date };
export type EvalConfig = { _id: "criterios"; exA: number; exB: number; actualizadoEn: Date };

const idEval = (proyectoId: ObjectId, documento: string) => `${proyectoId.toHexString()}|${documento}`;
const actorDe = (u: SessionUser): Actor => ({ rol: u.rol, usuario: u.usuario });

/** Si el proyecto cambió de mentor mientras se guardaba, se aborta la transacción. */
class CambioMentor extends Error {}
async function sigueSiendoSuyo(proyectoId: ObjectId, mentorId: string, session: ClientSession) {
  const { asientos } = await collections();
  if ((await asientos.findOne({ proyectoId }, { session, projection: { mentorId: 1 } }))?.mentorId !== mentorId) throw new CambioMentor();
}
async function enTransaccion(fn: (s: ClientSession) => Promise<void>): Promise<boolean> {
  try { await transaccion(fn); return true; } catch (e) { if (e instanceof CambioMentor) return false; throw e; }
}

export async function criterios(): Promise<Criterios> {
  const { evalConfig } = await collections();
  const c = await evalConfig.findOne({ _id: "criterios" });
  return c ? { exA: c.exA, exB: c.exB } : CRITERIOS_DEFECTO;
}

/** Sala y enlace del mentor en la hora de cada asiento (del plan de salas; vacío si aún no hay plan). */
async function salasDe(asientos: { inicio: Date; mentorId: string }[]): Promise<(a: { inicio: Date; mentorId: string }) => { sala?: number; enlace?: string }> {
  const { planSalas, salasConfig } = await collections();
  const dias = [...new Set(asientos.map((a) => diaCOL(a.inicio)))];
  const [plan, cfg] = await Promise.all([planSalas.find({ dia: { $in: dias } }).toArray(), salasConfig.findOne({ _id: "actual" })]);
  const sala = new Map(plan.map((p) => [`${p.dia}|${p.hora}|${p.mentorId}`, p.sala]));
  const enlace = new Map((cfg?.salas ?? []).filter((x) => esHttps(x.enlace)).map((x) => [x.sala, x.enlace]));
  return (a) => {
    const n = sala.get(`${diaCOL(a.inicio)}|${horaCOL(a.inicio)}|${a.mentorId}`);
    return n === undefined ? {} : { sala: n, ...(enlace.has(n) ? { enlace: enlace.get(n)! } : {}) };
  };
}

/** Mentores con proyectos (para que coordinación y admin elijan a quién ver). */
export async function mentoresConProyectos(): Promise<{ id: string; nombre: string }[]> {
  const { asientos, mentores } = await collections();
  const ids: string[] = await asientos.distinct("mentorId", { proyectoId: { $type: "objectId" } });
  const lista = await mentores.find({ _id: { $in: ids } }).toArray();
  return lista.map((m) => ({ id: m._id, nombre: m.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export type ResultadoIntegrante = { i: number; nombre: string; res: Resultado; a: number | null; b: number | null; nb: number };
export type FilaEvaluacion = {
  id: string; codigo: string; proyecto: string; ciudad: string; ruta?: Ruta;
  dia: string; inicio: string; mentorId: string; pareja: boolean; sala?: number; enlace?: string;
  integrantes: ResultadoIntegrante[]; destacado: boolean; borrador: boolean;
};

/** ¿Quién ve las evaluaciones de qué mentor? El mentor, solo las suyas; coordinación y admin, todas. */
function mentorVisible(user: SessionUser, mentorId?: string): string | null | undefined {
  if (puede(user.rol, "ver_evaluaciones")) return mentorId; // undefined = todos
  if (puede(user.rol, "evaluar")) return user.mentorId ?? null; // null = ninguno (usuario sin mentor)
  return null;
}

function resultados(p: Pick<Proyecto, "integrantes">, evals: Map<string, EvalResultado>, pId: ObjectId, crit: Criterios): ResultadoIntegrante[] {
  return p.integrantes.map((x, i) => ({ i, nombre: x.nombre, ...calc(evals.get(idEval(pId, x.documento)), crit) }));
}

/** Proyectos con hora de un mentor (o de todos), opcionalmente de un día, ordenados por hora y nombre. */
export async function listaEvaluaciones(user: SessionUser, filtro: { dia?: string; mentor?: string } = {}): Promise<FilaEvaluacion[]> {
  const mentorId = mentorVisible(user, filtro.mentor);
  if (mentorId === null) return [];
  const { asientos, proyectos, evalResultados, evalBorradores } = await collections();
  const asis = await asientos.find({ proyectoId: { $type: "objectId" }, ...(mentorId ? { mentorId } : {}), ...(filtro.dia ? { dia: filtro.dia } : {}) })
    .sort({ inicio: 1 }).toArray();
  const ids = asis.map((a) => a.proyectoId!);
  const [lista, evals, borradores, crit, salaDe] = await Promise.all([
    proyectos.find({ _id: { $in: ids } }).toArray(),
    evalResultados.find({ proyectoId: { $in: ids } }).toArray(),
    evalBorradores.find({ _id: { $in: ids.map((x) => x.toHexString()) } }, { projection: { _id: 1 } }).toArray(),
    criterios(), salasDe(asis),
  ]);
  const porId = new Map(lista.map((p) => [String(p._id), p]));
  const ev = new Map(evals.map((e) => [e._id, e]));
  const conBorrador = new Set(borradores.map((b) => b._id));
  const filas: FilaEvaluacion[] = [];
  for (const a of asis) {
    const p = porId.get(String(a.proyectoId));
    if (!p) continue;
    filas.push({
      id: String(p._id), codigo: p.codigo, proyecto: p.nombre, ciudad: p.ciudad, ...(p.ruta ? { ruta: p.ruta } : {}),
      dia: diaCOL(a.inicio), inicio: a.inicio.toISOString(), mentorId: a.mentorId, pareja: p.integrantes.length > 1, ...salaDe(a),
      integrantes: resultados(p, ev, p._id, crit),
      destacado: p.integrantes.some((x) => ev.get(idEval(p._id, x.documento))?.destacado),
      borrador: conBorrador.has(String(p._id)),
    });
  }
  return filas.sort((x, y) => x.inicio.localeCompare(y.inicio) || x.integrantes[0]!.nombre.localeCompare(y.integrantes[0]!.nombre, "es"));
}

export type DetalleEvaluacion = {
  id: string; codigo: string; proyecto: string; descripcion?: string; ciudad: string; ruta?: Ruta;
  dia: string; inicio: string; mentorId: string; editable: boolean; sala?: number; enlace?: string;
  integrantes: (ResultadoIntegrante & { documento: string; noPresento: boolean })[];
  /** Lo guardado, armado como formulario (A y cierre de quien ya los tenga, como el prototipo). */
  guardado: Formulario;
  borrador: Borrador | null;
  /** Última vez que se guardó (para descartar copias locales más viejas). */
  guardadoEn: string | null;
  criterios: Criterios;
};

type ErrorLectura = { error: "no_existe" | "otro_mentor" | "sin_hora" };

/** El proyecto y su asiento, si el usuario puede verlo (y si puede evaluarlo). */
async function cargar(user: SessionUser, proyectoId: string) {
  if (!ObjectId.isValid(proyectoId)) return { error: "no_existe" } as ErrorLectura;
  const { proyectos, asientos } = await collections();
  const _id = new ObjectId(proyectoId);
  const [p, asiento] = await Promise.all([proyectos.findOne({ _id }), asientos.findOne({ proyectoId: _id })]);
  if (!p) return { error: "no_existe" } as ErrorLectura;
  if (!asiento) return { error: "sin_hora" } as ErrorLectura;
  const mentorId = mentorVisible(user, asiento.mentorId);
  if (mentorId !== asiento.mentorId) return { error: "otro_mentor" } as ErrorLectura;
  const editable = puede(user.rol, "evaluar") && user.mentorId === asiento.mentorId;
  return { p, asiento, editable };
}

export async function detalleEvaluacion(user: SessionUser, proyectoId: string): Promise<DetalleEvaluacion | ErrorLectura> {
  const r = await cargar(user, proyectoId);
  if ("error" in r) return r;
  const { p, asiento, editable } = r;
  const { evalResultados, evalBorradores } = await collections();
  const [evals, borrador, crit, salaDe] = await Promise.all([
    evalResultados.find({ proyectoId: p._id }).toArray(),
    editable ? evalBorradores.findOne({ _id: String(p._id) }) : null,
    criterios(), salasDe([asiento]),
  ]);
  const ev = new Map(evals.map((e) => [e._id, e]));
  const propios = p.integrantes.map((x) => ev.get(idEval(p._id, x.documento)));
  const conA = propios.find((e) => e && Object.keys(e.a).length);
  const conCierre = propios.find((e) => e && (e.fortaleza || e.mejora || e.percepcion));
  // El borrador solo se ofrece si es más nuevo que lo guardado.
  const ultimo = Math.max(0, ...propios.map((e) => e?.actualizadoEn.getTime() ?? 0));
  return {
    id: String(p._id), codigo: p.codigo, proyecto: p.nombre, ...(p.descripcion ? { descripcion: p.descripcion } : {}),
    ciudad: p.ciudad, ...(p.ruta ? { ruta: p.ruta } : {}),
    dia: diaCOL(asiento.inicio), inicio: asiento.inicio.toISOString(), mentorId: asiento.mentorId, editable, ...salaDe(asiento),
    integrantes: resultados(p, ev, p._id, crit).map((x, i) => ({ ...x, documento: enmascararNumero(p.integrantes[i]!.documento), noPresento: !!propios[i]?.noPresento })),
    guardado: {
      a: conA?.a ?? {}, b: propios.map((e) => (e && !e.noPresento ? e.b : {})),
      destacado: propios.some((e) => e?.destacado),
      fortaleza: conCierre?.fortaleza ?? "", mejora: conCierre?.mejora ?? "", percepcion: conCierre?.percepcion ?? "",
    },
    borrador: borrador && borrador.actualizadoEn.getTime() > ultimo ? borrador.datos : null,
    guardadoEn: ultimo ? new Date(ultimo).toISOString() : null,
    criterios: crit,
  };
}

type ErrorEscritura = ErrorLectura | { error: "solo_lectura" | "integrantes" | "todos_no_presento" } | { error: "faltan"; faltan: string[] };

async function cargarEditable(user: SessionUser, proyectoId: string) {
  const r = await cargar(user, proyectoId);
  if ("error" in r) return r;
  return r.editable ? r : ({ error: "solo_lectura" } as const);
}

/** "Guardar evaluación": exige A completa y mínimo 2 temas de B por integrante presente. Borra el borrador. */
export async function guardarEvaluacion(user: SessionUser, proyectoId: string, f: Formulario): Promise<{ ok: true; resultados: ResultadoIntegrante[] } | ErrorEscritura> {
  const r = await cargarEditable(user, proyectoId);
  if ("error" in r) return r;
  const { p, asiento } = r;
  if (f.b.length !== p.integrantes.length) return { error: "integrantes" };
  const c = await collections();
  const previos = new Map((await c.evalResultados.find({ proyectoId: p._id }).toArray()).map((e) => [e._id, e]));
  // Como el prototipo: quien está como "No se presentó" y no tiene temas de B sigue así.
  const omitir = p.integrantes.map((x, i) => !!previos.get(idEval(p._id, x.documento))?.noPresento && !Object.keys(f.b[i]!).length);
  if (omitir.every(Boolean)) return { error: "todos_no_presento" };
  const faltan = faltantes(f.a, p.integrantes.map((x, i) => ({ nombre: x.nombre, b: f.b[i]!, omitir: omitir[i]! })));
  if (faltan.length) return { error: "faltan", faltan };

  const ahora = new Date(), crit = await criterios();
  const nuevos: EvalResultado[] = p.integrantes.flatMap((x, i) => omitir[i] ? [] : [{
    _id: idEval(p._id, x.documento), proyectoId: p._id, documento: x.documento, mentorId: asiento.mentorId,
    a: f.a, b: f.b[i]!, destacado: f.destacado, fortaleza: f.fortaleza, mejora: f.mejora, percepcion: f.percepcion,
    noPresento: false, actualizadoEn: ahora, actualizadoPor: user.usuario,
  }]);
  const ok = await enTransaccion(async (s) => {
    await sigueSiendoSuyo(p._id, asiento.mentorId, s);
    for (const e of nuevos) await c.evalResultados.replaceOne({ _id: e._id }, e, { upsert: true, session: s });
    await c.evalBorradores.deleteOne({ _id: String(p._id) }, { session: s });
    await c.changeLog.insertOne({
      proyectoId: p._id, accion: "evaluar", actor: actorDe(user), fecha: ahora,
      nuevo: nuevos.map((e) => `${primerNombre(p.integrantes.find((x) => x.documento === e.documento)!.nombre)}: ${calc(e, crit).res}`).join(" · ") + (f.destacado ? " · destacado" : ""),
    }, { session: s });
  });
  if (!ok) return { error: "otro_mentor" };
  const ev = new Map([...previos, ...nuevos.map((e) => [e._id, e] as const)]);
  return { ok: true, resultados: resultados(p, ev, p._id, crit) };
}

/** Borrador automático mientras califica. Solo el mentor del proyecto; no cambia el resultado. */
export async function guardarBorrador(user: SessionUser, proyectoId: string, datos: Borrador): Promise<{ ok: true } | ErrorEscritura> {
  const r = await cargarEditable(user, proyectoId);
  if ("error" in r) return r;
  if (datos.b && datos.b.length !== r.p.integrantes.length) return { error: "integrantes" };
  const { evalBorradores } = await collections();
  await evalBorradores.replaceOne({ _id: String(r.p._id) }, { usuario: user.usuario, datos, actualizadoEn: new Date() }, { upsert: true });
  return { ok: true };
}

/**
 * "No se presentó" de un integrante (borra su Parte B) o "Deshacer" (vuelve a poder calificarse;
 * conserva la Parte A y el cierre, como el prototipo).
 */
export async function marcarAsistencia(user: SessionUser, proyectoId: string, i: number, noPresento: boolean): Promise<{ ok: true; resultados: ResultadoIntegrante[] } | ErrorEscritura> {
  const r = await cargarEditable(user, proyectoId);
  if ("error" in r) return r;
  const { p, asiento } = r;
  const x = p.integrantes[i];
  if (!x) return { error: "integrantes" };
  const c = await collections();
  const _id = idEval(p._id, x.documento), ahora = new Date();
  const ok = await enTransaccion(async (s) => {
    await sigueSiendoSuyo(p._id, asiento.mentorId, s);
    if (noPresento)
      await c.evalResultados.updateOne({ _id }, {
        $set: { b: {}, noPresento: true, noPresentoEn: ahora, mentorId: asiento.mentorId, actualizadoEn: ahora, actualizadoPor: user.usuario },
        $setOnInsert: { proyectoId: p._id, documento: x.documento, a: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "" },
      }, { upsert: true, session: s });
    else
      await c.evalResultados.updateOne({ _id }, { $set: { noPresento: false, actualizadoEn: ahora, actualizadoPor: user.usuario }, $unset: { noPresentoEn: "" } }, { session: s });
    await c.changeLog.insertOne({ proyectoId: p._id, accion: noPresento ? "no_presento" : "presente", nuevo: x.nombre, actor: actorDe(user), fecha: ahora }, { session: s });
  });
  if (!ok) return { error: "otro_mentor" };
  const [evals, crit] = await Promise.all([c.evalResultados.find({ proyectoId: p._id }).toArray(), criterios()]);
  return { ok: true, resultados: resultados(p, new Map(evals.map((e) => [e._id, e])), p._id, crit) };
}

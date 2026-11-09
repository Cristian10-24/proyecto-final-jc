import { MongoServerError, ObjectId, type Filter } from "mongodb";
import { ciudadesDelDia, ciudadesExplicitas, diasPorCiudad } from "./agenda";
import { horaCO } from "./ciudades";
import { conteoComentarios } from "./comentarios";
import { revertible } from "./edicionEstudiante";
import { collections, transaccion } from "./db";
import { diaCOL } from "./edicion";
import { calc } from "./evaluacion/criterios";
import { criterios } from "./evaluacion/datos";
import { enmascararNumero } from "./estudiante";
import { conCandado, modoOrdenLlegada, topeDeDia } from "./modoCupos";
import { Falla, liberarProyecto, moverProyecto } from "./mover";
import type { Actor, Asiento, Proyecto } from "./types";

// Acciones del admin sobre horas, asientos y monitores. Toda acción deja registro en changeLog.
// Liberar y cambiar la hora van en transacción, con la lógica común de mover.ts (también la usa el tablero).

const etiqueta = (inicio: Date) => `${diaCOL(inicio)} ${horaCO(inicio)}`;
export const claveGrupo = (ciudades: string[]) => (ciudades.length ? [...ciudades].sort((a, b) => a.localeCompare(b, "es")).join(" + ") : "(sin ciudad)");

export type FilaProyecto = {
  id: string; codigo: string; nombre: string; ciudad: string; grupo?: string;
  integrantes: { nombre: string; documento: string }[];
  monitor: string | null;
  hora: { inicio: string; mentor: string } | null;
  /** Tiene evaluación guardada (no se mueve ni se libera; el admin puede anularla). */
  evaluado: boolean;
  /** Última vez que se guardó la evaluación: el admin anula esa versión y no otra más nueva. */
  evaluadoEn?: string;
  /** Paso 21: marcado «Sin proyecto» (no recibe hora ni cuenta en el seguimiento). */
  sinProyecto?: { desde: string; motivo?: string };
  /** Paso 22: comentarios de seguimiento (sin los borrados). */
  comentarios: number;
};

export type FiltroProyectos = { q?: string; ciudad?: string; estado?: "con_hora" | "sin_hora" | "sin_monitor" | "sin_proyecto" };

/** Lista para el tablero del admin (máx. 200). El admin sí ve mentor y documento completo. */
export async function listarProyectos(f: FiltroProyectos): Promise<FilaProyecto[]> {
  const { proyectos, asientos, mentores } = await collections();
  const filtro: Filter<Proyecto> = {};
  if (f.ciudad) filtro.ciudad = f.ciudad;
  if (f.estado === "sin_monitor") filtro.monitor = null;
  // Paso 21: "Sin hora" no muestra los marcados «Sin proyecto» (tienen su propio filtro).
  if (f.estado === "sin_proyecto") filtro.sinProyecto = { $exists: true };
  if (f.estado === "sin_hora") filtro.sinProyecto = { $exists: false };
  if (f.q) {
    const re = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filtro.$or = [{ nombre: re }, { codigo: re }, { "integrantes.nombre": re }, { "integrantes.documento": re }];
  }
  if (f.estado === "con_hora" || f.estado === "sin_hora") {
    // Se filtra en Mongo (no después del límite), con los proyectos que tienen asiento.
    const conHora = (await asientos.distinct("proyectoId", { proyectoId: { $type: "objectId" } })).filter((x): x is ObjectId => x !== null);
    filtro._id = f.estado === "con_hora" ? { $in: conHora } : { $nin: conHora };
  }
  const lista = await proyectos.find(filtro).sort({ ciudad: 1, nombre: 1 }).limit(200).toArray();
  const ocupados = await asientos.find({ proyectoId: { $in: lista.map((p) => p._id) } }).toArray();
  const porProyecto = new Map(ocupados.map((a) => [String(a.proyectoId), a]));
  const nombres = new Map((await mentores.find({}).toArray()).map((m) => [m._id, m.nombre]));
  const { evalResultados } = await collections();
  const evaluadoEn = new Map<string, string>();
  for (const e of await evalResultados.find({ proyectoId: { $in: lista.map((p) => p._id) }, noPresento: false }, { projection: { proyectoId: 1, actualizadoEn: 1 } }).toArray()) {
    const k = String(e.proyectoId), t = e.actualizadoEn.toISOString();
    if (!evaluadoEn.has(k) || evaluadoEn.get(k)! < t) evaluadoEn.set(k, t);
  }
  const nComent = await conteoComentarios(lista.map((p) => p._id));
  return lista
    .map((p): FilaProyecto => {
      const a = porProyecto.get(String(p._id));
      return {
        id: String(p._id), codigo: p.codigo, nombre: p.nombre, ciudad: p.ciudad, ...(p.grupo ? { grupo: p.grupo } : {}),
        integrantes: p.integrantes.map((i) => ({ nombre: i.nombre, documento: i.documento })),
        monitor: p.monitor ?? null,
        hora: a ? { inicio: a.inicio.toISOString(), mentor: nombres.get(a.mentorId) ?? a.mentorId } : null,
        evaluado: evaluadoEn.has(String(p._id)), ...(evaluadoEn.has(String(p._id)) ? { evaluadoEn: evaluadoEn.get(String(p._id))! } : {}),
        comentarios: nComent.get(String(p._id)) ?? 0,
        ...(p.sinProyecto ? { sinProyecto: { desde: p.sinProyecto.desde.toISOString(), ...(p.sinProyecto.motivo ? { motivo: p.sinProyecto.motivo } : {}) } } : {}),
      };
    });
}

export async function historial(proyectoId: ObjectId) {
  const { changeLog, proyectos } = await collections();
  const p = await proyectos.findOne({ _id: proyectoId }, { projection: { nombre: 1, descripcion: 1 } });
  const ultima = await changeLog.findOne({ proyectoId, accion: "editar_proyecto" }, { sort: { fecha: -1, _id: -1 }, projection: { _id: 1 } });
  return (await changeLog.find({ proyectoId }).sort({ fecha: -1 }).limit(50).toArray())
    // Coordinación también ve el historial: el documento del estudiante que reservó va enmascarado.
    .map((c) => ({
      id: String(c._id), ...(revertible(c, p, ultima ? String(ultima._id) : null) ? { revertible: true } : {}),
      accion: c.accion, anterior: c.anterior, nuevo: c.nuevo, motivo: c.motivo, fecha: c.fecha.toISOString(),
      actor: c.actor.rol === "estudiante" && c.actor.usuario ? { ...c.actor, usuario: enmascararNumero(c.actor.usuario) } : c.actor,
    }));
}

export type ResultadoAdmin = { ok: true; inicio?: string } | { ok: false; error: string; mensaje: string };

const MENSAJE: Record<Falla["codigo"], string> = {
  sin_cupo: "Ese bloque ya no tiene asientos libres para esta ciudad.",
  ya_evaluado: "Ya tiene una evaluación guardada: no se mueve ni se libera.",
  cambio: "La hora del proyecto cambió mientras tanto. Recarga y vuelve a intentarlo.",
  sin_hora: "Ese proyecto no tiene hora.",
  tope: "Su ciudad ya llegó al tope de ese día.",
  marcado: "Este proyecto está marcado «Sin proyecto»: quita la marca para darle hora.",
};
const falla = (e: Falla): ResultadoAdmin => ({ ok: false, error: e.codigo, mensaje: MENSAJE[e.codigo] });

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", timeZone: "UTC" });
/** "Cartagena ya tiene 30 de 30 el jueves 12. ¿Mover igual?" (advertencia del admin al pasar el tope). */
export async function mensajeTope(ciudad: string, dia: string): Promise<string> {
  const t = await topeDeDia(ciudad, dia);
  return t ? `${ciudad} ya tiene ${t.lleva} de ${t.tope} el ${fmtDia.format(new Date(dia + "T12:00:00Z"))}. ¿Mover igual?` : MENSAJE.tope;
}

/** Libera la hora y registra el cambio en la misma transacción (lógica común en mover.ts). */
export async function liberar(proyectoId: ObjectId, motivo: string, actor: Actor): Promise<ResultadoAdmin> {
  const { changeLog } = await collections();
  try {
    await transaccion(async (s) => {
      const ahora = new Date();
      const a = await liberarProyecto(s, proyectoId, actor.usuario ?? actor.rol, ahora);
      await changeLog.insertOne({ proyectoId, accion: "liberar", anterior: etiqueta(a.inicio), motivo, actor, fecha: ahora }, { session: s });
    });
  } catch (e) {
    if (e instanceof Falla) return falla(e);
    throw e;
  }
  return { ok: true };
}

/**
 * Salida de emergencia (solo admin): anula la evaluación del proyecto. Las evaluaciones se copian a
 * `evaluacion_anuladas` (no se pierden), se borran de las vigentes y el proyecto vuelve a Pendiente: se puede mover o
 * volver a evaluar. Toca el asiento (`rev`) para chocar con un guardado simultáneo del mentor. Deja changeLog.
 */
export async function anularEvaluacion(proyectoId: ObjectId, motivo: string, actor: Actor, version?: string): Promise<ResultadoAdmin> {
  const c = await collections();
  const p = await c.proyectos.findOne({ _id: proyectoId }, { projection: { integrantes: 1 } });
  if (!p) return { ok: false, error: "sin_proyecto", mensaje: "No existe ese proyecto." };
  let n = 0, cambio = false;
  await transaccion(async (s) => {
    const evals = await c.evalResultados.find({ proyectoId }, { session: s }).toArray();
    const vigentes = evals.filter((e) => !e.noPresento);
    n = vigentes.length;
    if (!n) return;
    // Solo la versión que vio el admin: si el mentor guardó después, se rechaza (vuelve a abrir la ficha).
    const ultima = new Date(Math.max(...vigentes.map((e) => e.actualizadoEn.getTime()))).toISOString();
    if (version && version !== ultima) { cambio = true; return; }
    const crit = await criterios();
    const ahora = new Date();
    await c.asientos.updateOne({ proyectoId }, { $inc: { rev: 1 } }, { session: s });
    await c.evalAnuladas.insertOne({ proyectoId, evaluaciones: evals, motivo, anuladoPor: actor.usuario ?? actor.rol, anuladoEn: ahora }, { session: s });
    await c.evalResultados.deleteMany({ proyectoId }, { session: s });
    await c.evalBorradores.deleteOne({ _id: String(proyectoId) }, { session: s }); // un borrador viejo no vuelve a ofrecerse
    // Nunca el documento completo en el historial (lo ve coordinación): si no está el integrante, enmascarado.
    const nombre = (doc: string) => p.integrantes.find((x) => x.documento === doc)?.nombre.split(" ")[0] ?? enmascararNumero(doc);
    await c.changeLog.insertOne({
      proyectoId, accion: "anular_evaluacion", anterior: evals.map((e) => `${nombre(e.documento)}: ${calc(e, crit).res}`).join(" · "),
      nuevo: "Pendiente", motivo, actor, fecha: ahora,
    }, { session: s });
  });
  if (cambio) return { ok: false, error: "cambio", mensaje: "El mentor guardó la evaluación otra vez mientras tanto. Cierra la ficha, revisa y vuelve a anular si hace falta." };
  return n ? { ok: true } : { ok: false, error: "sin_evaluacion", mensaje: "Este proyecto no tiene una evaluación guardada." };
}

/**
 * Pone el proyecto en el bloque `inicio` (o en el asiento `asiento` de ese bloque, para cambiar de mentor): libera su
 * asiento actual (si tiene) y toma uno libre, en una transacción (lógica común en mover.ts). Por defecto solo asientos
 * de su ciudad; con `otraCiudad`, cualquiera libre. Un proyecto con evaluación guardada no se mueve.
 */
export async function cambiarHora(proyectoId: ObjectId, inicio: Date, opciones: { otraCiudad: boolean; motivo: string; asiento?: ObjectId; confirmarTope?: boolean }, actor: Actor): Promise<ResultadoAdmin> {
  const c = await collections();
  const proyecto = await c.proyectos.findOne({ _id: proyectoId }, { projection: { ciudad: 1 } });
  if (!proyecto) return { ok: false, error: "sin_proyecto", mensaje: "No existe ese proyecto." };
  // Modo orden de llegada: las etiquetas no cuentan (primero se prueba uno de su ciudad, luego cualquiera).
  const orden = await modoOrdenLlegada();
  const otra = opciones.otraCiudad || orden;
  const ciudad: Filter<Asiento> = otra ? {} : { ciudades: proyecto.ciudad };
  const filtros: Filter<Asiento>[] = opciones.asiento
    ? [{ _id: opciones.asiento, inicio, ...ciudad }]
    : [{ inicio, ciudades: proyecto.ciudad }, ...(otra ? [{ inicio }] : [])];
  let resultado: ResultadoAdmin = { ok: false, error: "sin_cupo", mensaje: MENSAJE.sin_cupo };
  try {
    await conCandado(async (s) => {
      const viejo = await c.asientos.findOne({ proyectoId }, { session: s });
      if (viejo && (opciones.asiento ? viejo._id.equals(opciones.asiento) : viejo.inicio.getTime() === inicio.getTime())) throw new Error("misma_hora");
      const ahora = new Date();
      const nuevo = await moverProyecto(s, proyectoId, viejo?._id ?? null, filtros, actor.usuario ?? actor.rol, ahora, { tope: opciones.confirmarTope ? "permitir" : "respetar" });
      const ajeno = !orden && !nuevo.ciudades.includes(proyecto.ciudad);
      const cambioMentor = !!viejo && viejo.inicio.getTime() === nuevo.inicio.getTime();
      await c.changeLog.insertOne({
        proyectoId, accion: "cambiar_hora", ...(viejo ? { anterior: `${etiqueta(viejo.inicio)}${cambioMentor ? ` · ${viejo.mentorId}` : ""}` } : {}),
        nuevo: `${etiqueta(nuevo.inicio)}${cambioMentor ? ` · ${nuevo.mentorId}` : ""}${ajeno ? ` · asiento de ${claveGrupo(nuevo.ciudades)}` : ""}${nuevo.sobreTope ? " · sobre el tope" : ""}`,
        motivo: opciones.motivo, actor, fecha: ahora,
      }, { session: s });
      resultado = { ok: true, inicio: nuevo.inicio.toISOString() };
    });
  } catch (e) {
    if (e instanceof Error && e.message === "misma_hora") return { ok: false, error: "misma_hora", mensaje: "El proyecto ya tiene esa hora." };
    if (e instanceof Falla && e.codigo === "tope") return { ok: false, error: "tope", mensaje: await mensajeTope(proyecto.ciudad, diaCOL(inicio)) };
    if (e instanceof Falla) return falla(e);
    // Un integrante reservó en el mismo instante: el índice único sobre proyectoId lo frenó.
    if (e instanceof MongoServerError && e.code === 11000) return { ok: false, error: "ya_tiene_hora", mensaje: "El proyecto acaba de reservar una hora. Recarga y vuelve a intentarlo." };
    throw e;
  }
  // Paso 21 · Si otro admin marcó el proyecto «Sin proyecto» en este mismo instante (la transacción no veía la marca y
  // la marca no veía este asiento), se suelta la hora recién asignada: la marca escribe y luego revisa el asiento; aquí,
  // al revés, así que alguno de los dos ve al otro. Sin marca, no hace nada.
  const hecho = resultado as ResultadoAdmin; // se asigna dentro de la transacción (TS no lo sigue)
  if (hecho.ok && hecho.inicio) {
    const p = await c.proyectos.findOne({ _id: proyectoId }, { projection: { sinProyecto: 1 } });
    if (p?.sinProyecto) {
      const suelto = await c.asientos.findOneAndUpdate({ proyectoId, inicio: new Date(hecho.inicio) }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } });
      if (suelto) await c.changeLog.insertOne({ proyectoId, accion: "liberar", anterior: etiqueta(suelto.inicio), motivo: "El proyecto se marcó «Sin proyecto» al mismo tiempo", actor, fecha: new Date() });
      return { ok: false, error: "marcado", mensaje: MENSAJE.marcado };
    }
  }
  return resultado;
}

/**
 * Bloques con asiento libre en un día. `libres` cuenta los de su ciudad; `otras` dice de qué otras
 * ciudades hay asientos libres. Un bloque solo con asientos ajenos sale con deSuCiudad: false, para
 * que el admin lo use con advertencia.
 */
export async function bloquesLibres(proyectoId: ObjectId, dia: string) {
  const c = await collections();
  const p = await c.proyectos.findOne({ _id: proyectoId }, { projection: { ciudad: 1 } });
  if (!p) return null;
  // Modo orden de llegada: todo libre cuenta como de su ciudad, y se informa el tope (sin contar al propio proyecto si
  // ya tiene hora ese día: moverlo dentro del día no cambia lo que lleva su ciudad).
  const orden = await modoOrdenLlegada();
  const tope = orden ? await topeDeDia(p.ciudad, dia) : null;
  if (tope && await c.asientos.findOne({ proyectoId, dia }, { projection: { _id: 1 } })) tope.lleva--;
  const libres = await c.asientos.find({ dia, proyectoId: null }).sort({ inicio: 1 }).toArray();
  const porBloque = new Map<string, { inicio: string; libres: number; deSuCiudad: boolean; otras: string[] }>();
  for (const a of libres) {
    const k = a.inicio.toISOString();
    const b = porBloque.get(k) ?? { inicio: k, libres: 0, deSuCiudad: false, otras: [] };
    if (orden || a.ciudades.includes(p.ciudad)) { b.deSuCiudad = true; b.libres++; }
    else if (!b.otras.includes(claveGrupo(a.ciudades))) b.otras.push(claveGrupo(a.ciudades));
    porBloque.set(k, b);
  }
  const todos = await c.dias.find({}).toArray();
  return { ciudadTieneElDia: diasPorCiudad(todos, p.ciudad).includes(dia), bloques: [...porBloque.values()], ordenLlegada: orden, ciudad: p.ciudad, ...(tope ? { tope } : {}) };
}

export async function asignarMonitor(proyectoId: ObjectId, monitor: string | null, actor: Actor): Promise<ResultadoAdmin> {
  const { proyectos, users, changeLog } = await collections();
  const p = await proyectos.findOne({ _id: proyectoId }, { projection: { ciudad: 1 } });
  if (!p) return { ok: false, error: "sin_proyecto", mensaje: "No existe ese proyecto." };
  if (monitor) {
    const u = await users.findOne({ usuario: monitor, rol: "monitor", activo: true });
    if (!u) return { ok: false, error: "sin_monitor", mensaje: "Ese monitor no existe o está inactivo." };
    // El seguimiento del monitor filtra por sus ciudades: fuera de ellas no vería el proyecto.
    if (!u.ciudades.includes(p.ciudad)) return { ok: false, error: "otra_ciudad", mensaje: `Ese monitor no tiene ${p.ciudad} entre sus ciudades. Agrégasela en Usuarios o elige otro.` };
  }
  const antes = await proyectos.findOneAndUpdate({ _id: proyectoId }, { $set: { monitor } });
  if (!antes) return { ok: false, error: "sin_proyecto", mensaje: "No existe ese proyecto." };
  await changeLog.insertOne({ proyectoId, accion: "asignar_monitor", anterior: antes.monitor ?? "(por asignar)", nuevo: monitor ?? "(por asignar)", actor, fecha: new Date() });
  return { ok: true };
}

/** Asientos de un día por grupo de ciudades: libres y ocupados (el admin sí ve conteos). */
export async function resumenAsientos(dia: string) {
  const { asientos, dias } = await collections();
  const lista = await asientos.find({ dia }, { projection: { ciudades: 1, proyectoId: 1 } }).toArray();
  const grupos = new Map<string, { grupo: string; ciudades: string[]; libres: number; ocupados: number }>();
  for (const a of lista) {
    const k = claveGrupo(a.ciudades);
    const g = grupos.get(k) ?? { grupo: k, ciudades: a.ciudades, libres: 0, ocupados: 0 };
    if (a.proyectoId) g.ocupados++; else g.libres++;
    grupos.set(k, g);
  }
  const todos = await dias.find({}).sort({ _id: 1 }).toArray();
  return { dias: todos.map((d) => d._id), explicitas: [...ciudadesExplicitas(todos)], grupos: [...grupos.values()].sort((a, b) => a.grupo.localeCompare(b.grupo, "es")) };
}

/**
 * Reetiqueta `cantidad` asientos LIBRES de un día del grupo `desde` a las ciudades `hacia`, repartidos
 * a lo largo del día (no los primeros). Un asiento que alguien reserve mientras tanto no se toca.
 */
export async function reetiquetar(dia: string, desde: string, hacia: string[], cantidad: number, actor: Actor): Promise<{ ok: true; cambiados: number } | { ok: false; mensaje: string }> {
  const { asientos, changeLog, dias } = await collections();
  // Solo ciudades que presentan ese día (filas propias o "Todas", antes de su clausura): si no, el asiento sería inalcanzable.
  const todos = await dias.find({}).toArray();
  const cfg = todos.find((d) => d._id === dia);
  const presentan = cfg ? ciudadesDelDia(cfg.ciudades, dia, ciudadesExplicitas(todos)) : new Map();
  const fuera = hacia.filter((c) => !presentan.has(c));
  if (fuera.length) return { ok: false, mensaje: `${fuera.join(", ")} no presenta${fuera.length > 1 ? "n" : ""} el ${dia}. Agrégala en la hoja Cupos o elige otra ciudad.` };
  const libres = (await asientos.find({ dia, proyectoId: null }).sort({ inicio: 1, mentorId: 1 }).toArray()).filter((a) => claveGrupo(a.ciudades) === desde);
  if (cantidad > libres.length) return { ok: false, mensaje: `El grupo ${desde} solo tiene ${libres.length} asientos libres ese día.` };
  const elegidos: Asiento[] = [];
  for (let i = 0; i < cantidad; i++) elegidos.push(libres[Math.floor(((i + 0.5) * libres.length) / cantidad)]!);
  const r = await asientos.updateMany({ _id: { $in: elegidos.map((a) => a._id) }, proyectoId: null }, { $set: { ciudades: hacia } });
  await changeLog.insertOne({ accion: "reetiquetar", anterior: `${dia} ${desde}`, nuevo: `${claveGrupo(hacia)}: ${r.modifiedCount} asientos`, actor, fecha: new Date() });
  return { ok: true, cambiados: r.modifiedCount };
}


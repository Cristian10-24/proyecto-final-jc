import { MongoServerError, ObjectId, type ClientSession } from "mongodb";
import { ciudadesDelDia, ciudadesExplicitas } from "./agenda";
import { horaCO, NOMBRES_CIUDADES, presentaAntesDeClausura } from "./ciudades";
import { collections, transaccion } from "./db";
import { enmascararCorreo, enmascararNumero } from "./estudiante";
import { asignarMonitor } from "./importar/aplicar";
import { leerCelular, leerCorreo, leerDocumento } from "./importar/proyectos";
import type { Actor, Asiento, Integrante, Proyecto, Ruta } from "./types";
import { cleanSpaces, toProperName } from "./validation/name";

// Gestión manual de proyectos (solo admin): crear, editar, separar una pareja y agregar un integrante.
// Reglas: solo campos que ya existen en `proyectos` (nada nuevo en los documentos), ningún índice nuevo, y una
// reserva solo cambia cuando el admin actúa sobre ESE proyecto. Lo que toca horas va en una transacción.
// Mismas validaciones del importador (documento sin puntos ni decimales, celular normalizado, documento único:
// además lo garantiza el índice único de integrantes.documento). En el historial, los documentos van enmascarados.

export type IntegranteEntrada = { nombre: string; documento: string; celular?: string; correo?: string };
export type ProyectoEntrada = {
  ciudad: string; nombre: string; descripcion?: string; ruta?: Ruta | null;
  /** undefined = el monitor de la ciudad (si tiene uno solo); null = por asignar. */
  monitor?: string | null;
  integrantes: IntegranteEntrada[];
};
export type Falla = { ok: false; error: string; mensaje: string };
export type Resultado<T = object> = ({ ok: true } & T) | Falla;

class Corte extends Error { constructor(readonly r: Falla) { super(r.error); } }
const falla = (error: string, mensaje: string): Falla => ({ ok: false, error, mensaje });
const mask = (doc: string) => enmascararNumero(doc);
const quien = (i: Pick<Integrante, "nombre" | "documento">) => `${i.nombre} (${mask(i.documento)})`;

/** Integrante validado como en el importador; error con el número de integrante. */
function integranteValido(x: IntegranteEntrada, n: number): Integrante | Falla {
  const nombre = toProperName(cleanSpaces(x.nombre ?? ""));
  if (nombre.length < 3) return falla("datos", `Integrante ${n}: escribe el nombre.`);
  // En el formulario, sin puntos ni comas (el importador los quita de los números de Excel; aquí se escriben a mano).
  if (/[.,]/.test(x.documento ?? "")) return falla("datos", `Integrante ${n}: escribe el documento sin puntos ni comas.`);
  const d = leerDocumento(x.documento ?? "");
  if (!d) return falla("datos", `Integrante ${n}: falta el documento.`);
  if ("error" in d) return falla("datos", `Integrante ${n}: el documento ${d.error}.`);
  const cel = x.celular?.trim() ? leerCelular(x.celular) : null;
  if (cel && "error" in cel) return falla("datos", `Integrante ${n}: el celular ${cel.error}.`);
  const cor = x.correo?.trim() ? leerCorreo(x.correo) : null;
  if (cor && "error" in cor) return falla("datos", `Integrante ${n}: el correo ${cor.error}.`);
  return { documento: d.doc, nombre, ...(cel ? { celular: cel.celular } : {}), ...(cor ? { correo: cor.correo } : {}) };
}

type Valido = { ciudad: string; nombre: string; descripcion?: string; ruta?: Ruta; monitor: string | null; integrantes: Integrante[] };

async function validar(p: ProyectoEntrada, s?: ClientSession): Promise<Valido | Falla> {
  if (!NOMBRES_CIUDADES.includes(p.ciudad)) return falla("datos", "Ciudad no reconocida.");
  const nombre = cleanSpaces(p.nombre ?? "");
  if (nombre.length < 2) return falla("datos", "Escribe el nombre del proyecto.");
  if (p.integrantes.length < 1 || p.integrantes.length > 2) return falla("datos", "Un proyecto tiene 1 o 2 integrantes.");
  const integrantes: Integrante[] = [];
  for (const [i, x] of p.integrantes.entries()) {
    const v = integranteValido(x, i + 1);
    if ("ok" in v) return v;
    integrantes.push(v);
  }
  if (integrantes[1] && integrantes[0]!.documento === integrantes[1].documento) return falla("datos", "Los dos integrantes tienen el mismo documento.");
  const { users } = await collections();
  const monitores = (await users.find({ rol: "monitor", activo: true }, { session: s, projection: { usuario: 1, nombre: 1, ciudades: 1 } }).toArray())
    .map((m) => ({ usuario: m.usuario, nombre: m.nombre, ciudades: m.ciudades }));
  let monitor: string | null;
  if (p.monitor === undefined) monitor = asignarMonitor({ ciudad: p.ciudad, monitorTexto: undefined }, monitores).monitor;
  else if (p.monitor === null) monitor = null;
  else if (monitores.some((m) => m.usuario === p.monitor)) monitor = p.monitor;
  else return falla("datos", "Ese monitor no existe o está inactivo.");
  const descripcion = cleanSpaces(p.descripcion ?? "");
  return { ciudad: p.ciudad, nombre, ...(descripcion ? { descripcion } : {}), ...(p.ruta ? { ruta: p.ruta } : {}), monitor, integrantes };
}

/** Documentos que ya están en OTRO proyecto (código del dueño). */
async function documentosOcupados(docs: string[], excepto: ObjectId | null, s?: ClientSession) {
  const { proyectos } = await collections();
  const otros = await proyectos.find({ "integrantes.documento": { $in: docs }, ...(excepto ? { _id: { $ne: excepto } } : {}) }, { session: s, projection: { codigo: 1, integrantes: 1 } }).toArray();
  return otros.flatMap((o) => o.integrantes.filter((i) => docs.includes(i.documento)).map((i) => ({ documento: i.documento, codigo: o.codigo })));
}

/** Código como el del importador (P-<documento del integrante 1>); si ya existe, con sufijo -2, -3… */
async function codigoLibre(doc: string, s?: ClientSession): Promise<string> {
  const { proyectos } = await collections();
  const base = `P-${doc}`;
  const usados = new Set((await proyectos.find({ codigo: { $regex: `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?$` } }, { session: s, projection: { codigo: 1 } }).toArray()).map((p) => p.codigo));
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function evaluado(proyectoId: ObjectId, s?: ClientSession) {
  const { evalResultados } = await collections();
  return !!(await evalResultados.findOne({ proyectoId, noPresento: false }, { session: s, projection: { _id: 1 } }));
}

const ocupadoMsg = (o: { documento: string; codigo: string }[]) => `El documento ${o.map((x) => `${mask(x.documento)} ya está en ${x.codigo}`).join("; ")}.`;
const dup = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

/** Datos completos para el formulario de edición (admin). */
export async function datosProyecto(pid: ObjectId) {
  const c = await collections();
  const p = await c.proyectos.findOne({ _id: pid });
  if (!p) return null;
  const [a, ev] = await Promise.all([c.asientos.findOne({ proyectoId: pid }), evaluado(pid)]);
  return {
    id: String(p._id), codigo: p.codigo, ciudad: p.ciudad, nombre: p.nombre, descripcion: p.descripcion ?? "", ruta: p.ruta ?? null,
    monitor: p.monitor ?? null, integrantes: p.integrantes.map((i) => ({ nombre: i.nombre, documento: i.documento, celular: i.celular ?? "", correo: i.correo ?? "" })),
    hora: a ? { inicio: a.inicio.toISOString(), dia: a.dia } : null, evaluado: ev, version: p.actualizadoEn.toISOString(),
  };
}

// ---------- 1. Crear ----------
export async function crearProyecto(entrada: ProyectoEntrada, actor: Actor): Promise<Resultado<{ id: string; codigo: string }>> {
  const v = await validar(entrada);
  if ("ok" in v) return v;
  const ocupados = await documentosOcupados(v.integrantes.map((i) => i.documento), null);
  if (ocupados.length) return falla("documento", ocupadoMsg(ocupados));
  const c = await collections(), ahora = new Date(), _id = new ObjectId();
  const codigo = await codigoLibre(v.integrantes[0]!.documento);
  try {
    await c.proyectos.insertOne({ _id, codigo, ...v, creadoEn: ahora, actualizadoEn: ahora });
  } catch (e) {
    if (dup(e)) return falla("documento", "Otro proyecto se guardó con ese documento o código al mismo tiempo. Revisa y vuelve a intentar.");
    throw e;
  }
  await c.changeLog.insertOne({ proyectoId: _id, accion: "crear_proyecto", nuevo: `${codigo} · ${v.nombre} · ${v.ciudad} · ${v.integrantes.map(quien).join(" y ")}`, actor, fecha: ahora });
  return { ok: true, id: String(_id), codigo };
}

// ---------- 2. Editar ----------
/** ¿La nueva ciudad presenta el día de la hora que ya tiene? (no mueve la hora; solo para advertir). */
async function ciudadPuedeEseDia(ciudad: string, a: Asiento) {
  const { dias } = await collections();
  const configs = await dias.find({}).toArray();
  const cfg = configs.find((d) => d._id === a.dia);
  return !!cfg && presentaAntesDeClausura(ciudad, a.dia) && ciudadesDelDia(cfg.ciudades, cfg._id, ciudadesExplicitas(configs)).has(ciudad);
}

export async function editarProyecto(pid: ObjectId, entrada: ProyectoEntrada, opciones: { version?: string; confirmarCiudad?: boolean }, actor: Actor): Promise<Resultado | (Falla & { aviso?: string })> {
  const c = await collections();
  const p = await c.proyectos.findOne({ _id: pid });
  if (!p) return falla("no_existe", "Ese proyecto ya no existe.");
  if (opciones.version && p.actualizadoEn.toISOString() !== opciones.version) return falla("cambio", "Alguien cambió este proyecto mientras lo editabas. Ábrelo otra vez.");
  if (entrada.integrantes.length !== p.integrantes.length) return falla("datos", "Para cambiar cuántos integrantes tiene, usa «Separar pareja» o «Agregar integrante».");
  const v = await validar({ ...entrada, monitor: entrada.monitor === undefined ? p.monitor ?? null : entrada.monitor });
  if ("ok" in v) return v;

  const cambiaDoc = v.integrantes.some((i, k) => i.documento !== p.integrantes[k]!.documento);
  if (cambiaDoc) {
    const ocupados = await documentosOcupados(v.integrantes.map((i) => i.documento), pid);
    if (ocupados.length) return falla("documento", ocupadoMsg(ocupados));
    // La evaluación y las notas del monitor van por documento: no se dejan huérfanas.
    const viejos = p.integrantes.filter((i, k) => i.documento !== v.integrantes[k]!.documento).map((i) => i.documento);
    const conDatos = await c.evalResultados.findOne({ proyectoId: pid, documento: { $in: viejos } }, { projection: { _id: 1 } })
      ?? await c.evalMonitor.findOne({ proyectoId: pid, documento: { $in: viejos } }, { projection: { _id: 1 } });
    if (conDatos) return falla("evaluado", "Ese integrante ya tiene evaluación o notas del monitor: no se le cambia el documento.");
  }
  if (v.ciudad !== p.ciudad && !opciones.confirmarCiudad) {
    const a = await c.asientos.findOne({ proyectoId: pid });
    if (a && !(await ciudadPuedeEseDia(v.ciudad, a)))
      return { ...falla("confirmar_ciudad", `${v.ciudad} no presenta el ${a.dia}, el día de su hora (${horaCO(a.inicio)}). La hora no se mueve sola: confirma si quieres cambiar la ciudad igual, y luego muévela.`) };
  }

  // Solo los campos del formulario; codigo, grupo, creadoEn y la hora quedan igual.
  const set: Partial<Proyecto> = { ciudad: v.ciudad, nombre: v.nombre, monitor: v.monitor, integrantes: v.integrantes, actualizadoEn: new Date() };
  const unset: Record<string, ""> = {};
  if (v.descripcion) set.descripcion = v.descripcion; else if (p.descripcion !== undefined) unset.descripcion = "";
  if (v.ruta) set.ruta = v.ruta; else if (p.ruta !== undefined) unset.ruta = "";
  const cambios = diferencias(p, v);
  if (!cambios.length) return { ok: true };
  try {
    await transaccion(async (s) => {
      if (cambiaDoc) {
        // Escribe el asiento (como guardar una evaluación): una evaluación que se guarde a la vez choca y se reintenta,
        // y aquí se vuelve a comprobar que no haya evaluación ni notas del documento viejo.
        await c.asientos.updateOne({ proyectoId: pid }, { $inc: { rev: 1 } }, { session: s });
        const viejos = p.integrantes.filter((i, k) => i.documento !== v.integrantes[k]!.documento).map((i) => i.documento);
        if (await c.evalResultados.findOne({ proyectoId: pid, documento: { $in: viejos } }, { session: s, projection: { _id: 1 } })
          ?? await c.evalMonitor.findOne({ proyectoId: pid, documento: { $in: viejos } }, { session: s, projection: { _id: 1 } }))
          throw new Corte(falla("evaluado", "Ese integrante ya tiene evaluación o notas del monitor: no se le cambia el documento."));
      }
      const r = await c.proyectos.updateOne({ _id: pid, actualizadoEn: p.actualizadoEn }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { session: s });
      if (!r.matchedCount) throw new Corte(falla("cambio", "Alguien cambió este proyecto mientras lo editabas. Ábrelo otra vez."));
    });
  } catch (e) {
    if (e instanceof Corte) return e.r;
    if (dup(e)) return falla("documento", "Ese documento se acaba de guardar en otro proyecto.");
    throw e;
  }
  await c.changeLog.insertOne({ proyectoId: pid, accion: "editar_proyecto", anterior: cambios.map((x) => x[0]).join(" · "), nuevo: cambios.map((x) => x[1]).join(" · "), actor, fecha: set.actualizadoEn! });
  return { ok: true };
}

/** [antes, después] por campo cambiado, con documentos enmascarados. */
function diferencias(p: Proyecto, v: Valido): [string, string][] {
  const out: [string, string][] = [];
  const campo = (etq: string, a: string | null | undefined, b: string | null | undefined) => { if ((a ?? "") !== (b ?? "")) out.push([`${etq}: ${a || "—"}`, `${etq}: ${b || "—"}`]); };
  campo("ciudad", p.ciudad, v.ciudad); campo("nombre", p.nombre, v.nombre); campo("descripción", p.descripcion, v.descripcion);
  campo("ruta", p.ruta, v.ruta); campo("monitor", p.monitor, v.monitor);
  v.integrantes.forEach((i, k) => {
    const a = p.integrantes[k]!, n = `integrante ${k + 1}`;
    campo(`${n} nombre`, a.nombre, i.nombre);
    if (a.documento !== i.documento) out.push([`${n} documento: ${mask(a.documento)}`, `${n} documento: ${mask(i.documento)}`]);
    if ((a.celular ?? "") !== (i.celular ?? "")) out.push([`${n} celular: ${a.celular ? mask(a.celular) : "—"}`, `${n} celular: ${i.celular ? mask(i.celular) : "—"}`]);
    if ((a.correo ?? "") !== (i.correo ?? "")) out.push([`${n} correo: ${a.correo ? enmascararCorreo(a.correo) : "—"}`, `${n} correo: ${i.correo ? enmascararCorreo(i.correo) : "—"}`]);
  });
  return out;
}

// ---------- 3. Separar pareja ----------
export async function separarPareja(pid: ObjectId, opciones: { queda: 0 | 1; nombreNuevo?: string; version?: string }, actor: Actor): Promise<Resultado<{ nuevoId: string; codigo: string }>> {
  const c = await collections();
  let res: { nuevoId: string; codigo: string } | null = null;
  try {
    await transaccion(async (s) => {
      const p = await c.proyectos.findOne({ _id: pid }, { session: s });
      if (!p) throw new Corte(falla("no_existe", "Ese proyecto ya no existe."));
      if (opciones.version && p.actualizadoEn.toISOString() !== opciones.version) throw new Corte(falla("cambio", "Alguien cambió este proyecto. Ábrelo otra vez."));
      if (p.integrantes.length !== 2) throw new Corte(falla("datos", "Solo se separa un proyecto en pareja."));
      if (await evaluado(pid, s)) throw new Corte(falla("evaluado", "Tiene evaluación guardada: anúlala primero (ficha → «Anular evaluación»)."));
      const queda = p.integrantes[opciones.queda]!, sale = p.integrantes[1 - opciones.queda]!;
      const ahora = new Date();
      // El que queda conserva el proyecto, su hora y su sala (su asiento no se toca).
      const r = await c.proyectos.updateOne({ _id: pid, actualizadoEn: p.actualizadoEn, "integrantes.documento": { $all: [queda.documento, sale.documento] } },
        { $set: { integrantes: [queda], actualizadoEn: ahora } }, { session: s });
      if (!r.matchedCount) throw new Corte(falla("cambio", "Alguien cambió este proyecto. Ábrelo otra vez."));
      const nombre = cleanSpaces(opciones.nombreNuevo ?? "") || p.nombre;
      const codigo = await codigoLibre(sale.documento, s), _id = new ObjectId();
      await c.proyectos.insertOne({
        _id, codigo, ciudad: p.ciudad, nombre, ...(p.descripcion ? { descripcion: p.descripcion } : {}), ...(p.grupo ? { grupo: p.grupo } : {}),
        ...(p.ruta ? { ruta: p.ruta } : {}), monitor: p.monitor ?? null, integrantes: [sale], creadoEn: ahora, actualizadoEn: ahora,
      }, { session: s });
      // Lo que era del que sale en el proyecto viejo ("No se presentó", notas del monitor) y el borrador de la pareja.
      await c.evalResultados.deleteMany({ proyectoId: pid, documento: sale.documento }, { session: s });
      await c.evalMonitor.deleteMany({ proyectoId: pid, documento: sale.documento }, { session: s });
      await c.evalBorradores.deleteOne({ _id: String(pid) }, { session: s });
      await c.changeLog.insertMany([
        { proyectoId: pid, accion: "separar_pareja", anterior: `${quien(queda)} y ${quien(sale)}`, nuevo: `Queda ${quien(queda)} (con su hora); ${quien(sale)} pasa a ${codigo}`, actor, fecha: ahora },
        { proyectoId: _id, accion: "crear_proyecto", nuevo: `${codigo} · ${nombre} · separado de ${p.codigo} · ${quien(sale)} · sin hora`, actor, fecha: ahora },
      ], { session: s });
      res = { nuevoId: String(_id), codigo };
    });
  } catch (e) {
    if (e instanceof Corte) return e.r;
    if (dup(e)) return falla("cambio", "Otro cambio se cruzó con este. Ábrelo otra vez.");
    throw e;
  }
  return { ok: true, ...res! };
}

// ---------- 4. Agregar integrante ----------
export type OpcionesAgregar = { version?: string; unir?: boolean; conservar?: "este" | "otro" };
export type AvisoUnion = Falla & { otro: { codigo: string; nombre: string; ciudad: string; integrante: string; hora: string | null }; hora: string | null };

export async function agregarIntegrante(pid: ObjectId, entrada: IntegranteEntrada, opciones: OpcionesAgregar, actor: Actor): Promise<Resultado | AvisoUnion> {
  const nuevoV = integranteValido(entrada, 2);
  if ("ok" in nuevoV) return nuevoV;
  const c = await collections();
  let aviso: AvisoUnion | null = null, unido: ObjectId | null = null;
  try {
    await transaccion(async (s) => {
      aviso = null; unido = null;
      const p = await c.proyectos.findOne({ _id: pid }, { session: s });
      if (!p) throw new Corte(falla("no_existe", "Ese proyecto ya no existe."));
      if (opciones.version && p.actualizadoEn.toISOString() !== opciones.version) throw new Corte(falla("cambio", "Alguien cambió este proyecto. Ábrelo otra vez."));
      if (p.integrantes.length !== 1) throw new Corte(falla("datos", "Solo se agrega un integrante a un proyecto individual."));
      if (p.integrantes[0]!.documento === nuevoV.documento) throw new Corte(falla("datos", "Ese documento ya es del integrante 1."));
      const o = await c.proyectos.findOne({ "integrantes.documento": nuevoV.documento }, { session: s });
      const ahora = new Date();
      if (!o) {
        const r = await c.proyectos.updateOne({ _id: pid, integrantes: { $size: 1 }, actualizadoEn: p.actualizadoEn }, { $push: { integrantes: nuevoV }, $set: { actualizadoEn: ahora } }, { session: s });
        if (!r.matchedCount) throw new Corte(falla("cambio", "Alguien cambió este proyecto. Ábrelo otra vez."));
        await c.changeLog.insertOne({ proyectoId: pid, accion: "agregar_integrante", anterior: quien(p.integrantes[0]!), nuevo: `${quien(p.integrantes[0]!)} y ${quien(nuevoV)}`, actor, fecha: ahora }, { session: s });
        return;
      }
      // El documento ya está en otro proyecto: unirlos.
      if (o.integrantes.length !== 1) throw new Corte(falla("datos", `Ese documento está en ${o.codigo}, que es en pareja: sepáralo primero.`));
      if ((await evaluado(pid, s)) || (await evaluado(o._id, s))) throw new Corte(falla("evaluado", "Uno de los dos proyectos tiene evaluación guardada: no se unen."));
      const [aP, aO] = [await c.asientos.findOne({ proyectoId: pid }, { session: s }), await c.asientos.findOne({ proyectoId: o._id }, { session: s })];
      const hora = (a: Asiento | null) => (a ? `${a.dia} ${horaCO(a.inicio)}` : null);
      if (!opciones.unir || (aO && !opciones.conservar)) {
        aviso = {
          ...falla("confirmar_union", aO
            ? `Ese documento es de ${o.codigo}, que tiene hora (${hora(aO)}). Al unirlos, elige qué hora se conserva; la otra se libera y ${o.codigo} se elimina.`
            : `Ese documento es de ${o.codigo} (sin hora). Al unirlos, ${o.codigo} se elimina.`),
          otro: { codigo: o.codigo, nombre: o.nombre, ciudad: o.ciudad, integrante: quien(o.integrantes[0]!), hora: hora(aO) }, hora: hora(aP),
        };
        return;
      }
      const sale = (a: Asiento) => c.asientos.findOneAndUpdate({ _id: a._id, proyectoId: a.proyectoId }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } }, { session: s });
      let horaFinal = hora(aP);
      if (aO && opciones.conservar === "otro") {
        if (!aO.ciudades.includes(p.ciudad))
          throw new Corte(falla("datos", `La hora de ${o.codigo} es para ${aO.ciudades.join(", ") || "otra ciudad"}, no para ${p.ciudad}: conserva la de este proyecto o muévela después.`));
        if (aP && !(await sale(aP))) throw new Corte(falla("cambio", "La hora cambió mientras se unían. Ábrelo otra vez."));
        if (!(await c.asientos.findOneAndUpdate({ _id: aO._id, proyectoId: o._id }, { $set: { proyectoId: pid } }, { session: s })))
          throw new Corte(falla("cambio", "La hora del otro proyecto cambió. Ábrelo otra vez."));
        horaFinal = hora(aO);
      } else if (aO && !(await sale(aO))) throw new Corte(falla("cambio", "La hora del otro proyecto cambió. Ábrelo otra vez."));
      const r1 = await c.proyectos.deleteOne({ _id: o._id, "integrantes.documento": nuevoV.documento, integrantes: { $size: 1 } }, { session: s });
      if (!r1.deletedCount) throw new Corte(falla("cambio", "El otro proyecto cambió. Ábrelo otra vez."));
      const deO = o.integrantes[0]!;
      const integrante: Integrante = { ...deO, ...nuevoV, ...(nuevoV.celular ? {} : deO.celular ? { celular: deO.celular } : {}), ...(nuevoV.correo ? {} : deO.correo ? { correo: deO.correo } : {}) };
      const r2 = await c.proyectos.updateOne({ _id: pid, integrantes: { $size: 1 }, actualizadoEn: p.actualizadoEn }, { $push: { integrantes: integrante }, $set: { actualizadoEn: ahora } }, { session: s });
      if (!r2.matchedCount) throw new Corte(falla("cambio", "Alguien cambió este proyecto. Ábrelo otra vez."));
      // Lo que colgaba del proyecto eliminado.
      await c.evalResultados.deleteMany({ proyectoId: o._id }, { session: s });
      await c.evalMonitor.deleteMany({ proyectoId: o._id }, { session: s });
      await c.evalBorradores.deleteOne({ _id: String(o._id) }, { session: s });
      await c.cambiosSugeridos.updateMany({ proyectoId: o._id, estado: "pendiente" },
        { $set: { estado: "rechazado", resueltoPor: actor.usuario ?? actor.rol, resueltoEn: ahora, respuesta: `El proyecto se unió a ${p.codigo}.` } }, { session: s });
      await c.changeLog.insertMany([
        { proyectoId: pid, accion: "unir_proyecto", anterior: `${quien(p.integrantes[0]!)} · hora ${hora(aP) ?? "—"} · ${o.codigo} con ${quien(deO)} · hora ${hora(aO) ?? "—"}`, nuevo: `${quien(p.integrantes[0]!)} y ${quien(integrante)} · hora ${horaFinal ?? "—"} · ${o.codigo} eliminado`, actor, fecha: ahora },
        { proyectoId: o._id, accion: "unir_proyecto", anterior: `${o.codigo} · ${quien(deO)}`, nuevo: `Unido a ${p.codigo}; ${o.codigo} eliminado`, actor, fecha: ahora },
      ], { session: s });
      unido = o._id;
    });
  } catch (e) {
    if (e instanceof Corte) return e.r;
    if (dup(e)) return falla("cambio", "Otro cambio (o una reserva) se cruzó con este. Ábrelo otra vez.");
    throw e;
  }
  // Si el estudiante del proyecto eliminado reservó justo mientras se unían (la transacción no veía esa reserva), su
  // asiento quedó con un proyecto que ya no existe: pasa al proyecto unido si no tiene hora; si ya tiene, se libera.
  if (unido) {
    const huerfano = await c.asientos.findOne({ proyectoId: unido });
    if (huerfano) {
      const p = await c.proyectos.findOne({ _id: pid }, { projection: { ciudad: 1 } });
      const tieneHora = !p || !huerfano.ciudades.includes(p.ciudad) || await c.asientos.findOne({ proyectoId: pid }, { projection: { _id: 1 } });
      try {
        await c.asientos.updateOne({ _id: huerfano._id, proyectoId: unido }, tieneHora ? { $set: { proyectoId: null }, $unset: { reservadoEn: "" } } : { $set: { proyectoId: pid } });
      } catch (e) {
        if (!dup(e)) throw e; // el proyecto unido tomó hora en ese instante: se libera
        await c.asientos.updateOne({ _id: huerfano._id, proyectoId: unido }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } });
      }
    }
  }
  return aviso ?? { ok: true };
}

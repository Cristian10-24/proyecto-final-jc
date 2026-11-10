import { randomUUID } from "node:crypto";
import { ObjectId as Oid, type ObjectId } from "mongodb";
import { collections } from "../db";
import { esHttps } from "../planSalas";
import type { Actor, ChangeLog } from "../types";
import {
  citacionesDelDia, enModoPrueba, limpio, queCambio, TEN_EN_CUENTA_DEFECTO,
  type Citacion, type DatosDia, type Persona, type Resumen, type TipoCitacion,
} from "./contenido";
import { ErrorGoogle, nuevoIdEvento, type ClienteCalendario } from "./google";

// Fase 5 · Paso 28 · Registro de citaciones (colección nueva `citaciones`) y texto «Ten en cuenta» (`citaciones_config`).
// Reglas:
//  - Solo lee los datos existentes (asientos, proyectos, plan de salas, mentores, usuarios); nunca los modifica.
//  - Una citación por (tipo, clave, día) con índice único: si ya existe, se actualiza; nunca se crea dos veces.
//  - Antes de llamar a Google se toma la fila (`bloqueoHasta`) y se guardan los ids de los eventos que se van a usar
//    (`idsPlan`): un doble clic espera, y un reintento después de un error reemplaza los mismos eventos.
//  - Modo prueba (`correoPrueba`): todo va solo a ese correo y queda marcado `prueba`; nunca toca lo citado de verdad.
//  - Todo deja changeLog.

export type EstadoRegistro = "citado" | "externo" | "error" | "cancelado";

export type RegistroCitacion = {
  _id: ObjectId;
  tipo: TipoCitacion;
  clave: string;
  dia: string;
  nombre: string;
  estado?: EstadoRegistro;
  /** Eventos creados por la app y vigentes. */
  ids: string[];
  /** Ids reservados para el envío en curso o fallido (un reintento usa los mismos). */
  idsPlan?: string[];
  resumen?: Resumen;
  huella?: string;
  citadoEn?: Date;
  citadoPor?: string;
  /** Citada en modo prueba: los eventos solo fueron al correo de prueba. */
  prueba?: string;
  error?: string;
  errorEn?: Date;
  canceladoEn?: Date;
  /** Fila tomada por un envío en curso (vence sola a los 5 minutos). */
  bloqueoHasta?: Date;
  /** Dueño de la toma: las escrituras del envío solo aplican si la fila sigue siendo suya. */
  bloqueoId?: string;
  creadoEn: Date;
  actualizadoEn: Date;
};

export type ConfigCitaciones = { _id: "tenEnCuenta"; texto: string; actualizadoEn: Date; actualizadoPor: string };

export type EstadoFila = "sin_citar" | "citado" | "externo" | "desactualizado" | "error" | "enviando" | "no_se_puede" | "sobra";

export type Fila = {
  tipo: TipoCitacion; clave: string; dia: string; nombre: string; detalle: string;
  estado: EstadoFila;
  /** Qué cambió desde que se citó (si está desactualizada). */
  cambios: string[];
  avisos: string[];
  bloqueo?: string;
  eventos: number;
  /** La app tiene eventos creados para esta fila (se pueden actualizar o cancelar en Google). */
  conEventos: boolean;
  /** Se marcó como citada por fuera (sin evento de la app). */
  externo: boolean;
  citadoEn?: string; citadoPor?: string;
  prueba?: string;
  error?: string;
  /** Solo se citó en modo prueba: para la citación real cuenta como sin citar. */
  soloPrueba?: boolean;
  canceladoEn?: string;
};

const LOCK_MS = 5 * 60_000;
export const TIPO_TXT: Record<TipoCitacion, string> = { participante: "Participante", mentor: "Mentor", monitor: "Monitor" };
const MAX_TEN_EN_CUENTA = 2000;

/* ------------------------------------------------------------------ lectura */

/** Todo lo que se necesita para citar un día. Solo lee. */
export async function datosDelDia(dia: string): Promise<DatosDia> {
  const { asientos, proyectos, planSalas, salasConfig, mentores, users } = await collections();
  const [as, plan, cfg] = await Promise.all([
    asientos.find({ dia, proyectoId: { $type: "objectId" } }, { projection: { inicio: 1, mentorId: 1, proyectoId: 1 } }).toArray(),
    planSalas.find({ dia }).toArray(),
    salasConfig.findOne({ _id: "actual" }),
  ]);
  const mentorIds = [...new Set(as.map((a) => a.mentorId))];
  const monitores = [...new Set(plan.map((p) => p.monitor).filter((m): m is string => !!m))];
  const [ps, ms, us, mons] = await Promise.all([
    proyectos.find({ _id: { $in: as.map((a) => a.proyectoId!) } }, { projection: { codigo: 1, nombre: 1, ciudad: 1, integrantes: 1 } }).toArray(),
    mentores.find({ _id: { $in: mentorIds } }).toArray(),
    users.find({ mentorId: { $in: mentorIds } }, { projection: { mentorId: 1, nombre: 1, correo: 1, celular: 1 } }).toArray(),
    users.find({ usuario: { $in: monitores } }, { projection: { usuario: 1, nombre: 1, correo: 1, celular: 1 } }).toArray(),
  ]);
  const proyecto = new Map(ps.map((p) => [String(p._id), p]));
  const persona = (p: Persona): Persona => ({ nombre: p.nombre, ...(p.correo ? { correo: p.correo } : {}), ...(p.celular ? { celular: p.celular } : {}) });
  const mentoresDia: Record<string, Persona> = {};
  for (const id of mentorIds) {
    const m = ms.find((x) => x._id === id), u = us.find((x) => x.mentorId === id);
    mentoresDia[id] = persona({ nombre: m?.nombre ?? u?.nombre ?? id, correo: m?.correo || u?.correo, celular: m?.celular || u?.celular });
  }
  return {
    dia,
    bloques: as.flatMap((a) => {
      const p = proyecto.get(String(a.proyectoId));
      return p ? [{ inicio: a.inicio, mentorId: a.mentorId, proyecto: { id: String(p._id), codigo: p.codigo, nombre: p.nombre, ciudad: p.ciudad, integrantes: p.integrantes.map((i) => ({ nombre: i.nombre, ...(i.correo ? { correo: i.correo } : {}), ...(i.celular ? { celular: i.celular } : {}) })) } }] : [];
    }),
    plan: plan.map((p) => ({ hora: p.hora, mentorId: p.mentorId, sala: p.sala, monitor: p.monitor })),
    enlaces: Object.fromEntries((cfg?.salas ?? []).filter((s) => esHttps(s.enlace)).map((s) => [s.sala, s.enlace])),
    mentores: mentoresDia,
    monitores: Object.fromEntries(mons.map((u) => [u.usuario, persona({ nombre: u.nombre, correo: u.correo, celular: u.celular })])),
  };
}

export async function textoTenEnCuenta(): Promise<string> {
  const { citacionesConfig } = await collections();
  return (await citacionesConfig.findOne({ _id: "tenEnCuenta" }))?.texto ?? TEN_EN_CUENTA_DEFECTO;
}

/** Guarda el texto «Ten en cuenta» (una viñeta por línea) con changeLog. Devuelve el texto guardado. */
export async function guardarTenEnCuenta(texto: string, actor: Actor & { usuario: string }): Promise<{ ok: true; texto: string } | { ok: false; mensaje: string }> {
  const limpioTxt = texto.split(/\r?\n/).map(limpio).filter(Boolean).join("\n");
  if (!limpioTxt) return { ok: false, mensaje: "Escribe al menos una recomendación." };
  if (limpioTxt.length > MAX_TEN_EN_CUENTA) return { ok: false, mensaje: `Máximo ${MAX_TEN_EN_CUENTA} caracteres.` };
  const { citacionesConfig, changeLog } = await collections();
  const antes = await textoTenEnCuenta();
  if (antes === limpioTxt) return { ok: true, texto: limpioTxt };
  await citacionesConfig.updateOne({ _id: "tenEnCuenta" }, { $set: { texto: limpioTxt, actualizadoEn: new Date(), actualizadoPor: actor.usuario } }, { upsert: true });
  await changeLog.insertOne({ accion: "texto_citacion", anterior: antes, nuevo: limpioTxt, actor: { rol: actor.rol, usuario: actor.usuario }, fecha: new Date() });
  return { ok: true, texto: limpioTxt };
}

/** ¿El registro tiene algo citado de verdad (no en prueba)? En modo prueba eso nunca se toca. */
const tieneReal = (r: RegistroCitacion | null | undefined) =>
  !!r && !r.prueba && (r.estado === "externo" || r.ids.length > 0 || (r.idsPlan?.length ?? 0) > 0);

/** Estado de una fila (función pura). `correoPrueba`: modo prueba activo. */
export function estadoFila(c: Citacion | null, r: RegistroCitacion | null, correoPrueba: string | null, ahora = new Date()): Fila | null {
  const base = c ?? (r ? { tipo: r.tipo, clave: r.clave, dia: r.dia, nombre: r.nombre, detalle: "Ya no tiene nada que citar este día.", eventos: [], avisos: [] as string[] } : null);
  if (!base) return null;
  const soloPrueba = !!r?.prueba && !correoPrueba && (r.estado === "citado" || r.estado === "error");
  const fila: Fila = {
    tipo: base.tipo, clave: base.clave, dia: base.dia, nombre: base.nombre, detalle: base.detalle,
    estado: "sin_citar", cambios: [], avisos: base.avisos, ...(c?.bloqueo ? { bloqueo: c.bloqueo } : {}),
    eventos: base.eventos.length, conEventos: (r?.ids.length ?? 0) > 0, externo: r?.estado === "externo",
    ...(r?.citadoEn ? { citadoEn: r.citadoEn.toISOString(), citadoPor: r.citadoPor } : {}),
    ...(r?.prueba ? { prueba: r.prueba } : {}), ...(r?.error ? { error: r.error } : {}),
    ...(soloPrueba ? { soloPrueba } : {}), ...(r?.canceladoEn && r.estado === "cancelado" ? { canceladoEn: r.canceladoEn.toISOString() } : {}),
  };
  if (r?.bloqueoHasta && r.bloqueoHasta > ahora) return { ...fila, estado: "enviando" };
  if (!c) {
    // Ya no está en la agenda de este día (p. ej. cambió de día): solo interesa si quedó algo citado.
    return r && r.estado !== "cancelado" && (r.ids.length > 0 || r.estado === "externo" || (r.idsPlan?.length ?? 0) > 0) ? { ...fila, estado: "sobra" } : null;
  }
  if (r?.estado === "error") return { ...fila, estado: "error" };
  if ((r?.estado === "citado" || r?.estado === "externo") && !soloPrueba) {
    if (r.huella !== c.huella) return { ...fila, estado: "desactualizado", cambios: r.resumen ? queCambio(r.resumen, c.resumen) : [] };
    return { ...fila, estado: r.estado };
  }
  if (c.bloqueo) return { ...fila, estado: "no_se_puede" };
  return fila;
}

/** Lo que entra en «Citar todos los pendientes»: sin citar, desactualizadas o con error (en prueba, nunca lo real). */
export function esPendiente(f: Fila, correoPrueba: string | null): boolean {
  if (f.bloqueo || !["sin_citar", "desactualizado", "error"].includes(f.estado)) return false;
  if (correoPrueba && (f.externo || (f.conEventos && !f.prueba))) return false;
  return true;
}

export async function filasDelDia(dia: string, tipo: TipoCitacion, correoPrueba: string | null, ahora = new Date()): Promise<Fila[]> {
  const { citaciones } = await collections();
  const [datos, texto, regs] = await Promise.all([datosDelDia(dia), textoTenEnCuenta(), citaciones.find({ dia, tipo }).toArray()]);
  const cs = citacionesDelDia(tipo, datos, texto);
  const reg = new Map(regs.map((r) => [r.clave, r]));
  const claves = new Set(cs.map((c) => c.clave));
  return [
    ...cs.map((c) => estadoFila(c, reg.get(c.clave) ?? null, correoPrueba, ahora)),
    ...regs.filter((r) => !claves.has(r.clave)).map((r) => estadoFila(null, r, correoPrueba, ahora)),
  ].filter((f): f is Fila => !!f);
}

export type EventoVista = { titulo: string; inicio: string; fin: string; ubicacion?: string; descripcion: string; invitados: { correo: string; nombre: string }[] };

/** Vista previa: los eventos tal como se enviarían (en modo prueba, ya con el correo de prueba). Solo lee. */
export async function vistaPrevia(dia: string, tipo: TipoCitacion, clave: string, correoPrueba: string | null): Promise<{ citacion: Citacion; eventos: EventoVista[] } | null> {
  const c = citacionesDelDia(tipo, await datosDelDia(dia), await textoTenEnCuenta()).find((x) => x.clave === clave);
  if (!c) return null;
  return {
    citacion: c,
    eventos: c.eventos.map((e) => (correoPrueba ? enModoPrueba(e, correoPrueba) : e)).map((e) => ({
      titulo: e.titulo, inicio: e.inicio.toISOString(), fin: e.fin.toISOString(), ...(e.ubicacion ? { ubicacion: e.ubicacion } : {}), descripcion: e.descripcion, invitados: e.invitados,
    })),
  };
}

/* ------------------------------------------------------------------ acciones */

export type Resultado =
  | { clave: string; nombre: string; ok: true; accion: "citado" | "actualizado" | "cancelado" | "marcado"; aviso?: string }
  | { clave: string; nombre: string; ok: false; error: "no_existe" | "no_se_puede" | "ocupado" | "real_en_prueba" | "google" | "sin_eventos"; mensaje: string };

type Opciones = { cliente: ClienteCalendario; correoPrueba: string | null; ahora?: Date };
type ActorAdmin = Actor & { usuario: string };

const actorLog = (a: ActorAdmin) => ({ rol: a.rol, usuario: a.usuario });
const proyectoLog = (tipo: TipoCitacion, clave: string) => (tipo === "participante" && Oid.isValid(clave) ? { proyectoId: new Oid(clave) } : {});
const textoLog = (tipo: TipoCitacion, nombre: string, dia: string, extra = "") => `${TIPO_TXT[tipo]} · ${nombre} · ${dia}${extra}`;

/**
 * Toma la fila para un envío, con un dueño (`bloqueoId`). null = otro envío la tiene tomada. Solo escribe la toma
 * (nombre y fechas, solo si la fila es nueva).
 */
async function tomar(tipo: TipoCitacion, dia: string, clave: string, nombre: string, ahora: Date): Promise<RegistroCitacion | null> {
  const { citaciones } = await collections();
  try {
    return await citaciones.findOneAndUpdate(
      { tipo, clave, dia, $or: [{ bloqueoHasta: { $exists: false } }, { bloqueoHasta: { $lt: ahora } }] },
      { $set: { bloqueoHasta: new Date(ahora.getTime() + LOCK_MS), bloqueoId: randomUUID() }, $setOnInsert: { ids: [], creadoEn: ahora, nombre, actualizadoEn: ahora } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (e) {
    if (e instanceof Error && (e as { code?: number }).code === 11000) return null;
    throw e;
  }
}

/** Filtro de las escrituras de un envío: solo si la fila sigue tomada por él. */
const suya = (r: RegistroCitacion) => ({ _id: r._id, bloqueoId: r.bloqueoId });
const LIBERAR = { bloqueoHasta: "", bloqueoId: "" } as const;

async function soltar(r: RegistroCitacion) {
  const { citaciones } = await collections();
  await citaciones.updateOne(suya(r), { $unset: LIBERAR });
}

const perdida = (clave: string, nombre: string): Resultado => ({ clave, nombre, ok: false, error: "ocupado", mensaje: "Otro envío tomó esta fila mientras tanto. Recarga y revisa su estado." });

const mensajeError = (e: unknown) => (e instanceof ErrorGoogle ? e.message : "Error inesperado al hablar con Google Calendar.");

/** Citar (o actualizar si ya estaba citada). Nunca crea dos veces la misma citación. */
export async function citar(tipo: TipoCitacion, dia: string, clave: string, actor: ActorAdmin, op: Opciones): Promise<Resultado> {
  const ahora = op.ahora ?? new Date();
  const c = citacionesDelDia(tipo, await datosDelDia(dia), await textoTenEnCuenta()).find((x) => x.clave === clave);
  if (!c) return { clave, nombre: clave, ok: false, error: "no_existe", mensaje: "Ya no tiene nada que citar este día." };
  if (c.bloqueo) return { clave, nombre: c.nombre, ok: false, error: "no_se_puede", mensaje: c.bloqueo };
  const r = await tomar(tipo, dia, clave, c.nombre, ahora);
  if (!r) return { clave, nombre: c.nombre, ok: false, error: "ocupado", mensaje: "Se está enviando en este momento. Espera y recarga." };
  if (op.correoPrueba && tieneReal(r)) {
    await soltar(r);
    return { clave, nombre: c.nombre, ok: false, error: "real_en_prueba", mensaje: "Ya está citada de verdad: en modo prueba no se toca." };
  }
  const { citaciones, changeLog } = await collections();
  const previos = [...new Set([...(r.idsPlan ?? []), ...r.ids])];
  const plan = c.eventos.map((_, i) => previos[i] ?? nuevoIdEvento());
  const sobran = previos.filter((id) => !plan.includes(id));
  if (!(await citaciones.updateOne(suya(r), { $set: { idsPlan: [...plan, ...sobran] } })).matchedCount) return perdida(clave, c.nombre);

  const hechos: string[] = [];
  try {
    for (const [i, e] of c.eventos.entries()) {
      await op.cliente.guardar(plan[i]!, op.correoPrueba ? enModoPrueba(e, op.correoPrueba) : e, r.ids.includes(plan[i]!));
      hechos.push(plan[i]!);
    }
    for (const id of sobran) await op.cliente.cancelar(id);
  } catch (e) {
    const mensaje = mensajeError(e);
    // En modo real, si algo ya salió a los invitados reales, deja de contar como prueba.
    const quitaPrueba = !op.correoPrueba && hechos.length > 0;
    await citaciones.updateOne(suya(r), {
      $set: { estado: "error", error: mensaje, errorEn: ahora, ids: [...new Set([...r.ids, ...hechos])], nombre: c.nombre, actualizadoEn: ahora, ...(op.correoPrueba ? { prueba: op.correoPrueba } : {}) },
      $unset: { ...LIBERAR, ...(quitaPrueba ? { prueba: "" } : {}) },
    });
    await changeLog.insertOne({ ...proyectoLog(tipo, clave), accion: "citar", nuevo: textoLog(tipo, c.nombre, dia, " · error"), motivo: mensaje, actor: actorLog(actor), fecha: ahora } as ChangeLog);
    return { clave, nombre: c.nombre, ok: false, error: "google", mensaje };
  }

  const actualiza = r.ids.length > 0 || r.estado === "externo" || r.estado === "citado";
  const fin = await citaciones.updateOne(suya(r), {
    $set: { estado: "citado", ids: plan, resumen: c.resumen, huella: c.huella, citadoEn: ahora, citadoPor: actor.usuario, nombre: c.nombre, actualizadoEn: ahora, ...(op.correoPrueba ? { prueba: op.correoPrueba } : {}) },
    $unset: { ...LIBERAR, idsPlan: "", error: "", errorEn: "", canceladoEn: "", ...(op.correoPrueba ? {} : { prueba: "" }) },
  });
  if (!fin.matchedCount) return perdida(clave, c.nombre);
  await changeLog.insertOne({
    ...proyectoLog(tipo, clave), accion: actualiza ? "actualizar_citacion" : "citar",
    nuevo: textoLog(tipo, c.nombre, dia, ` · ${plan.length} evento${plan.length === 1 ? "" : "s"}${op.correoPrueba ? ` · PRUEBA (${op.correoPrueba})` : ""}`),
    actor: actorLog(actor), fecha: ahora,
  } as ChangeLog);
  const aviso = r.estado === "externo" && !op.correoPrueba ? "Se creó un evento nuevo: cancela a mano en Google Calendar el que enviaste por fuera." : undefined;
  return { clave, nombre: c.nombre, ok: true, accion: actualiza ? "actualizado" : "citado", ...(aviso ? { aviso } : {}) };
}

/** Cancelar una citación: borra sus eventos en Google (avisa a los invitados). Lo marcado por fuera solo se desmarca. */
export async function cancelar(tipo: TipoCitacion, dia: string, clave: string, actor: ActorAdmin, op: Opciones): Promise<Resultado> {
  const ahora = op.ahora ?? new Date();
  const { citaciones, changeLog } = await collections();
  const actual = await citaciones.findOne({ tipo, clave, dia });
  if (!actual || actual.estado === "cancelado" || (!actual.ids.length && !actual.idsPlan?.length && actual.estado !== "externo"))
    return { clave, nombre: actual?.nombre ?? clave, ok: false, error: "sin_eventos", mensaje: "No hay nada citado que cancelar." };
  const r = await tomar(tipo, dia, clave, actual.nombre, ahora);
  if (!r) return { clave, nombre: actual.nombre, ok: false, error: "ocupado", mensaje: "Se está enviando en este momento. Espera y recarga." };
  if (op.correoPrueba && tieneReal(r)) {
    await soltar(r);
    return { clave, nombre: r.nombre, ok: false, error: "real_en_prueba", mensaje: "Está citada de verdad: en modo prueba no se cancela." };
  }
  const ids = [...new Set([...r.ids, ...(r.idsPlan ?? [])])];
  const quedan = [...ids];
  try {
    for (const id of ids) { await op.cliente.cancelar(id); quedan.splice(quedan.indexOf(id), 1); }
  } catch (e) {
    const mensaje = mensajeError(e);
    await citaciones.updateOne(suya(r), { $set: { estado: "error", error: mensaje, errorEn: ahora, ids: quedan, actualizadoEn: ahora }, $unset: { ...LIBERAR, idsPlan: "" } });
    await changeLog.insertOne({ ...proyectoLog(tipo, clave), accion: "cancelar_citacion", nuevo: textoLog(tipo, r.nombre, dia, " · error"), motivo: mensaje, actor: actorLog(actor), fecha: ahora } as ChangeLog);
    return { clave, nombre: r.nombre, ok: false, error: "google", mensaje };
  }
  const fin = await citaciones.updateOne(suya(r), {
    $set: { estado: "cancelado", ids: [], canceladoEn: ahora, actualizadoEn: ahora },
    $unset: { ...LIBERAR, idsPlan: "", resumen: "", huella: "", error: "", errorEn: "", prueba: "" },
  });
  if (!fin.matchedCount) return perdida(clave, r.nombre);
  await changeLog.insertOne({ ...proyectoLog(tipo, clave), accion: "cancelar_citacion", nuevo: textoLog(tipo, r.nombre, dia, ids.length ? ` · ${ids.length} evento${ids.length === 1 ? "" : "s"}` : " · marcada por fuera"), actor: actorLog(actor), fecha: ahora } as ChangeLog);
  const aviso = r.estado === "externo" ? "Estaba marcada como citada por fuera: si debe cancelarse, hazlo a mano en Google Calendar." : undefined;
  return { clave, nombre: r.nombre, ok: true, accion: "cancelado", ...(aviso ? { aviso } : {}) };
}

/**
 * Marcar como citado (sin crear eventos), una o todas las del día y tipo. Guarda lo de ahora como «citado por fuera»
 * (así luego se detecta si cambia). Nunca toca filas con eventos de la app ni filas que se están enviando.
 */
export async function marcarCitado(tipo: TipoCitacion, dia: string, claves: string[] | "todos", actor: ActorAdmin, correoPrueba: string | null, ahora = new Date()): Promise<{ marcados: Resultado[]; omitidos: Extract<Resultado, { ok: false }>[] }> {
  const { citaciones, changeLog } = await collections();
  const cs = citacionesDelDia(tipo, await datosDelDia(dia), await textoTenEnCuenta()).filter((c) => claves === "todos" || claves.includes(c.clave));
  // En modo prueba no se marca nada como citado de verdad.
  if (correoPrueba) return { marcados: [], omitidos: cs.map((c) => ({ clave: c.clave, nombre: c.nombre, ok: false as const, error: "real_en_prueba" as const, mensaje: "En modo prueba no se marca nada como citado." })) };
  const regs = new Map((await citaciones.find({ tipo, dia, clave: { $in: cs.map((c) => c.clave) } }).toArray()).map((r) => [r.clave, r]));
  const marcados: Resultado[] = [], omitidos: Extract<Resultado, { ok: false }>[] = [];
  for (const c of cs) {
    const r = regs.get(c.clave);
    const omitir = (mensaje: string) => omitidos.push({ clave: c.clave, nombre: c.nombre, ok: false, error: "no_se_puede", mensaje });
    if (r?.estado === "externo" && r.huella === c.huella) { omitir("Ya estaba marcada como citada."); continue; }
    if (r && (r.ids.length || r.idsPlan?.length)) { omitir(r.prueba ? "Tiene eventos de prueba de la app: cancélalos primero." : "Tiene eventos de la app: usa «Actualizar» o «Cancelar»."); continue; }
    try {
      const u = await citaciones.updateOne(
        { tipo, clave: c.clave, dia, "ids.0": { $exists: false }, "idsPlan.0": { $exists: false }, $or: [{ bloqueoHasta: { $exists: false } }, { bloqueoHasta: { $lt: ahora } }] },
        {
          $set: { estado: "externo", nombre: c.nombre, resumen: c.resumen, huella: c.huella, citadoEn: ahora, citadoPor: actor.usuario, actualizadoEn: ahora },
          $unset: { error: "", errorEn: "", prueba: "", canceladoEn: "" },
          $setOnInsert: { ids: [], creadoEn: ahora },
        },
        { upsert: true },
      );
      if (!u.matchedCount && !u.upsertedCount) { omitir("No se pudo marcar: recarga."); continue; }
    } catch (e) {
      if (e instanceof Error && (e as { code?: number }).code === 11000) { omitir("Tiene eventos de la app o se está enviando: recarga."); continue; }
      throw e;
    }
    marcados.push({ clave: c.clave, nombre: c.nombre, ok: true, accion: "marcado" });
  }
  if (marcados.length) await changeLog.insertMany(marcados.map((m) => ({ ...proyectoLog(tipo, m.clave), accion: "marcar_citado", nuevo: textoLog(tipo, m.nombre, dia, " · sin evento (citado por fuera)"), actor: actorLog(actor), fecha: ahora } as ChangeLog)));
  return { marcados, omitidos };
}

/** Citar varias, una por una con una pausa (límites de la API). Si una falla, sigue con las demás. */
export async function citarVarias(tipo: TipoCitacion, dia: string, claves: string[], actor: ActorAdmin, op: Opciones & { pausaMs?: number }): Promise<Resultado[]> {
  const out: Resultado[] = [];
  const pausa = op.pausaMs ?? 300;
  for (const [i, clave] of claves.entries()) {
    if (i && pausa) await new Promise((ok) => setTimeout(ok, pausa));
    try { out.push(await citar(tipo, dia, clave, actor, op)); } catch {
      out.push({ clave, nombre: clave, ok: false, error: "google", mensaje: "Error inesperado; se siguió con las demás." });
    }
  }
  return out;
}

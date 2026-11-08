import type ExcelJS from "exceljs";
import { MongoServerError, ObjectId, type ClientSession } from "mongodb";
import { NOMBRES_CIUDADES } from "./ciudades";
import { collections } from "./db";
import { enmascararNumero } from "./estudiante";
import { asignarMonitor } from "./importar/aplicar";
import { clave, texto } from "./importar/excel";
import { leerCelular, leerCorreo, leerDocumento } from "./importar/proyectos";
import type { Actor, ParticipanteSinProyecto } from "./types";
import { cleanSpaces, normalizeCity, toProperName } from "./validation/name";

// Fase 4 · Paso 21 · «Sin proyecto».
//  - Participantes sin proyecto: colección nueva `sin_proyecto` (documento único). Se cargan por Excel o uno por uno y
//    se convierten en proyecto (el registro queda, con `convertidoEn`).
//  - Proyectos marcados: campo nuevo y opcional `sinProyecto` en ESE proyecto, solo si no tiene hora.
// Un documento nunca está a la vez en un proyecto y aquí: cada lado escribe primero y después revisa el otro (si los
// dos escriben a la vez, al menos uno ve al otro y se deshace). Nada cambia sin una acción del admin sobre ese registro.

export const MENSAJE_NO_INSCRITO = "No tienes un proyecto inscrito. Escríbele a tu monitor.";

type Falla = { ok: false; error: string; mensaje: string; campo?: string };
const falla = (error: string, mensaje: string, campo?: string): Falla => ({ ok: false, error, mensaje, ...(campo ? { campo } : {}) });
const mask = (doc: string) => enmascararNumero(doc);
const dup = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

/** Participantes pendientes (sin convertir) con alguno de esos documentos. `excepto`: el que se está convirtiendo. */
export async function enSinProyecto(docs: string[], excepto?: ObjectId | null, s?: ClientSession) {
  const { sinProyecto } = await collections();
  return sinProyecto.find({ documento: { $in: docs }, convertidoEn: { $exists: false }, ...(excepto ? { _id: { $ne: excepto } } : {}) }, { session: s, projection: { documento: 1 } }).toArray();
}

export const mensajeEnSinProyecto = (docs: string[]) =>
  `El documento ${docs.map(mask).join(", ")} está en «Sin proyecto»: conviértelo en proyecto desde ese apartado (o quítalo de allí).`;

/** ¿El portal debe decir «No tienes un proyecto inscrito»? (participante pendiente o proyecto marcado). */
export async function noInscrito(documento: string): Promise<boolean> {
  const { proyectos, sinProyecto } = await collections();
  const [p, sp] = await Promise.all([
    proyectos.findOne({ "integrantes.documento": documento }, { projection: { sinProyecto: 1 } }),
    sinProyecto.findOne({ documento, convertidoEn: { $exists: false } }, { projection: { _id: 1 } }),
  ]);
  return p ? !!p.sinProyecto : !!sp;
}

// ---------- Participantes ----------

export type EntradaParticipante = { nombre: string; documento: string; ciudad: string; celular?: string; correo?: string; monitor?: string | null };
type Valido = Omit<ParticipanteSinProyecto, "_id" | "creadoEn" | "creadoPor" | "convertidoEn" | "proyectoId">;
type Monitor = { usuario: string; nombre: string; ciudades: string[] };

async function monitoresActivos(): Promise<Monitor[]> {
  const { users } = await collections();
  return (await users.find({ rol: "monitor", activo: true }, { projection: { usuario: 1, nombre: 1, ciudades: 1 } }).toArray())
    .map((m) => ({ usuario: m.usuario, nombre: m.nombre, ciudades: m.ciudades }));
}

/**
 * Valida como el importador. `monitor`: undefined = el de la ciudad si tiene uno solo; null = por asignar; un usuario
 * = ese monitor (debe existir). En el Excel, `monitorTexto` (nombre o usuario) se resuelve como en el importador.
 */
function validar(x: EntradaParticipante & { monitorTexto?: string }, monitores: Monitor[], desdeExcel = false): (Valido & { aviso?: string }) | Falla {
  const nombre = toProperName(cleanSpaces(x.nombre ?? ""));
  if (nombre.length < 3) return falla("datos", "Escribe el nombre completo.", "nombre");
  if (nombre.length > 120) return falla("datos", "El nombre es muy largo (máximo 120 caracteres).", "nombre");
  if (!desdeExcel && /[.,]/.test(x.documento ?? "")) return falla("datos", "Escribe el documento sin puntos ni comas.", "documento");
  const d = leerDocumento(x.documento ?? "");
  if (!d) return falla("datos", "Falta el documento.", "documento");
  if ("error" in d) return falla("datos", `El documento ${d.error}.`, "documento");
  const ciudad = desdeExcel ? normalizeCity(x.ciudad ?? "") : x.ciudad;
  if (!NOMBRES_CIUDADES.includes(ciudad)) return falla("datos", x.ciudad ? `Ciudad "${x.ciudad}" no reconocida.` : "Falta la ciudad.", "ciudad");
  let celular: string | undefined, correo: string | undefined;
  if (x.celular?.trim()) {
    const c = leerCelular(x.celular.trim());
    if (c && "error" in c) return falla("datos", `El celular ${c.error}.`, "celular");
    celular = c?.celular;
  }
  if (x.correo?.trim()) {
    if (/[^\x21-\x7e]/.test(x.correo.trim())) return falla("datos", "El correo no puede tener tildes ni espacios.", "correo");
    const c = leerCorreo(x.correo.trim());
    if (c && "error" in c) return falla("datos", `El correo ${c.error}.`, "correo");
    correo = c?.correo;
  }
  let monitor: string | null, aviso: string | undefined;
  if (desdeExcel || x.monitor === undefined) {
    const a = asignarMonitor({ ciudad, monitorTexto: x.monitorTexto || undefined }, monitores);
    monitor = a.monitor;
    if (a.noExiste) aviso = `No hay un monitor "${a.noExiste}": ${a.monitor ? "queda el de la ciudad" : "queda por asignar"}.`;
  } else if (x.monitor === null) monitor = null;
  else if (monitores.some((m) => m.usuario === x.monitor)) monitor = x.monitor;
  else return falla("datos", "Ese monitor no existe o está inactivo.", "monitor");
  return { nombre, documento: d.doc, ciudad, ...(celular ? { celular } : {}), ...(correo ? { correo } : {}), monitor, ...(aviso ? { aviso } : {}) };
}

type ResultadoInsertar = { ok: true; id: string } | Falla;

/** Inserta un participante: escribe y luego revisa que el documento no esté en un proyecto (si está, se deshace). */
async function insertar(v: Valido, actor: Actor): Promise<ResultadoInsertar> {
  const c = await collections();
  const enProyecto = async () => c.proyectos.findOne({ "integrantes.documento": v.documento }, { projection: { codigo: 1 } });
  const ya = await enProyecto();
  if (ya) return falla("en_proyecto", `El documento ${mask(v.documento)} ya está en el proyecto ${ya.codigo}.`, "documento");
  const ahora = new Date(), _id = new ObjectId();
  try {
    await c.sinProyecto.insertOne({ _id, nombre: v.nombre, documento: v.documento, ciudad: v.ciudad, ...(v.celular ? { celular: v.celular } : {}), ...(v.correo ? { correo: v.correo } : {}), monitor: v.monitor, creadoEn: ahora, creadoPor: actor.usuario ?? actor.rol });
  } catch (e) {
    if (!dup(e)) throw e;
    const otro = await c.sinProyecto.findOne({ documento: v.documento }, { projection: { nombre: 1, convertidoEn: 1 } });
    return falla("repetido", otro?.convertidoEn ? `El documento ${mask(v.documento)} ya se convirtió en proyecto.` : `El documento ${mask(v.documento)} ya está en «Sin proyecto» (${otro?.nombre ?? "otro registro"}).`, "documento");
  }
  // Un proyecto con ese documento se guardó en este mismo instante: se deshace este registro.
  const cruce = await enProyecto();
  if (cruce) {
    await c.sinProyecto.deleteOne({ _id });
    return falla("en_proyecto", `El documento ${mask(v.documento)} ya está en el proyecto ${cruce.codigo}.`, "documento");
  }
  await c.changeLog.insertOne({ accion: "sin_proyecto", nuevo: `Participante sin proyecto: ${v.nombre} (${mask(v.documento)}) · ${v.ciudad}`, actor, fecha: ahora });
  return { ok: true, id: String(_id) };
}

export async function agregarParticipante(entrada: EntradaParticipante, actor: Actor): Promise<ResultadoInsertar> {
  const v = validar(entrada, await monitoresActivos());
  if ("ok" in v) return v;
  const { aviso: _aviso, ...datos } = v;
  return insertar(datos, actor);
}

/** Borra un participante pendiente (cargado por error). Uno ya convertido no se borra. */
export async function quitarParticipante(id: ObjectId, actor: Actor): Promise<{ ok: true } | Falla> {
  const c = await collections();
  const sp = await c.sinProyecto.findOneAndDelete({ _id: id, convertidoEn: { $exists: false } });
  if (!sp) return falla("no_existe", "Ese registro ya no está (o ya se convirtió en proyecto).");
  await c.changeLog.insertOne({ accion: "quitar_sin_proyecto", anterior: `Participante sin proyecto: ${sp.nombre} (${mask(sp.documento)}) · ${sp.ciudad}`, nuevo: "Quitado de «Sin proyecto»", actor, fecha: new Date() });
  return { ok: true };
}

// ---------- Marcar un proyecto ----------

/** Marca el proyecto como «Sin proyecto». Solo sin hora; si un integrante reserva en ese instante, la marca se deshace. */
export async function marcarSinProyecto(pid: ObjectId, motivo: string, actor: Actor): Promise<{ ok: true } | Falla> {
  const c = await collections();
  const p = await c.proyectos.findOne({ _id: pid }, { projection: { sinProyecto: 1 } });
  if (!p) return falla("no_existe", "Ese proyecto ya no existe.");
  if (p.sinProyecto) return falla("cambio", "Ese proyecto ya está marcado «Sin proyecto».");
  const conHora = () => c.asientos.findOne({ proyectoId: pid }, { projection: { _id: 1 } });
  if (await conHora()) return falla("tiene_hora", "Primero libera su hora.");
  const ahora = new Date();
  const r = await c.proyectos.updateOne({ _id: pid, sinProyecto: { $exists: false } },
    { $set: { sinProyecto: { desde: ahora, por: actor.usuario ?? actor.rol, ...(motivo ? { motivo } : {}) }, actualizadoEn: ahora } });
  if (!r.modifiedCount) return falla("cambio", "Ese proyecto cambió mientras tanto. Ábrelo otra vez.");
  // La reserva escribe el asiento y después revisa la marca; aquí al revés: alguno de los dos ve al otro.
  if (await conHora()) {
    await c.proyectos.updateOne({ _id: pid, "sinProyecto.desde": ahora }, { $unset: { sinProyecto: "" } });
    return falla("tiene_hora", "Un integrante acaba de elegir hora. Primero libera su hora.");
  }
  await c.changeLog.insertOne({ proyectoId: pid, accion: "sin_proyecto", nuevo: "Marcado «Sin proyecto»", ...(motivo ? { motivo } : {}), actor, fecha: ahora });
  return { ok: true };
}

export async function quitarMarca(pid: ObjectId, actor: Actor): Promise<{ ok: true } | Falla> {
  const c = await collections(), ahora = new Date();
  const r = await c.proyectos.updateOne({ _id: pid, sinProyecto: { $exists: true } }, { $unset: { sinProyecto: "" }, $set: { actualizadoEn: ahora } });
  if (!r.matchedCount) return (await c.proyectos.findOne({ _id: pid }, { projection: { _id: 1 } })) ? falla("cambio", "Ese proyecto ya no está marcado.") : falla("no_existe", "Ese proyecto ya no existe.");
  await c.changeLog.insertOne({ proyectoId: pid, accion: "quitar_sin_proyecto", anterior: "Marcado «Sin proyecto»", nuevo: "Sin marca", actor, fecha: ahora });
  return { ok: true };
}

// ---------- Listas ----------

export type FilaParticipante = {
  id: string; nombre: string; documento: string; ciudad: string; celular?: string; correo?: string; monitor: string | null;
  creadoEn: string; convertido: { codigo: string; en: string } | null;
};
export type FilaMarcado = { id: string; codigo: string; nombre: string; ciudad: string; integrantes: string[]; desde: string; por: string; motivo?: string };

export async function listarSinProyecto(): Promise<{ participantes: FilaParticipante[]; marcados: FilaMarcado[] }> {
  const c = await collections();
  const [ps, marcados] = await Promise.all([
    c.sinProyecto.find({}).sort({ ciudad: 1, nombre: 1 }).toArray(),
    c.proyectos.find({ sinProyecto: { $exists: true } }).sort({ ciudad: 1, nombre: 1 }).toArray(),
  ]);
  const ids = ps.map((p) => p.proyectoId).filter((x): x is ObjectId => !!x);
  const codigos = new Map((await c.proyectos.find({ _id: { $in: ids } }, { projection: { codigo: 1 } }).toArray()).map((p) => [String(p._id), p.codigo]));
  return {
    participantes: ps.map((p) => ({
      id: String(p._id), nombre: p.nombre, documento: p.documento, ciudad: p.ciudad, ...(p.celular ? { celular: p.celular } : {}), ...(p.correo ? { correo: p.correo } : {}),
      monitor: p.monitor ?? null, creadoEn: p.creadoEn.toISOString(),
      convertido: p.convertidoEn ? { codigo: (p.proyectoId && codigos.get(String(p.proyectoId))) || "—", en: p.convertidoEn.toISOString() } : null,
    })),
    marcados: marcados.map((p) => ({
      id: String(p._id), codigo: p.codigo, nombre: p.nombre, ciudad: p.ciudad, integrantes: p.integrantes.map((i) => i.nombre),
      desde: p.sinProyecto!.desde.toISOString(), por: p.sinProyecto!.por, ...(p.sinProyecto!.motivo ? { motivo: p.sinProyecto!.motivo } : {}),
    })),
  };
}

/** Seguimiento de evaluaciones: por ciudad, participantes pendientes y proyectos marcados (con sus estudiantes). */
export type SinProyectoCiudad = { ciudad: string; participantes: number; proyectos: number; estudiantes: number };
export async function sinProyectoPorCiudad(ciudad?: string): Promise<SinProyectoCiudad[]> {
  const c = await collections();
  const [ps, marcados] = await Promise.all([
    c.sinProyecto.find({ convertidoEn: { $exists: false }, ...(ciudad ? { ciudad } : {}) }, { projection: { ciudad: 1 } }).toArray(),
    c.proyectos.find({ sinProyecto: { $exists: true }, ...(ciudad ? { ciudad } : {}) }, { projection: { ciudad: 1, integrantes: 1 } }).toArray(),
  ]);
  const out = new Map<string, SinProyectoCiudad>();
  const fila = (k: string) => { const f = out.get(k) ?? { ciudad: k, participantes: 0, proyectos: 0, estudiantes: 0 }; out.set(k, f); return f; };
  for (const p of ps) { const f = fila(p.ciudad); f.participantes++; f.estudiantes++; }
  for (const p of marcados) { const f = fila(p.ciudad); f.proyectos++; f.estudiantes += p.integrantes.length; }
  return [...out.values()].sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es"));
}

// ---------- Excel ----------

export const COLUMNAS_SIN_PROYECTO = ["Nombre", "Documento", "Ciudad", "Celular", "Correo", "Monitor"] as const;
export const MAX_FILAS_SIN_PROYECTO = 500;

type Col = "nombre" | "documento" | "ciudad" | "celular" | "correo" | "monitor";
const SINONIMOS: [Col, RegExp][] = [
  ["documento", /(documento|cedula|identificacion|^doc\b|^id\b)/],
  ["celular", /^(celular|telefono|movil|whatsapp|cel\b)/],
  ["correo", /^(correo|email|e mail|mail)/],
  ["ciudad", /^(ciudad|sede)/],
  ["monitor", /^monitor/],
  ["nombre", /^(nombre|estudiante|participante|integrante)/],
];

export type FilaExcelSP = { fila: number; v: Valido; aviso?: string };
export type LecturaSinProyecto = { filas: FilaExcelSP[]; errores: { fila: number; mensaje: string }[] };

export async function leerSinProyecto(wb: ExcelJS.Workbook): Promise<LecturaSinProyecto> {
  const out: LecturaSinProyecto = { filas: [], errores: [] };
  const ws = wb.worksheets.find((w) => clave(w.name) === "sin proyecto") ?? wb.worksheets[0];
  if (!ws) return { filas: [], errores: [{ fila: 0, mensaje: "El archivo no tiene hojas." }] };
  if (ws.actualRowCount > MAX_FILAS_SIN_PROYECTO + 1) return { filas: [], errores: [{ fila: 0, mensaje: `El archivo tiene más de ${MAX_FILAS_SIN_PROYECTO} personas. Divídelo en varios archivos.` }] };
  const col: Partial<Record<Col, number>> = {};
  ws.getRow(1).eachCell((c, i) => {
    const k = clave(texto(c.value));
    const hallado = SINONIMOS.find(([, re]) => re.test(k));
    if (hallado) col[hallado[0]] ??= i;
  });
  if (!col.nombre || !col.documento || !col.ciudad) return { filas: [], errores: [{ fila: 1, mensaje: "La primera fila debe tener los encabezados Nombre, Documento y Ciudad (Celular, Correo y Monitor son opcionales)." }] };
  const monitores = await monitoresActivos();
  const vistos = new Map<string, number>();
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const crudo = (c?: number) => (c ? row.getCell(c).value : null);
    const t = (c?: number) => (c ? cleanSpaces(texto(row.getCell(c).value)) : "");
    if (!t(col.nombre) && !t(col.documento) && !t(col.ciudad)) return;
    const docCelda = leerDocumento(crudo(col.documento));
    const v = validar({
      nombre: t(col.nombre), documento: docCelda && "doc" in docCelda ? docCelda.doc : t(col.documento), ciudad: t(col.ciudad),
      celular: t(col.celular), correo: t(col.correo), monitorTexto: t(col.monitor),
    }, monitores, true);
    const quien = t(col.nombre) || `Fila ${r}`;
    if (docCelda && "error" in docCelda) return void out.errores.push({ fila: r, mensaje: `${quien}: el documento ${docCelda.error}.` });
    if ("ok" in v) return void out.errores.push({ fila: r, mensaje: `${quien}: ${v.mensaje.charAt(0).toLowerCase()}${v.mensaje.slice(1)}` });
    const antes = vistos.get(v.documento);
    if (antes) return void out.errores.push({ fila: r, mensaje: `${quien}: el documento ${mask(v.documento)} se repite (fila ${antes}).` });
    vistos.set(v.documento, r);
    const { aviso, ...datos } = v;
    out.filas.push({ fila: r, v: datos, ...(aviso ? { aviso } : {}) });
  });
  if (!out.filas.length && !out.errores.length) out.errores.push({ fila: 0, mensaje: "El archivo no tiene personas." });
  return out;
}

export type PreviaSinProyecto = {
  nuevos: { fila: number; nombre: string; documento: string; ciudad: string; monitor: string | null; aviso?: string }[];
  yaRegistrados: { fila: number; nombre: string; documento: string }[];
  enProyecto: { fila: number; nombre: string; documento: string; codigo: string }[];
  errores: { fila: number; mensaje: string }[];
};

/** Vista previa (no escribe): nuevos, ya registrados (se omiten), en un proyecto (se omiten) y errores por fila. */
export async function previaSinProyecto(l: LecturaSinProyecto): Promise<PreviaSinProyecto & { validos: FilaExcelSP[] }> {
  const c = await collections();
  const docs = l.filas.map((f) => f.v.documento);
  const [registrados, proyectos] = await Promise.all([
    c.sinProyecto.find({ documento: { $in: docs } }, { projection: { documento: 1 } }).toArray(),
    c.proyectos.find({ "integrantes.documento": { $in: docs } }, { projection: { codigo: 1, "integrantes.documento": 1 } }).toArray(),
  ]);
  const yaSet = new Set(registrados.map((x) => x.documento));
  const dueno = new Map(proyectos.flatMap((p) => p.integrantes.map((i) => [i.documento, p.codigo] as const)));
  const previa: PreviaSinProyecto & { validos: FilaExcelSP[] } = { nuevos: [], yaRegistrados: [], enProyecto: [], errores: l.errores, validos: [] };
  for (const f of l.filas) {
    const { nombre, documento, ciudad, monitor } = f.v;
    if (dueno.has(documento)) previa.enProyecto.push({ fila: f.fila, nombre, documento: mask(documento), codigo: dueno.get(documento)! });
    else if (yaSet.has(documento)) previa.yaRegistrados.push({ fila: f.fila, nombre, documento: mask(documento) });
    else { previa.nuevos.push({ fila: f.fila, nombre, documento: mask(documento), ciudad, monitor, ...(f.aviso ? { aviso: f.aviso } : {}) }); previa.validos.push(f); }
  }
  return previa;
}

/** Guarda los nuevos uno por uno (cada uno revisa otra vez que su documento no esté en un proyecto). */
export async function aplicarSinProyecto(validos: FilaExcelSP[], actor: Actor): Promise<{ agregados: number; omitidos: { fila: number; mensaje: string }[] }> {
  let agregados = 0;
  const omitidos: { fila: number; mensaje: string }[] = [];
  for (const f of validos) {
    const r = await insertar(f.v, actor);
    if (r.ok) agregados++; else omitidos.push({ fila: f.fila, mensaje: `${f.v.nombre}: ${r.mensaje}` });
  }
  return { agregados, omitidos };
}

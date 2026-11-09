import { ObjectId } from "mongodb";
import { collections, transaccion } from "./db";
import { enmascararNumero } from "./estudiante";
import type { Actor, ChangeLog, Proyecto } from "./types";

// Fase 4 · Paso 23 · El estudiante edita el nombre y la descripción de SU proyecto desde el portal (cualquiera de los
// integrantes, también después del cierre de su ciudad), mientras no haya evaluación guardada. Solo se escriben
// `nombre`, `descripcion` y `actualizadoEn` de ese proyecto, con la versión que vio (no pisa un cambio simultáneo del
// admin). Queda en el historial con el antes y el después; el admin puede revertirlo si nadie lo cambió después.

export const NOMBRE_MIN = 3, NOMBRE_MAX = 120, DESCRIPCION_MAX = 600;

/** Texto plano de una línea: NFC, sin caracteres de control ni de dirección, espacios normalizados. */
export function textoPlano(t: string): string {
  return t.normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufeff\uffa0]/g, " ")
    .replace(/\s+/gu, " ").trim();
}

export type Falla = { ok: false; error: "sin_proyecto" | "no_inscrito" | "datos" | "evaluado" | "cambio" | "no_existe"; mensaje: string; campo?: "nombre" | "descripcion" };
const falla = (error: Falla["error"], mensaje: string, campo?: Falla["campo"]): Falla => ({ ok: false, error, mensaje, ...(campo ? { campo } : {}) });

export function validarEdicion(nombre: string, descripcion: string): { nombre: string; descripcion: string } | Falla {
  const n = textoPlano(nombre), d = textoPlano(descripcion);
  if (/[<>]/.test(n)) return falla("datos", "El nombre no puede tener los signos < ni >.", "nombre");
  if (/[<>]/.test(d)) return falla("datos", "La descripción no puede tener los signos < ni >.", "descripcion");
  if (n.length < NOMBRE_MIN) return falla("datos", `Escribe el nombre del proyecto (mínimo ${NOMBRE_MIN} caracteres).`, "nombre");
  if (n.length > NOMBRE_MAX) return falla("datos", `El nombre es muy largo (máximo ${NOMBRE_MAX} caracteres).`, "nombre");
  if (d.length > DESCRIPCION_MAX) return falla("datos", `La descripción es muy larga (máximo ${DESCRIPCION_MAX} caracteres).`, "descripcion");
  return { nombre: n, descripcion: d };
}

async function evaluado(proyectoId: ObjectId) {
  const { evalResultados } = await collections();
  return !!(await evalResultados.findOne({ proyectoId, noPresento: false }, { projection: { _id: 1 } }));
}

const txt = (s: string) => (s ? `«${s}»` : "(sin descripción)");
const resumen = (n: string, d: string) => `Nombre: «${n}» · Descripción: ${txt(d)}`;

export type ResultadoEdicion = { ok: true; proyecto: { nombre: string; descripcion?: string }; version: string } | Falla;

/** Edición desde el portal. `version`: el `actualizadoEn` que vio el estudiante. */
export async function editarDesdePortal(documento: string, entrada: { nombre: string; descripcion: string; version: string }, ahora = new Date()): Promise<ResultadoEdicion> {
  const v = validarEdicion(entrada.nombre, entrada.descripcion);
  if ("ok" in v) return v;
  const { proyectos, changeLog, sinProyecto } = await collections();
  const p = await proyectos.findOne({ "integrantes.documento": documento });
  if (!p) return (await sinProyecto.findOne({ documento, convertidoEn: { $exists: false } }, { projection: { _id: 1 } }))
    ? falla("no_inscrito", "No tienes un proyecto inscrito. Escríbele a tu monitor.") : falla("sin_proyecto", "No encontramos un proyecto con ese documento.");
  if (p.sinProyecto) return falla("no_inscrito", "No tienes un proyecto inscrito. Escríbele a tu monitor.");
  if (await evaluado(p._id)) return falla("evaluado", "Tu proyecto ya fue evaluado: el nombre y la descripción ya no se cambian. Si hay un error, escríbele a tu monitor.");
  if (p.actualizadoEn.toISOString() !== entrada.version) return falla("cambio", "Tu proyecto cambió mientras lo editabas. Revisa cómo quedó y vuelve a intentarlo.");
  const antes = { nombre: p.nombre, descripcion: p.descripcion ?? "" };
  if (antes.nombre === v.nombre && antes.descripcion === v.descripcion) return { ok: true, proyecto: vistaP(p), version: entrada.version };
  // El cambio y su historial van juntos (si uno falla, no queda ninguno).
  let cambio = true;
  await transaccion(async (s) => {
    const r = await proyectos.updateOne({ _id: p._id, actualizadoEn: p.actualizadoEn, sinProyecto: { $exists: false } },
      { $set: { nombre: v.nombre, ...(v.descripcion ? { descripcion: v.descripcion } : {}), actualizadoEn: ahora }, ...(v.descripcion ? {} : { $unset: { descripcion: "" } }) }, { session: s });
    if (!r.matchedCount) { cambio = false; return; }
    await changeLog.insertOne({
      proyectoId: p._id, accion: "editar_proyecto",
      anterior: resumen(antes.nombre, antes.descripcion), nuevo: resumen(v.nombre, v.descripcion),
      motivo: "El estudiante lo cambió en el portal",
      cambio: { nombre: [antes.nombre, v.nombre], descripcion: [antes.descripcion, v.descripcion] },
      actor: { rol: "estudiante", usuario: enmascararNumero(documento) }, fecha: ahora,
    }, { session: s });
  });
  if (!cambio) return falla("cambio", "Tu proyecto cambió mientras lo editabas. Revisa cómo quedó y vuelve a intentarlo.");
  // Si el mentor guardó la evaluación en este mismo instante, se deshace el cambio (solo si sigue siendo el nuestro).
  if (await evaluado(p._id)) {
    await transaccion(async (s) => {
      const r = await proyectos.updateOne({ _id: p._id, actualizadoEn: ahora },
        { $set: { nombre: antes.nombre, ...(antes.descripcion ? { descripcion: antes.descripcion } : {}), actualizadoEn: new Date() }, ...(antes.descripcion ? {} : { $unset: { descripcion: "" } }) }, { session: s });
      if (r.matchedCount) await changeLog.insertOne({ proyectoId: p._id, accion: "editar_proyecto", anterior: resumen(v.nombre, v.descripcion), nuevo: resumen(antes.nombre, antes.descripcion), motivo: "Se deshizo: el proyecto se evaluó al mismo tiempo", actor: { rol: "estudiante", usuario: enmascararNumero(documento) }, fecha: new Date() }, { session: s });
    });
    return falla("evaluado", "Tu proyecto ya fue evaluado: el nombre y la descripción ya no se cambian. Si hay un error, escríbele a tu monitor.");
  }
  return { ok: true, proyecto: { nombre: v.nombre, ...(v.descripcion ? { descripcion: v.descripcion } : {}) }, version: ahora.toISOString() };
}

const vistaP = (p: Pick<Proyecto, "nombre" | "descripcion">) => ({ nombre: p.nombre, ...(p.descripcion ? { descripcion: p.descripcion } : {}) });

/** ¿Se puede revertir esa entrada? Del estudiante, con su cambio, es la última edición del proyecto (`ultima`: _id de
 *  la entrada `editar_proyecto` más reciente) y el proyecto sigue con el «después». */
export function revertible(c: Pick<ChangeLog, "_id" | "accion" | "actor" | "cambio">, p: Pick<Proyecto, "nombre" | "descripcion"> | null, ultima: string | null): boolean {
  if (c.accion !== "editar_proyecto" || c.actor.rol !== "estudiante" || !c.cambio || !p || String(c._id) !== ultima) return false;
  return p.nombre === c.cambio.nombre[1] && (p.descripcion ?? "") === c.cambio.descripcion[1];
}

/** El admin deshace un cambio del estudiante: solo si el proyecto sigue con lo que dejó el estudiante. */
export async function revertirEdicion(pid: ObjectId, entrada: ObjectId, actor: Actor): Promise<{ ok: true } | Falla> {
  const { proyectos, changeLog } = await collections();
  const [c, p] = await Promise.all([changeLog.findOne({ _id: entrada, proyectoId: pid }), proyectos.findOne({ _id: pid })]);
  if (!p) return falla("no_existe", "Ese proyecto ya no existe.");
  if (!c || c.accion !== "editar_proyecto" || c.actor.rol !== "estudiante" || !c.cambio) return falla("no_existe", "Ese cambio no se puede revertir.");
  const ultima = await changeLog.findOne({ proyectoId: pid, accion: "editar_proyecto" }, { sort: { fecha: -1, _id: -1 }, projection: { _id: 1 } });
  if (!revertible(c, p, ultima ? String(ultima._id) : null)) return falla("cambio", "El nombre o la descripción cambiaron después de ese cambio: edítalo a mano.");
  const [nombre, descripcion] = [c.cambio.nombre[0], c.cambio.descripcion[0]];
  const ahora = new Date();
  let ok = true;
  await transaccion(async (s) => {
    const r = await proyectos.updateOne({ _id: pid, actualizadoEn: p.actualizadoEn },
      { $set: { nombre, ...(descripcion ? { descripcion } : {}), actualizadoEn: ahora }, ...(descripcion ? {} : { $unset: { descripcion: "" } }) }, { session: s });
    if (!r.matchedCount) { ok = false; return; }
    await changeLog.insertOne({
      proyectoId: pid, accion: "editar_proyecto", anterior: resumen(c.cambio!.nombre[1], c.cambio!.descripcion[1]), nuevo: resumen(nombre, descripcion),
      motivo: "Revertido el cambio del estudiante", actor, fecha: ahora,
    }, { session: s });
  });
  return ok ? { ok: true } : falla("cambio", "Alguien cambió este proyecto mientras tanto. Ábrelo otra vez.");
}

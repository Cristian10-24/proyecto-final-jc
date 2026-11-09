import type { ClientSession, Filter, ObjectId } from "mongodb";
import { collections } from "./db";
import { quedaSobreTope } from "./modoCupos";
import type { Asiento } from "./types";

// Mover o liberar un proyecto DENTRO de una transacción: la única lógica para cambiar de asiento. La usan el admin
// (Horarios y el tablero), el monitor (reprogramar) y la bandeja de sugerencias (aprobar).
// - No se mueve ni se libera un proyecto con evaluación guardada (quedaría con otro mentor o sin hora).
// - Como el prototipo, quien estaba "No se presentó" vuelve a Pendiente, se borra la asistencia que marcó el monitor
//   (motivo y observación quedan) y el borrador del mentor anterior.

export class Falla extends Error { constructor(readonly codigo: "sin_cupo" | "ya_evaluado" | "cambio" | "sin_hora" | "tope" | "marcado" | "con_datos" | "por_empezar" | "en_curso") { super(codigo); } }

/**
 * Fase 4 · `tope`: con el modo orden de llegada encendido, "respetar" (por defecto; monitor) rechaza con Falla("tope")
 * si la ciudad queda por encima de su tope en el día nuevo; "permitir" (admin que confirmó) lo deja pasar y lo avisa en
 * `sobreTope`. Usar dentro de `conCandado` (crea el candado si falta). Con el modo apagado no cambia nada.
 */
export type OpcionesMover = { tope?: "respetar" | "permitir" };

async function noEvaluado(s: ClientSession, proyectoId: ObjectId) {
  const c = await collections();
  if (await c.evalResultados.findOne({ proyectoId, noPresento: false }, { session: s, projection: { _id: 1 } })) throw new Falla("ya_evaluado");
}

async function limpiar(s: ClientSession, proyectoId: ObjectId, usuario: string, ahora: Date) {
  const c = await collections();
  await c.evalResultados.deleteMany({ proyectoId }, { session: s }); // solo quedaban "No se presentó"
  await c.evalMonitor.updateMany({ proyectoId }, { $set: { asistencia: null, actualizadoEn: ahora, actualizadoPor: usuario } }, { session: s });
  await c.evalBorradores.deleteOne({ _id: String(proyectoId) }, { session: s });
}

/**
 * Pasa el proyecto de su asiento actual `viejoId` (null = no tenía hora) al primer asiento libre que cumpla alguno
 * de `filtros`, en orden. Si el asiento actual ya no es el esperado (alguien lo movió), Falla("cambio").
 */
export async function moverProyecto(s: ClientSession, proyectoId: ObjectId, viejoId: ObjectId | null, filtros: Filter<Asiento>[], usuario: string, ahora: Date, opciones: OpcionesMover = {}): Promise<Asiento & { sobreTope: boolean }> {
  const c = await collections();
  await noEvaluado(s, proyectoId);
  let diaAnterior: string | null = null;
  if (viejoId) {
    const suelto = await c.asientos.findOneAndUpdate({ _id: viejoId, proyectoId }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } }, { session: s });
    if (!suelto) throw new Falla("cambio");
    diaAnterior = suelto.dia;
  } else if (await c.asientos.findOne({ proyectoId }, { session: s, projection: { _id: 1 } })) throw new Falla("cambio");
  let nuevo: Asiento | null = null;
  for (const f of filtros) {
    nuevo = await c.asientos.findOneAndUpdate({ $and: [f, { proyectoId: null }, ...(viejoId ? [{ _id: { $ne: viejoId } }] : [])] },
      { $set: { proyectoId, reservadoEn: ahora } }, { session: s, returnDocument: "after", sort: { mentorId: 1 } });
    if (nuevo) break;
  }
  if (!nuevo) throw new Falla("sin_cupo");
  const p = await c.proyectos.findOne({ _id: proyectoId }, { session: s, projection: { ciudad: 1, sinProyecto: 1 } });
  // Paso 21: un proyecto marcado «Sin proyecto» no recibe hora (primero se quita la marca).
  if (p?.sinProyecto) throw new Falla("marcado");
  const sobreTope = !!p && await quedaSobreTope(s, p.ciudad, diaAnterior, nuevo.dia);
  if (sobreTope && opciones.tope !== "permitir") throw new Falla("tope");
  await limpiar(s, proyectoId, usuario, ahora);
  return { ...nuevo, sobreTope };
}

/** Libera el asiento del proyecto (queda sin hora). Devuelve el asiento que tenía. */
export async function liberarProyecto(s: ClientSession, proyectoId: ObjectId, usuario: string, ahora: Date): Promise<Asiento> {
  const c = await collections();
  await noEvaluado(s, proyectoId);
  const a = await c.asientos.findOneAndUpdate({ proyectoId }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } }, { session: s });
  if (!a) throw new Falla("sin_hora");
  await limpiar(s, proyectoId, usuario, ahora);
  return a;
}

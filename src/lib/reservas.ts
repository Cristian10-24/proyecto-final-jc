import { MongoServerError, type ObjectId } from "mongodb";
import { ciudadesExplicitas, puedeElegir } from "./agenda";
import { horaCO } from "./ciudades";
import { collections } from "./db";
import { estadoCiudad } from "./reglasCupos";
import { diaCOL } from "./edicion";

// Reserva de un bloque por el estudiante. Sin bloqueos en memoria: un solo findOneAndUpdate atómico
// toma un asiento libre de la ciudad en ese bloque, y el índice único parcial sobre asientos.proyectoId
// impide que un proyecto quede con dos asientos aunque los dos integrantes reserven a la vez.

export type ResultadoReserva =
  | { ok: true; inicio: Date; dia: string }
  | { ok: false; error: "sin_proyecto" | "ya_tiene_hora" | "dia_no_disponible" | "aun_no_abre" | "bloque_pasado" | "sin_cupo" | "cerrado"; inicio?: Date; cierre?: string; abre?: string };

export const MENSAJES_RESERVA: Record<Exclude<ResultadoReserva, { ok: true }>["error"], string> = {
  sin_proyecto: "No encontramos un proyecto con ese documento.",
  ya_tiene_hora: "Tu proyecto ya tiene una hora elegida.",
  dia_no_disponible: "Tu ciudad no presenta ese día.",
  aun_no_abre: "La elección de hora para ese día todavía no está abierta para tu ciudad.",
  bloque_pasado: "Esa hora ya pasó. Elige otra.",
  sin_cupo: "Alguien acaba de tomar esa hora. Elige otra.",
  cerrado: "Las inscripciones de tu ciudad ya cerraron.",
};

/** Asiento del proyecto, si ya tiene uno. */
export async function asientoDe(proyectoId: ObjectId) {
  const { asientos } = await collections();
  return asientos.findOne({ proyectoId });
}

export async function reservar(documento: string, inicio: Date, ahora = new Date(), intento = 0): Promise<ResultadoReserva> {
  const { proyectos, asientos, dias, changeLog } = await collections();
  const proyecto = await proyectos.findOne({ "integrantes.documento": documento }, { projection: { ciudad: 1, codigo: 1 } });
  if (!proyecto) return { ok: false, error: "sin_proyecto" };

  const actual = await asientoDe(proyecto._id);
  if (actual) return { ok: false, error: "ya_tiene_hora", inicio: actual.inicio };
  if (inicio.getTime() <= ahora.getTime()) return { ok: false, error: "bloque_pasado" };
  const e = await estadoCiudad(proyecto.ciudad, ahora);
  if (e.estado === "cerrado") return { ok: false, error: "cerrado", cierre: e.cierre };
  if (e.estado === "antes") return { ok: false, error: "aun_no_abre", abre: e.abre };

  const dia = diaCOL(inicio);
  const configs = await dias.find({}).toArray();
  const explicitas = ciudadesExplicitas(configs);
  const cfg = configs.find((d) => d._id === dia);
  if (!cfg || !puedeElegir({ ...cfg, ciudades: cfg.ciudades.map((c) => ({ ...c, abre: null })) }, proyecto.ciudad, ahora, explicitas))
    return { ok: false, error: "dia_no_disponible" };
  if (!puedeElegir(cfg, proyecto.ciudad, ahora, explicitas)) return { ok: false, error: "aun_no_abre" };

  let tomado;
  try {
    tomado = await asientos.findOneAndUpdate(
      { inicio, proyectoId: null, ciudades: proyecto.ciudad },
      { $set: { proyectoId: proyecto._id, reservadoEn: ahora } },
      { returnDocument: "after" },
    );
  } catch (e) {
    // El otro integrante reservó en el mismo instante: el índice único lo frenó.
    if (e instanceof MongoServerError && e.code === 11000) {
      const ya = await asientoDe(proyecto._id);
      return { ok: false, error: "ya_tiene_hora", ...(ya ? { inicio: ya.inicio } : {}) };
    }
    throw e;
  }
  if (!tomado) return { ok: false, error: "sin_cupo" };
  // Si el admin separó o unió el proyecto mientras tanto, el documento ya no está en él: se suelta ese asiento (solo si
  // sigue siendo esta reserva) y se intenta otra vez con su proyecto actual. Sin cambios del admin, no hace nada.
  if (!(await proyectos.findOne({ _id: proyecto._id, "integrantes.documento": documento }, { projection: { _id: 1 } }))) {
    await asientos.updateOne({ _id: tomado._id, proyectoId: proyecto._id, reservadoEn: ahora }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } });
    return intento < 2 ? reservar(documento, inicio, ahora, intento + 1) : { ok: false, error: "sin_proyecto" };
  }

  await changeLog.insertOne({ proyectoId: proyecto._id, accion: "reservar", nuevo: `${dia} ${horaCO(inicio)}`, actor: { rol: "estudiante", usuario: documento }, fecha: ahora });
  return { ok: true, inicio: tomado.inicio, dia };
}

import { ObjectId, type AnyBulkWriteOperation, type ClientSession } from "mongodb";
import { resumenPorDia } from "../agenda";
import { horaCO } from "../ciudades";
import { collections, getClient } from "../db";
import type { Actor, Asiento } from "../types";
import type { ErrorFila } from "./excel";
import { HOJAS_MENTORES, type LibroMentores } from "./mentores";
import { HOJA_PROYECTOS, type ProyectoLeido } from "./proyectos";

// Vista previa (no escribe) y aplicación de cada importación. La vista previa también revisa contra
// la base: documentos que ya son de otro proyecto, proyectos con hora que cambian de ciudad y horas-mentor
// reservadas que desaparecen del archivo.

export type PreviaProyectos = {
  total: number; nuevos: number; actualizados: number; fueraDelArchivo: number;
  porCiudad: Record<string, number>; errores: ErrorFila[];
};

export async function previaProyectos(leidos: ProyectoLeido[], errores: ErrorFila[]): Promise<PreviaProyectos> {
  const { proyectos, asientos } = await collections();
  const errs = [...errores];
  const existentes = await proyectos.find({}, { projection: { codigo: 1, ciudad: 1, "integrantes.documento": 1 } }).toArray();
  const porCodigo = new Map(existentes.map((p) => [p.codigo, p]));
  const duenoDoc = new Map(existentes.flatMap((p) => p.integrantes.map((i) => [i.documento, p.codigo] as const)));
  const conHora = new Set((await asientos.find({ proyectoId: { $type: "objectId" } }, { projection: { proyectoId: 1 } }).toArray()).map((a) => String(a.proyectoId)));

  let nuevos = 0, actualizados = 0;
  const porCiudad: Record<string, number> = {};
  for (const p of leidos) {
    const actual = porCodigo.get(p.codigo);
    const err = (mensaje: string) => errs.push({ hoja: HOJA_PROYECTOS, fila: p.fila, mensaje });
    for (const i of p.integrantes) {
      const dueno = duenoDoc.get(i.documento);
      if (dueno && dueno !== p.codigo) err(`El documento ${i.documento} ya es del proyecto ${dueno}.`);
    }
    if (actual && actual.ciudad !== p.ciudad && conHora.has(String(actual._id)))
      err(`El proyecto ${p.codigo} ya tiene hora en ${actual.ciudad}: libera su hora antes de cambiarle la ciudad.`);
    if (actual) actualizados++; else nuevos++;
    porCiudad[p.ciudad] = (porCiudad[p.ciudad] ?? 0) + 1;
  }
  const enArchivo = new Set(leidos.map((p) => p.codigo));
  errs.sort((a, b) => a.fila - b.fila);
  return { total: leidos.length, nuevos, actualizados, fueraDelArchivo: existentes.filter((p) => !enArchivo.has(p.codigo)).length, porCiudad, errores: errs };
}

export async function aplicarProyectos(leidos: ProyectoLeido[], actor: Actor) {
  const { proyectos, changeLog } = await collections();
  const now = new Date();
  if (leidos.length)
    await proyectos.bulkWrite(leidos.map((p) => ({
      updateOne: {
        filter: { codigo: p.codigo },
        update: {
          $set: { ciudad: p.ciudad, nombre: p.nombre, integrantes: p.integrantes, actualizadoEn: now, ...(p.grupo ? { grupo: p.grupo } : {}) },
          ...(p.grupo ? {} : { $unset: { grupo: "" } }),
          $setOnInsert: { _id: new ObjectId(), creadoEn: now },
        },
        upsert: true,
      },
    })), { ordered: false });
  await changeLog.insertOne({ accion: "importar", nuevo: `proyectos: ${leidos.length}`, actor, fecha: now });
}

export type PreviaMentores = {
  mentores: number; avisos: ErrorFila[]; errores: ErrorFila[];
  dias: { dia: string; asientos: number; porCiudad: Record<string, number> }[];
  /** Horas disponibles de cada mentor en el archivo, para comprobar ajustes. */
  horasPorMentor: { nombre: string; horas: number }[];
  /** Asientos que ya tienen reserva y se conservan tal cual. */
  reservadosQueSeConservan: number;
};

const claveAsiento = (a: { inicio: Date; mentorId: string }) => `${a.inicio.toISOString()}|${a.mentorId}`;

/**
 * Asientos reservados cuya hora-mentor ya no está en el archivo. Nunca se borran: son conflictos que
 * el admin debe resolver primero (mover o liberar el proyecto).
 */
async function conflictos(libro: LibroMentores, session?: ClientSession): Promise<ErrorFila[]> {
  const c = await collections();
  const nuevas = new Set(libro.asientos.map(claveAsiento));
  const reservados = await c.asientos.find({ proyectoId: { $type: "objectId" } }, { session }).toArray();
  const perdidos = reservados.filter((a) => !nuevas.has(claveAsiento(a)));
  if (!perdidos.length) return [];
  const proys = new Map((await c.proyectos.find({ _id: { $in: perdidos.map((a) => a.proyectoId!) } }, { session, projection: { codigo: 1, ciudad: 1 } }).toArray()).map((p) => [String(p._id), p]));
  const mentores = new Map((await c.mentores.find({ _id: { $in: perdidos.map((a) => a.mentorId) } }, { session }).toArray()).map((m) => [m._id, m.nombre]));
  return perdidos
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    .map((a) => {
      const p = proys.get(String(a.proyectoId));
      return { hoja: HOJAS_MENTORES.horarios, fila: 0, mensaje: `Conflicto: ${p ? `${p.codigo} (${p.ciudad})` : "un proyecto"} tiene hora el ${a.dia} a las ${horaCO(a.inicio)} con ${mentores.get(a.mentorId) ?? a.mentorId}, que ya no está disponible en el archivo. Muévelo o libéralo antes de reimportar.` };
    });
}

export async function previaMentores(libro: LibroMentores): Promise<PreviaMentores> {
  const { asientos } = await collections();
  const errores = [...(await conflictos(libro)), ...libro.errores];
  const horas = new Map<string, number>();
  for (const h of libro.horas) for (const m of h.mentores) horas.set(m, (horas.get(m) ?? 0) + 1);
  const nombre = new Map(libro.mentores.map((m) => [m._id, m.nombre]));
  return {
    mentores: libro.mentores.length, avisos: libro.avisos, errores, dias: resumenPorDia(libro.asientos),
    horasPorMentor: [...horas].map(([id, n]) => ({ nombre: nombre.get(id) ?? id, horas: n })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    reservadosQueSeConservan: await asientos.countDocuments({ proyectoId: { $type: "objectId" } }),
  };
}

/**
 * Reemplaza mentores y días, y sincroniza los asientos en una transacción: los reservados se conservan
 * tal cual, los libres que siguen se reetiquetan, los libres que ya no están se borran y los nuevos se
 * crean. Falla ("conflictos") si una hora-mentor reservada ya no está en el archivo.
 */
export async function aplicarMentores(libro: LibroMentores, actor: Actor) {
  const c = await collections();
  const client = await getClient();
  const now = new Date();
  await client.withSession((s) => s.withTransaction(async () => {
    if ((await conflictos(libro, s)).length) throw new Error("conflictos");
    const actuales = new Map((await c.asientos.find({}, { session: s, projection: { inicio: 1, mentorId: 1, proyectoId: 1 } }).toArray()).map((a) => [claveAsiento(a), a]));
    const nuevas = new Set(libro.asientos.map(claveAsiento));
    const borrar = [...actuales].filter(([k, a]) => !nuevas.has(k) && !a.proyectoId).map(([, a]) => a._id);
    if (borrar.length) await c.asientos.deleteMany({ _id: { $in: borrar } }, { session: s });
    const ops: AnyBulkWriteOperation<Asiento>[] = [];
    for (const a of libro.asientos) {
      const actual = actuales.get(claveAsiento(a));
      if (!actual) ops.push({ insertOne: { document: { _id: new ObjectId(), ...a, proyectoId: null } } });
      else if (!actual.proyectoId) ops.push({ updateOne: { filter: { _id: actual._id, proyectoId: null }, update: { $set: { ciudades: a.ciudades } } } });
    }
    if (ops.length) await c.asientos.bulkWrite(ops, { session: s, ordered: false });
    await c.mentores.deleteMany({}, { session: s });
    await c.dias.deleteMany({}, { session: s });
    if (libro.mentores.length) await c.mentores.insertMany(libro.mentores, { session: s });
    if (libro.cupos.size) await c.dias.insertMany([...libro.cupos].map(([dia, ciudades]) => ({ _id: dia, ciudades })), { session: s });
    await c.changeLog.insertOne({ accion: "importar", nuevo: `mentores: ${libro.mentores.length}, asientos: ${libro.asientos.length}`, actor, fecha: now }, { session: s });
  }));
}

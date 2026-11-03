import { ObjectId } from "mongodb";
import { resumenPorDia } from "../agenda";
import { collections, getClient } from "../db";
import type { Actor } from "../types";
import type { ErrorFila } from "./excel";
import type { LibroMentores } from "./mentores";
import { HOJA_PROYECTOS, type ProyectoLeido } from "./proyectos";

// Vista previa (no escribe) y aplicación de cada importación. La vista previa también revisa contra
// la base: documentos que ya son de otro proyecto, proyectos con hora que cambian de ciudad, reservas.

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
};

export async function previaMentores(libro: LibroMentores): Promise<PreviaMentores> {
  const { asientos } = await collections();
  const errores = [...libro.errores];
  const reservados = await asientos.countDocuments({ proyectoId: { $type: "objectId" } });
  if (reservados)
    errores.unshift({ hoja: "", fila: 0, mensaje: `Ya hay ${reservados} proyectos con hora: no se pueden reemplazar los asientos. Para ajustar cupos, reetiqueta los asientos libres.` });
  return { mentores: libro.mentores.length, avisos: libro.avisos, errores, dias: resumenPorDia(libro.asientos) };
}

/** Reemplaza mentores, días y asientos en una transacción. Falla si alguien ya reservó. */
export async function aplicarMentores(libro: LibroMentores, actor: Actor) {
  const c = await collections();
  const client = await getClient();
  const now = new Date();
  await client.withSession((s) => s.withTransaction(async () => {
    if (await c.asientos.countDocuments({ proyectoId: { $type: "objectId" } }, { session: s })) throw new Error("ya_hay_reservas");
    await c.asientos.deleteMany({}, { session: s });
    await c.mentores.deleteMany({}, { session: s });
    await c.dias.deleteMany({}, { session: s });
    if (libro.mentores.length) await c.mentores.insertMany(libro.mentores, { session: s });
    if (libro.cupos.size) await c.dias.insertMany([...libro.cupos].map(([dia, ciudades]) => ({ _id: dia, ciudades })), { session: s });
    if (libro.asientos.length)
      await c.asientos.insertMany(libro.asientos.map((a) => ({ _id: new ObjectId(), ...a, proyectoId: null })), { session: s });
    await c.changeLog.insertOne({ accion: "importar", nuevo: `mentores: ${libro.mentores.length}, asientos: ${libro.asientos.length}`, actor, fecha: now }, { session: s });
  }));
}

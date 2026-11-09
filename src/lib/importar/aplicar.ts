import { ObjectId, type AnyBulkWriteOperation, type ClientSession } from "mongodb";
import { diasPorCiudad, resumenPorDia } from "../agenda";
import { horaCO } from "../ciudades";
import { collections, transaccion } from "../db";
import { franjasEditadas } from "../franjas";
import { diasEditados } from "../reglasCupos";
import type { Actor, Asiento } from "../types";
import { clave, type ErrorFila } from "./excel";
import { HOJAS_MENTORES, type LibroMentores } from "./mentores";
import { CAMPOS, type Campo, type Columna, type LecturaProyectos, type ProyectoLeido } from "./proyectos";
import { FILTRO_MONITOR } from "../permisos";

// Vista previa (no escribe) y aplicación de cada importación. La vista previa también revisa contra
// la base: documentos que ya son de otro proyecto, proyectos con hora que cambian de ciudad y horas-mentor
// reservadas que desaparecen del archivo.

export type PreviaProyectos = {
  total: number; nuevos: number; actualizados: number; fueraDelArchivo: number;
  porCiudad: Record<string, number>; errores: ErrorFila[]; avisos: ErrorFila[];
  /** Columnas del archivo y el campo reconocido en cada una; `faltan` = obligatorios sin columna. */
  columnas: Columna[]; faltan: { campo: Campo; etiqueta: string }[];
  monitores: { asignados: number; porAsignar: { ciudad: string; proyectos: number; motivo: string }[] };
};

type MonitorUsuario = { usuario: string; nombre: string; ciudades: string[] };

/**
 * Monitor de un proyecto: el de la columna Monitor si coincide con un usuario; si no, el único monitor
 * de su ciudad. Con varios (o ninguno) queda por asignar, para que el admin lo elija.
 */
export function asignarMonitor(p: Pick<ProyectoLeido, "ciudad" | "monitorTexto">, monitores: MonitorUsuario[]): { monitor: string | null; motivo?: string; noExiste?: string } {
  let noExiste: string | undefined;
  if (p.monitorTexto) {
    const k = clave(p.monitorTexto);
    const m = monitores.find((x) => clave(x.nombre) === k || x.usuario === p.monitorTexto!.toLowerCase());
    if (m) return { monitor: m.usuario };
    noExiste = p.monitorTexto;
  }
  const deCiudad = monitores.filter((m) => m.ciudades.includes(p.ciudad));
  if (deCiudad.length === 1) return { monitor: deCiudad[0]!.usuario, ...(noExiste ? { noExiste } : {}) };
  return { monitor: null, motivo: deCiudad.length ? "varios monitores en la ciudad" : "la ciudad no tiene monitor", ...(noExiste ? { noExiste } : {}) };
}

export async function previaProyectos(lectura: LecturaProyectos): Promise<PreviaProyectos & { asignaciones: Map<string, string | null> }> {
  const { proyectos, asientos, dias, users, sinProyecto, changeLog } = await collections();
  const { proyectos: leidos, columnas, faltan } = lectura;
  const errs = [...lectura.errores];
  const avisos: ErrorFila[] = [];
  const existentes = await proyectos.find({}, { projection: { codigo: 1, ciudad: 1, nombre: 1, descripcion: 1, "integrantes.documento": 1 } }).toArray();
  // Paso 23: proyectos cuyo nombre o descripción cambió el estudiante en el portal.
  const editadosPorEstudiante = new Set((await changeLog.distinct("proyectoId", { accion: "editar_proyecto", "actor.rol": "estudiante" })).map(String));
  const porCodigo = new Map(existentes.map((p) => [p.codigo, p]));
  const duenoDoc = new Map(existentes.flatMap((p) => p.integrantes.map((i) => [i.documento, p.codigo] as const)));
  const conHora = new Set((await asientos.find({ proyectoId: { $type: "objectId" } }, { projection: { proyectoId: 1 } }).toArray()).map((a) => String(a.proyectoId)));
  // Fase 4 · Paso 21: un documento en «Sin proyecto» (sin convertir) no entra a un proyecto por el importador.
  const enSinProyecto = new Set((await sinProyecto.find({ convertidoEn: { $exists: false } }, { projection: { documento: 1 } }).toArray()).map((x) => x.documento));
  const configDias = await dias.find({}).toArray();
  if (!configDias.length && leidos.length)
    avisos.push({ hoja: "", fila: 0, mensaje: "Aún no hay mentores ni cupos importados: no se pudo revisar qué ciudades tienen días habilitados." });
  const monitores = (await users.find({ ...FILTRO_MONITOR, activo: true }, { projection: { usuario: 1, nombre: 1, ciudades: 1 } }).toArray()) as MonitorUsuario[];

  let nuevos = 0, actualizados = 0, asignados = 0;
  const porCiudad: Record<string, number> = {};
  const pendientes = new Map<string, { ciudad: string; proyectos: number; motivo: string }>();
  const asignaciones = new Map<string, string | null>();
  for (const p of leidos) {
    // Código generado: si alguno de sus documentos ya es de un proyecto, es ese proyecto (aunque cambie el orden de la pareja).
    if (p.codigoGenerado) {
      const existente = p.integrantes.map((i) => duenoDoc.get(i.documento)).find(Boolean);
      if (existente) p.codigo = existente;
    }
    const actual = porCodigo.get(p.codigo);
    const hoja = lectura.hoja;
    const err = (mensaje: string) => errs.push({ hoja, fila: p.fila, mensaje });
    for (const i of p.integrantes) {
      const dueno = duenoDoc.get(i.documento);
      if (dueno && dueno !== p.codigo) err(`Documento repetido: ${i.documento} ya es del proyecto ${dueno}.`);
      else if (!dueno && enSinProyecto.has(i.documento)) err(`El documento ${i.documento} está en «Sin proyecto»: conviértelo en proyecto desde ese apartado (o quítalo de allí) antes de importarlo.`);
    }
    if (actual && actual.ciudad !== p.ciudad && conHora.has(String(actual._id)))
      err(`El proyecto ${p.codigo} ya tiene hora en ${actual.ciudad}: libera su hora antes de cambiarle la ciudad.`);
    if (configDias.length && diasPorCiudad(configDias, p.ciudad).length === 0)
      err(`${p.ciudad} no tiene días habilitados en la hoja Cupos.`);
    if (actual && editadosPorEstudiante.has(String(actual._id)) && (actual.nombre !== p.nombre || (actual.descripcion ?? "") !== (p.descripcion ?? "")))
      avisos.push({ hoja, fila: p.fila, mensaje: `${p.codigo}: el estudiante cambió el nombre o la descripción en el portal («${actual.nombre}»); al importar se reemplaza por lo del Excel.` });
    if (actual) actualizados++; else nuevos++;
    porCiudad[p.ciudad] = (porCiudad[p.ciudad] ?? 0) + 1;

    const a = asignarMonitor(p, monitores);
    asignaciones.set(p.codigo, a.monitor);
    if (a.noExiste) avisos.push({ hoja, fila: p.fila, mensaje: `No hay un monitor "${a.noExiste}"; se asigna por ciudad.` });
    if (a.monitor) asignados++;
    else {
      const x = pendientes.get(p.ciudad) ?? { ciudad: p.ciudad, proyectos: 0, motivo: a.motivo! };
      x.proyectos++;
      pendientes.set(p.ciudad, x);
    }
  }
  const enArchivo = new Set(leidos.map((p) => p.codigo));
  errs.sort((a, b) => a.fila - b.fila);
  return {
    total: leidos.length, nuevos, actualizados, fueraDelArchivo: existentes.filter((p) => !enArchivo.has(p.codigo)).length,
    porCiudad, errores: errs, avisos, columnas,
    faltan: faltan.map((f) => ({ campo: f, etiqueta: CAMPOS.find((c) => c.campo === f)!.etiqueta })),
    monitores: { asignados, porAsignar: [...pendientes.values()].sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es")) },
    asignaciones,
  };
}

/** Guarda los proyectos. Un monitor ya asignado no se borra si el archivo no trae uno para ese proyecto. */
export async function aplicarProyectos(leidos: ProyectoLeido[], asignaciones: Map<string, string | null>, actor: Actor) {
  const { proyectos, changeLog } = await collections();
  const now = new Date();
  if (leidos.length)
    await proyectos.bulkWrite(leidos.map((p) => {
      const monitor = asignaciones.get(p.codigo) ?? null;
      const unset: { grupo?: ""; descripcion?: ""; ruta?: "" } = {};
      if (!p.grupo) unset.grupo = "";
      if (!p.ruta) unset.ruta = "";
      if (!p.descripcion) unset.descripcion = "";
      return {
        updateOne: {
          filter: { codigo: p.codigo },
          update: {
            $set: {
              ciudad: p.ciudad, nombre: p.nombre, integrantes: p.integrantes, actualizadoEn: now,
              ...(p.grupo ? { grupo: p.grupo } : {}), ...(p.descripcion ? { descripcion: p.descripcion } : {}), ...(p.ruta ? { ruta: p.ruta } : {}), ...(monitor ? { monitor } : {}),
            },
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
            $setOnInsert: { _id: new ObjectId(), creadoEn: now, ...(monitor ? {} : { monitor: null }) },
          },
          upsert: true,
        },
      };
    }), { ordered: false });
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
  // Con errores en el libro no hay asientos nuevos que comparar: los conflictos se revisan cuando el libro esté bien.
  const errores = libro.errores.length ? [...libro.errores] : await conflictos(libro);
  const horas = new Map<string, number>();
  for (const h of libro.horas) for (const m of h.mentores) horas.set(m, (horas.get(m) ?? 0) + 1);
  const nombre = new Map(libro.mentores.map((m) => [m._id, m.nombre]));
  // Reglas editadas en pantalla (Paso 17): mandan hasta esta importación, que las reemplaza con la hoja Cupos.
  const [editados, franjas] = await Promise.all([diasEditados(), franjasEditadas()]);
  const avisos = [
    ...libro.avisos,
    ...(editados.length ? [{ hoja: HOJAS_MENTORES.cupos, fila: 0, mensaje: `Hay reglas de cupos editadas en pantalla para ${editados.join(", ")}: al importar, la hoja Cupos las reemplaza.` }] : []),
    ...(franjas ? [{ hoja: HOJAS_MENTORES.horarios, fila: 0, mensaje: `Hay ${franjas} cambio${franjas === 1 ? "" : "s"} de mentores hecho${franjas === 1 ? "" : "s"} en Franjas y mentores: al importar, la hoja Horarios los reemplaza.` }] : []),
  ];
  return {
    mentores: libro.mentores.length, avisos, errores, dias: resumenPorDia(libro.asientos),
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
  const now = new Date();
  await transaccion(async (s) => {
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
    await c.franjasEditadas.deleteMany({}, { session: s }); // Horarios vuelve a mandar
    if (libro.mentores.length) await c.mentores.insertMany(libro.mentores, { session: s });
    if (libro.cupos.size) await c.dias.insertMany([...libro.cupos].map(([dia, ciudades]) => ({ _id: dia, ciudades })), { session: s });
    await c.changeLog.insertOne({ accion: "importar", nuevo: `mentores: ${libro.mentores.length}, asientos: ${libro.asientos.length}`, actor, fecha: now }, { session: s });
  });
}

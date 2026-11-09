import type { ObjectId } from "mongodb";
import { conDatosDeEvaluacion, MARGEN_MS } from "./admin";
import { collections } from "./db";
import { diaCOL, horaCOL } from "./edicion";
import { modoOrdenLlegada } from "./modoCupos";
import type { CargaMentor, MentoresLibres, OpcionMentor } from "./cambioMentorTexto";

// Paso 25 · «Cambiar mentor (mismo bloque)» en las fichas de Horarios y del Tablero. Solo lee: el cambio lo hace
// cambiarHora (admin.ts) con `mismoBloque`, dentro de su transacción. Aquí: los asientos libres del bloque exacto del
// proyecto, con la carga de cada mentor para decidir rápido.

export type { CargaMentor, MentoresLibres, OpcionMentor } from "./cambioMentorTexto";
export { etiquetaCarga } from "./cambioMentorTexto";

/** Carga por mentor a partir de sus asientos ocupados: en esa hora (mismo día), ese día y en total. */
export function contarCarga(ocupados: { mentorId: string; dia: string; inicio: Date }[], dia: string, hora: number): Map<string, CargaMentor> {
  const m = new Map<string, CargaMentor>();
  for (const a of ocupados) {
    const c = m.get(a.mentorId) ?? { enHora: 0, enDia: 0, total: 0 };
    c.total++;
    if (a.dia === dia) { c.enDia++; if (horaCOL(a.inicio) === hora) c.enHora++; }
    m.set(a.mentorId, c);
  }
  return m;
}

export async function mentoresLibres(proyectoId: ObjectId, ahora = new Date()): Promise<MentoresLibres> {
  const c = await collections();
  const proyecto = await c.proyectos.findOne({ _id: proyectoId }, { projection: { ciudad: 1 } });
  if (!proyecto) return { ok: false, error: "sin_proyecto" };
  const actual = await c.asientos.findOne({ proyectoId });
  if (!actual) return { ok: false, error: "sin_hora" };
  const [libres, datos, orden, mentores] = await Promise.all([
    c.asientos.find({ inicio: actual.inicio, proyectoId: null, mentorId: { $ne: actual.mentorId } }).toArray(),
    conDatosDeEvaluacion(proyectoId),
    modoOrdenLlegada(),
    c.mentores.find({}, { projection: { nombre: 1 } }).toArray(),
  ]);
  const nombre = new Map(mentores.map((m) => [m._id, m.nombre]));
  const ocupados = await c.asientos.find({ mentorId: { $in: libres.map((a) => a.mentorId) }, proyectoId: { $type: "objectId" } }, { projection: { mentorId: 1, dia: 1, inicio: 1 } }).toArray();
  const carga = contarCarga(ocupados, diaCOL(actual.inicio), horaCOL(actual.inicio));
  const opciones = libres
    .map((a): OpcionMentor => ({
      asiento: String(a._id), mentor: nombre.get(a.mentorId) ?? a.mentorId, ciudades: a.ciudades,
      deSuCiudad: orden || a.ciudades.includes(proyecto.ciudad),
      ...(carga.get(a.mentorId) ?? { enHora: 0, enDia: 0, total: 0 }),
    }))
    // Primero quien ya tiene proyectos en esa hora (así se juntan), luego por nombre.
    .sort((x, y) => y.enHora - x.enHora || x.mentor.localeCompare(y.mentor, "es"));
  return {
    ok: true, inicio: actual.inicio.toISOString(), mentor: nombre.get(actual.mentorId) ?? actual.mentorId,
    bloqueo: datos ? "con_datos" : null, enCurso: actual.inicio.getTime() < ahora.getTime() + MARGEN_MS, opciones,
  };
}

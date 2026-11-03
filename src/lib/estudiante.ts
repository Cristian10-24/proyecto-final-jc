import { ciudadesDelDia, ciudadesExplicitas, horasDisponibles, puedeElegir } from "./agenda";
import { collections } from "./db";
import { diaCOL } from "./edicion";
import { estadoCiudad } from "./reglasCupos";
import type { Asiento, Integrante, Proyecto } from "./types";

// Lo que ve el estudiante (DECISIONES): nombres completos, ciudad, nombre y descripción del proyecto
// y su hora si existe. Documento, celular y correo, enmascarados. Nada más: ni mentores, ni conteos,
// ni datos de otros proyectos.

export const enmascararNumero = (s: string) => `•••• ${s.replace(/\D/g, "").slice(-4) || s.slice(-4)}`;

/** "valentina@gmail.com" → "va•••@gmail.com" (una letra si el usuario es muy corto). */
export function enmascararCorreo(correo: string): string {
  const [usuario = "", dominio = ""] = correo.split("@");
  return `${usuario.slice(0, usuario.length > 3 ? 2 : 1)}•••@${dominio}`;
}

export type IntegranteVista = { nombre: string; documento: string; celular?: string; correo?: string; tu: boolean };
export type HoraVista = { inicio: string; elegidaPor: "tu" | "pareja" | "coordinacion" };
export type ProyectoVista = {
  proyecto: { nombre: string; descripcion?: string; ciudad: string };
  integrantes: IntegranteVista[];
  hora: HoraVista | null;
};

function vistaIntegrante(i: Integrante, documento: string): IntegranteVista {
  return {
    nombre: i.nombre,
    documento: enmascararNumero(i.documento),
    ...(i.celular ? { celular: enmascararNumero(i.celular) } : {}),
    ...(i.correo ? { correo: enmascararCorreo(i.correo) } : {}),
    tu: i.documento === documento,
  };
}

export function vistaProyecto(p: Pick<Proyecto, "nombre" | "descripcion" | "ciudad" | "integrantes">, documento: string, hora: HoraVista | null): ProyectoVista {
  return {
    proyecto: { nombre: p.nombre, ...(p.descripcion ? { descripcion: p.descripcion } : {}), ciudad: p.ciudad },
    // El que consulta va primero.
    integrantes: p.integrantes.map((i) => vistaIntegrante(i, documento)).sort((a, b) => Number(b.tu) - Number(a.tu)),
    hora,
  };
}

async function proyectoDe(documento: string) {
  const { proyectos } = await collections();
  return proyectos.findOne({ "integrantes.documento": documento }, { projection: { nombre: 1, descripcion: 1, ciudad: 1, integrantes: 1 } });
}

/** Hora del proyecto y quién la eligió (por el registro de la reserva). */
async function horaDe(p: Pick<Proyecto, "_id">, documento: string): Promise<{ asiento: Asiento; vista: HoraVista } | null> {
  const { asientos, changeLog } = await collections();
  const asiento = await asientos.findOne({ proyectoId: p._id });
  if (!asiento) return null;
  const ultimo = await changeLog.findOne({ proyectoId: p._id, accion: { $in: ["reservar", "cambiar_hora"] } }, { sort: { fecha: -1 } });
  const elegidaPor = ultimo?.actor.rol !== "estudiante" ? "coordinacion" : ultimo.actor.usuario === documento ? "tu" : "pareja";
  return { asiento, vista: { inicio: asiento.inicio.toISOString(), elegidaPor } };
}

export async function consultar(documento: string): Promise<ProyectoVista | null> {
  const p = await proyectoDe(documento);
  if (!p) return null;
  return vistaProyecto(p, documento, (await horaDe(p, documento))?.vista ?? null);
}

export type DiaVista = { dia: string; estado: "disponible" | "sin_horas" | "aun_no_abre"; abre?: string };

export type Agenda =
  | { error: "sin_proyecto" }
  | { error: "ya_tiene_hora"; hora: HoraVista }
  | { error: "dia_no_disponible" }
  | { error: "cerrado"; cierre: string }
  | { error: "aun_no_abre"; abre: string }
  | { dias: DiaVista[] }
  | { dia: string; bloques: string[] };

/**
 * Días de la ciudad del estudiante (sin `dia`) o bloques libres de un día (con `dia`).
 * Solo "disponible" o no: nunca cuántos asientos quedan.
 */
export async function agenda(documento: string, dia: string | undefined, ahora = new Date()): Promise<Agenda> {
  const p = await proyectoDe(documento);
  if (!p) return { error: "sin_proyecto" };
  const h = await horaDe(p, documento);
  if (h) return { error: "ya_tiene_hora", hora: h.vista };
  // Inscripciones de su ciudad (Paso 17): cerradas desde su cierre o aún sin abrir ningún día.
  const e = await estadoCiudad(p.ciudad, ahora);
  if (e.estado === "cerrado") return { error: "cerrado", cierre: e.cierre };
  if (e.estado === "antes") return { error: "aun_no_abre", abre: e.abre };
  const { dias, asientos } = await collections();

  if (dia) {
    const todos = await dias.find({}).toArray();
    if (!puedeElegir(todos.find((d) => d._id === dia), p.ciudad, ahora, ciudadesExplicitas(todos))) return { error: "dia_no_disponible" };
    const libres = await asientos.find({ dia, ciudades: p.ciudad, proyectoId: null }, { projection: { inicio: 1, ciudades: 1, proyectoId: 1 } }).toArray();
    return { dia, bloques: horasDisponibles(libres, p.ciudad, ahora).map((d) => d.toISOString()) };
  }

  const hoy = diaCOL(ahora);
  const todos = await dias.find({}).sort({ _id: 1 }).toArray();
  const explicitas = ciudadesExplicitas(todos);
  const configs = todos.filter((d) => d._id >= hoy && ciudadesDelDia(d.ciudades, d._id, explicitas).has(p.ciudad));
  const conLibres = new Set(await asientos.distinct("dia", { ciudades: p.ciudad, proyectoId: null, inicio: { $gt: ahora } }));
  return {
    dias: configs.map((d): DiaVista => {
      const abre = ciudadesDelDia(d.ciudades, d._id, explicitas).get(p.ciudad);
      if (abre && abre > ahora) return { dia: d._id, estado: "aun_no_abre", abre: abre.toISOString() };
      return { dia: d._id, estado: conLibres.has(d._id) ? "disponible" : "sin_horas" };
    }),
  };
}

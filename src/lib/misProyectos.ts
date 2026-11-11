import type { SessionUser } from "./auth";
import { esUruguay } from "./citaciones/contenido";
import { datosDelDia } from "./citaciones/registro";
import { horaCO, horaUY } from "./ciudades";
import { collections } from "./db";
import { diaCOL, horaCOL } from "./edicion";
import { salasDelMonitor } from "./evaluacion/monitor";
import { puede } from "./permisos";

// «Mis proyectos»: lista detallada de los proyectos con hora, de solo lectura.
//  - Monitor: solo los bloques de SUS salas (misma función de alcance que «Mis salas»: salasDelMonitor), de cualquier ciudad.
//  - Coordinación y admin (ver_todas_las_ciudades): todos, con filtro por monitor.
// Los datos salen de datosDelDia (lo mismo que arma las citaciones). Nunca se devuelve documento ni correo.

export type Contacto = { nombre: string; celular: string | null };
export type MonitorRef = { usuario: string; nombre: string };
export type MiProyecto = {
  id: string; codigo: string; dia: string; inicio: string;
  /** Hora Colombia y, para Colonia y Paysandú, también la de Uruguay. */
  horaCOL: string; horaUY: string | null;
  sala: number | null; enlace: string | null;
  ciudad: string; proyecto: string;
  integrantes: Contacto[]; mentor: Contacto; monitor: MonitorRef | null;
};
export type FiltroMisProyectos = { dia?: string; ciudad?: string; sala?: number; monitor?: string; q?: string };
export type VistaMisProyectos = {
  /** true: coordinación o admin (ve todo y puede filtrar por monitor). */
  todos: boolean;
  /** Día aplicado ("todos" = sin filtro de día; null si no hay proyectos). */
  dia: string | null;
  dias: string[]; ciudades: string[]; salas: number[]; monitores: MonitorRef[];
  proyectos: MiProyecto[];
};

const VACIA = (todos: boolean): VistaMisProyectos => ({ todos, dia: null, dias: [], ciudades: [], salas: [], monitores: [], proyectos: [] });
export const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const contacto = (nombre: string, celular?: string): Contacto => ({ nombre, celular: celular?.trim() || null });

/** Los proyectos que esta persona puede ver, por día y hora. `soloDia`: solo carga ese día (si no, todos). */
export async function proyectosVisibles(user: SessionUser, soloDia?: string): Promise<{ todos: boolean; dias: string[]; lista: MiProyecto[] }> {
  const todos = puede(user, "ver_todas_las_ciudades");
  if (!todos && !puede(user, "monitorear_salas")) return { todos, dias: [], lista: [] };
  let dias: string[];
  let suyas: Set<string> | null = null;
  if (todos) {
    const { asientos } = await collections();
    dias = (await asientos.distinct("dia", { proyectoId: { $type: "objectId" } })).sort();
  } else {
    const plan = await salasDelMonitor(user);
    suyas = new Set(plan.map((p) => `${p.dia}|${p.hora}|${p.mentorId}`));
    dias = [...new Set(plan.map((p) => p.dia))].sort();
  }
  const lista: MiProyecto[] = [];
  const cargar = soloDia ? dias.filter((d) => d === soloDia) : dias;
  for (const d of await Promise.all(cargar.map((dia) => datosDelDia(dia)))) {
    for (const b of d.bloques) {
      const hora = horaCOL(b.inicio);
      if (suyas && !suyas.has(`${d.dia}|${hora}|${b.mentorId}`)) continue;
      const pe = d.plan.find((p) => p.hora === hora && p.mentorId === b.mentorId);
      const sala = pe?.sala ?? null;
      const m = d.mentores[b.mentorId];
      const p = b.proyecto;
      lista.push({
        id: p.id, codigo: p.codigo, dia: diaCOL(b.inicio), inicio: b.inicio.toISOString(),
        horaCOL: horaCO(b.inicio), horaUY: esUruguay(p.ciudad) ? horaUY(b.inicio) : null,
        sala, enlace: sala !== null ? d.enlaces[sala] ?? null : null,
        ciudad: p.ciudad, proyecto: p.nombre,
        // Solo nombre y celular: ni documento ni correo.
        integrantes: p.integrantes.map((i) => contacto(i.nombre, i.celular)),
        mentor: contacto(m?.nombre ?? b.mentorId, m?.celular),
        monitor: pe?.monitor ? { usuario: pe.monitor, nombre: d.monitores[pe.monitor]?.nombre ?? pe.monitor } : null,
      });
    }
  }
  lista.sort((x, y) => x.inicio.localeCompare(y.inicio) || x.proyecto.localeCompare(y.proyecto, "es"));
  return { todos, dias, lista };
}

/** Día por defecto: hoy si hay presentaciones hoy; si no, el primer día con proyectos. */
export const diaPorDefecto = (dias: string[], hoy = diaCOL(new Date())): string | null => (dias.includes(hoy) ? hoy : dias[0] ?? null);

/** Aplica los filtros (día, ciudad, sala, monitor y búsqueda por proyecto o integrante). */
export function filtrar(lista: MiProyecto[], f: FiltroMisProyectos, todos: boolean, dia: string | null): MiProyecto[] {
  const q = sinTildes(f.q?.trim() ?? "");
  return lista.filter((x) =>
    (dia === "todos" || x.dia === dia)
    && (!f.ciudad || x.ciudad === f.ciudad)
    && (f.sala === undefined || x.sala === f.sala)
    && (!todos || !f.monitor || (f.monitor === "sin" ? !x.monitor : x.monitor?.usuario === f.monitor))
    && (!q || sinTildes([x.proyecto, ...x.integrantes.map((i) => i.nombre)].join(" ")).includes(q)));
}

export async function misProyectos(user: SessionUser, f: FiltroMisProyectos = {}, hoy?: string): Promise<VistaMisProyectos> {
  // Coordinación y admin: primero los días con proyectos (consulta liviana) y después solo se arma el día elegido
  // (o todos con "todos"). Monitor: sus salas son pocas; se arma todo y los días salen de sus proyectos.
  const todos = puede(user, "ver_todas_las_ciudades");
  let dias: string[], lista: MiProyecto[], dia: string | null;
  if (todos) {
    dias = (await proyectosVisibles(user, "-")).dias;
    dia = f.dia ?? diaPorDefecto(dias, hoy);
    lista = dia ? (await proyectosVisibles(user, dia === "todos" ? undefined : dia)).lista : [];
  } else {
    lista = (await proyectosVisibles(user)).lista;
    dias = [...new Set(lista.map((x) => x.dia))].sort();
    dia = f.dia ?? diaPorDefecto(dias, hoy);
  }
  if (!dias.length) return VACIA(todos);
  const monitores = new Map(lista.flatMap((x) => (x.monitor ? [[x.monitor.usuario, x.monitor] as const] : [])));
  return {
    todos, dia, dias,
    ciudades: [...new Set(lista.map((x) => x.ciudad))].sort((a, b) => a.localeCompare(b, "es")),
    salas: [...new Set(lista.flatMap((x) => (x.sala !== null ? [x.sala] : [])))].sort((a, b) => a - b),
    monitores: todos ? [...monitores.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) : [],
    proyectos: filtrar(lista, f, todos, dia),
  };
}

import { collections } from "../db";
import { diaCOL, horaCOL } from "../edicion";
import { diaPorDefecto } from "../misProyectos";
import { FILTRO_MONITOR } from "../permisos";
import { esHttps } from "../planSalas";
import type { Celda } from "./bloques";

// Fase 6 · «Monitores» (coordinación y admin, solo lectura): el plan de salas de un día con sus proyectos actuales.
// Solo lectura. Datos personales: nombre y celular del monitor y del mentor (los de su ficha); de los estudiantes,
// NADA (ni nombres, ni documento, ni correo, ni celular): de cada proyecto solo su nombre y su minuto. Cada objeto
// se arma campo por campo (nunca con spread). Solo horas de sala con al menos un proyecto.

export type Persona = { id: string; nombre: string; celular: string | null };
export type VistaMonitores = {
  dias: string[]; dia: string | null;
  celdas: Celda[];
  monitores: Persona[]; mentores: Persona[];
  enlaces: { sala: number; enlace: string }[];
};

const cel = (x?: string) => x?.trim() || null;

export async function asignacionesMonitores(pedido?: string, hoy = diaCOL(new Date())): Promise<VistaMonitores> {
  const c = await collections();
  const dias: string[] = (await c.planSalas.distinct("dia")).sort();
  const dia = pedido ?? diaPorDefecto(dias, hoy);
  if (!dia || !dias.includes(dia)) return { dias, dia, celdas: [], monitores: [], mentores: [], enlaces: [] };

  const [plan, asis, cfg] = await Promise.all([
    c.planSalas.find({ dia }, { projection: { hora: 1, sala: 1, mentorId: 1, monitor: 1 } }).toArray(),
    c.asientos.find({ dia, proyectoId: { $type: "objectId" } }, { projection: { inicio: 1, mentorId: 1, proyectoId: 1 } }).toArray(),
    c.salasConfig.findOne({ _id: "actual" }, { projection: { salas: 1 } }),
  ]);
  const nombres = new Map((await c.proyectos.find({ _id: { $in: asis.map((a) => a.proyectoId!) } }, { projection: { nombre: 1 } }).toArray())
    .map((p) => [String(p._id), p.nombre]));
  const porHora = new Map<string, { minuto: number; nombre: string }[]>();
  for (const a of asis) {
    const k = `${horaCOL(a.inicio)}|${a.mentorId}`;
    porHora.set(k, [...(porHora.get(k) ?? []), { minuto: a.inicio.getUTCMinutes(), nombre: nombres.get(String(a.proyectoId)) ?? "Proyecto" }]);
  }
  const celdas: Celda[] = [];
  for (const p of plan) {
    const proyectos = porHora.get(`${p.hora}|${p.mentorId}`);
    if (!proyectos?.length) continue;
    celdas.push({
      hora: p.hora, sala: p.sala, mentorId: p.mentorId, monitor: p.monitor ?? null,
      proyectos: proyectos.sort((x, y) => x.minuto - y.minuto).map((x) => ({ minuto: x.minuto, nombre: x.nombre })),
    });
  }
  celdas.sort((x, y) => x.hora - y.hora || x.sala - y.sala);

  const usuarios = [...new Set(celdas.flatMap((x) => (x.monitor ? [x.monitor] : [])))];
  const mentorIds = [...new Set(celdas.map((x) => x.mentorId))];
  const [mons, ments] = await Promise.all([
    c.users.find({ $and: [FILTRO_MONITOR, { usuario: { $in: usuarios } }] }, { projection: { usuario: 1, nombre: 1, celular: 1 } }).toArray(),
    c.mentores.find({ _id: { $in: mentorIds } }, { projection: { nombre: 1, celular: 1 } }).toArray(),
  ]);
  const monUsuario = new Map(mons.map((u) => [u.usuario, u]));
  const mentor = new Map(ments.map((m) => [m._id, m]));
  return {
    dias, dia, celdas,
    // Un monitor del plan que ya no es usuario monitor sigue apareciendo con su usuario como nombre.
    monitores: usuarios.map((u) => ({ id: u, nombre: monUsuario.get(u)?.nombre ?? u, celular: cel(monUsuario.get(u)?.celular) })),
    mentores: mentorIds.map((id) => ({ id, nombre: mentor.get(id)?.nombre ?? id, celular: cel(mentor.get(id)?.celular) })),
    enlaces: (cfg?.salas ?? []).filter((s) => esHttps(s.enlace)).map((s) => ({ sala: s.sala, enlace: s.enlace })),
  };
}

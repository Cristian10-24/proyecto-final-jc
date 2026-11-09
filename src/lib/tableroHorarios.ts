import { ciudadesDelDia, ciudadesExplicitas, diasPorCiudad } from "./agenda";
import { collections } from "./db";
import { horaCOL, inicioUTC } from "./edicion";
import { calc, estadoFila } from "./evaluacion/criterios";
import { criterios, idEval } from "./evaluacion/datos";
import { conteoComentarios } from "./comentarios";
import { modoOrdenLlegada } from "./modoCupos";
import type { Proyecto, Ruta } from "./types";

// Tablero de horarios (Paso 16): un día con sus horas, los 4 bloques de 15 min de cada hora con capacidad usada/total,
// las tarjetas de los proyectos y la columna "Sin hora". Solo lee: mover y liberar usan las acciones de Horarios
// (admin.ts → mover.ts), así que el tablero no tiene lógica propia de asientos.

export type Tarjeta = {
  id: string; codigo: string; proyecto: string; integrantes: string[]; ciudad: string; ruta?: Ruta;
  inicio?: string; asientoId?: string; mentor?: string; sala?: number; monitor?: string;
  estado: "presente" | "ausente" | "pendiente";
  /** Tiene evaluación guardada: no se mueve ni se libera. `evaluadoEn`: su última versión (para anular esa). */
  evaluado: boolean;
  evaluadoEn?: string;
  /** Paso 22: comentarios de seguimiento (sin los borrados). */
  comentarios: number;
};
export type BloqueTablero = {
  inicio: string; total: number; ocupados: number;
  /** Asientos libres por grupo de ciudades ("Cali", "Cali + Cartagena"…; "" = sin ciudad). */
  libres: { ciudades: string[]; n: number }[];
  /** Asientos libres con su mentor (para cambiar de mentor en el mismo bloque). */
  asientosLibres: { id: string; mentor: string; ciudades: string[] }[];
  tarjetas: Tarjeta[];
};
export type HoraTablero = { hora: number; mentores: number; bloques: BloqueTablero[] };
export type DatosTablero = {
  dia: string; dias: string[];
  /** Ciudades que presentan ese día (con su apertura, si la tiene). */
  ciudadesDia: { ciudad: string; abre: string | null }[];
  /** Días en que presenta cada ciudad (respeta la clausura): para advertir al soltar. */
  diasPorCiudad: Record<string, string[]>;
  horas: HoraTablero[];
  sinHora: Tarjeta[];
  /** Fase 4: modo orden de llegada (las etiquetas de los asientos no cuentan; el tope sí, lo avisa el servidor). */
  ordenLlegada: boolean;
};

/** Solo lo que usa la tarjeta (el documento, para cruzar con la evaluación; no sale en la respuesta). */
const CAMPOS = { codigo: 1, nombre: 1, ciudad: 1, ruta: 1, "integrantes.nombre": 1, "integrantes.documento": 1 } as const;

export async function datosTablero(diaPedido?: string): Promise<DatosTablero> {
  const c = await collections();
  const [diasCfg, todosDias] = await Promise.all([c.dias.find({}).toArray(), c.asientos.distinct("dia")]);
  const dias = (todosDias as string[]).sort();
  const dia = diaPedido && dias.includes(diaPedido) ? diaPedido : dias[0] ?? "";
  const explicitas = ciudadesExplicitas(diasCfg);
  const cfg = diasCfg.find((d) => d._id === dia);
  const ciudadesDia = cfg ? [...ciudadesDelDia(cfg.ciudades, dia, explicitas)].map(([ciudad, abre]) => ({ ciudad, abre: abre ? abre.toISOString() : null })) : [];

  const [asientos, conHora, plan, mentores] = await Promise.all([
    c.asientos.find({ dia }).sort({ inicio: 1, mentorId: 1 }).toArray(),
    c.asientos.distinct("proyectoId", { proyectoId: { $type: "objectId" } }),
    c.planSalas.find({ dia }).toArray(),
    c.mentores.find({}, { projection: { nombre: 1 } }).toArray(),
  ]);
  const idsDia = asientos.map((a) => a.proyectoId).filter((x): x is NonNullable<typeof x> => x !== null);
  const [proyectosDia, sinHoraP] = await Promise.all([
    c.proyectos.find({ _id: { $in: idsDia } }, { projection: CAMPOS }).toArray(),
    // Paso 21: los marcados «Sin proyecto» no aparecen para asignarles hora.
    c.proyectos.find({ _id: { $nin: conHora.filter((x): x is NonNullable<typeof x> => x !== null) }, sinProyecto: { $exists: false } }, { projection: CAMPOS }).sort({ ciudad: 1, nombre: 1 }).toArray(),
  ]);
  const ids = [...proyectosDia, ...sinHoraP].map((p) => p._id);
  const [evals, notas, crit, monitores, nComent] = await Promise.all([
    c.evalResultados.find({ proyectoId: { $in: ids } }).toArray(),
    c.evalMonitor.find({ proyectoId: { $in: ids } }).toArray(),
    criterios(),
    c.users.find({ usuario: { $in: plan.map((p) => p.monitor).filter((m): m is string => !!m) } }, { projection: { usuario: 1, nombre: 1 } }).toArray(),
    conteoComentarios(ids),
  ]);
  const ev = new Map(evals.map((e) => [e._id, e])), nota = new Map(notas.map((n) => [n._id, n]));
  const nombreMentor = new Map(mentores.map((m) => [m._id, m.nombre])), nombreMonitor = new Map(monitores.map((u) => [u.usuario, u.nombre]));
  const sala = new Map(plan.map((p) => [`${p.hora}|${p.mentorId}`, p]));
  const porId = new Map(proyectosDia.map((p) => [String(p._id), p]));

  const tarjeta = (p: Proyecto, a?: (typeof asientos)[number]): Tarjeta => {
    const integrantes = p.integrantes.map((x) => {
      const e = ev.get(idEval(p._id, x.documento)), n = nota.get(idEval(p._id, x.documento));
      return { res: calc(e, crit).res, presente: n?.asistencia === "si", ausente: n?.asistencia === "no", evaluado: !!e && !e.noPresento, en: e && !e.noPresento ? e.actualizadoEn.toISOString() : "" };
    });
    const evaluadoEn = integrantes.map((x) => x.en).filter(Boolean).sort().at(-1);
    const s = a ? sala.get(`${horaCOL(a.inicio)}|${a.mentorId}`) : undefined;
    return {
      id: String(p._id), codigo: p.codigo, proyecto: p.nombre, integrantes: p.integrantes.map((x) => x.nombre), ciudad: p.ciudad, ...(p.ruta ? { ruta: p.ruta } : {}),
      ...(a ? { inicio: a.inicio.toISOString(), asientoId: String(a._id), mentor: nombreMentor.get(a.mentorId) ?? a.mentorId } : {}),
      ...(s ? { sala: s.sala, ...(s.monitor ? { monitor: nombreMonitor.get(s.monitor) ?? s.monitor } : {}) } : {}),
      estado: estadoFila(integrantes), evaluado: integrantes.some((x) => x.evaluado), ...(evaluadoEn ? { evaluadoEn } : {}),
      comentarios: nComent.get(String(p._id)) ?? 0,
    };
  };

  const horas = new Map<number, HoraTablero>();
  for (const a of asientos) {
    const h = horaCOL(a.inicio);
    const hora = horas.get(h) ?? { hora: h, mentores: 0, bloques: [0, 15, 30, 45].map((m) => ({ inicio: inicioUTC(dia, h, m).toISOString(), total: 0, ocupados: 0, libres: [], asientosLibres: [], tarjetas: [] })) };
    horas.set(h, hora);
    const b = hora.bloques.find((x) => x.inicio === a.inicio.toISOString());
    if (!b) continue;
    b.total++;
    const p = a.proyectoId ? porId.get(String(a.proyectoId)) : undefined;
    if (p) { b.ocupados++; b.tarjetas.push(tarjeta(p, a)); continue; }
    const k = [...a.ciudades].sort().join("|");
    const g = b.libres.find((x) => [...x.ciudades].sort().join("|") === k);
    if (g) g.n++; else b.libres.push({ ciudades: a.ciudades, n: 1 });
    b.asientosLibres.push({ id: String(a._id), mentor: nombreMentor.get(a.mentorId) ?? a.mentorId, ciudades: a.ciudades });
  }
  for (const h of horas.values()) h.mentores = Math.max(...h.bloques.map((b) => b.total));
  const ciudades = [...new Set([...ciudadesDia.map((x) => x.ciudad), ...sinHoraP.map((p) => p.ciudad), ...proyectosDia.map((p) => p.ciudad)])];
  return {
    dia, dias, ciudadesDia,
    diasPorCiudad: Object.fromEntries(ciudades.map((x) => [x, diasPorCiudad(diasCfg, x)])),
    horas: [...horas.values()].sort((a, b) => a.hora - b.hora),
    sinHora: sinHoraP.map((p) => tarjeta(p)),
    ordenLlegada: await modoOrdenLlegada(),
  };
}

/** Paso 25 · Resultado del buscador del Tablero (sin documentos: coordinación también lo usa). `dia`: null = sin hora. */
export type Encontrado = { id: string; codigo: string; proyecto: string; ciudad: string; dia: string | null; inicio: string | null };

/** Busca por nombre del proyecto, integrante, código o documento (máx. 20; sin los marcados «Sin proyecto»).
 *  `documentoParcial`: solo el admin (que ya ve los documentos en Horarios) busca por parte del documento; coordinación,
 *  solo con el documento exacto, para que el buscador no sirva para adivinar documentos por prefijos. */
export async function buscarTablero(q: string, { documentoParcial }: { documentoParcial: boolean }): Promise<Encontrado[]> {
  const c = await collections();
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const lista = await c.proyectos
    .find({ $or: [{ nombre: re }, { codigo: re }, { "integrantes.nombre": re }, { "integrantes.documento": documentoParcial ? re : q }], sinProyecto: { $exists: false } }, { projection: { codigo: 1, nombre: 1, ciudad: 1 } })
    .sort({ nombre: 1 }).limit(20).toArray();
  const asientos = new Map((await c.asientos.find({ proyectoId: { $in: lista.map((p) => p._id) } }, { projection: { proyectoId: 1, dia: 1, inicio: 1 } }).toArray()).map((a) => [String(a.proyectoId), a]));
  return lista.map((p) => {
    const a = asientos.get(String(p._id));
    return { id: String(p._id), codigo: p.codigo, proyecto: p.nombre, ciudad: p.ciudad, dia: a?.dia ?? null, inicio: a ? a.inicio.toISOString() : null };
  });
}

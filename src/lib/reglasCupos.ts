import type { AnyBulkWriteOperation, ClientSession } from "mongodb";
import { ciudadesDelDia, ciudadesExplicitas, diasPorCiudad, gruposDelDia, repartoProporcional, TODAS } from "./agenda";
import { CIUDADES, horaCO, presentaAntesDeClausura } from "./ciudades";
import { collections, transaccion } from "./db";
import { horaCOL } from "./edicion";
import type { Actor, Asiento, CupoCiudad, DiaConfig } from "./types";

// Editor de reglas de cupos (Paso 17) y cierre de inscripciones por ciudad.
// Reglas de un día: por ciudad, mínimo (cupos reservados), máximo, sobrante y apertura. Al aplicar SOLO se
// reetiquetan asientos LIBRES: nadie que ya reservó se mueve. Lo reservado de cada ciudad cuenta dentro de su cupo
// y los libres se reparten para completar lo que le falta a cada grupo, en proporción a lo largo del día.
// Lo editado aquí manda hasta la próxima importación de la hoja Cupos (que reemplaza los días).

export const etiquetaGrupo = (ciudades: string[]) => (ciudades.length ? [...ciudades].sort((a, b) => a.localeCompare(b, "es")).join(" + ") : "(sin ciudad)");

export type PlanDia = {
  dia: string; capacidad: number; ocupados: number;
  grupos: { etiqueta: string; ciudades: string[]; cuota: number; reservados: number; libres: number }[];
  porHora: { hora: string; total: number; ocupados: number; libres: Record<string, number> }[];
  /** Asientos libres que cambian de ciudad al aplicar. */
  cambios: number;
  errores: string[];
  avisos: string[];
};

type Plan = PlanDia & { asignacion: { asiento: Asiento; ciudades: string[] }[] };

async function planDia(dia: string, cupos: CupoCiudad[], session?: ClientSession): Promise<Plan> {
  const c = await collections();
  // En orden (no en paralelo): dentro de una transacción la sesión no admite operaciones simultáneas.
  const asientos = await c.asientos.find({ dia }, { session }).sort({ inicio: 1, mentorId: 1 }).toArray();
  const todos = await c.dias.find({}, { session }).toArray();
  const errores: string[] = [], avisos: string[] = [];
  const vacio: Plan = { dia, capacidad: asientos.length, ocupados: 0, grupos: [], porHora: [], cambios: 0, errores, avisos, asignacion: [] };
  if (!asientos.length) { errores.push(`El ${dia} no tiene asientos (ningún mentor en Horarios).`); return vacio; }

  const vistas = new Set<string>();
  for (const x of cupos) {
    if (vistas.has(x.ciudad)) errores.push(`${x.ciudad} aparece dos veces.`);
    vistas.add(x.ciudad);
    if (x.ciudad !== TODAS && !presentaAntesDeClausura(x.ciudad, dia))
      errores.push(`${x.ciudad} ya no presenta el ${dia}: su clausura es el ${CIUDADES.find((k) => k.nombre === x.ciudad)?.clausura ?? "—"}.`);
  }
  // Las ciudades explícitas se calculan con este día ya cambiado (para expandir "Todas").
  const explicitas = ciudadesExplicitas([...todos.filter((d) => d._id !== dia), { _id: dia, ciudades: cupos }]);
  // "Todas" son las ciudades sin días propios en NINGÚN día: si este cambio le da o le quita días propios a una ciudad,
  // cambiaría en silencio los otros días con "Todas" (sus asientos quedarían con etiquetas que ya no aplican). Se pide
  // hacerlo explícito en esos días o desde la hoja Cupos.
  const antes = ciudadesExplicitas(todos);
  const cambian = [...new Set([...antes, ...explicitas])].filter((k) => antes.has(k) !== explicitas.has(k));
  for (const k of cambian) {
    const afectados = todos.filter((d) => d._id !== dia && d.ciudades.some((x) => x.ciudad === TODAS) && presentaAntesDeClausura(k, d._id)).map((d) => d._id);
    if (afectados.length)
      errores.push(`${explicitas.has(k) ? `Agregar ${k} aquí la saca` : `Quitar a ${k} de aquí la vuelve a meter`} de «Todas» en ${afectados.join(", ")}. Hazlo por su nombre en esos días también, o cámbialo en la hoja Cupos e impórtala.`);
  }
  let grupos: { ciudades: string[]; cuota: number }[] = [];
  try { grupos = gruposDelDia(cupos, asientos.length, dia, explicitas); } catch (e) { errores.push(`${(e as Error).message}.`); }
  if (errores.length) return vacio;

  // Reservas: cuentan dentro del grupo de su ciudad (primero los de una sola ciudad). Nunca se mueven.
  const reservadas = asientos.filter((a) => a.proyectoId);
  const ciudadDe = new Map((await c.proyectos.find({ _id: { $in: reservadas.map((a) => a.proyectoId!) } }, { session, projection: { ciudad: 1 } }).toArray()).map((p) => [String(p._id), p.ciudad]));
  const orden = grupos.map((g, i) => ({ g, i })).sort((a, b) => a.g.ciudades.length - b.g.ciudades.length || a.i - b.i);
  const reservados = grupos.map(() => 0);
  const fuera = new Map<string, number>();
  for (const a of reservadas) {
    const ciudad = ciudadDe.get(String(a.proyectoId)) ?? "";
    const k = orden.find(({ g, i }) => g.ciudades.includes(ciudad) && reservados[i]! < g.cuota);
    if (k) reservados[k.i]!++;
    else fuera.set(ciudad, (fuera.get(ciudad) ?? 0) + 1);
  }
  for (const [ciudad, n] of fuera) {
    const enDia = grupos.some((g) => g.ciudades.includes(ciudad));
    if (enDia) errores.push(`${ciudad} ya tiene más reservas ese día que su cupo: súbelo (o su máximo) a por lo menos lo reservado.`);
    else avisos.push(`${n} reserva${n === 1 ? "" : "s"} de ${ciudad || "otra ciudad"} se conserva${n === 1 ? "" : "n"} aunque ${ciudad || "esa ciudad"} no está habilitada este día.`);
  }
  if (errores.length) return vacio;

  // Libres que le faltan a cada grupo. Si hay reservas fuera de los grupos, ocupan lugar: se descuentan del grupo
  // sin ciudad y después del de sobrante.
  const libresAs = asientos.filter((a) => !a.proyectoId);
  const faltan = grupos.map((g, i) => g.cuota - reservados[i]!);
  let exceso = faltan.reduce((a, b) => a + b, 0) - libresAs.length;
  for (const i of [...grupos.keys()].filter((i) => !grupos[i]!.ciudades.length).concat([grupos.length - 1])) {
    const quita = Math.min(exceso, faltan[i]!);
    faltan[i]! -= quita;
    exceso -= quita;
  }
  if (exceso > 0) { errores.push("No alcanzan los asientos libres para estas reglas."); return vacio; }

  // Primero se conserva la ciudad de cada libre que ya sirve (menos cambios); lo que falta se reparte en proporción.
  const igual = (x: string[], y: string[]) => etiquetaGrupo(x) === etiquetaGrupo(y);
  const resta = [...faltan];
  const elegido = new Map<Asiento, number>();
  for (const a of libresAs) {
    const i = grupos.findIndex((g, k) => resta[k]! > 0 && igual(g.ciudades, a.ciudades));
    if (i >= 0) { elegido.set(a, i); resta[i]!--; }
  }
  const sinGrupo = libresAs.filter((a) => !elegido.has(a));
  const reparto = repartoProporcional(sinGrupo.length, resta);
  sinGrupo.forEach((a, k) => elegido.set(a, reparto[k]!));
  const asignacion = libresAs.map((a) => ({ asiento: a, ciudades: grupos[elegido.get(a)!]!.ciudades }));
  const horas = new Map<number, PlanDia["porHora"][number]>();
  for (const a of asientos) {
    const h = horaCOL(a.inicio);
    const fila = horas.get(h) ?? { hora: horaCO(a.inicio), total: 0, ocupados: 0, libres: {} };
    fila.total++;
    if (a.proyectoId) fila.ocupados++;
    horas.set(h, fila);
  }
  for (const { asiento, ciudades } of asignacion) {
    const fila = horas.get(horaCOL(asiento.inicio))!, k = etiquetaGrupo(ciudades);
    fila.libres[k] = (fila.libres[k] ?? 0) + 1;
  }
  return {
    dia, capacidad: asientos.length, ocupados: reservadas.length,
    grupos: grupos.map((g, i) => ({ etiqueta: etiquetaGrupo(g.ciudades), ciudades: g.ciudades, cuota: g.cuota, reservados: reservados[i]!, libres: faltan[i]! })),
    porHora: [...horas].sort(([a], [b]) => a - b).map(([, v]) => v),
    cambios: asignacion.filter((x) => !igual(x.ciudades, x.asiento.ciudades)).length,
    errores, avisos, asignacion,
  };
}

/** Vista previa: reparto por hora, cupos, reservas que se conservan, cuántos libres cambian y errores. */
export async function previaReglas(dia: string, cupos: CupoCiudad[]): Promise<PlanDia> {
  const { asignacion: _, ...plan } = await planDia(dia, cupos);
  return plan;
}

export class CambioReglas extends Error {}

/**
 * Dentro de una transacción: calcula el plan del día con `cupos` y reetiqueta solo los asientos libres que cambian.
 * Si alguien reservó uno de ellos mientras tanto, lanza CambioReglas (la transacción se aborta). Lo usan el editor de
 * reglas y Franjas y mentores (al agregar o quitar un mentor).
 */
export async function reetiquetar(s: ClientSession, dia: string, cupos: CupoCiudad[]): Promise<Plan> {
  const c = await collections();
  const plan = await planDia(dia, cupos, s);
  if (plan.errores.length) return plan;
  const ops: AnyBulkWriteOperation<Asiento>[] = plan.asignacion
    .filter((x) => etiquetaGrupo(x.ciudades) !== etiquetaGrupo(x.asiento.ciudades))
    .map((x) => ({ updateOne: { filter: { _id: x.asiento._id, proyectoId: null }, update: { $set: { ciudades: x.ciudades } } } }));
  if (ops.length) {
    const r = await c.asientos.bulkWrite(ops, { session: s, ordered: false });
    if (r.matchedCount !== ops.length) throw new CambioReglas(); // alguien reservó uno de esos asientos
  }
  return plan;
}

/**
 * Aplica las reglas de un día en una transacción: reetiqueta solo asientos libres (si alguien reserva mientras
 * tanto, se aborta y se pide repetir), guarda el día como editado en pantalla y deja changeLog.
 */
export async function aplicarReglas(dia: string, cupos: CupoCiudad[], actor: Actor): Promise<{ ok: true; plan: PlanDia } | { ok: false; errores: string[] }> {
  const c = await collections();
  let plan: Plan | null = null;
  try {
    await transaccion(async (s) => {
      plan = await reetiquetar(s, dia, cupos);
      if (plan.errores.length) return;
      const ahora = new Date();
      await c.dias.replaceOne({ _id: dia }, { ciudades: cupos, editadoEn: ahora, editadoPor: actor.usuario ?? actor.rol } satisfies Omit<DiaConfig, "_id">, { upsert: true, session: s });
      await c.changeLog.insertOne({
        accion: "reglas_cupos", anterior: dia,
        nuevo: cupos.map((x) => `${x.ciudad} ${x.cupos ?? 0}${x.max != null ? `–${x.max}` : ""}${x.sobrante ? " (sobrante)" : ""}`).join(" · ") + ` · ${plan.cambios} asientos libres reetiquetados`,
        actor, fecha: ahora,
      }, { session: s });
    });
  } catch (e) {
    if (e instanceof CambioReglas) return { ok: false, errores: ["Alguien reservó una hora mientras se aplicaba. Revisa la vista previa otra vez."] };
    throw e;
  }
  const p = plan as Plan | null;
  if (!p || p.errores.length) return { ok: false, errores: p?.errores ?? ["No se pudo aplicar."] };
  const { asignacion: _, ...resto } = p;
  return { ok: true, plan: resto };
}

// ---- Cierre de inscripciones por ciudad ----

export const HORAS_ANTES_DEFECTO = 24;

/** `sinAutomatico`: el cierre automático caería antes de que la ciudad abra (abre el mismo día que presenta). */
export type CierreCiudad = { ciudad: string; primerBloque: string | null; automatico: string | null; manual: string | null; cierre: string | null; sinAutomatico: boolean };

type DatosCiudad = { primerBloque: Date | null; abre: Date | null };

/** Primer bloque de presentación de cada ciudad (el más temprano de su primer día) y su apertura más tardía. */
async function datosCiudades(dias: DiaConfig[]): Promise<Map<string, DatosCiudad>> {
  const c = await collections();
  const out = new Map<string, DatosCiudad>();
  const explicitas = ciudadesExplicitas(dias);
  const porCiudad = new Map<string, (Date | null)[]>();
  for (const d of dias) for (const [ciudad, abre] of ciudadesDelDia(d.ciudades, d._id, explicitas)) porCiudad.set(ciudad, [...(porCiudad.get(ciudad) ?? []), abre]);
  for (const [ciudad, aperturas] of porCiudad) {
    const primero = diasPorCiudad(dias, ciudad)[0];
    const a = primero ? await c.asientos.find({ dia: primero }, { projection: { inicio: 1 } }).sort({ inicio: 1 }).limit(1).next() : null;
    const abre = aperturas.filter((x): x is Date => !!x).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
    out.set(ciudad, { primerBloque: a?.inicio ?? null, abre });
  }
  return out;
}

/** El cierre de una ciudad: a mano o `horasAntes` antes de su primer bloque (si eso no cae antes de que abra). */
function calcularCierre(d: DatosCiudad | undefined, horasAntes: number, manual: Date | null) {
  const automatico = d?.primerBloque ? new Date(d.primerBloque.getTime() - horasAntes * 3600_000) : null;
  const sinAutomatico = !!automatico && !!d?.abre && automatico <= d.abre;
  return { automatico, sinAutomatico, cierre: manual ?? (sinAutomatico ? null : automatico) };
}

/** Cierre de cada ciudad: el fijado a mano o `horasAntes` antes de su primer bloque. */
export async function cierres(): Promise<{ horasAntes: number; ciudades: CierreCiudad[] }> {
  const c = await collections();
  const [cfg, dias] = await Promise.all([c.inscripciones.findOne({ _id: "cierre" }), c.dias.find({}).toArray()]);
  const horasAntes = cfg?.horasAntes ?? HORAS_ANTES_DEFECTO;
  const datos = await datosCiudades(dias);
  const nombres = [...new Set([...datos.keys(), ...Object.keys(cfg?.porCiudad ?? {})])].filter((x) => x !== TODAS).sort((a, b) => a.localeCompare(b, "es"));
  return {
    horasAntes,
    ciudades: nombres.map((ciudad) => {
      const d = datos.get(ciudad), manual = cfg && Object.hasOwn(cfg.porCiudad, ciudad) ? cfg.porCiudad[ciudad]! : null;
      const k = calcularCierre(d, horasAntes, manual);
      return {
        ciudad, primerBloque: d?.primerBloque?.toISOString() ?? null, automatico: k.automatico?.toISOString() ?? null,
        manual: manual?.toISOString() ?? null, cierre: k.cierre?.toISOString() ?? null, sinAutomatico: k.sinAutomatico,
      };
    }),
  };
}

export async function guardarCierre(horasAntes: number, porCiudad: Record<string, Date | null>, actor: Actor): Promise<void> {
  const c = await collections(), ahora = new Date();
  const fijos = Object.fromEntries(Object.entries(porCiudad).filter((x): x is [string, Date] => x[1] !== null));
  await transaccion(async (s) => {
    await c.inscripciones.replaceOne({ _id: "cierre" }, { horasAntes, porCiudad: fijos, actualizadoEn: ahora }, { upsert: true, session: s });
    await c.changeLog.insertOne({
      accion: "cierre_inscripciones",
      nuevo: `${horasAntes} h antes del primer bloque${Object.keys(fijos).length ? ` · a mano: ${Object.entries(fijos).map(([k, v]) => `${k} ${v.toISOString()}`).join(", ")}` : ""}`,
      actor, fecha: ahora,
    }, { session: s });
  });
}

export type EstadoCiudad = { estado: "abierto" } | { estado: "antes"; abre: string } | { estado: "cerrado"; cierre: string };

/**
 * Estado de las inscripciones para una ciudad (portal): cerradas desde su cierre; "aún no abre" si todos sus días
 * tienen una apertura futura (con la más temprana); si no, abiertas.
 */
export async function estadoCiudad(ciudad: string, ahora = new Date()): Promise<EstadoCiudad> {
  const c = await collections();
  const [cfg, dias] = await Promise.all([c.inscripciones.findOne({ _id: "cierre" }), c.dias.find({}).toArray()]);
  const explicitas = ciudadesExplicitas(dias);
  const aperturas = dias.map((d) => ciudadesDelDia(d.ciudades, d._id, explicitas)).filter((m) => m.has(ciudad)).map((m) => m.get(ciudad) ?? null);
  const primero = diasPorCiudad(dias, ciudad)[0];
  const a = primero ? await c.asientos.find({ dia: primero }, { projection: { inicio: 1 } }).sort({ inicio: 1 }).limit(1).next() : null;
  const abreTarde = aperturas.filter((x): x is Date => !!x).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  const manual = cfg && Object.hasOwn(cfg.porCiudad, ciudad) ? cfg.porCiudad[ciudad]! : null;
  const { cierre } = calcularCierre({ primerBloque: a?.inicio ?? null, abre: abreTarde }, cfg?.horasAntes ?? HORAS_ANTES_DEFECTO, manual);
  if (cierre && ahora >= cierre) return { estado: "cerrado", cierre: cierre.toISOString() };
  if (aperturas.length && aperturas.every((x) => x && x > ahora)) {
    const abre = new Date(Math.min(...aperturas.map((x) => x!.getTime())));
    return { estado: "antes", abre: abre.toISOString() };
  }
  return { estado: "abierto" };
}

/** Días con reglas editadas en pantalla (para avisar antes de importar la hoja Cupos). */
export async function diasEditados(): Promise<string[]> {
  const c = await collections();
  return (await c.dias.find({ editadoEn: { $exists: true } }, { projection: { _id: 1 } }).toArray()).map((d) => d._id).sort();
}

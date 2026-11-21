import { calc, ITEMS_A, TEMAS_B, type Criterios, type Resultado, type ValorA } from "./criterios";
import { SIN_MONITOR, type FilaEstudiante } from "./tablero";

// Seguimiento general v2 (rama feature/seguimiento-v2): funciones puras, sin base. Reglas en docs/DECISIONES.md:
// - Solo cuentan quienes AGENDARON (fila con día). Los demás van solo a «Sin agendar».
// - «Contar por»: por estudiante (una fila) o por proyecto (una pareja = un proyecto, el mejor resultado).
// - Por estudiante, cada número coincide con tablero() sobre las mismas filas (pruebas de paridad).

export type Modo = "est" | "proy";
export type Modalidad = "individual" | "pareja";
export type FiltroV2 = { dia?: string; ciudad?: string; ruta?: string; modalidad?: Modalidad; q?: string };

/** Un estudiante o un proyecto, ya con su resultado. */
export type Unidad = {
  proyectoId: string; nombre: string; proyecto: string; ciudad: string; dia: string | null; hora: string; ruta: string; pareja: boolean;
  mentor: string; monitor: string; n: number;
  res: Resultado; a: number | null; b: number | null;
  /** Parte A por criterio (orden de ITEMS_A) y Parte B por tema (orden de TEMAS_B); null = sin dato. */
  items: (ValorA | null)[]; temas: (number | null)[];
  destacado: boolean; fortaleza: string; motivo: string | null;
};

const PRESENTO: Resultado[] = ["Excelente", "Aprobado", "Incompleto"];
export const sePresento = (r: Resultado) => PRESENTO.includes(r);
const prom = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : null);
const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => typeof x === "number");
/** Fracciones y promedios con 4 decimales: la respuesta se refresca cada minuto. */
const r4 = (x: number | null) => (x === null ? null : Math.round(x * 1e4) / 1e4);
const frac = (a: number, b: number) => (b ? r4(a / b) : null);
const es = (a: string, b: string) => a.localeCompare(b, "es");

/** Texto sin tildes ni mayúsculas (buscador). */
export const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "8:00 a. m." → minutos desde la medianoche (para ordenar). */
export function horaMin(h: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])/i.exec(h.trim());
  if (!m) return 24 * 60;
  const hh = Number(m[1]) % 12 + (m[3].toLowerCase() === "p" ? 12 : 0);
  return hh * 60 + Number(m[2]);
}

// ---------- filtros ----------

/** Ciudad, ruta, modalidad y búsqueda (por proyecto: si coincide el proyecto o un integrante, entra el proyecto entero). */
export function filtrarBase(filas: FilaEstudiante[], f: FiltroV2): FilaEstudiante[] {
  const q = normal(f.q ?? "");
  const ok = new Set<string>();
  if (q) for (const x of filas) if (normal(x.proyecto).includes(q) || normal(x.nombre).includes(q)) ok.add(x.proyectoId);
  return filas.filter((x) =>
    (!f.ciudad || x.ciudad === f.ciudad) && (!f.ruta || x.ruta === f.ruta) &&
    (!f.modalidad || (f.modalidad === "pareja") === !!x.pareja) && (!q || ok.has(x.proyectoId)));
}

export const agendadas = (filas: FilaEstudiante[]) => filas.filter((f) => f.dia !== null);
export const sinAgendarFilas = (filas: FilaEstudiante[]) => filas.filter((f) => f.dia === null);

// ---------- unidades ----------

export function unidadEstudiante(f: FilaEstudiante, crit: Criterios): Unidad {
  const c = calc(f.ev, crit), con = c.res !== "Pendiente";
  return {
    proyectoId: f.proyectoId, nombre: f.nombre, proyecto: f.proyecto, ciudad: f.ciudad, dia: f.dia, hora: f.hora, ruta: f.ruta, pareja: !!f.pareja,
    mentor: f.mentor, monitor: f.monitor, n: 1, res: c.res, a: c.a, b: c.b,
    items: ITEMS_A.map(([k]) => (con ? f.ev?.a[k] ?? null : null)), temas: TEMAS_B.map(([k]) => (con ? f.ev?.b[k] ?? null : null)),
    destacado: !!f.ev?.destacado, fortaleza: f.ev?.fortaleza ?? "", motivo: f.motivo,
  };
}

const RANGO_A: Record<ValorA, number> = { no: 0, parcial: 1, si: 2 };

/** Un proyecto a partir de las unidades de sus integrantes (reglas «Contar por proyectos» de DECISIONES). */
export function unidadProyecto(us: Unidad[]): Unidad {
  const pres = us.filter((u) => sePresento(u.res));
  const res: Resultado = (["Excelente", "Aprobado", "Incompleto"] as Resultado[]).find((r) => us.some((u) => u.res === r))
    ?? (us.some((u) => u.res === "Pendiente") ? "Pendiente" : "No se presentó");
  const base = us[0], as = nums(pres.map((u) => u.a));
  const dest = pres.filter((u) => u.destacado);
  const mejor = (i: number) => pres.map((u) => u.items[i]).filter((v): v is ValorA => !!v).sort((x, y) => RANGO_A[y] - RANGO_A[x])[0] ?? null;
  return {
    ...base, nombre: us.map((u) => u.nombre).join(" y "), n: us.length, res,
    a: as.length ? Math.max(...as) : null, b: prom(nums(pres.map((u) => u.b))),
    items: ITEMS_A.map((_, i) => mejor(i)), temas: TEMAS_B.map((_, i) => prom(nums(pres.map((u) => u.temas[i])))),
    destacado: dest.length > 0, fortaleza: (dest.find((u) => u.fortaleza) ?? pres.find((u) => u.fortaleza))?.fortaleza ?? "",
    motivo: us.find((u) => u.motivo)?.motivo ?? null,
  };
}

export function unidades(filas: FilaEstudiante[], crit: Criterios, modo: Modo): Unidad[] {
  const est = filas.map((f) => unidadEstudiante(f, crit));
  if (modo === "est") return est;
  const g = new Map<string, Unidad[]>();
  for (const u of est) g.set(u.proyectoId, [...(g.get(u.proyectoId) ?? []), u]);
  return [...g.values()].map(unidadProyecto);
}

// ---------- conteos ----------

export type Cuenta = {
  tot: number; exc: number; apr: number; inc: number; nsp: number; pend: number;
  /** Evaluados = con resultado distinto de Pendiente (incluye «No se presentó», como hoy). */
  ev: number; pres: number; des: number; conMotivo: number;
  avance: number | null; pctExc: number | null; asis: number | null; funciona: number | null; nivel: number | null;
};

export function cuenta(us: Unidad[]): Cuenta {
  const k = (r: Resultado) => us.filter((u) => u.res === r).length;
  const exc = k("Excelente"), apr = k("Aprobado"), inc = k("Incompleto"), nsp = k("No se presentó"), pend = k("Pendiente");
  const tot = us.length, ev = tot - pend, pres = exc + apr + inc;
  return {
    tot, exc, apr, inc, nsp, pend, ev, pres, des: us.filter((u) => u.destacado).length,
    conMotivo: us.filter((u) => u.res === "No se presentó" && u.motivo).length,
    avance: frac(ev, tot), pctExc: frac(exc, pres), asis: frac(pres, pres + nsp),
    funciona: r4(prom(nums(us.map((u) => u.a)))), nivel: r4(prom(nums(us.map((u) => u.b)))),
  };
}

export type FilaDia = { dia: string; d: Cuenta; acum: Cuenta };
/** Por día (orden de fecha) y acumulado hasta ese día. */
export function porDia(us: Unidad[]): FilaDia[] {
  const dias = [...new Set(us.map((u) => u.dia).filter((d): d is string => !!d))].sort();
  return dias.map((dia) => ({ dia, d: cuenta(us.filter((u) => u.dia === dia)), acum: cuenta(us.filter((u) => u.dia! <= dia)) }));
}

export type Grupo = { grupo: string; c: Cuenta };
function agrupar(us: Unidad[], clave: (u: Unidad) => string, fijos: string[] = []): Grupo[] {
  return [...new Set([...fijos, ...us.map(clave)])].map((g) => ({ grupo: g, c: cuenta(us.filter((u) => clave(u) === g)) }))
    .filter((g) => g.c.tot > 0).sort((x, y) => y.c.tot - x.c.tot || es(x.grupo, y.grupo));
}

export type Atipico = { mentor: string; funciona: number; nivel: number; evaluados: number; distancia: number; atipico: boolean };
/** Mentores que califican muy distinto: solo con ≥ 3 presentados con Funciona y Nivel. Distancia robusta a las medianas
 *  (|x − mediana| / (1,4826 · MAD), con un piso de 5 pts y 0,25 de nivel); atípico si la distancia combinada pasa de 3
 *  y además se aleja al menos 10 pts de Funciona o 0,5 de Nivel. */
export function mentoresAtipicos(us: Unidad[]): { lista: Atipico[]; medFunciona: number | null; medNivel: number | null } {
  const g = new Map<string, Unidad[]>();
  for (const u of us) if (sePresento(u.res) && u.a !== null && u.b !== null) g.set(u.mentor, [...(g.get(u.mentor) ?? []), u]);
  const val = [...g].filter(([, l]) => l.length >= 3).map(([m, l]) => ({ mentor: m, funciona: prom(l.map((u) => u.a!))!, nivel: prom(l.map((u) => u.b!))!, evaluados: l.length }));
  if (val.length < 3) return { lista: val.map((v) => ({ ...v, distancia: 0, atipico: false })), medFunciona: null, medNivel: null };
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mf = med(val.map((v) => v.funciona)), mn = med(val.map((v) => v.nivel));
  const sf = Math.max(1.4826 * med(val.map((v) => Math.abs(v.funciona - mf))), 0.05), sn = Math.max(1.4826 * med(val.map((v) => Math.abs(v.nivel - mn))), 0.25);
  const lista = val.map((v) => {
    const distancia = Math.hypot((v.funciona - mf) / sf, (v.nivel - mn) / sn);
    return { ...v, funciona: r4(v.funciona)!, nivel: r4(v.nivel)!, distancia: r4(distancia)!, atipico: distancia > 3 && (Math.abs(v.funciona - mf) >= 0.1 || Math.abs(v.nivel - mn) >= 0.5) };
  }).sort((a, b) => b.distancia - a.distancia || es(a.mentor, b.mentor));
  return { lista, medFunciona: r4(mf), medNivel: r4(mn) };
}

// ---------- vista completa de un modo ----------

/** Fila de las listas: solo lo que se ve (nombres; nunca documento, correo ni celular). */
export type ItemLista = { nombre: string; proyecto: string; ciudad: string; dia: string | null; hora?: string; mentor?: string; monitor?: string; res?: Resultado; a?: number | null; b?: number | null; fortaleza?: string; motivo?: string | null };
const base = (u: Unidad) => ({ nombre: u.nombre, proyecto: u.proyecto, ciudad: u.ciudad, dia: u.dia });
const itemDestacado = (u: Unidad): ItemLista => ({ ...base(u), mentor: u.mentor, res: u.res, fortaleza: u.fortaleza });
const itemExcelente = (u: Unidad): ItemLista => ({ ...base(u), mentor: u.mentor, a: r4(u.a), b: r4(u.b) });
const itemInasistencia = (u: Unidad): ItemLista => ({ ...base(u), hora: u.hora, monitor: u.monitor, motivo: u.motivo });

export type VistaModo = {
  c: Cuenta;
  /** Tendencia: por día con los filtros salvo el Día (para las mini tendencias y el combinado). */
  dias: FilaDia[];
  parteA: { k: string; titulo: string; si: number | null; n: number; cumplen: number }[];
  parteB: { k: string; titulo: string; promedio: number | null; n: number }[];
  calor: { ciudad: string; temas: (number | null)[]; prom: number | null }[];
  porCiudad: Grupo[]; porRuta: Grupo[]; porModalidad: Grupo[];
  /** Por ciudad, «eligieron hora y no se presentaron», como hoy (incluye «No» del monitor sin evaluación). */
  noSePresentaronCiudad: { ciudad: string; n: number; tot: number; pres: number }[];
  motivos: { motivo: string; n: number }[];
  porMonitor: { monitor: string; ciudad: string; c: Cuenta; sinMotivo: number }[];
  porMentor: { mentor: string; c: Cuenta; atipico: boolean }[];
  atipicos: ReturnType<typeof mentoresAtipicos>;
  destacados: ItemLista[]; excelentes: ItemLista[]; inasistencias: ItemLista[];
};

/** Todo lo de un modo. `listas` = false: sin las listas largas (el otro modo solo necesita sus cifras). */
export function vistaModo(filasDia: FilaEstudiante[], filasTendencia: FilaEstudiante[], crit: Criterios, modo: Modo, asistenciaNo: Set<string>, listas = true): VistaModo {
  const us = unidades(filasDia, crit, modo), c = cuenta(us);
  const conRes = us.filter((u) => u.res !== "Pendiente");
  const parteA = ITEMS_A.map(([k, titulo], i) => {
    const m = conRes.filter((u) => u.items[i]), si = m.filter((u) => u.items[i] === "si").length;
    return { k, titulo, si: frac(si, m.length), n: m.length, cumplen: si };
  });
  const parteB = TEMAS_B.map(([k, titulo], i) => { const v = nums(conRes.map((u) => u.temas[i])); return { k, titulo, promedio: r4(prom(v)), n: v.length }; });
  const ciudades = [...new Set(us.map((u) => u.ciudad))].sort(es);
  const calor = ciudades.map((ciudad) => {
    const l = conRes.filter((u) => u.ciudad === ciudad);
    return { ciudad, temas: TEMAS_B.map((_, i) => r4(prom(nums(l.map((u) => u.temas[i]))))), prom: r4(prom(nums(l.map((u) => u.b)))) };
  }).filter((x) => x.prom !== null || x.temas.some((t) => t !== null));
  // «No se presentaron» por ciudad, como hoy: «No se presentó» guardado o «No» del monitor sin evaluación.
  const ausente = (f: FilaEstudiante) => (f.ev ? f.ev.noPresento : asistenciaNo.has(`${f.proyectoId}|${f.documento}`));
  const nsc = ciudades.map((ciudad) => {
    const fs = filasDia.filter((f) => f.ciudad === ciudad), u = us.filter((x) => x.ciudad === ciudad);
    let n: number;
    if (modo === "est") n = fs.filter(ausente).length;
    else { const ids = new Set(fs.map((f) => f.proyectoId)); n = [...ids].filter((id) => { const m = fs.filter((f) => f.proyectoId === id); return m.every(ausente); }).length; }
    return { ciudad, n, tot: u.length, pres: u.filter((x) => sePresento(x.res)).length };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || es(a.ciudad, b.ciudad));
  const motivos = new Map<string, number>();
  for (const u of us) if (u.motivo) motivos.set(u.motivo, (motivos.get(u.motivo) ?? 0) + 1); // incluye reprogramados
  const monitores = [...new Set(us.map((u) => u.monitor))].sort(es);
  const atipicos = mentoresAtipicos(us), raro = new Set(atipicos.lista.filter((x) => x.atipico).map((x) => x.mentor));
  const mentores = [...new Set(us.map((u) => u.mentor))].sort(es);
  return {
    c, dias: porDia(unidades(filasTendencia, crit, modo)), parteA, parteB, calor,
    porCiudad: agrupar(us, (u) => u.ciudad), porRuta: agrupar(us, (u) => u.ruta || "Sin dato", ["Básica", "Avanzada"]),
    porModalidad: agrupar(us, (u) => (u.pareja ? "En pareja" : "Individual"), ["Individual", "En pareja"]),
    noSePresentaronCiudad: nsc,
    motivos: [...motivos].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n || es(a.motivo, b.motivo)),
    porMonitor: monitores.map((m) => {
      const l = us.filter((u) => u.monitor === m), cs = [...new Set(l.map((u) => u.ciudad))], cc = cuenta(l);
      return { monitor: m, ciudad: cs.length === 1 ? cs[0] : "Varias", c: cc, sinMotivo: cc.nsp - cc.conMotivo };
    }),
    porMentor: mentores.map((m) => ({ mentor: m, c: cuenta(us.filter((u) => u.mentor === m)), atipico: raro.has(m) })),
    atipicos,
    destacados: listas ? us.filter((u) => u.destacado).map(itemDestacado) : [],
    excelentes: listas ? us.filter((u) => u.res === "Excelente").map(itemExcelente) : [],
    inasistencias: !listas ? [] : us.filter((u) => u.res === "No se presentó").map(itemInasistencia).sort((a, b) => (a.dia ?? "").localeCompare(b.dia ?? "") || horaMin(a.hora!) - horaMin(b.hora!) || es(a.nombre, b.nombre)),
  };
}

/** Parejas con los dos integrantes evaluados (siempre por estudiantes, como hoy). */
export function parejas(filas: FilaEstudiante[], crit: Criterios) {
  const out = { ambos: 0, uno: 0, ninguno: 0 };
  const us = unidades(filas.filter((f) => f.pareja), crit, "est");
  for (const id of new Set(us.map((u) => u.proyectoId))) {
    const rs = us.filter((u) => u.proyectoId === id);
    if (rs.length !== 2 || !rs.every((u) => sePresento(u.res))) continue;
    const k = rs.filter((u) => u.res === "Excelente").length;
    out[k === 2 ? "ambos" : k === 1 ? "uno" : "ninguno"]++;
  }
  return out;
}

// ---------- sin agendar ----------

export type SinAgendar = {
  proyectos: { proyectoId: string; proyecto: string; estudiantes: string[]; ciudad: string; ruta: string; pareja: boolean; monitor: string }[];
  porCiudad: { ciudad: string; proyectos: number; estudiantes: number; sinMonitor: number }[];
  estudiantes: number;
};
/** Proyectos sin día ni hora (no cuentan en las estadísticas). `monitorAsignado`: monitor del proyecto por id. */
export function sinAgendar(filas: FilaEstudiante[], monitorAsignado: Map<string, string | null> = new Map()): SinAgendar {
  const g = new Map<string, FilaEstudiante[]>();
  for (const f of filas) g.set(f.proyectoId, [...(g.get(f.proyectoId) ?? []), f]);
  const proyectos = [...g.values()].map((fs) => ({
    proyectoId: fs[0].proyectoId, proyecto: fs[0].proyecto, estudiantes: fs.map((f) => f.nombre), ciudad: fs[0].ciudad, ruta: fs[0].ruta,
    pareja: fs.length > 1, monitor: monitorAsignado.get(fs[0].proyectoId) ?? SIN_MONITOR,
  })).sort((a, b) => es(a.ciudad, b.ciudad) || es(a.proyecto, b.proyecto));
  const ciudades = [...new Set(proyectos.map((p) => p.ciudad))].sort(es);
  return {
    proyectos, estudiantes: filas.length,
    porCiudad: ciudades.map((ciudad) => {
      const l = proyectos.filter((p) => p.ciudad === ciudad);
      return { ciudad, proyectos: l.length, estudiantes: l.reduce((s, p) => s + p.estudiantes.length, 0), sinMonitor: l.filter((p) => p.monitor === SIN_MONITOR).length };
    }),
  };
}

// ---------- reporte del día (oficial) ----------

export type Reporte = {
  dia: string | null; ciudades: number;
  /** Por estudiantes: agendados, se presentaron («evaluados» del reporte), no se presentaron, pendientes, excelentes. */
  e: { tot: number; pres: number; nsp: number; pend: number; exc: number };
  /** Por proyectos: «aprobados» = presentados no excelentes (incluye incompletos). */
  p: { tot: number; pres: number; exc: number; apr: number; des: number; nsp: number; nspIndividual: number; nspPareja: number; pend: number };
  porCiudad: { ciudad: string; proyectos: number; presentados: number; noPresentados: number; pendientes: number; estudiantes: number }[];
  noAsistieron: { ciudad: string; n: number }[];
};

/** Reporte del día: todas las ciudades, agendados de ese día (null = todos los días), coherente con el que se envía. */
export function reporte(filas: FilaEstudiante[], crit: Criterios, dia: string | null): Reporte {
  const fs = agendadas(filas).filter((f) => !dia || f.dia === dia);
  const est = unidades(fs, crit, "est"), proy = unidades(fs, crit, "proy");
  const k = (us: Unidad[], r: Resultado) => us.filter((u) => u.res === r).length;
  const pres = proy.filter((u) => sePresento(u.res)), nspP = proy.filter((u) => u.res === "No se presentó");
  const ciudades = [...new Set(proy.map((u) => u.ciudad))];
  const noAs = new Map<string, number>();
  for (const u of est) if (u.res === "No se presentó") noAs.set(u.ciudad, (noAs.get(u.ciudad) ?? 0) + 1);
  return {
    dia, ciudades: ciudades.length,
    e: { tot: est.length, pres: est.filter((u) => sePresento(u.res)).length, nsp: k(est, "No se presentó"), pend: k(est, "Pendiente"), exc: k(est, "Excelente") },
    p: {
      tot: proy.length, pres: pres.length, exc: k(proy, "Excelente"), apr: pres.length - k(proy, "Excelente"), des: pres.filter((u) => u.destacado).length,
      nsp: nspP.length, nspIndividual: nspP.filter((u) => !u.pareja).length, nspPareja: nspP.filter((u) => u.pareja).length, pend: k(proy, "Pendiente"),
    },
    porCiudad: ciudades.map((ciudad) => {
      const l = proy.filter((u) => u.ciudad === ciudad);
      return { ciudad, proyectos: l.length, presentados: l.filter((u) => sePresento(u.res)).length, noPresentados: k(l, "No se presentó"), pendientes: k(l, "Pendiente"), estudiantes: l.reduce((s, u) => s + u.n, 0) };
    }).sort((a, b) => b.proyectos - a.proyectos || es(a.ciudad, b.ciudad)),
    noAsistieron: [...noAs].map(([ciudad, n]) => ({ ciudad, n })).sort((a, b) => b.n - a.n || es(a.ciudad, b.ciudad)),
  };
}

import ExcelJS from "exceljs";
import type { Filter } from "mongodb";
import { horaCO } from "../ciudades";
import { collections, transaccion } from "../db";
import { diaCOL, horaCOL } from "../edicion";
import { sinProyectoPorCiudad, type SinProyectoCiudad } from "../sinProyecto";
import type { Actor, Asiento, Proyecto } from "../types";
import { calc, CRITERIOS_DEFECTO, ITEMS_A, TEMAS_B, type Criterios } from "./criterios";
import { criterios, idEval } from "./datos";
import { mensajeEstudiante, SIN_MENTOR, SIN_MONITOR, tablero, type FilaEstudiante, type Tablero } from "./tablero";

// Seguimiento general (Paso 15) en la base: coordinación y admin. Una fila por estudiante de todos los proyectos
// (también los que aún no tienen hora), filtrable por día y ciudad, y el Excel de resultados (solo exportar).
// Lleva documento, correo y celular completos: solo para quien puede descargar el Excel (descargar_excel).

export type FiltroSeguimiento = { dia?: string; ciudad?: string };

/** Filas por estudiante con su evaluación, la nota del monitor, sala, mentor y monitor de la sala. */
export async function filasEstudiantes(filtro: FiltroSeguimiento = {}): Promise<FilaEstudiante[]> {
  const c = await collections();
  const asientosF: Filter<Asiento> = { proyectoId: { $type: "objectId" }, ...(filtro.dia ? { dia: filtro.dia } : {}) };
  const asientos = await c.asientos.find(asientosF).toArray();
  const porProyecto = new Map(asientos.map((a) => [String(a.proyectoId), a]));
  // Paso 21: los proyectos marcados «Sin proyecto» no cuentan (tienen su propio apartado).
  const proyectosF: Filter<Proyecto> = { sinProyecto: { $exists: false }, ...(filtro.ciudad ? { ciudad: filtro.ciudad } : {}), ...(filtro.dia ? { _id: { $in: asientos.map((a) => a.proyectoId!) } } : {}) };
  const proyectos = await c.proyectos.find(proyectosF).sort({ ciudad: 1, nombre: 1 }).toArray();
  const ids = proyectos.map((p) => p._id);
  const [evals, notas, plan, mentores] = await Promise.all([
    c.evalResultados.find({ proyectoId: { $in: ids } }).toArray(),
    c.evalMonitor.find({ proyectoId: { $in: ids } }).toArray(),
    c.planSalas.find(filtro.dia ? { dia: filtro.dia } : {}).toArray(),
    c.mentores.find({}, { projection: { nombre: 1 } }).toArray(),
  ]);
  const usuarios = await c.users.find({ usuario: { $in: [...new Set(plan.map((p) => p.monitor).filter((m): m is string => !!m))] } }, { projection: { usuario: 1, nombre: 1 } }).toArray();
  const ev = new Map(evals.map((e) => [e._id, e])), nota = new Map(notas.map((n) => [n._id, n]));
  const sala = new Map(plan.map((p) => [`${p.dia}|${p.hora}|${p.mentorId}`, p]));
  const nombreMentor = new Map(mentores.map((m) => [m._id, m.nombre])), nombreUsuario = new Map(usuarios.map((u) => [u.usuario, u.nombre]));
  const filas: FilaEstudiante[] = [];
  for (const p of proyectos) {
    const a = porProyecto.get(String(p._id));
    const s = a ? sala.get(`${diaCOL(a.inicio)}|${horaCOL(a.inicio)}|${a.mentorId}`) : undefined;
    p.integrantes.forEach((x, i) => {
      const k = idEval(p._id, x.documento), e = ev.get(k), n = nota.get(k), otro = p.integrantes[1 - i];
      filas.push({
        proyectoId: String(p._id), codigo: p.codigo, nombre: x.nombre, documento: x.documento, correo: x.correo ?? "", celular: x.celular ?? "",
        ciudad: p.ciudad, ruta: p.ruta ?? "", pareja: p.integrantes.length > 1 && otro ? { nombre: otro.nombre, documento: otro.documento } : null,
        proyecto: p.nombre, descripcion: p.descripcion ?? "",
        dia: a ? diaCOL(a.inicio) : null, hora: a ? horaCO(a.inicio) : "", sala: s?.sala ?? null,
        mentor: a ? nombreMentor.get(a.mentorId) ?? a.mentorId : SIN_MENTOR,
        monitor: s?.monitor ? nombreUsuario.get(s.monitor) ?? s.monitor : SIN_MONITOR,
        ev: e ? { a: e.a, b: e.b, noPresento: e.noPresento, destacado: e.destacado, fortaleza: e.fortaleza, mejora: e.mejora, percepcion: e.percepcion } : null,
        motivo: n?.motivo ?? null, observacion: n?.observacion ?? "",
      });
    });
  }
  return filas;
}

export type Cupos = { ofrecidos: number; ocupados: number; libres: number; porDia: { dia: string; ocupados: number; libres: number }[]; porMentor: { mentor: string; libres: number }[] };

/** Cupos para reprogramar (desde ahora): ocupados y libres por día, y libres por mentor. Con ciudad: los de esa ciudad. */
export async function cuposDesdeHoy(filtro: FiltroSeguimiento = {}, ahora = new Date()): Promise<Cupos> {
  const c = await collections();
  const lista = await c.asientos.find({ inicio: { $gte: ahora }, ...(filtro.dia ? { dia: filtro.dia } : {}), ...(filtro.ciudad ? { ciudades: filtro.ciudad } : {}) }, { projection: { dia: 1, mentorId: 1, proyectoId: 1 } }).toArray();
  const nombre = new Map((await c.mentores.find({}, { projection: { nombre: 1 } }).toArray()).map((m) => [m._id, m.nombre]));
  const dias = new Map<string, { ocupados: number; libres: number }>(), mentores = new Map<string, number>();
  for (const a of lista) {
    const d = dias.get(a.dia) ?? { ocupados: 0, libres: 0 };
    if (a.proyectoId) d.ocupados++; else { d.libres++; const m = nombre.get(a.mentorId) ?? a.mentorId; mentores.set(m, (mentores.get(m) ?? 0) + 1); }
    dias.set(a.dia, d);
  }
  const libres = lista.filter((a) => !a.proyectoId).length;
  return {
    ofrecidos: lista.length, ocupados: lista.length - libres, libres,
    porDia: [...dias].sort(([a], [b]) => a.localeCompare(b)).map(([dia, v]) => ({ dia, ...v })),
    porMentor: [...mentores].map(([mentor, n]) => ({ mentor, libres: n })).sort((a, b) => b.libres - a.libres || a.mentor.localeCompare(b.mentor, "es")),
  };
}

/** Paso 21 · Por ciudad: integrantes con hora que no se presentaron («No se presentó» guardado, o asistencia «No» del
 *  monitor sin evaluación guardada). */
export type NoSePresentaronCiudad = { ciudad: string; estudiantes: number };
export function noSePresentaronPorCiudad(filas: FilaEstudiante[], asistenciaNo: Set<string>): NoSePresentaronCiudad[] {
  const out = new Map<string, number>();
  for (const f of filas) {
    if (!f.dia) continue;
    if (f.ev ? f.ev.noPresento : asistenciaNo.has(`${f.proyectoId}|${f.documento}`)) out.set(f.ciudad, (out.get(f.ciudad) ?? 0) + 1);
  }
  return [...out].map(([ciudad, estudiantes]) => ({ ciudad, estudiantes })).sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es"));
}

export type Seguimiento = Tablero & { cupos: Cupos; criterios: Criterios; dias: string[]; ciudades: string[]; sinProyecto: SinProyectoCiudad[]; noSePresentaronCiudad: NoSePresentaronCiudad[] };

export async function seguimiento(filtro: FiltroSeguimiento = {}): Promise<Seguimiento> {
  const c = await collections();
  const [filas, crit, cupos, dias, ciudades, sinProyecto, asistenciaNo] = await Promise.all([
    filasEstudiantes(filtro), criterios(), cuposDesdeHoy(filtro),
    c.asientos.distinct("dia"), c.proyectos.distinct("ciudad"), sinProyectoPorCiudad(filtro.ciudad),
    c.evalMonitor.find({ asistencia: "no" }, { projection: { _id: 1 } }).toArray(),
  ]);
  return {
    ...tablero(filas, crit), cupos, criterios: crit, dias: dias.sort(), ciudades: ciudades.sort((a, b) => a.localeCompare(b, "es")),
    sinProyecto, noSePresentaronCiudad: noSePresentaronPorCiudad(filas, new Set(asistenciaNo.map((n) => n._id))),
  };
}

/** Guarda los criterios de Excelente (Parte A mínima y Parte B mínima) con changeLog. */
export async function guardarCriterios(crit: Criterios, actor: Actor): Promise<void> {
  const c = await collections(), ahora = new Date();
  await transaccion(async (s) => {
    const previo = await c.evalConfig.findOne({ _id: "criterios" }, { session: s });
    const antes = previo ? { exA: previo.exA, exB: previo.exB } : CRITERIOS_DEFECTO;
    await c.evalConfig.replaceOne({ _id: "criterios" }, { exA: crit.exA, exB: crit.exB, actualizadoEn: ahora }, { upsert: true, session: s });
    await c.changeLog.insertOne({
      accion: "criterios", anterior: `A ≥ ${Math.round(antes.exA * 100)} % · B ≥ ${antes.exB}`, nuevo: `A ≥ ${Math.round(crit.exA * 100)} % · B ≥ ${crit.exB}`, actor, fecha: ahora,
    }, { session: s });
  });
}

// ---- Excel de resultados ----

const SI_NO = { si: "Sí", parcial: "Parcial", no: "No" } as const;
const pctTxt = (x: number | null) => (x === null ? "" : `${Math.round(x * 100)} %`);
const unoTxt = (x: number | null) => (x === null ? "" : Number(x.toFixed(1)));

export const COLUMNAS_RESULTADOS = [
  "Estudiante", "Documento", "Correo", "Celular", "Ciudad", "Ruta", "Modalidad", "Pareja (nombre)", "Pareja (documento)", "Emprendimiento", "Descripción",
  "Día", "Hora (COL)", "Sala", "Evaluador(a)", "Monitor(a)",
  ...ITEMS_A.map(([, t]) => `A · ${t}`), ...TEMAS_B.map(([, t]) => `B · ${t}`),
  "% Funciona", "Nivel promedio", "Resultado", "Destacado", "Lo que hizo bien", "Qué mejorar", "Percepción del mentor",
  "Asistencia", "Motivo de inasistencia", "Observación del monitor", "Asunto del correo", "Mensaje para el estudiante",
] as const;

/** Una fila del Excel por estudiante, en el orden de COLUMNAS_RESULTADOS. */
export function filaExcel(f: FilaEstudiante, crit: Criterios): (string | number)[] {
  const c = calc(f.ev, crit), m = mensajeEstudiante(f, crit), e = f.ev;
  return [
    f.nombre, f.documento, f.correo, f.celular, f.ciudad, f.ruta, f.pareja ? "En pareja" : "Individual", f.pareja?.nombre ?? "", f.pareja?.documento ?? "", f.proyecto, f.descripcion,
    f.dia ?? "Sin fecha", f.hora, f.sala ?? "", f.mentor, f.monitor,
    ...ITEMS_A.map(([k]) => (e?.a[k] ? SI_NO[e.a[k]!] : "")), ...TEMAS_B.map(([k]) => e?.b[k] ?? ""),
    pctTxt(c.a), unoTxt(c.b), c.res, e?.destacado ? "Sí" : "", e?.fortaleza ?? "", e?.mejora ?? "", e?.percepcion ?? "",
    c.res === "No se presentó" ? "No se presentó" : c.res === "Pendiente" ? "" : "Se presentó",
    f.motivo ?? "", f.observacion, m.asunto, m.mensaje,
  ];
}

/** Texto que una hoja de cálculo podría leer como fórmula (= + - @, tabulador o retorno) va con apóstrofo delante. */
export const sinFormula = (v: string | number) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

function hoja(wb: ExcelJS.Workbook, nombre: string, encabezados: string[], filas: (string | number)[][], anchos?: number[]) {
  const ws = wb.addWorksheet(nombre);
  ws.addRow(encabezados).font = { bold: true };
  for (const f of filas) ws.addRow(f.map(sinFormula));
  ws.columns.forEach((col, i) => { col.width = anchos?.[i] ?? Math.max(12, (encabezados[i] ?? "").length + 3); });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: encabezados.length } };
  return ws;
}

const GRUPO = ["Estudiantes", "Evaluados", "No se presentaron", "% excelentes", "Nivel prom."];

/** Excel de resultados: hoja "Resultados" (una fila por estudiante) y una hoja por tabla del seguimiento. */
export async function excelResultados(filtro: FiltroSeguimiento = {}): Promise<Buffer> {
  const [filas, crit] = await Promise.all([filasEstudiantes(filtro), criterios()]);
  const t = tablero(filas, crit);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Proyecto final JC 2026";
  const ws = hoja(wb, "Resultados", [...COLUMNAS_RESULTADOS], filas.map((f) => filaExcel(f, crit)));
  ws.getColumn(2).numFmt = "@";
  ws.getColumn(COLUMNAS_RESULTADOS.length).width = 60;
  ws.getColumn(COLUMNAS_RESULTADOS.length).alignment = { wrapText: true, vertical: "top" };
  const grupo = (nombre: string, etiqueta: string, g: Tablero["porRuta"]) =>
    hoja(wb, nombre, [etiqueta, ...GRUPO], g.map((x) => [x.grupo, x.estudiantes, x.evaluados, x.noSePresentaron, pctTxt(x.excelentes), unoTxt(x.nivel)]), [22, 12, 12, 18, 14, 12]);
  grupo("Por ruta", "Ruta", t.porRuta);
  grupo("Por ciudad", "Ciudad", t.porCiudad);
  grupo("Por modalidad", "Modalidad", t.porModalidad);
  hoja(wb, "Por mentor", ["Mentor", "Asignados", "Evaluados", "Avance", "Funciona prom.", "Nivel prom."],
    t.porMentor.map((x) => [x.mentor, x.asignados, x.evaluados, pctTxt(x.avance), pctTxt(x.funciona), unoTxt(x.nivel)]), [28, 12, 12, 10, 16, 12]);
  hoja(wb, "Por monitor", ["Monitor", "Estudiantes", "No se presentaron", "Con motivo", "Sin motivo"],
    t.inasistencias.porMonitor.map((x) => [x.monitor, x.estudiantes, x.noSePresentaron, x.conMotivo, x.sinMotivo]), [28, 12, 18, 12, 12]);
  hoja(wb, "Por día", ["Día", "Programados", "Evaluados", "No se presentaron", "Avance"],
    t.porDia.map((x) => [x.dia ?? "Sin fecha", x.programados, x.evaluados, x.noSePresentaron, pctTxt(x.avance)]), [14, 13, 12, 18, 10]);
  hoja(wb, "Inasistencias", ["Motivo de inasistencia (incluye reprogramados)", "Estudiantes"], t.inasistencias.motivos.map((x) => [x.motivo, x.n]), [46, 12]);
  hoja(wb, "Destacados", ["Estudiante", "Emprendimiento", "Mentor", "Resultado", "Lo que hizo muy bien"],
    t.destacados.map((x) => [x.nombre, x.proyecto, x.mentor, x.res, x.fortaleza]), [28, 28, 26, 12, 60]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

import type ExcelJS from "exceljs";
import { HOJAS_SALAS, MAX_SALAS, type Sala } from "../salas";
import { cleanSpaces } from "../validation/name";
import { clave, hoja, leerDia, leerHora, texto, valor, type ErrorFila } from "./excel";

// Libro de salas y monitores: "Salas" (Sala 1 a N, máximo MAX_SALAS = 12, y Enlace, obligatoria), "Monitores" (Día, Hora,
// Sala o Mentor, Monitor; opcional) y "Disponibilidad monitores" (Monitor, Día, Hora; opcional).
// Aquí solo se lee el archivo; los nombres de mentores y monitores se buscan en la base al revisar.

export const COLUMNAS_SALAS = ["Sala", "Enlace"] as const;
export const COLUMNAS_MONITORES = ["Día", "Hora", "Sala", "Monitor"] as const;
export const COLUMNAS_DISPONIBILIDAD = ["Monitor", "Día", "Hora"] as const;
export const COLUMNAS_PLAN = ["Día", "Hora", "Mentor", "Sala", "Monitor"] as const;

export type FilaMonitorLeida = { fila: number; dia: string; hora: number; sala?: number; mentor?: string; monitor: string };
export type FilaDisponibilidadLeida = { fila: number; monitor: string; dia: string; hora: number };
/** Fila de la hoja «Plan de salas»: fija la sala del mentor en esa hora; `monitor` vacío = sala sin monitor. */
export type FilaPlanLeida = { fila: number; dia: string; hora: number; mentor: string; sala: number; monitor: string };

export type LibroSalas = {
  salas: Sala[];
  monitores: FilaMonitorLeida[];
  disponibilidad: FilaDisponibilidadLeida[];
  /** Hoja opcional «Plan de salas». Si viene, la importación solo toca los días que trae (ver planSalasFijo.ts). */
  plan?: FilaPlanLeida[];
  /** La hoja Disponibilidad monitores venía en el archivo (aunque sin filas). */
  conDisponibilidad?: boolean;
  errores: ErrorFila[];
  avisos: ErrorFila[];
};

/** Columnas por encabezado (sin tildes ni mayúsculas). Devuelve 0 si falta. */
function columnas(ws: ExcelJS.Worksheet, buscar: Record<string, RegExp>): Record<string, number> {
  const encab: string[] = [];
  ws.getRow(1).eachCell((c, i) => { encab[i] = clave(texto(c.value)); });
  return Object.fromEntries(Object.entries(buscar).map(([campo, re]) => [campo, encab.findIndex((h) => !!h && re.test(h))]).map(([c, i]) => [c, Math.max(0, i as number)]));
}

/** "3", 3 o "Sala 3" → 3 (1 a MAX_SALAS). */
export function leerSala(v: ExcelJS.CellValue): number | null {
  // Signos o decimales ("-1", "8.5") no son una sala (la normalización de `clave` los quitaría).
  if (/[^\p{L}\d\s]/u.test(texto(v).trim())) return null;
  const m = clave(texto(v)).match(/^(?:sala )?(\d+)$/);
  const n = m ? +m[1]! : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_SALAS ? n : null;
}

const vacia = (row: ExcelJS.Row, cols: number[]) => cols.every((c) => !c || valor(row.getCell(c).value) === null);

export function leerLibroSalas(wb: ExcelJS.Workbook): LibroSalas {
  const out: LibroSalas = { salas: [], monitores: [], disponibilidad: [], errores: [], avisos: [] };
  const wsS = hoja(wb, HOJAS_SALAS.salas);
  if (!wsS) {
    out.errores.push({ hoja: "", fila: 0, mensaje: `Falta la hoja ${HOJAS_SALAS.salas}. Descarga la plantilla de salas y monitores.` });
    return out;
  }

  const cs = columnas(wsS, { sala: /^sala/, enlace: /enlace|link|url/ });
  if (!cs.sala || !cs.enlace) out.errores.push({ hoja: HOJAS_SALAS.salas, fila: 1, mensaje: "La hoja Salas debe tener las columnas Sala y Enlace." });
  else wsS.eachRow((row, r) => {
    if (r === 1 || vacia(row, [cs.sala!, cs.enlace!])) return;
    const err = (mensaje: string) => out.errores.push({ hoja: HOJAS_SALAS.salas, fila: r, mensaje });
    const sala = leerSala(row.getCell(cs.sala!).value);
    const enlace = texto(row.getCell(cs.enlace!).value).trim();
    if (sala === null) return err(`Sala debe ser un número del 1 al ${MAX_SALAS}: "${texto(row.getCell(cs.sala!).value)}".`);
    if (!/^https:\/\/[^\s]+$/i.test(enlace) || enlace.length > 500) return err(`El enlace de la sala ${sala} debe empezar por https:// (máximo 500 caracteres).`);
    if (out.salas.some((s) => s.sala === sala)) return err(`La sala ${sala} está repetida.`);
    out.salas.push({ sala, enlace });
  });
  if (!out.errores.length && !out.salas.length) out.errores.push({ hoja: HOJAS_SALAS.salas, fila: 0, mensaje: "La hoja Salas no tiene salas." });
  out.salas.sort((a, b) => a.sala - b.sala);

  const wsM = hoja(wb, HOJAS_SALAS.monitores);
  if (wsM) {
    const H = HOJAS_SALAS.monitores;
    const cm = columnas(wsM, { dia: /^dia|fecha/, hora: /^hora/, sala: /^sala/, mentor: /^mentor/, monitor: /^monitor/ });
    if (!cm.dia || !cm.hora || !cm.monitor || (!cm.sala && !cm.mentor))
      out.errores.push({ hoja: H, fila: 1, mensaje: "La hoja Monitores debe tener Día, Hora, Sala (o Mentor) y Monitor." });
    else wsM.eachRow((row, r) => {
      if (r === 1 || vacia(row, [cm.dia!, cm.hora!, cm.sala!, cm.mentor!, cm.monitor!])) return;
      const err = (mensaje: string) => out.errores.push({ hoja: H, fila: r, mensaje });
      const dia = leerDia(row.getCell(cm.dia!).value), hora = leerHora(row.getCell(cm.hora!).value);
      const monitor = cleanSpaces(texto(row.getCell(cm.monitor!).value));
      const sala = cm.sala ? leerSala(row.getCell(cm.sala).value) : null;
      const mentor = cm.mentor ? cleanSpaces(texto(row.getCell(cm.mentor).value)) : "";
      if (!dia) return err(`Día no reconocido: "${texto(row.getCell(cm.dia!).value)}".`);
      if (hora === null) return err(`Hora no reconocida: "${texto(row.getCell(cm.hora!).value)}". Usa por ejemplo "08 am".`);
      if (!monitor) return err("Falta el monitor.");
      if (sala === null && !mentor) return err(`Escribe la sala (1 a ${MAX_SALAS}) o el mentor.`);
      out.monitores.push({ fila: r, dia, hora, monitor, ...(sala !== null ? { sala } : { mentor }) });
    });
  }

  const wsD = hoja(wb, HOJAS_SALAS.disponibilidad);
  if (wsD) {
    const H = HOJAS_SALAS.disponibilidad;
    const cd = columnas(wsD, { monitor: /^monitor/, dia: /^dia|fecha/, hora: /^hora|bloque/ });
    if (!cd.monitor || !cd.dia || !cd.hora) out.errores.push({ hoja: H, fila: 1, mensaje: "La hoja Disponibilidad monitores debe tener Monitor, Día y Hora." });
    else wsD.eachRow((row, r) => {
      if (r === 1 || vacia(row, [cd.monitor!, cd.dia!, cd.hora!])) return;
      const err = (mensaje: string) => out.errores.push({ hoja: H, fila: r, mensaje });
      const dia = leerDia(row.getCell(cd.dia!).value), hora = leerHora(row.getCell(cd.hora!).value);
      const monitor = cleanSpaces(texto(row.getCell(cd.monitor!).value));
      if (!monitor) return err("Falta el monitor.");
      if (!dia) return err(`Día no reconocido: "${texto(row.getCell(cd.dia!).value)}".`);
      if (hora === null) return err(`Hora no reconocida: "${texto(row.getCell(cd.hora!).value)}". Usa por ejemplo "08 am".`);
      out.disponibilidad.push({ fila: r, monitor, dia, hora });
    });
  }
  if (wsD) out.conDisponibilidad = true;

  const wsP = hoja(wb, HOJAS_SALAS.plan);
  if (wsP) {
    const H = HOJAS_SALAS.plan;
    out.plan = [];
    const cp = columnas(wsP, { dia: /^dia|fecha/, hora: /^hora/, mentor: /^mentor/, sala: /^sala/, monitor: /^monitor/ });
    if (!cp.dia || !cp.hora || !cp.mentor || !cp.sala || !cp.monitor)
      out.errores.push({ hoja: H, fila: 1, mensaje: "La hoja Plan de salas debe tener Día, Hora, Mentor, Sala y Monitor." });
    else wsP.eachRow((row, r) => {
      if (r === 1 || vacia(row, [cp.dia!, cp.hora!, cp.mentor!, cp.sala!, cp.monitor!])) return;
      const err = (mensaje: string) => out.errores.push({ hoja: H, fila: r, mensaje });
      const dia = leerDia(row.getCell(cp.dia!).value), hora = leerHora(row.getCell(cp.hora!).value);
      const mentor = cleanSpaces(texto(row.getCell(cp.mentor!).value));
      const sala = leerSala(row.getCell(cp.sala!).value);
      const monitor = cleanSpaces(texto(row.getCell(cp.monitor!).value));
      if (!dia) return err(`Día no reconocido: "${texto(row.getCell(cp.dia!).value)}". Usa por ejemplo "Martes 17 nov".`);
      if (hora === null) return err(`Hora no reconocida: "${texto(row.getCell(cp.hora!).value)}". Usa por ejemplo "05 pm".`);
      if (!mentor) return err("Falta el mentor.");
      if (sala === null) return err(`Sala debe ser un número del 1 al ${MAX_SALAS}: "${texto(row.getCell(cp.sala!).value)}".`);
      if (monitor.length > 80) return err("El monitor es demasiado largo (escribe su usuario).");
      out.plan!.push({ fila: r, dia, hora, mentor, sala, monitor });
    });
    if (!out.plan.length && !out.errores.some((e) => e.hoja === H)) out.errores.push({ hoja: H, fila: 0, mensaje: "La hoja Plan de salas no tiene filas." });
  }

  if (!wsM && !wsD && !wsP) out.avisos.push({ hoja: "", fila: 0, mensaje: "El archivo no tiene hojas Monitores ni Disponibilidad monitores: las salas quedan sin monitor." });
  return out;
}

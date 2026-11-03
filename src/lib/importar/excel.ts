import ExcelJS from "exceljs";
import { AÑO_EDICION, esDia } from "../edicion";

// Lectura tolerante de celdas: texto, número, fecha, texto enriquecido, fórmula o hipervínculo.

export type Valor = string | number | Date | null;

export function valor(v: ExcelJS.CellValue): Valor {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number") return v;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "boolean") return v ? "x" : null;
  if (typeof v === "object") {
    if ("richText" in v) return valor(v.richText.map((t) => t.text).join(""));
    if ("formula" in v || "sharedFormula" in v) return valor((v as { result?: ExcelJS.CellValue }).result ?? null);
    if ("text" in v) return valor((v as { text: string }).text);
    if ("error" in v) return null;
  }
  return null;
}

export const texto = (v: ExcelJS.CellValue) => {
  const x = valor(v);
  return x === null ? "" : x instanceof Date ? x.toISOString() : String(x);
};

export async function leerLibro(buf: ArrayBuffer | Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb;
}

export const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Hoja por nombre, sin importar mayúsculas ni tildes. */
export function hoja(wb: ExcelJS.Workbook, nombre: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((w) => clave(w.name) === clave(nombre));
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

/** "Jueves 12 nov", "12/11/2026", "2026-11-12" o una fecha de Excel → 'YYYY-MM-DD'. */
export function leerDia(v: ExcelJS.CellValue): string | null {
  const x = valor(v);
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (typeof x !== "string") return null;
  const s = clave(x);
  let m = s.match(/^(\d{4}) (\d{1,2}) (\d{1,2})$/);
  if (m) return armar(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2}) (\d{1,2}) (\d{4})$/);
  if (m) return armar(+m[3]!, +m[2]!, +m[1]!);
  m = s.match(/(?:^|\s)(\d{1,2}) (?:de )?([a-z]{3})[a-z]*(?: (?:de )?(\d{4}))?$/);
  if (m && MESES[m[2]!]) return armar(m[3] ? +m[3] : AÑO_EDICION, MESES[m[2]!]!, +m[1]!);
  return null;
}

function armar(y: number, mes: number, d: number): string | null {
  const s = `${y}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return esDia(s) && new Date(s + "T00:00:00Z").getUTCDate() === d ? s : null;
}

/** "08 am – 09 am", "4 pm", "16:00" o una hora de Excel → hora de inicio (0–23). Solo horas en punto. */
export function leerHora(v: ExcelJS.CellValue): number | null {
  const x = valor(v);
  if (x instanceof Date) return x.getUTCMinutes() === 0 ? x.getUTCHours() : null;
  if (typeof x !== "string") return null;
  const s = x.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m)?/);
  if (!m || (m[2] && m[2] !== "00")) return null;
  let h = +m[1]!;
  const ampm = m[3]?.replace(" ", "");
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm === "pm" ? 12 : 0);
  }
  return h >= 0 && h <= 23 ? h : null;
}

/** "2026-11-13 14:00" o fecha de Excel (hora de Colombia) → instante UTC. */
export function leerFechaHora(v: ExcelJS.CellValue): Date | null {
  const x = valor(v);
  // Excel guarda la fecha "tal cual se ve", sin zona: se interpreta como hora de Colombia.
  if (x instanceof Date) return new Date(x.getTime() + 5 * 3600_000);
  if (typeof x !== "string") return null;
  const m = x.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]! + 5, +m[5]!));
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ErrorFila = { hoja: string; fila: number; mensaje: string };

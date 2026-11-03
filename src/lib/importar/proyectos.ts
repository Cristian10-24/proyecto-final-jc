import type ExcelJS from "exceljs";
import { NOMBRES_CIUDADES } from "../ciudades";
import type { Integrante } from "../types";
import { ciudadExistente, cleanSpaces, normalizeCity, normalizeDocumento, toProperName } from "../validation/name";
import { clave, hoja, texto, valor, type ErrorFila } from "./excel";

// Libro de proyectos: hoja "Proyectos", una fila por proyecto (individual o en pareja).

export const HOJA_PROYECTOS = "Proyectos";
export const COLUMNAS_PROYECTOS = ["Código", "Ciudad", "Nombre del proyecto", "Grupo", "Documento 1", "Nombre 1", "Documento 2", "Nombre 2"] as const;

export type ProyectoLeido = { fila: number; codigo: string; ciudad: string; nombre: string; grupo?: string; integrantes: Integrante[] };

/**
 * Documento como texto. Acepta números de Excel (1234567890) y "1234567890.0"; rechaza decimales
 * y notación científica, porque ahí Excel ya perdió dígitos.
 */
export function leerDocumento(v: ExcelJS.CellValue): { doc: string } | { error: string } | null {
  const x = valor(v);
  if (x === null) return null;
  if (x instanceof Date) return { error: "es una fecha" };
  if (typeof x === "number") return Number.isInteger(x) ? { doc: String(x) } : { error: `tiene decimales (${x})` };
  if (/e\+?\d+$/i.test(x) && /^\d[.,]?\d*e/i.test(x)) return { error: `está en notación científica (${x}); formatea la columna como texto` };
  const doc = normalizeDocumento(x.replace(/^(\d+)[.,]0+$/, "$1"));
  if (doc.length < 5 || doc.length > 15) return { error: `"${x}" no parece un documento (5 a 15 letras o números)` };
  return { doc };
}

export function leerLibroProyectos(wb: ExcelJS.Workbook): { proyectos: ProyectoLeido[]; errores: ErrorFila[] } {
  const ws = hoja(wb, HOJA_PROYECTOS);
  if (!ws) return { proyectos: [], errores: [{ hoja: "", fila: 0, mensaje: `Falta la hoja ${HOJA_PROYECTOS}. Descarga la plantilla de proyectos.` }] };

  const encab = new Map<string, number>();
  ws.getRow(1).eachCell((c, i) => encab.set(clave(texto(c.value)), i));
  const faltan = COLUMNAS_PROYECTOS.filter((n) => n !== "Grupo" && !encab.has(clave(n)));
  if (faltan.length) return { proyectos: [], errores: [{ hoja: HOJA_PROYECTOS, fila: 1, mensaje: `Faltan columnas: ${faltan.join(", ")}.` }] };
  const celda = (row: ExcelJS.Row, n: (typeof COLUMNAS_PROYECTOS)[number]) => {
    const i = encab.get(clave(n));
    return i ? row.getCell(i).value : null;
  };

  const proyectos: ProyectoLeido[] = [];
  const errores: ErrorFila[] = [];
  const codigos = new Map<string, number>(), documentos = new Map<string, number>();
  ws.eachRow((row, r) => {
    if (r === 1) return;
    if (COLUMNAS_PROYECTOS.every((n) => valor(celda(row, n)) === null)) return;
    const errs: string[] = [];
    const codigo = cleanSpaces(texto(celda(row, "Código"))).toUpperCase();
    if (!codigo) errs.push("Falta el código.");
    else if (codigos.has(codigo)) errs.push(`El código ${codigo} ya está en la fila ${codigos.get(codigo)}.`);

    const ciudadTxt = texto(celda(row, "Ciudad"));
    const ciudad = ciudadExistente(normalizeCity(ciudadTxt), NOMBRES_CIUDADES);
    if (!ciudadTxt) errs.push("Falta la ciudad.");
    else if (!NOMBRES_CIUDADES.includes(ciudad)) errs.push(`Ciudad desconocida: "${ciudadTxt}".`);

    const nombre = cleanSpaces(texto(celda(row, "Nombre del proyecto")));
    if (!nombre) errs.push("Falta el nombre del proyecto.");
    const grupo = cleanSpaces(texto(celda(row, "Grupo")));

    const integrantes: Integrante[] = [];
    for (const n of [1, 2] as const) {
      const d = leerDocumento(celda(row, `Documento ${n}`));
      const nom = toProperName(texto(celda(row, `Nombre ${n}`)));
      if (!d && !nom) { if (n === 1) errs.push("Falta el integrante 1 (documento y nombre)."); continue; }
      if (!d) { errs.push(`Integrante ${n}: falta el documento.`); continue; }
      if ("error" in d) { errs.push(`Documento ${n} ${d.error}.`); continue; }
      if (!nom) errs.push(`Integrante ${n}: falta el nombre.`);
      if (integrantes.some((i) => i.documento === d.doc)) errs.push(`Los dos integrantes tienen el mismo documento (${d.doc}).`);
      else if (documentos.has(d.doc)) errs.push(`El documento ${d.doc} ya está en la fila ${documentos.get(d.doc)}.`);
      integrantes.push({ documento: d.doc, nombre: nom });
    }

    if (codigo && !codigos.has(codigo)) codigos.set(codigo, r);
    for (const i of integrantes) if (!documentos.has(i.documento)) documentos.set(i.documento, r);
    if (errs.length) errs.forEach((mensaje) => errores.push({ hoja: HOJA_PROYECTOS, fila: r, mensaje }));
    else proyectos.push({ fila: r, codigo, ciudad, nombre, ...(grupo ? { grupo } : {}), integrantes });
  });
  return { proyectos, errores };
}

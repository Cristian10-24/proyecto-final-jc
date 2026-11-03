import type ExcelJS from "exceljs";
import { NOMBRES_CIUDADES } from "../ciudades";
import type { Integrante } from "../types";
import { ciudadExistente, cleanSpaces, normalizeCity, normalizeDocumento, toProperName } from "../validation/name";
import { clave, hoja, texto, valor, type ErrorFila } from "./excel";

// Libro de inscritos: una fila por proyecto (individual o en pareja). Los encabezados pueden variar:
// cada columna se reconoce por sinónimos (sin tildes ni mayúsculas) y, si falta un campo obligatorio,
// el admin elige en la vista previa qué columna le corresponde (mapa manual).

export const HOJA_PROYECTOS = "Proyectos";

export type Campo =
  | "codigo" | "ciudad" | "modalidad" | "proyecto" | "descripcion" | "grupo" | "monitor"
  | "nombre1" | "documento1" | "celular1" | "correo1" | "nombre2" | "documento2" | "celular2" | "correo2";

export const CAMPOS: { campo: Campo; etiqueta: string; obligatorio?: true }[] = [
  { campo: "ciudad", etiqueta: "Ciudad", obligatorio: true },
  { campo: "modalidad", etiqueta: "Modalidad" },
  { campo: "proyecto", etiqueta: "Nombre del proyecto", obligatorio: true },
  { campo: "descripcion", etiqueta: "Descripción" },
  { campo: "nombre1", etiqueta: "Nombre 1", obligatorio: true },
  { campo: "documento1", etiqueta: "Documento 1", obligatorio: true },
  { campo: "celular1", etiqueta: "Celular 1" },
  { campo: "correo1", etiqueta: "Correo 1" },
  { campo: "nombre2", etiqueta: "Nombre 2" },
  { campo: "documento2", etiqueta: "Documento 2" },
  { campo: "celular2", etiqueta: "Celular 2" },
  { campo: "correo2", etiqueta: "Correo 2" },
  { campo: "grupo", etiqueta: "Grupo" },
  { campo: "monitor", etiqueta: "Monitor" },
  { campo: "codigo", etiqueta: "Código" },
];

/** Encabezados de la plantilla sugerida (y del Excel de ejemplo). */
export const COLUMNAS_PROYECTOS = CAMPOS.filter((c) => c.campo !== "codigo").map((c) => c.etiqueta);

/** Campo al que corresponde un encabezado, por sinónimos. null si no se reconoce. */
export function detectarCampo(encabezado: string): Campo | null {
  const k = ` ${clave(encabezado)} `;
  if (k.trim() === "" || /tipo de (documento|identificacion)|tipo doc/.test(k)) return null;
  const n = /\s2\s|pareja|companer|segundo/.test(k) ? 2 : 1;
  if (/\scodigo\s/.test(k)) return "codigo";
  if (/ciudad|sede|municipio/.test(k)) return "ciudad";
  if (/modalidad|tipo de proyecto|individual o/.test(k)) return "modalidad";
  if (/descripcion|resumen|de que trata/.test(k)) return "descripcion";
  if (/monitor/.test(k)) return "monitor";
  if (/\sgrupo\s/.test(k)) return "grupo";
  if (/documento|identificacion|cedula|\scc\s|\sti\s|\sdoc\s|\snumero de id/.test(k)) return `documento${n}`;
  if (/celular|telefono|whatsapp|movil|\scel\s/.test(k)) return `celular${n}`;
  if (/correo|email|e mail|\smail\s/.test(k)) return `correo${n}`;
  if (/proyecto|titulo/.test(k)) return "proyecto";
  if (/nombre|estudiante|integrante|companer/.test(k)) return `nombre${n}`;
  return null;
}

export type ProyectoLeido = {
  fila: number; codigo: string; ciudad: string; nombre: string; descripcion?: string;
  grupo?: string; monitorTexto?: string; integrantes: Integrante[];
};

export type Columna = { indice: number; encabezado: string; campo: Campo | null };

export type LecturaProyectos = {
  hoja: string;
  proyectos: ProyectoLeido[];
  errores: ErrorFila[];
  columnas: Columna[];
  /** Campos obligatorios sin columna: el admin debe elegirla en la vista previa. */
  faltan: Campo[];
};

/**
 * Documento como texto. Acepta números de Excel (1234567890) y "1234567890.0"; rechaza decimales
 * y notación científica, porque ahí Excel ya perdió dígitos.
 */
export function leerDocumento(v: ExcelJS.CellValue): { doc: string } | { error: string } | null {
  const x = valor(v);
  if (x === null) return null;
  if (x instanceof Date) return { error: "es una fecha" };
  if (typeof x === "number") return Number.isInteger(x) ? { doc: String(x) } : { error: `está guardado como decimal (${x})` };
  if (/e\+?\d+$/i.test(x) && /^\d[.,]?\d*e/i.test(x)) return { error: `está en notación científica (${x}); formatea la columna como texto` };
  const doc = normalizeDocumento(x.replace(/^(\d+)[.,]0+$/, "$1"));
  if (doc.length < 5 || doc.length > 15) return { error: `"${x}" no parece un documento (5 a 15 letras o números)` };
  return { doc };
}

/**
 * Celular con o sin indicativo (+57, 57, 0057; espacios, puntos y guiones se ignoran).
 * 10 dígitos que empiezan por 3 = Colombia (+57). Con indicativo se guarda "+<dígitos>".
 */
export function leerCelular(v: ExcelJS.CellValue): { celular: string } | { error: string } | null {
  const x = valor(v);
  if (x === null) return null;
  if (x instanceof Date) return { error: "es una fecha" };
  if (typeof x === "number" && !Number.isInteger(x)) return { error: `está guardado como decimal (${x})` };
  const crudo = String(x).trim();
  let d = crudo.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) return { celular: `+57${d}` };
  if (d.length === 12 && d.startsWith("57") && d[2] === "3") return { celular: `+${d}` };
  if (d.length >= 11 && d.length <= 15 && !d.startsWith("57")) return { celular: `+${d}` }; // otro país con indicativo
  if (d.length >= 8 && d.length <= 9 && !crudo.startsWith("+")) return { celular: d }; // local sin indicativo (p. ej. Uruguay 09…)
  return { error: `"${crudo}" no parece un celular` };
}

export function leerCorreo(v: ExcelJS.CellValue): { correo: string } | { error: string } | null {
  const x = valor(v);
  if (x === null) return null;
  const correo = String(x).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(correo) ? { correo } : { error: `"${correo}" no parece un correo` };
}

/** "Pareja", "En pareja", "Dupla", "2" → 2; "Individual", "1" → 1; otro texto → null. */
function leerModalidad(v: ExcelJS.CellValue): 1 | 2 | null {
  const k = clave(texto(v));
  if (!k) return null;
  if (/pareja|dupla|grupal|^2/.test(k)) return 2;
  if (/individual|solo|^1/.test(k)) return 1;
  return null;
}

/** Hoja de inscritos: la llamada "Proyectos" o, si no existe, la primera del libro. */
function hojaInscritos(wb: ExcelJS.Workbook) {
  return hoja(wb, HOJA_PROYECTOS) ?? wb.worksheets[0];
}

export function leerLibroProyectos(wb: ExcelJS.Workbook, mapaManual: Partial<Record<Campo, string>> = {}): LecturaProyectos {
  const ws = hojaInscritos(wb);
  if (!ws) return { hoja: "", proyectos: [], errores: [{ hoja: "", fila: 0, mensaje: "El archivo no tiene hojas." }], columnas: [], faltan: [] };
  const H = ws.name;

  const columnas: Columna[] = [];
  ws.getRow(1).eachCell((c, i) => {
    const encabezado = cleanSpaces(texto(c.value));
    if (encabezado) columnas.push({ indice: i, encabezado, campo: detectarCampo(encabezado) });
  });
  const mapa = new Map<Campo, number>();
  for (const c of columnas) if (c.campo && !mapa.has(c.campo)) mapa.set(c.campo, c.indice);
  for (const [campo, encabezado] of Object.entries(mapaManual) as [Campo, string][]) {
    const col = columnas.find((c) => c.encabezado === encabezado);
    if (col) { mapa.set(campo, col.indice); col.campo = campo; }
  }
  const faltan = CAMPOS.filter((c) => c.obligatorio && !mapa.has(c.campo)).map((c) => c.campo);
  if (faltan.length) {
    const nombres = faltan.map((f) => CAMPOS.find((c) => c.campo === f)!.etiqueta).join(", ");
    return { hoja: H, proyectos: [], errores: [{ hoja: H, fila: 1, mensaje: `No reconocí la columna de: ${nombres}. Elige abajo cuál es.` }], columnas, faltan };
  }
  const celda = (row: ExcelJS.Row, campo: Campo) => {
    const i = mapa.get(campo);
    return i ? row.getCell(i).value : null;
  };

  const proyectos: ProyectoLeido[] = [];
  const errores: ErrorFila[] = [];
  const codigos = new Map<string, number>(), documentos = new Map<string, number>();
  ws.eachRow((row, r) => {
    if (r === 1) return;
    if ([...mapa.keys()].every((campo) => valor(celda(row, campo)) === null)) return;
    const errs: string[] = [];

    const ciudadTxt = texto(celda(row, "ciudad"));
    const ciudad = ciudadExistente(normalizeCity(ciudadTxt), NOMBRES_CIUDADES);
    if (!ciudadTxt) errs.push("Falta la ciudad.");
    else if (!NOMBRES_CIUDADES.includes(ciudad)) errs.push(`Ciudad desconocida: "${ciudadTxt}".`);

    const nombre = cleanSpaces(texto(celda(row, "proyecto")));
    if (!nombre) errs.push("Falta el nombre del proyecto.");
    const descripcion = cleanSpaces(texto(celda(row, "descripcion")));
    const grupo = cleanSpaces(texto(celda(row, "grupo")));
    const monitorTexto = cleanSpaces(texto(celda(row, "monitor")));

    const integrantes: Integrante[] = [];
    let incompleta = false;
    for (const n of [1, 2] as const) {
      const d = leerDocumento(celda(row, `documento${n}`));
      const nom = toProperName(texto(celda(row, `nombre${n}`)));
      const celCrudo = celda(row, `celular${n}`), corCrudo = celda(row, `correo${n}`);
      if (!d && !nom) {
        if (n === 1) errs.push("Falta el integrante 1 (documento y nombre).");
        else if (valor(celCrudo) !== null || valor(corCrudo) !== null) { errs.push("Pareja incompleta: hay celular o correo del integrante 2, pero no su nombre ni documento."); incompleta = true; }
        continue;
      }
      if (!d) { errs.push(n === 2 ? "Pareja incompleta: falta el documento del integrante 2." : "Integrante 1: falta el documento."); incompleta ||= n === 2; continue; }
      if ("error" in d) { errs.push(`Documento ${n} ${d.error}.`); continue; }
      if (!nom) { errs.push(n === 2 ? "Pareja incompleta: falta el nombre del integrante 2." : "Integrante 1: falta el nombre."); incompleta ||= n === 2; }
      if (integrantes.some((i) => i.documento === d.doc)) errs.push(`Los dos integrantes tienen el mismo documento (${d.doc}).`);
      else if (documentos.has(d.doc)) errs.push(`Documento repetido: ${d.doc} ya está en la fila ${documentos.get(d.doc)}.`);
      const cel = leerCelular(celCrudo);
      const cor = leerCorreo(corCrudo);
      if (cel && "error" in cel) errs.push(`Celular ${n}: ${cel.error}.`);
      if (cor && "error" in cor) errs.push(`Correo ${n}: ${cor.error}.`);
      integrantes.push({
        documento: d.doc, nombre: nom,
        ...(cel && "celular" in cel ? { celular: cel.celular } : {}),
        ...(cor && "correo" in cor ? { correo: cor.correo } : {}),
      });
    }

    const modalidad = leerModalidad(celda(row, "modalidad"));
    if (modalidad === 2 && integrantes.length < 2 && !incompleta) errs.push("Pareja incompleta: la modalidad dice en pareja, pero falta el integrante 2.");
    if (modalidad === 1 && integrantes.length === 2) errs.push("La modalidad dice individual, pero hay un integrante 2.");

    // Sin columna de código, el proyecto se identifica por el documento del integrante 1.
    const codigo = cleanSpaces(texto(celda(row, "codigo"))).toUpperCase() || (integrantes[0] ? `P-${integrantes[0].documento}` : "");
    if (codigo && codigos.has(codigo)) errs.push(`El código ${codigo} ya está en la fila ${codigos.get(codigo)}.`);

    if (codigo && !codigos.has(codigo)) codigos.set(codigo, r);
    for (const i of integrantes) if (!documentos.has(i.documento)) documentos.set(i.documento, r);
    if (errs.length) errs.forEach((mensaje) => errores.push({ hoja: H, fila: r, mensaje }));
    else proyectos.push({
      fila: r, codigo, ciudad, nombre, integrantes,
      ...(descripcion ? { descripcion } : {}), ...(grupo ? { grupo } : {}), ...(monitorTexto ? { monitorTexto } : {}),
    });
  });
  return { hoja: H, proyectos, errores, columnas, faltan: [] };
}

import type ExcelJS from "exceljs";
import { ciudadesExplicitas, generarAsientos, gruposDelDia, TODAS, type AsientoNuevo, type HoraMentores } from "../agenda";
import { BLOQUES_POR_HORA } from "../edicion";
import { NOMBRES_CIUDADES, presentaAntesDeClausura } from "../ciudades";
import type { CupoCiudad, Mentor } from "../types";
import { ciudadExistente, cleanSpaces, normalizeCity } from "../validation/name";
import { clave, hoja, leerDia, leerFechaHora, leerHora, texto, valor, type ErrorFila } from "./excel";

// Libro de mentores: hojas "Mentores" (datos de contacto, opcional), "Horarios" (disponibilidad:
// una fila por día y hora, una columna por mentor, cualquier marca = disponible) y "Cupos"
// (qué ciudades presentan cada día, con cupos fijos o compartiendo el resto, y desde cuándo eligen).
// Es el mismo formato del Excel "Horarios Proyecto Final - JC 2026", más la hoja Cupos.

export const HOJAS_MENTORES = { mentores: "Mentores", horarios: "Horarios", cupos: "Cupos" } as const;

export const idMentor = (nombre: string) => clave(nombre).replace(/ /g, "-");

export type HorariosLeidos = { horas: HoraMentores[]; nombres: Map<string, string>; errores: ErrorFila[]; avisos: ErrorFila[] };

/** Lee la hoja Horarios. Las filas sin día ni hora (totales, notas) se ignoran. */
export function leerHorarios(ws: ExcelJS.Worksheet): HorariosLeidos {
  const errores: ErrorFila[] = [], avisos: ErrorFila[] = [];
  const nombres = new Map<string, string>();
  const cols: { col: number; id: string; nombre: string }[] = [];
  let colConteo = 0;
  const encab = ws.getRow(1);
  for (let c = 3; c <= ws.columnCount; c++) {
    const nombre = cleanSpaces(texto(encab.getCell(c).value));
    if (/^n\s*(o\s*)?(de )?mentores$/.test(clave(nombre))) { colConteo = c; continue; }
    cols.push({ col: c, id: nombre ? idMentor(nombre) : "", nombre });
  }

  const horas: HoraMentores[] = [];
  const vistas = new Set<string>();
  let diaAnterior: string | null = null;
  let terminada = false;
  ws.eachRow((row, r) => {
    if (r === 1 || terminada) return;
    const crudoDia = valor(row.getCell(1).value);
    const crudoHora = valor(row.getCell(2).value);
    const dia = crudoDia === null ? diaAnterior : leerDia(row.getCell(1).value);
    const hora = leerHora(row.getCell(2).value);
    // La tabla termina en la fila TOTAL (debajo suele haber resúmenes por día).
    if (clave(texto(row.getCell(1).value)).startsWith("total")) { terminada = true; return; }
    if (crudoHora === null || (hora === null && dia === null)) return; // fila de totales o notas
    const err = (mensaje: string) => errores.push({ hoja: HOJAS_MENTORES.horarios, fila: r, mensaje });
    if (!dia) return err(`Día no reconocido: "${texto(row.getCell(1).value)}". Usa por ejemplo "Jueves 12 nov".`);
    if (hora === null) return err(`Hora no reconocida: "${texto(row.getCell(2).value)}". Usa por ejemplo "08 am – 09 am".`);
    diaAnterior = dia;
    if (vistas.has(`${dia} ${hora}`)) return err(`La hora ${hora}:00 del ${dia} está repetida.`);
    vistas.add(`${dia} ${hora}`);

    const mentores: string[] = [];
    for (const c of cols) {
      if (valor(row.getCell(c.col).value) === null) continue;
      if (!c.id) { err(`Hay una marca en la columna ${c.col}, que no tiene nombre de mentor.`); continue; }
      mentores.push(c.id);
      nombres.set(c.id, c.nombre);
    }
    if (colConteo) {
      const n = valor(row.getCell(colConteo).value);
      if (typeof n === "number" && n !== mentores.length)
        avisos.push({ hoja: HOJAS_MENTORES.horarios, fila: r, mensaje: `"N° mentores" dice ${n}, pero hay ${mentores.length} marcados.` });
    }
    if (mentores.length) horas.push({ dia, hora, mentores });
  });
  return { horas, nombres, errores, avisos };
}

/** Asientos por día (4 bloques × mentores de cada hora). Es lo que se compara con "Proyectos por franja". */
export function asientosPorDia(horas: HoraMentores[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of horas) m.set(h.dia, (m.get(h.dia) ?? 0) + h.mentores.length * BLOQUES_POR_HORA);
  return m;
}

function leerContactos(ws: ExcelJS.Worksheet | undefined): Map<string, Omit<Mentor, "_id">> {
  const m = new Map<string, Omit<Mentor, "_id">>();
  if (!ws) return m;
  const encab = [1, 2, 3, 4, 5, 6].map((c) => clave(texto(ws.getRow(1).getCell(c).value)));
  const col = (re: RegExp) => encab.findIndex((h) => re.test(h)) + 1;
  const cNombre = col(/nombre/), cCorreo = col(/correo|email/), cCel = col(/celular|telefono|whatsapp/);
  if (!cNombre) return m;
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const nombre = cleanSpaces(texto(row.getCell(cNombre).value));
    if (!nombre) return;
    m.set(idMentor(nombre), {
      nombre,
      ...(cCorreo && texto(row.getCell(cCorreo).value) ? { correo: texto(row.getCell(cCorreo).value) } : {}),
      ...(cCel && texto(row.getCell(cCel).value) ? { celular: texto(row.getCell(cCel).value) } : {}),
    });
  });
  return m;
}

export const COLUMNAS_CUPOS = ["Día", "Ciudad", "Cupos", "Sobrante", "Abre (hora COL)"] as const;

function leerCupos(ws: ExcelJS.Worksheet, errores: ErrorFila[]): Map<string, CupoCiudad[]> {
  const out = new Map<string, CupoCiudad[]>();
  const encab = COLUMNAS_CUPOS.map((_, i) => clave(texto(ws.getRow(1).getCell(i + 1).value)));
  const col = (prefijo: string, porDefecto: number) => { const i = encab.findIndex((h) => h.startsWith(prefijo)); return i >= 0 ? i + 1 : porDefecto; };
  const cols = [col("dia", 1), col("ciudad", 2), col("cupos", 3), col("sobrante", 4), col("abre", 5)];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const [cDia, cCiudad, cCupos, cSobrante, cAbre] = cols.map((c) => row.getCell(c).value);
    if ([cDia, cCiudad, cCupos, cSobrante, cAbre].every((v) => valor(v ?? null) === null)) return;
    const err = (mensaje: string) => errores.push({ hoja: HOJAS_MENTORES.cupos, fila: r, mensaje });
    const ms = clave(texto(cSobrante ?? null));
    if (ms && !["x", "si", "s"].includes(ms)) return err(`Sobrante: marca con "x" la ciudad que recibe el sobrante, o déjalo vacío: "${texto(cSobrante ?? null)}".`);
    const sobrante = ms !== "" || clave(texto(cCiudad ?? null)) === clave(TODAS);
    const dia = leerDia(cDia ?? null);
    if (!dia) return err(`Día no reconocido: "${texto(cDia ?? null)}".`);
    const ciudadTxt = texto(cCiudad ?? null);
    const ciudad = clave(ciudadTxt) === clave(TODAS) ? TODAS : ciudadExistente(normalizeCity(ciudadTxt), NOMBRES_CIUDADES);
    if (ciudad !== TODAS && !NOMBRES_CIUDADES.includes(ciudad)) return err(`Ciudad desconocida: "${ciudadTxt}".`);
    if (ciudad !== TODAS && !presentaAntesDeClausura(ciudad, dia)) return err(`${ciudad} ya tuvo su clausura el ${dia}: no puede presentar ese día.`);
    const vc = valor(cCupos ?? null);
    const cupos = vc === null ? null : Number(vc);
    if (cupos !== null && (!Number.isInteger(cupos) || cupos < 0)) return err(`Cupos debe ser un número entero: "${texto(cCupos ?? null)}".`);
    if (cupos === null && !sobrante) return err(`Falta Cupos. Escribe un número, o marca la ciudad como Sobrante.`);
    const va = valor(cAbre ?? null);
    const abre = va === null ? null : leerFechaHora(cAbre ?? null);
    if (va !== null && !abre) return err(`"Abre" debe ser fecha y hora de Colombia, por ejemplo 2026-11-13 14:00: "${texto(cAbre ?? null)}".`);
    const lista = out.get(dia) ?? [];
    if (lista.some((c) => c.ciudad === ciudad)) return err(`${ciudad} está repetida el ${dia}.`);
    if (sobrante && lista.some((c) => c.sobrante)) return err(`El ${dia} ya tiene otra ciudad de sobrante: solo puede haber una por día.`);
    lista.push({ ciudad, cupos, sobrante, abre });
    out.set(dia, lista);
  });
  return out;
}

export type LibroMentores = {
  mentores: Mentor[];
  horas: HoraMentores[];
  cupos: Map<string, CupoCiudad[]>;
  asientos: AsientoNuevo[];
  errores: ErrorFila[];
  avisos: ErrorFila[];
};

export function leerLibroMentores(wb: ExcelJS.Workbook): LibroMentores {
  const vacio = { mentores: [], horas: [], cupos: new Map(), asientos: [], avisos: [] };
  const wsH = hoja(wb, HOJAS_MENTORES.horarios), wsC = hoja(wb, HOJAS_MENTORES.cupos);
  if (!wsH || !wsC) {
    const faltan = [!wsH && HOJAS_MENTORES.horarios, !wsC && HOJAS_MENTORES.cupos].filter(Boolean).join(" y ");
    return { ...vacio, errores: [{ hoja: "", fila: 0, mensaje: `Falta la hoja ${faltan}. Descarga la plantilla de mentores.` }] };
  }
  const { horas, nombres, errores, avisos } = leerHorarios(wsH);
  const cupos = leerCupos(wsC, errores);
  const contactos = leerContactos(hoja(wb, HOJAS_MENTORES.mentores));

  const porDia = asientosPorDia(horas);
  for (const [dia, lista] of cupos) {
    const total = porDia.get(dia);
    if (!total) { errores.push({ hoja: HOJAS_MENTORES.cupos, fila: 0, mensaje: `El ${dia} tiene cupos pero ningún mentor en Horarios.` }); continue; }
    try {
      const grupos = gruposDelDia(lista, total, dia, ciudadesExplicitas([...cupos.values()].map((ciudades) => ({ ciudades }))));
      const resto = grupos[grupos.length - 1]!;
      if (resto.cuota > 0 && resto.ciudades.length === 0)
        avisos.push({ hoja: HOJAS_MENTORES.cupos, fila: 0, mensaje: `El ${dia} sobran ${resto.cuota} asientos sin ciudad (ninguna ciudad está marcada como Sobrante). Se pueden reetiquetar después.` });
    } catch (e) {
      errores.push({ hoja: HOJAS_MENTORES.cupos, fila: 0, mensaje: `El ${dia}: ${(e as Error).message}.` });
    }
  }
  for (const dia of porDia.keys())
    if (!cupos.has(dia)) avisos.push({ hoja: HOJAS_MENTORES.cupos, fila: 0, mensaje: `El ${dia} no tiene ciudades en Cupos: sus asientos quedan sin ciudad.` });

  const mentores: Mentor[] = [...nombres].map(([id, nombre]) => {
    const c = contactos.get(id);
    if (!c) avisos.push({ hoja: HOJAS_MENTORES.mentores, fila: 0, mensaje: `"${nombre}" está en Horarios pero no en Mentores (sin correo ni celular).` });
    return { _id: id, ...c, nombre: c?.nombre ?? nombre };
  });
  const asientos = errores.length ? [] : generarAsientos(horas, cupos);
  return { mentores, horas, cupos, asientos, errores, avisos };
}

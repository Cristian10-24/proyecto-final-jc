// Texto prellenado del botón WhatsApp para PARTICIPANTES (mentores y monitores abren el chat sin texto).
// Puro: tests/contactoMensajes.test.ts. Los textos están en constantes para editarlos fácil.
// El mensaje no lleva documento, correo ni ningún otro dato personal: solo primer nombre, proyecto, día y hora.

import { horaCO, horaUY } from "../ciudades";
import { paisDeCiudad } from "./celular";

/** Plantillas. {nombre}, {proyecto}, {fecha}, {hora} se reemplazan; {proyecto} puede faltar (ver FRASE_PROYECTO). */
export const TEXTOS_RECORDATORIO = {
  base:
    "Hola {nombre}, te escribimos desde Jóvenes creaTIvos. Te recordamos tu presentación del proyecto final{frase_proyecto} " +
    "el {fecha} a las {hora}. ¿Nos confirmas que podrás conectarte? ¡Mucho éxito!",
  /** Va justo después de «del proyecto final»; se omite si el nombre del proyecto es un marcador. */
  fraseProyecto: " «{proyecto}»",
  horaColombia: "{hora} (hora de Colombia)",
  horaUruguay: "{hora} hora de Colombia ({horaUY} hora de Uruguay)",
} as const;

/** Nombres de proyecto que en realidad dicen «aún no tengo» (sin tildes, minúsculas, sin puntuación al final). */
const MARCADORES = [
  /^no tengo\b/, /^aun no\b/, /^todavia no\b/, /^no (lo )?(he|hemos) definido/, /^sin (nombre|definir|proyecto|titulo)\b/,
  /^por definir\b/, /^pendiente\b/, /^ninguno\b/, /^no aplica\b/, /^n\/?a$/, /^-+$/, /^\?+$/,
];
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.…!¡]+$/g, "").trim();

/** ¿El nombre del proyecto es un marcador («No tengo», «Aún no tengo definido…») o está vacío? */
export function esNombreMarcador(nombre: string | null | undefined): boolean {
  const n = normal(nombre ?? "");
  return !n || MARCADORES.some((r) => r.test(n));
}

const fmtFecha = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });
/** Fecha larga de la app en minúscula: "martes 17 de noviembre" (día en hora de Colombia). */
export const fechaRecordatorio = (inicio: Date) => fmtFecha.format(inicio).replace(",", "").replace(/\s+/g, " ").toLowerCase();

/** Proyecto muy largo: se corta a MAX_PROYECTO caracteres con «…» (el enlace no crece sin control). */
export const MAX_PROYECTO = 120;
const recortar = (t: string) => ([...t].length > MAX_PROYECTO ? [...t].slice(0, MAX_PROYECTO - 1).join("").trimEnd() + "…" : t);

const poner = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/**
 * Recordatorio para un integrante. `nombre` = su nombre completo (se usa el primero). `ciudad` decide si se agrega la
 * hora de Uruguay (la misma regla que el resto de la app); Ecuador y Panamá tienen la hora de Colombia.
 * Fecha inválida → null (el chat se abre sin texto).
 */
export function mensajeRecordatorio({ nombre, proyecto, inicio, ciudad }: {
  nombre: string; proyecto: string | null | undefined; inicio: string | Date; ciudad: string | null | undefined;
}): string | null {
  const d = typeof inicio === "string" ? new Date(inicio) : inicio;
  if (Number.isNaN(d.getTime())) return null; // sin fecha válida, el chat se abre sin texto
  const primero = nombre.trim().split(/\s+/)[0] ?? "";
  const hora = paisDeCiudad(ciudad) === "UY"
    ? poner(TEXTOS_RECORDATORIO.horaUruguay, { hora: horaCO(d), horaUY: horaUY(d) })
    : poner(TEXTOS_RECORDATORIO.horaColombia, { hora: horaCO(d) });
  const frase = esNombreMarcador(proyecto) ? "" : poner(TEXTOS_RECORDATORIO.fraseProyecto, { proyecto: recortar((proyecto ?? "").trim()) });
  return poner(TEXTOS_RECORDATORIO.base, { nombre: primero, frase_proyecto: frase, fecha: fechaRecordatorio(d), hora });
}

// Reglas de nombre: se usan en el navegador, en la API y en los scripts.

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

/** Recorta y colapsa espacios. No cambia mayúsculas ni tildes. */
export function cleanSpaces(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function capitalize(word: string): string {
  // "maría-josé" -> "María-José", "d'angelo" -> "D'Angelo", "d.c" -> "D.C"
  return word
    .split(/([-'’.])/)
    .map((part) => (part.length ? part.charAt(0).toLocaleUpperCase("es") + part.slice(1) : part))
    .join("");
}

/** "  MARÍA  DE LOS ángeles " -> "María de los Ángeles". Nunca agrega tildes. */
export function toProperName(value: string): string {
  const words = cleanSpaces(value).toLocaleLowerCase("es").split(" ").filter(Boolean);
  return words
    .map((w, i) => (i > 0 && PARTICULAS.has(w) ? w : capitalize(w)))
    .join(" ");
}

export function hasAccent(value: string): boolean {
  return /[áéíóúüÁÉÍÓÚÜ]/.test(value);
}

export type NameWarning = "sin_tildes" | "incompleto";

export const NAME_WARNING_TEXT: Record<NameWarning, string> = {
  sin_tildes: "Tu nombre no tiene ninguna tilde. Revisa que esté bien escrito (por ejemplo: Martínez, José, Sofía).",
  incompleto: "Escribe tu nombre completo: nombres y apellidos.",
};

export function nameWarnings(value: string): NameWarning[] {
  const name = cleanSpaces(value);
  const warnings: NameWarning[] = [];
  if (name.split(" ").length < 2) warnings.push("incompleto");
  if (!hasAccent(name)) warnings.push("sin_tildes");
  return warnings;
}

/**
 * Nombres oficiales de ciudades que no salen bien solo con Nombre Propio.
 * Clave: minúsculas, sin tildes ni puntos ni espacios extra.
 */
const CIUDADES_OFICIALES: Record<string, string> = {
  "bogota": "Bogotá D.C.",
  "bogota dc": "Bogotá D.C.",
};

function cityKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

/** Ciudad normalizada para comparar entre el Excel y los monitores. */
export function normalizeCity(value: string): string {
  return CIUDADES_OFICIALES[cityKey(value)] ?? toProperName(value);
}

/** Si la ciudad ya existe escrita de otra forma (tildes, mayúsculas, puntos), devuelve la existente. */
export function ciudadExistente(ciudad: string, existentes: string[]): string {
  const k = cityKey(ciudad);
  return existentes.find((c) => cityKey(c) === k) ?? ciudad;
}

/** Documento sin puntos, espacios ni guiones. */
export function normalizeDocumento(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

// Fase 6 · Formatos puros de las vistas nuevas (Mi ciudad y Monitores). Sin base ni navegador: se usan en el servidor
// y en el cliente, y se prueban en tests/vistasFormato.test.ts.

/**
 * Celular para mostrar, como el prototipo: "+57 300 411 8250" (Colombia) y "+598 99 214 367" (Uruguay).
 * Acepta lo que guarda el importador ("+573004118250", "3004118250", "+59899214367", "099214367").
 * Vacío → null (la vista escribe «Sin registrar»). Un formato que no reconoce se devuelve tal cual.
 */
export function formatoCelular(celular: string | null | undefined): string | null {
  const crudo = (celular ?? "").trim();
  if (!crudo) return null;
  let d = crudo.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && d.startsWith("3")) d = `57${d}`;
  if (d.length === 12 && d.startsWith("573")) return `+57 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.length === 11 && d.startsWith("598")) return `+598 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  if (d.length === 9 && d.startsWith("09")) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`; // Uruguay sin indicativo
  return crudo;
}

/** Iniciales del avatar del monitor: "Valeria Ocampo Ríos" → "VO"; un solo nombre → "VA". */
export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  const t = p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0];
  return t.toLocaleUpperCase("es");
}

/** Color de cada monitor (1 a 7, se repite) por orden alfabético del nombre: estable aunque cambie el filtro. */
export function coloresMonitores(nombres: readonly string[]): Map<string, number> {
  const orden = [...new Set(nombres)].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  return new Map(orden.map((n, i) => [n, (i % 7) + 1]));
}

/** Minúsculas y sin tildes, para buscar. */
export const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿Alguno de los textos contiene lo buscado (sin tildes ni mayúsculas)? Búsqueda vacía = sí. */
export function coincide(textos: readonly (string | null | undefined)[], q: string): boolean {
  const b = sinTildes(q.trim());
  if (!b) return true;
  return textos.some((t) => !!t && sinTildes(t).includes(b));
}

/** "1 proyecto" / "4 proyectos". */
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Porcentaje entero (0 si no hay total). */
export const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/** Primer nombre para el menú: "Danna Belén Buendía Vega" → "Danna". Vacío o solo espacios → "". */
export const primerNombre = (nombre: string | null | undefined) => (nombre ?? "").trim().split(/\s+/)[0] ?? "";

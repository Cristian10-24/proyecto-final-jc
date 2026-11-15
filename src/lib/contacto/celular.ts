// Celulares de Colombia, Ecuador, Panamá y Uruguay para MOSTRAR y armar enlaces (tel: y wa.me). Solo presentación:
// el celular se guarda como hoy; aquí se corrige al leerlo. Puro: se usa en el navegador y en las pruebas
// (tests/contactoCelular.test.ts).

import { CIUDADES, type Pais } from "../ciudades";

export type CelularNormalizado = {
  /** "+593963976623", o null si no se pudo normalizar (nunca se arma un enlace con él). */
  e164: string | null;
  /** "+593 96 397 6623" para mostrar, o null. */
  internacional: string | null;
  ok: boolean;
};

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Ciudades que no están en CIUDADES pero pueden llegar escritas así (solo para decidir el país del celular). */
const OTRAS_CIUDADES: Record<string, Pais> = {
  cuenca: "EC", manta: "EC", guayaquil: "EC", quito: "EC", portoviejo: "EC", machala: "EC", "santo domingo": "EC",
  panama: "PA", "ciudad de panama": "PA", "panama city": "PA",
  colonia: "UY", "colonia del sacramento": "UY", paysandu: "UY", montevideo: "UY",
};

/**
 * País de una ciudad: el de la lista de ciudades de la app (la misma regla que la hora de Uruguay) y, si no está,
 * un mapa mínimo. Una ciudad desconocida → null: no se adivina.
 */
export function paisDeCiudad(ciudad: string | null | undefined): Pais | null {
  const c = sinTildes(ciudad ?? "");
  if (!c) return null;
  const oficial = CIUDADES.find((x) => sinTildes(x.nombre) === c);
  return oficial ? oficial.pais : OTRAS_CIUDADES[c] ?? null;
}

type Regla = { pais: Pais; indicativo: string; resto: RegExp; grupos: number[] };
// `resto` = el número nacional (sin indicativo ni 0 inicial). `grupos` = cómo se parte para mostrarlo.
const REGLAS: Regla[] = [
  { pais: "CO", indicativo: "57", resto: /^3\d{9}$/, grupos: [3, 3, 4] }, //  +57 300 123 4567
  { pais: "EC", indicativo: "593", resto: /^9\d{8}$/, grupos: [2, 3, 4] }, // +593 96 397 6623
  { pais: "PA", indicativo: "507", resto: /^6\d{7}$/, grupos: [4, 4] }, //    +507 6123 4567
  { pais: "UY", indicativo: "598", resto: /^9\d{7}$/, grupos: [2, 3, 3] }, // +598 99 214 367
];

const INVALIDO: CelularNormalizado = { e164: null, internacional: null, ok: false };

function armar(r: Regla, resto: string): CelularNormalizado {
  const partes: string[] = [];
  let i = 0;
  for (const g of r.grupos) { partes.push(resto.slice(i, i + g)); i += g; }
  return { e164: `+${r.indicativo}${resto}`, internacional: `+${r.indicativo} ${partes.join(" ")}`, ok: true };
}

/** El número nacional con su 0 inicial opcional (Ecuador «09…», Uruguay «09…»); Colombia y Panamá no lo usan. */
function conRegla(r: Regla, nacional: string): CelularNormalizado | null {
  if (r.resto.test(nacional)) return armar(r, nacional);
  if ((r.pais === "EC" || r.pais === "UY") && nacional.startsWith("0") && r.resto.test(nacional.slice(1))) return armar(r, nacional.slice(1));
  return null;
}

/**
 * Normaliza un celular guardado. Quita espacios, guiones, puntos y paréntesis; acepta prefijo «+» o «00».
 * - Indicativo explícito (57, 593, 507, 598) siempre manda sobre la ciudad. También sin «+» si trae el largo completo.
 * - Sin indicativo: 10 dígitos que empiezan por 3 = Colombia, sea cual sea la ciudad. Las formas locales de Ecuador,
 *   Panamá y Uruguay solo valen si `pais` (de la ciudad del participante) es ese país.
 * - Cualquier otra cosa (o letras): ok = false.
 */
export function normalizarCelular(texto: string | null | undefined, pais?: Pais | null): CelularNormalizado {
  const limpio = (texto ?? "").replace(/[\s\-.()]/g, "");
  if (!limpio) return INVALIDO;
  let d: string, explicito: boolean;
  if (limpio.startsWith("+")) { d = limpio.slice(1); explicito = true; }
  else if (limpio.startsWith("00")) { d = limpio.slice(2); explicito = true; }
  else { d = limpio; explicito = false; }
  if (!/^\d+$/.test(d)) return INVALIDO; // \d en JS = solo 0-9 ASCII

  // Con indicativo: el que coincida (los indicativos no se solapan: 57 / 593 / 507 / 598).
  for (const r of REGLAS) {
    if (!d.startsWith(r.indicativo)) continue;
    const hecho = conRegla(r, d.slice(r.indicativo.length));
    if (hecho) return hecho;
  }
  if (explicito) return INVALIDO;

  // Sin indicativo.
  const co = REGLAS[0]!;
  if (co.resto.test(d)) return armar(co, d);
  const local = REGLAS.find((r) => r.pais === pais && r.pais !== "CO");
  return (local && conRegla(local, d)) || INVALIDO;
}

/** Enlace para llamar: tel:+593963976623. */
export const enlaceLlamar = (e164: string) => `tel:${e164}`;

/** Mitades sueltas de un emoji partido: encodeURIComponent fallaría con ellas. */
const SURROGATE_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Enlace de WhatsApp: https://wa.me/593963976623, con el texto prellenado (codificado) si lo hay. */
export function enlaceWhatsApp(e164: string, texto?: string | null): string {
  const base = `https://wa.me/${e164.replace(/^\+/, "")}`;
  const limpio = texto?.replace(SURROGATE_SUELTO, "�");
  return limpio ? `${base}?text=${encodeURIComponent(limpio)}` : base;
}

import { describe, expect, it } from "vitest";
import { enlaceLlamar, enlaceWhatsApp, normalizarCelular, paisDeCiudad } from "@/lib/contacto/celular";
import type { Pais } from "@/lib/ciudades";

// Celulares de Colombia, Ecuador, Panamá y Uruguay: solo presentación (lo guardado no cambia).

type Caso = [texto: string, pais: Pais | null, e164: string | null, visible: string | null];

const VALIDOS: Caso[] = [
  // Colombia: con y sin indicativo, sea cual sea la ciudad.
  ["3001234567", null, "+573001234567", "+57 300 123 4567"],
  ["3001234567", "EC", "+573001234567", "+57 300 123 4567"],
  ["3001234567", "UY", "+573001234567", "+57 300 123 4567"],
  ["+573001234567", null, "+573001234567", "+57 300 123 4567"],
  ["573001234567", null, "+573001234567", "+57 300 123 4567"],
  ["0057 300 123 4567", null, "+573001234567", "+57 300 123 4567"],
  ["+57 (300) 123-4567", "PA", "+573001234567", "+57 300 123 4567"],
  ["300.123.4567", null, "+573001234567", "+57 300 123 4567"],
  // Ecuador: 9 dígitos con 9, o 10 con 0 inicial (se quita el 0); con indicativo vale sin ciudad.
  ["963976623", "EC", "+593963976623", "+593 96 397 6623"],
  ["0963976623", "EC", "+593963976623", "+593 96 397 6623"],
  ["096 397 6623", "EC", "+593963976623", "+593 96 397 6623"],
  ["+593963976623", null, "+593963976623", "+593 96 397 6623"],
  ["+593 96-397-6623", "CO", "+593963976623", "+593 96 397 6623"],
  ["00593963976623", null, "+593963976623", "+593 96 397 6623"],
  ["+593 0963976623", null, "+593963976623", "+593 96 397 6623"],
  ["593963976623", null, "+593963976623", "+593 96 397 6623"],
  // Panamá: 8 dígitos con 6.
  ["61234567", "PA", "+50761234567", "+507 6123 4567"],
  ["6123-4567", "PA", "+50761234567", "+507 6123 4567"],
  ["+507 6123 4567", null, "+50761234567", "+507 6123 4567"],
  ["00507 (6123) 4567", "UY", "+50761234567", "+507 6123 4567"],
  // Uruguay: 8 dígitos con 9, o 9 con 0 inicial.
  ["99214367", "UY", "+59899214367", "+598 99 214 367"],
  ["099214367", "UY", "+59899214367", "+598 99 214 367"],
  ["099 214 367", "UY", "+59899214367", "+598 99 214 367"],
  ["+59899214367", null, "+59899214367", "+598 99 214 367"],
  ["+598 99 214 367", "EC", "+59899214367", "+598 99 214 367"],
  ["0059899214367", null, "+59899214367", "+598 99 214 367"],
  ["59899214367", null, "+59899214367", "+598 99 214 367"],
];

const INVALIDOS: [string | null | undefined, Pais | null][] = [
  ["+598167992", "UY"], // indicativo de Uruguay con un número que no es celular
  ["+598167992", null],
  ["963976623", null], // forma local de Ecuador sin ciudad: no se adivina
  ["963976623", "CO"],
  ["963976623", "UY"],
  ["99214367", "PA"],
  ["61234567", "UY"],
  ["61234567", null],
  ["099214367", "EC"],
  ["+44 7700 900123", null], // otro país
  ["+57 963976623", "EC"], // indicativo explícito manda: no es celular colombiano
  ["30012345", null], // corto
  ["30012345678", null], // largo
  ["2001234567", null], // 10 dígitos que no empiezan por 3
  ["300 123 4567 ext 2", null],
  ["abc", null],
  ["+", null],
  ["", null],
  ["   ", "EC"],
  [null, null],
  [undefined, "UY"],
];

describe("normalizarCelular", () => {
  it.each(VALIDOS)("%s (país %s) → %s", (texto, pais, e164, visible) => {
    expect(normalizarCelular(texto, pais)).toEqual({ e164, internacional: visible, ok: true });
  });
  it.each(INVALIDOS)("%s (país %s) → no válido", (texto, pais) => {
    expect(normalizarCelular(texto, pais)).toEqual({ e164: null, internacional: null, ok: false });
  });
});

describe("paisDeCiudad", () => {
  it("usa la lista de ciudades de la app (la misma regla de la hora de Uruguay)", () => {
    expect(paisDeCiudad("Guayaquil")).toBe("EC");
    expect(paisDeCiudad("Quito")).toBe("EC");
    expect(paisDeCiudad("Panamá")).toBe("PA");
    expect(paisDeCiudad("Colonia")).toBe("UY");
    expect(paisDeCiudad("Paysandú")).toBe("UY");
    expect(paisDeCiudad("Cali")).toBe("CO");
    expect(paisDeCiudad("Bogotá D.C.")).toBe("CO");
  });
  it("mapa mínimo para otras formas, sin tildes ni mayúsculas", () => {
    expect(paisDeCiudad("Cuenca")).toBe("EC");
    expect(paisDeCiudad("manta")).toBe("EC");
    expect(paisDeCiudad("Ciudad de Panamá")).toBe("PA");
    expect(paisDeCiudad("PAYSANDU")).toBe("UY");
    expect(paisDeCiudad(" Montevideo ")).toBe("UY");
  });
  it("ciudad desconocida o vacía: null (no se adivina)", () => {
    expect(paisDeCiudad("Lima")).toBeNull();
    expect(paisDeCiudad("")).toBeNull();
    expect(paisDeCiudad(null)).toBeNull();
  });
});

describe("enlaces", () => {
  it("tel: con + y wa.me solo con dígitos", () => {
    expect(enlaceLlamar("+593963976623")).toBe("tel:+593963976623");
    expect(enlaceWhatsApp("+593963976623")).toBe("https://wa.me/593963976623");
  });
  it("texto codificado con encodeURIComponent", () => {
    const u = enlaceWhatsApp("+59899214367", "Hola Ñoño & co? #1 «sí»");
    expect(u).toBe("https://wa.me/59899214367?text=Hola%20%C3%91o%C3%B1o%20%26%20co%3F%20%231%20%C2%ABs%C3%AD%C2%BB");
    expect(new URL(u).searchParams.get("text")).toBe("Hola Ñoño & co? #1 «sí»");
  });
});

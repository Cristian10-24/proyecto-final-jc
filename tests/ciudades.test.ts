import { describe, expect, it } from "vitest";
import { horaParaCiudad } from "@/lib/ciudades";

describe("hora en pantalla", () => {
  const seisYCuarto = new Date("2026-11-12T23:15:00Z"); // 6:15 p. m. en Colombia

  it("Colombia, Ecuador y Panamá ven solo la hora COL", () => {
    expect(horaParaCiudad(seisYCuarto, "CO")).toMatch(/^6:15\s?p\.\s?m\. COL$/);
  });

  it("Uruguay ve la hora COL y la de UY (2 horas más)", () => {
    expect(horaParaCiudad(seisYCuarto, "UY")).toMatch(/^6:15\s?p\.\s?m\. COL · 8:15\s?p\.\s?m\. UY$/);
  });
});

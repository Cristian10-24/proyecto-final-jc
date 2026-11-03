import { describe, expect, it } from "vitest";
import {
  agruparPorHora, ciudadesDelDia, diasPorCiudad, generarAsientos, gruposDelDia, horasDisponibles,
  puedeElegir, repartoPorHora, repartoProporcional, resumenPorDia, TODAS, type HoraMentores,
} from "@/lib/agenda";
import { inicioUTC } from "@/lib/edicion";
import type { CupoCiudad, DiaConfig } from "@/lib/types";

const cupo = (ciudad: string, cupos: number | null, sobrante = false, abre: Date | null = null): CupoCiudad => ({ ciudad, cupos, sobrante, abre });

// Perfil del jueves 12 en el Excel: mentores por hora (8–11 a. m. y 4–8 p. m.) → 128 asientos.
const JUEVES: HoraMentores[] = [[8, 1], [9, 2], [10, 1], [11, 2], [16, 4], [17, 4], [18, 7], [19, 5], [20, 6]].map(([hora, n]) => ({
  dia: "2026-11-12", hora: hora!, mentores: Array.from({ length: n! }, (_, i) => `m${i + 1}`),
}));

describe("reparto proporcional", () => {
  it("cada grupo recibe exactamente su cuota", () => {
    const r = repartoProporcional(10, [7, 3]);
    expect(r.filter((g) => g === 0)).toHaveLength(7);
    expect(r.filter((g) => g === 1)).toHaveLength(3);
    expect(() => repartoProporcional(10, [7, 2])).toThrow(/no suman/);
  });

  it("en cada tramo va cerca de la proporción (error acumulado < 1)", () => {
    const r = repartoProporcional(128, [88, 40]);
    let b = 0;
    r.forEach((g, i) => { if (g === 1) b++; expect(Math.abs(b - (40 * (i + 1)) / 128)).toBeLessThan(1); });
  });
});

describe("caso 80 Cali / 40 Cartagena (jueves 12, 128 asientos)", () => {
  const cupos = new Map([["2026-11-12", [cupo("Cali", 80, true), cupo("Cartagena", 40)]]]);
  const asientos = generarAsientos(JUEVES, cupos);
  const porHora = repartoPorHora(asientos);

  it("totales: Cali 80 + sobrante = 88, Cartagena exactamente 40", () => {
    expect(resumenPorDia(asientos)).toEqual([{ dia: "2026-11-12", asientos: 128, porCiudad: { Cali: 88, Cartagena: 40 } }]);
  });

  it("cada hora tiene las dos ciudades, en proporción (±2)", () => {
    for (const { hora, mentores } of JUEVES) {
      const total = mentores.length * 4;
      const r = porHora.get(hora)!;
      expect(r.Cali, `hora ${hora}`).toBeGreaterThan(0);
      expect(r.Cartagena, `hora ${hora}`).toBeGreaterThan(0);
      expect(Math.abs(r.Cartagena! - (total * 40) / 128), `hora ${hora}`).toBeLessThan(2);
    }
  });

  it("dentro de una hora, Cartagena no queda amontonada en un solo bloque", () => {
    const cart18 = asientos.filter((a) => a.ciudades[0] === "Cartagena" && a.inicio.getUTCHours() === 23);
    expect(new Set(cart18.map((a) => a.inicio.getTime())).size).toBeGreaterThan(1);
  });

  it("sin sobrante quedan 8 asientos sin ciudad, también repartidos", () => {
    const sin = generarAsientos(JUEVES, new Map([["2026-11-12", [cupo("Cali", 80), cupo("Cartagena", 40)]]]));
    expect(resumenPorDia(sin)[0]!.porCiudad).toEqual({ Cali: 80, Cartagena: 40, "(sin ciudad)": 8 });
  });

  it("guía 2026: Cali 77 y Cartagena 51 llenan el día", () => {
    const g = generarAsientos(JUEVES, new Map([["2026-11-12", [cupo("Cali", 77, true), cupo("Cartagena", 51)]]]));
    expect(resumenPorDia(g)[0]!.porCiudad).toEqual({ Cali: 77, Cartagena: 51 });
  });

  it("errores de configuración del día", () => {
    expect(() => gruposDelDia([cupo("Cali", 100), cupo("Cartagena", 40)], 128, "2026-11-12")).toThrow(/superan/);
    expect(() => gruposDelDia([cupo("Cali", null, true), cupo("Cartagena", null, true)], 128, "2026-11-12")).toThrow(/una ciudad/);
    expect(() => gruposDelDia([cupo("Cali", null)], 128, "2026-11-12")).toThrow(/no tiene cupos/);
  });
});

describe("días por ciudad y apertura", () => {
  const abreBaq = new Date("2026-11-13T19:00:00Z"); // vie 13, 2:00 p. m. COL
  const dias: DiaConfig[] = [
    { _id: "2026-11-12", ciudades: [cupo("Cali", 80, true), cupo("Cartagena", 40)] },
    { _id: "2026-11-13", ciudades: [cupo("Cartagena", 35), cupo("Barranquilla", null, true, abreBaq)] },
    { _id: "2026-11-17", ciudades: [cupo("Barranquilla", 46), cupo(TODAS, null, true)] },
    { _id: "2026-11-19", ciudades: [cupo(TODAS, null, true)] },
  ];

  it("Cali solo el 12; Cartagena hasta antes de su clausura (19); los demás desde el 17", () => {
    expect(diasPorCiudad(dias, "Cali")).toEqual(["2026-11-12"]);
    expect(diasPorCiudad(dias, "Cartagena")).toEqual(["2026-11-12", "2026-11-13", "2026-11-17"]);
    expect(diasPorCiudad(dias, "Barranquilla")).toEqual(["2026-11-13", "2026-11-17", "2026-11-19"]);
    expect(diasPorCiudad(dias, "Medellín")).toEqual(["2026-11-17", "2026-11-19"]);
    expect(diasPorCiudad(dias, "Paysandú")).toEqual(["2026-11-17", "2026-11-19"]);
  });

  it("una fila explícita gana a Todas", () => {
    expect(ciudadesDelDia(dias[2]!.ciudades, "2026-11-17").get("Barranquilla")).toBeNull();
    expect(ciudadesDelDia(dias[2]!.ciudades, "2026-11-17").has("Cali")).toBe(false);
  });

  it("Barranquilla elige el 13 solo desde su apertura", () => {
    expect(puedeElegir(dias[1], "Barranquilla", new Date("2026-11-13T18:59:00Z"))).toBe(false);
    expect(puedeElegir(dias[1], "Barranquilla", abreBaq)).toBe(true);
    expect(puedeElegir(dias[1], "Cartagena", new Date("2026-11-01T00:00:00Z"))).toBe(true);
    expect(puedeElegir(dias[1], "Cali", abreBaq)).toBe(false);
    expect(puedeElegir(undefined, "Cali", abreBaq)).toBe(false);
  });
});

describe("horas disponibles", () => {
  const p = { toHexString: () => "x" } as never;
  const a = (h: number, m: number, ciudades: string[], proyectoId: unknown = null) => ({ inicio: inicioUTC("2026-11-12", h, m), ciudades, proyectoId: proyectoId as never });
  const asientos = [
    a(8, 0, ["Cali"]), a(8, 0, ["Cali"]), a(8, 15, ["Cartagena"]), a(8, 30, ["Cali"], p),
    a(8, 45, ["Cali"]), a(16, 0, ["Cali", "Cartagena"]), a(16, 15, ["Cali"]),
  ];

  it("bloques libres de la ciudad, sin repetir, en orden, sin los ocupados", () => {
    const h = horasDisponibles(asientos, "Cali", new Date("2026-11-01T00:00:00Z"));
    expect(h.map((d) => d.toISOString())).toEqual(["2026-11-12T13:00:00.000Z", "2026-11-12T13:45:00.000Z", "2026-11-12T21:00:00.000Z", "2026-11-12T21:15:00.000Z"]);
    expect(horasDisponibles(asientos, "Cartagena", new Date(0))).toHaveLength(2);
  });

  it("no ofrece bloques que ya empezaron", () => {
    expect(horasDisponibles(asientos, "Cali", inicioUTC("2026-11-12", 16, 0))).toHaveLength(1);
  });

  it("agrupa por hora de Colombia", () => {
    const g = agruparPorHora(horasDisponibles(asientos, "Cali", new Date(0)));
    expect(g.map((x) => [x.hora, x.bloques.length])).toEqual([[8, 2], [16, 2]]);
  });
});

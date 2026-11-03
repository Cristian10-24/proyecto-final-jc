import { describe, expect, it } from "vitest";
import {
  agruparPorHora, ciudadesDelDia, ciudadesExplicitas, diasPorCiudad, generarAsientos, gruposDelDia, horasDisponibles,
  puedeElegir, repartoPorHora, repartoProporcional, resumenPorDia, TODAS, type HoraMentores,
} from "@/lib/agenda";
import { esDia, inicioUTC } from "@/lib/edicion";
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

  it("datos reales (Horarios, jueves 12: 136 asientos): Cali 96 y Cartagena 40, hora por hora", () => {
    const real: HoraMentores[] = [[8, 1], [9, 2], [10, 1], [11, 2], [16, 4], [17, 4], [18, 8], [19, 6], [20, 6]].map(([hora, n]) => ({
      dia: "2026-11-12", hora: hora!, mentores: Array.from({ length: n! }, (_, i) => `m${i + 1}`),
    }));
    const r = generarAsientos(real, cupos);
    expect(resumenPorDia(r)[0]).toEqual({ dia: "2026-11-12", asientos: 136, porCiudad: { Cali: 96, Cartagena: 40 } });
    expect([...repartoPorHora(r)].map(([h, x]) => [h, x.Cali, x.Cartagena])).toEqual([
      [8, 3, 1], [9, 5, 3], [10, 3, 1], [11, 6, 2], [16, 11, 5], [17, 12, 4], [18, 22, 10], [19, 17, 7], [20, 17, 7],
    ]);
  });

  it("guía 2026: Cali 77 y Cartagena 51 llenan el día", () => {
    const g = generarAsientos(JUEVES, new Map([["2026-11-12", [cupo("Cali", 77, true), cupo("Cartagena", 51)]]]));
    expect(resumenPorDia(g)[0]!.porCiudad).toEqual({ Cali: 77, Cartagena: 51 });
  });

  it("máximo por ciudad (Paso 17): el sobrante llena hasta su máximo y lo demás va a quien tenga máximo mayor que sus cupos", () => {
    const cm = (ciudad: string, cupos: number | null, max: number | null, sobrante = false): CupoCiudad => ({ ...cupo(ciudad, cupos, sobrante), max });
    // 128 asientos: Cali 80 (máx 100, sobrante), Cartagena 0 (máx 40) → Cali 100, Cartagena 28.
    expect(gruposDelDia([cm("Cali", 80, 100, true), cm("Cartagena", 0, 40)], 128, "2026-11-12", new Set())).toEqual([
      { ciudades: ["Cartagena"], cuota: 28 }, { ciudades: ["Cali"], cuota: 100 },
    ]);
    // Si ni el sobrante ni los máximos alcanzan, lo que queda va sin ciudad.
    expect(gruposDelDia([cm("Cali", 80, 90, true), cm("Cartagena", 10, 20)], 128, "2026-11-12", new Set())).toEqual([
      { ciudades: ["Cartagena"], cuota: 20 }, { ciudades: [], cuota: 18 }, { ciudades: ["Cali"], cuota: 90 },
    ]);
    // Sin máximos se comporta como antes.
    expect(gruposDelDia([cupo("Cali", 80, true), cupo("Cartagena", 40)], 128, "2026-11-12", new Set())).toEqual([
      { ciudades: ["Cartagena"], cuota: 40 }, { ciudades: ["Cali"], cuota: 88 },
    ]);
    expect(() => gruposDelDia([cm("Cali", 80, 70, true)], 128, "2026-11-12", new Set())).toThrow(/máximo de Cali/);
  });

  it("errores de configuración del día", () => {
    expect(() => gruposDelDia([cupo("Cali", 100), cupo("Cartagena", 40)], 128, "2026-11-12", new Set())).toThrow(/superan/);
    expect(() => gruposDelDia([cupo("Cali", null, true), cupo("Cartagena", null, true)], 128, "2026-11-12", new Set())).toThrow(/una ciudad/);
    expect(() => gruposDelDia([cupo("Cali", null)], 128, "2026-11-12", new Set())).toThrow(/no tiene cupos/);
  });
});

describe("días por ciudad y apertura", () => {
  // Configuración del PLAN: Cali solo el 12; Cartagena 12 y 13; Barranquilla 13 (sobrante), 17 y 18;
  // del martes 17 en adelante, "Todas" para las ciudades sin días asignados.
  const abreBaq = new Date("2026-11-13T19:00:00Z"); // vie 13, 2:00 p. m. COL
  const dias: DiaConfig[] = [
    { _id: "2026-11-12", ciudades: [cupo("Cali", 80, true), cupo("Cartagena", 40)] },
    { _id: "2026-11-13", ciudades: [cupo("Cartagena", 35), cupo("Barranquilla", null, true, abreBaq)] },
    { _id: "2026-11-17", ciudades: [cupo("Barranquilla", 46), cupo(TODAS, null, true)] },
    { _id: "2026-11-18", ciudades: [cupo("Barranquilla", 20), cupo(TODAS, null, true)] },
    { _id: "2026-11-19", ciudades: [cupo(TODAS, null, true)] },
    { _id: "2026-11-20", ciudades: [cupo(TODAS, null, true)] },
    { _id: "2026-11-21", ciudades: [cupo(TODAS, null, true)] },
  ];
  const DESDE_17 = ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
  const explicitas = ciudadesExplicitas(dias);

  it("Cali: solo el jueves 12", () => expect(diasPorCiudad(dias, "Cali")).toEqual(["2026-11-12"]));
  it("Cartagena: solo jueves 12 y viernes 13 (Todas no le aplica)", () => expect(diasPorCiudad(dias, "Cartagena")).toEqual(["2026-11-12", "2026-11-13"]));
  it("Barranquilla: viernes 13, martes 17 y miércoles 18", () => expect(diasPorCiudad(dias, "Barranquilla")).toEqual(["2026-11-13", "2026-11-17", "2026-11-18"]));
  it("Medellín: los días de Todas desde el 17 (clausura 24)", () => expect(diasPorCiudad(dias, "Medellín")).toEqual(DESDE_17));
  it("Guayaquil", () => expect(diasPorCiudad(dias, "Guayaquil")).toEqual(DESDE_17));
  it("Quito", () => expect(diasPorCiudad(dias, "Quito")).toEqual(DESDE_17));
  it("Bogotá D.C.", () => expect(diasPorCiudad(dias, "Bogotá D.C.")).toEqual(DESDE_17));
  it("Colonia", () => expect(diasPorCiudad(dias, "Colonia")).toEqual(DESDE_17));
  it("Paysandú", () => expect(diasPorCiudad(dias, "Paysandú")).toEqual(DESDE_17));
  it("Panamá", () => expect(diasPorCiudad(dias, "Panamá")).toEqual(DESDE_17));

  it("Todas respeta la clausura aunque la ciudad no tenga días asignados", () => {
    const sinCartagena = dias.map((d) => ({ ...d, ciudades: d.ciudades.filter((c) => c.ciudad !== "Cartagena") }));
    expect(diasPorCiudad(sinCartagena, "Cartagena")).toEqual(["2026-11-17", "2026-11-18"]); // clausura jue 19
  });

  it("los asientos de Todas no llevan ciudades con días asignados", () => {
    const cupos = new Map(dias.map((d) => [d._id, d._id === "2026-11-17" ? [cupo("Barranquilla", 2), cupo(TODAS, null, true)] : d.ciudades]));
    const a = generarAsientos([{ dia: "2026-11-17", hora: 8, mentores: ["m1"] }], cupos);
    expect(new Set(a.flatMap((x) => x.ciudades))).toEqual(new Set(["Barranquilla", "Medellín", "Guayaquil", "Quito", "Bogotá D.C.", "Colonia", "Paysandú", "Panamá"]));
    expect(a.filter((x) => x.ciudades.includes("Cartagena") || x.ciudades.includes("Cali"))).toEqual([]);
  });

  it("una fila explícita gana a Todas", () => {
    expect(ciudadesDelDia(dias[2]!.ciudades, "2026-11-17", explicitas).get("Barranquilla")).toBeNull();
    expect(ciudadesDelDia(dias[2]!.ciudades, "2026-11-17", explicitas).has("Cartagena")).toBe(false);
  });

  it("Barranquilla elige el 13 solo desde su apertura", () => {
    expect(puedeElegir(dias[1], "Barranquilla", new Date("2026-11-13T18:59:00Z"), explicitas)).toBe(false);
    expect(puedeElegir(dias[1], "Barranquilla", abreBaq, explicitas)).toBe(true);
    expect(puedeElegir(dias[1], "Cartagena", new Date("2026-11-01T00:00:00Z"), explicitas)).toBe(true);
    expect(puedeElegir(dias[1], "Cali", abreBaq, explicitas)).toBe(false);
    expect(puedeElegir(dias[2], "Cartagena", abreBaq, explicitas)).toBe(false);
    expect(puedeElegir(undefined, "Cali", abreBaq, explicitas)).toBe(false);
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

describe("esDia", () => {
  it("solo fechas que existen", () => {
    expect([esDia("2026-11-12"), esDia("2026-02-31"), esDia("2026-13-01"), esDia("12-11-2026")]).toEqual([true, false, false, false]);
  });
});

import { describe, expect, it } from "vitest";
import { horasDisponibles } from "@/lib/agenda";
import { inicioUTC } from "@/lib/edicion";
import { resumenModo, topeCiudad } from "@/lib/modoCupos";
import type { DiaConfig } from "@/lib/types";

// Fase 4 · Funciones puras del modo orden de llegada.

const jueves: DiaConfig = {
  _id: "2026-11-12",
  ciudades: [
    { ciudad: "Cali", cupos: 80, sobrante: true, abre: null },
    { ciudad: "Cartagena", cupos: 20, max: 30, sobrante: false, abre: null },
    { ciudad: "Barranquilla", cupos: 10, sobrante: false, abre: null },
  ],
};

describe("topeCiudad", () => {
  it("máximo del día; sin máximo, los cupos reservados; sobrante sin tope", () => {
    expect(topeCiudad(jueves, "Cartagena")).toBe(30);
    expect(topeCiudad(jueves, "Barranquilla")).toBe(10);
    expect(topeCiudad(jueves, "Cali")).toBeNull();
  });
  it("ciudad sin fila (llega por «Todas») o con cupos vacíos: sin tope", () => {
    expect(topeCiudad(jueves, "Medellín")).toBeNull();
    expect(topeCiudad({ ciudades: [{ ciudad: "Todas", cupos: 5, sobrante: false, abre: null }] }, "Medellín")).toBeNull();
    expect(topeCiudad({ ciudades: [{ ciudad: "Pasto", cupos: null, sobrante: false, abre: null }] }, "Pasto")).toBeNull();
  });
});

describe("resumenModo", () => {
  it("tope, lleva y lo que puede tomar (mínimo entre lo que le falta y los libres del día)", () => {
    const r = resumenModo([jueves], new Map([["2026-11-12", 12]]), [
      { dia: "2026-11-12", ciudad: "Cartagena", n: 25 },
      { dia: "2026-11-12", ciudad: "Barranquilla", n: 10 },
      { dia: "2026-11-12", ciudad: "Pereira", n: 1 },
    ]);
    const k = Object.fromEntries(r[0]!.ciudades.map((c) => [c.ciudad, c]));
    expect(r[0]!.libres).toBe(12);
    expect(k.Cartagena).toMatchObject({ tope: 30, lleva: 25, puedeTomar: 5, habilitada: true });
    expect(k.Barranquilla).toMatchObject({ tope: 10, lleva: 10, puedeTomar: 0 });
    expect(k.Cali).toMatchObject({ tope: null, lleva: 0, puedeTomar: 12 });
    // Reserva movida a mano a un día que su ciudad no presenta: se muestra, sin tope ni libres.
    expect(k.Pereira).toMatchObject({ habilitada: false, lleva: 1, puedeTomar: 0 });
  });
});

describe("horasDisponibles en modo orden de llegada", () => {
  it("con ciudad null toma cualquier asiento libre, sin mirar la etiqueta", () => {
    const a = (h: number, ciudades: string[]) => ({ inicio: inicioUTC("2026-11-12", h), ciudades, proyectoId: null });
    const asientos = [a(8, ["Cali"]), a(9, ["Cartagena"]), a(10, [])];
    expect(horasDisponibles(asientos, "Cartagena", new Date(0))).toHaveLength(1);
    expect(horasDisponibles(asientos, null, new Date(0))).toHaveLength(3);
  });
});

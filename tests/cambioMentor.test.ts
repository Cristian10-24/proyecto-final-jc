import { describe, expect, it } from "vitest";
import { contarCarga } from "@/lib/cambioMentor";
import { etiquetaCarga } from "@/lib/cambioMentorTexto";
import { inicioUTC } from "@/lib/edicion";

// Paso 25 · Carga de cada mentor para la lista «Cambiar mentor (mismo bloque)». Datos INVENTADOS.

describe("carga del mentor", () => {
  const D = "2026-11-12", D2 = "2026-11-13";
  const a = (mentorId: string, dia: string, h: number, m: number) => ({ mentorId, dia, inicio: inicioUTC(dia, h, m) });

  it("cuenta en esa hora (del mismo día), ese día y en total", () => {
    const c = contarCarga([a("x", D, 8, 0), a("x", D, 8, 45), a("x", D, 9, 0), a("x", D2, 8, 0), a("y", D, 10, 0)], D, 8);
    expect(c.get("x")).toEqual({ enHora: 2, enDia: 3, total: 4 });
    expect(c.get("y")).toEqual({ enHora: 0, enDia: 1, total: 1 });
    expect(c.get("z")).toBeUndefined();
  });

  it("la misma hora de otro día no cuenta como «en esta hora»", () => {
    expect(contarCarga([a("x", D2, 8, 15)], D, 8).get("x")).toEqual({ enHora: 0, enDia: 0, total: 1 });
  });

  it("texto de la lista", () => {
    expect(etiquetaCarga({ mentor: "Ana", enHora: 2, enDia: 5, total: 9 })).toBe("Ana · 2 en esta hora · 5 este día · 9 en total");
  });
});

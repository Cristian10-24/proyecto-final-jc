import { describe, expect, it } from "vitest";
import { cambiosSinMargen, horaCorta, horaLarga, porMonitor, rangoHoras, salasSinMonitor, totales, unirBloques, type Celda } from "@/lib/vistas/bloques";

// Fase 6 · Paso 5: bloques del plan de salas para «Monitores» (agrupar horas, «sin margen», salas sin monitor).

const p = (...m: number[]) => m.map((minuto) => ({ minuto, nombre: `P${minuto}` }));
const c = (hora: number, sala: number, mentorId: string, monitor: string | null, proyectos = p(0, 15, 30, 45)): Celda => ({ hora, sala, mentorId, monitor, proyectos });

describe("unirBloques", () => {
  it("horas seguidas de la misma sala, mentor y monitor = un bloque; un hueco, otra sala u otro monitor lo cortan", () => {
    const b = unirBloques([c(9, 4, "m4", "san"), c(8, 4, "m4", "san"), c(10, 4, "m4", "san"), c(12, 4, "m4", "san"), c(11, 6, "m6", "san"), c(8, 2, "m2", "val"), c(9, 2, "m2", null)]);
    expect(b.map((x) => [x.monitor, x.sala, x.desde, x.hasta, x.proyectos.length])).toEqual([
      ["val", 2, 8, 9, 4], ["san", 4, 8, 11, 12], [null, 2, 9, 10, 4], ["san", 6, 11, 12, 4], ["san", 4, 12, 13, 4],
    ]);
    expect(b[1]!.proyectos.map((x) => `${x.hora}:${x.minuto}`).slice(0, 5)).toEqual(["8:0", "8:15", "8:30", "8:45", "9:0"]);
  });
  it("misma sala con otro mentor no se une", () => {
    expect(unirBloques([c(8, 1, "m1", "a"), c(9, 1, "m9", "a")])).toHaveLength(2);
  });
  it("totales por monitor", () => {
    const m = porMonitor(unirBloques([c(8, 4, "m4", "san"), c(9, 4, "m4", "san"), c(11, 6, "m6", "san", p(0, 15, 30))]));
    expect(totales(m.get("san")!)).toEqual({ horas: 3, proyectos: 11 });
  });
});

describe("cambiosSinMargen", () => {
  it("último proyecto a las :45 y el siguiente bloque, en otra sala, a la hora en punto siguiente", () => {
    const s = cambiosSinMargen(unirBloques([c(8, 4, "m4", "san"), c(9, 4, "m4", "san"), c(10, 4, "m4", "san"), c(11, 6, "m6", "san", p(0))]));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ monitor: "san", de: { sala: 4, desde: 8, hasta: 11 }, a: { sala: 6, desde: 11 }, ultimo: { hora: 10, minuto: 45 } });
  });
  it("no es «sin margen»: último a las :30, misma sala, hueco de una hora, o sin monitor", () => {
    expect(cambiosSinMargen(unirBloques([c(8, 4, "m4", "a", p(0, 15, 30)), c(9, 6, "m6", "a")]))).toEqual([]);
    expect(cambiosSinMargen(unirBloques([c(8, 4, "m4", "a"), c(9, 4, "m9", "a")]))).toEqual([]); // misma sala
    expect(cambiosSinMargen(unirBloques([c(8, 4, "m4", "a"), c(10, 6, "m6", "a")]))).toEqual([]);
    expect(cambiosSinMargen(unirBloques([c(8, 4, "m4", null), c(9, 6, "m6", null)]))).toEqual([]);
  });
});

describe("sin monitor y textos de hora", () => {
  it("salas sin monitor", () => {
    expect(salasSinMonitor(unirBloques([c(8, 8, "m8", null), c(20, 1, "m1", null), c(9, 2, "m2", "a")])).map((b) => [b.sala, b.desde])).toEqual([[8, 8], [1, 20]]);
  });
  it("horas y rangos", () => {
    expect(horaCorta(8)).toBe("8 a. m.");
    expect(horaCorta(12)).toBe("12 p. m.");
    expect(horaCorta(20)).toBe("8 p. m.");
    expect(horaLarga(10, 45)).toBe("10:45 a. m.");
    expect(rangoHoras(8, 9)).toBe("8:00 a 9:00 a. m.");
    expect(rangoHoras(11, 12)).toBe("11:00 a. m. a 12:00 p. m.");
    expect(rangoHoras(14, 16)).toBe("2:00 a 4:00 p. m.");
  });
});

describe("bloqueDeSala (tarjeta Mentor del detalle)", async () => {
  const { bloqueDeSala } = await import("@/lib/vistas/bloques");
  const S = [8, 9, 11].map((hora) => ({ dia: "2026-11-12", hora, sala: 2, mentor: "Julián" })).concat([{ dia: "2026-11-12", hora: 10, sala: 2, mentor: "Otra" }, { dia: "2026-11-13", hora: 10, sala: 2, mentor: "Julián" }]);
  it("une las horas seguidas de la misma sala y mentor", () => {
    expect(bloqueDeSala(S, "2026-11-12", 2, "Julián", 8)).toEqual({ desde: 8, hasta: 10 });
    expect(bloqueDeSala(S, "2026-11-12", 2, "Julián", 9)).toEqual({ desde: 8, hasta: 10 });
    expect(bloqueDeSala(S, "2026-11-12", 2, "Julián", 11)).toEqual({ desde: 11, hasta: 12 }); // a las 10 hay otro mentor
  });
  it("sin esa hora en la lista: null", () => {
    expect(bloqueDeSala(S, "2026-11-12", 3, "Julián", 8)).toBeNull();
    expect(bloqueDeSala(S, "2026-11-14", 2, "Julián", 8)).toBeNull();
  });
});

describe("ajuste 4: un mismo bloque y un mismo panel desde las tres vistas", async () => {
  const B = await import("@/lib/vistas/bloques");
  const D = "2026-11-12";
  const celdas = [c(8, 4, "m4", "san"), c(9, 4, "m4", "san"), c(10, 5, "m5", null, p(0, 30)), c(11, 6, "m6", "san", p(0))];
  const todo = () => true;
  const sinFiltro = { monitor: "", sala: "", mentor: "" };
  it("la lista visible une las horas y filtra bloques enteros", () => {
    expect(B.bloquesVisibles(celdas, sinFiltro, todo).map((b) => [b.sala, b.desde, b.hasta])).toEqual([[4, 8, 10], [5, 10, 11], [6, 11, 12]]);
    expect(B.bloquesVisibles(celdas, { ...sinFiltro, monitor: "sin" }, todo).map((b) => b.sala)).toEqual([5]);
    expect(B.bloquesVisibles(celdas, { ...sinFiltro, mentor: "m6" }, todo).map((b) => b.sala)).toEqual([6]);
    // La búsqueda nunca parte un bloque: o entra entero o no entra.
    expect(B.bloquesVisibles(celdas, sinFiltro, (b) => b.proyectos.some((x) => x.hora === 9))[0]).toMatchObject({ sala: 4, desde: 8, hasta: 10 });
  });
  it("Cuadrícula, Por monitor y Por sala abren el MISMO panel para la misma clave", () => {
    const vis = B.bloquesVisibles(celdas, sinFiltro, todo);
    const grid = vis.find((b) => b.sala === 4)!; // lo que pinta la cuadrícula
    const porMon = B.porMonitor(vis).get("san")!.find((b) => b.sala === 4)!; // tarjeta del monitor
    const porSala = vis.filter((b) => b.sala === 4)[0]!; // fila de la sala
    const ctx = { enlace: "https://meet.google.com/abc-defg-hij", mentor: { nombre: "Mentora Cuatro", celular: "+573000000004" }, monitor: { nombre: "Santiago", celular: null }, sinMargen: false };
    const [a, b, c2] = [grid, porMon, porSala].map((x) => B.contenidoPanel(B.buscarBloque(vis, D, B.claveBloque(D, x))!, ctx));
    expect(a).toEqual(b);
    expect(b).toEqual(c2);
    expect(a).toMatchObject({ titulo: "Sala 4", rango: "8:00 a 10:00 a. m.", enlaceTxt: "meet.google.com/abc-defg-hij" });
    expect(a.proyectos[0]).toEqual({ hora: "8:00 a. m.", nombre: "P0" });
    // Solo hora y nombre del proyecto: nada de integrantes ni contacto de estudiantes.
    for (const p of a.proyectos) expect(Object.keys(p).sort()).toEqual(["hora", "nombre"]);
  });
  it("otro día o un filtro que lo oculta: no hay panel", () => {
    const vis = B.bloquesVisibles(celdas, sinFiltro, todo);
    const k = B.claveBloque(D, vis[0]!);
    expect(B.buscarBloque(vis, "2026-11-13", k)).toBeNull();
    expect(B.buscarBloque(B.bloquesVisibles(celdas, { ...sinFiltro, sala: "5" }, todo), D, k)).toBeNull();
  });
  it("sin monitor y aria-label", () => {
    const sm = B.bloquesVisibles(celdas, sinFiltro, todo).find((b) => b.sala === 5)!;
    expect(B.contenidoPanel(sm, { sinMargen: false }).monitor).toBeNull();
    expect(B.ariaBloque(sm, "Paola Andrea Lozano", false)).toBe("Sala 5, 10:00 a 11:00 a. m., mentor Paola Andrea Lozano, 2 proyectos, sin monitor. Ver detalle");
    expect(B.ariaBloque(sm, "Paola", true)).toContain(", sin margen, sin monitor. Ver detalle");
  });
});

import { describe, expect, it } from "vitest";
import { leerLibro } from "@/lib/importar/excel";
import { plantilla } from "@/lib/importar/plantillas";
import { leerLibroProyectos, leerRuta } from "@/lib/importar/proyectos";
import { leerLibroSalas, leerSala } from "@/lib/importar/salas";
import { asignarSalas, planificar, type EntradaPlan, type PlanSala } from "@/lib/salas";
import { ENC_PROYECTOS, libro } from "./helpers/libros";

// Plan de salas (funciones puras) y lectura del libro de salas y monitores. Datos INVENTADOS.

const D = "2026-11-12";
const SALAS = [1, 2, 3].map((sala) => ({ sala, enlace: `https://meet.ejemplo.org/${sala}` }));
const entrada = (e: Partial<EntradaPlan>): EntradaPlan => ({ horas: [], salas: SALAS, importados: [], disponibilidad: [], cambiosAdmin: [], ...e });
const de = (plan: PlanSala[], hora: number, mentor: string) => plan.find((p) => p.hora === hora && p.mentorId === mentor)!;
const todoElDia = (monitor: string, horas: number[]) => horas.map((hora) => ({ monitor, dia: D, hora }));

describe("salas por mentor", () => {
  it("el mentor conserva su sala en horas seguidas y vuelve a la suya después de un hueco", () => {
    const { salaDe, errores } = asignarSalas([
      { dia: D, hora: 8, mentores: ["b", "c"] },
      { dia: D, hora: 9, mentores: ["a", "c"] },
      { dia: D, hora: 10, mentores: ["a", "b", "c"] },
    ], [1, 2, 3]);
    expect(errores).toEqual([]);
    expect([8, 9, 10].map((h) => salaDe.get(`${D}|${h}|c`))).toEqual([2, 2, 2]);
    expect(salaDe.get(`${D}|9|a`)).toBe(1);
    expect(salaDe.get(`${D}|10|a`)).toBe(1);
    expect(salaDe.get(`${D}|10|b`)).toBe(3); // su sala 1 ya la tiene a, que sigue de la hora anterior
  });

  it("error si en una hora hay más mentores que salas", () => {
    const { errores } = asignarSalas([{ dia: D, hora: 8, mentores: ["a", "b", "c", "d"] }], [1, 2, 3]);
    expect(errores[0]!.mensaje).toContain("4 mentores y solo 3 salas");
  });
});

describe("monitores", () => {
  const horas = [8, 9, 10, 11].map((hora) => ({ dia: D, hora, mentores: ["a", "b"] }));

  it("lo importado manda sobre lo automático y nadie queda en dos salas a la vez", () => {
    const r = planificar(entrada({
      horas,
      importados: [{ fila: 2, dia: D, hora: 8, sala: 1, monitor: "m1" }],
      disponibilidad: [...todoElDia("m1", [8, 9, 10, 11]), ...todoElDia("m2", [8, 9, 10, 11])],
    }));
    expect(r.errores).toEqual([]);
    expect(de(r.plan, 8, "a")).toMatchObject({ sala: 1, monitor: "m1", origen: "importado" });
    expect(de(r.plan, 8, "b")).toMatchObject({ monitor: "m2", origen: "automatico" });
    for (const h of [8, 9, 10, 11]) {
      const enHora = r.plan.filter((p) => p.hora === h).map((p) => p.monitor);
      expect(new Set(enHora).size).toBe(enHora.length);
    }
  });

  it("mantiene al monitor en la misma sala en horas seguidas", () => {
    const r = planificar(entrada({ horas, disponibilidad: [...todoElDia("m1", [8, 9, 10, 11]), ...todoElDia("m2", [8, 9, 10, 11])] }));
    const sala1 = r.plan.filter((p) => p.sala === 1).map((p) => p.monitor);
    expect(new Set(sala1).size).toBe(1);
    expect(r.plan.every((p) => p.monitor)).toBe(true);
  });

  it("reparte la carga: rota cuando otro disponible tiene 2 salas menos", () => {
    const r = planificar(entrada({
      horas: [8, 9, 10, 11].map((hora) => ({ dia: D, hora, mentores: ["a"] })),
      disponibilidad: [...todoElDia("m1", [8, 9, 10, 11]), ...todoElDia("m2", [10, 11])],
    }));
    const carga = (m: string) => r.plan.filter((p) => p.monitor === m).length;
    expect(carga("m1")).toBe(2);
    expect(carga("m2")).toBe(2);
  });

  it("sin disponibilidad la sala queda sin monitor", () => {
    const r = planificar(entrada({ horas: [{ dia: D, hora: 8, mentores: ["a"] }], disponibilidad: todoElDia("m1", [9]) }));
    expect(r.plan[0]).toMatchObject({ monitor: null, origen: null });
  });

  it("errores de la hoja Monitores: sala sin mentor, sala repetida y monitor en dos salas", () => {
    const r = planificar(entrada({
      horas: [{ dia: D, hora: 8, mentores: ["a", "b"] }],
      importados: [
        { fila: 2, dia: D, hora: 8, sala: 3, monitor: "m1" },
        { fila: 3, dia: D, hora: 8, sala: 1, monitor: "m1" },
        { fila: 4, dia: D, hora: 8, sala: 1, monitor: "m2" },
        { fila: 5, dia: D, hora: 8, mentorId: "b", monitor: "m1" },
        { fila: 6, dia: D, hora: 9, mentorId: "a", monitor: "m3" },
      ],
    }));
    expect(r.errores.map((e) => e.fila)).toEqual([2, 4, 5, 6]);
    expect(r.errores[0]!.mensaje).toContain("no tiene mentor");
    expect(r.errores[2]!.mensaje).toContain("ya tiene otra sala");
  });

  it("el cambio manual del admin se conserva si sigue valiendo, y cede ante el archivo", () => {
    const r = planificar(entrada({
      horas: [{ dia: D, hora: 8, mentores: ["a", "b"] }],
      importados: [{ fila: 2, dia: D, hora: 8, mentorId: "b", monitor: "m1" }],
      cambiosAdmin: [{ dia: D, hora: 8, mentorId: "a", monitor: null }, { dia: D, hora: 8, mentorId: "b", monitor: "m2" }, { dia: D, hora: 9, mentorId: "a", monitor: "m2" }],
      disponibilidad: todoElDia("m3", [8]),
    }));
    expect(de(r.plan, 8, "a")).toMatchObject({ monitor: null, origen: "admin" }); // el admin la dejó sin monitor: no se llena sola
    expect(de(r.plan, 8, "b")).toMatchObject({ monitor: "m1", origen: "importado" });
    expect(r.avisos).toHaveLength(1);
  });
});

describe("libro de salas y monitores", () => {
  it("la plantilla se lee sin errores", async () => {
    const r = leerLibroSalas(await leerLibro(await plantilla("salas")));
    expect(r.errores).toEqual([]);
    expect(r.salas.map((s) => s.sala)).toEqual([1, 2, 3]);
    expect(r.monitores[0]).toMatchObject({ dia: D, hora: 8, sala: 1, monitor: "Monitora Ejemplo Uno" });
    expect(r.disponibilidad).toHaveLength(3);
  });

  it("errores típicos: sala fuera de rango, enlace sin https, sala repetida, hora con minutos", () => {
    const r = leerLibroSalas(libro({
      Salas: [["Sala", "Enlace"], [1, "https://a.org/1"], [13, "https://a.org/13"], [2, "meet.a.org/2"], ["Sala 1", "https://a.org/x"]],
      Monitores: [["Día", "Hora", "Mentor", "Monitor"], ["Jueves 12 nov", "8:30", "Mentor Uno", "Ana"], ["Jueves 12 nov", "09 am", "Mentor Uno", "Ana"]],
    }));
    expect(r.errores.map((e) => [e.hoja, e.fila])).toEqual([["Salas", 3], ["Salas", 4], ["Salas", 5], ["Monitores", 2]]);
    expect(r.monitores).toEqual([{ fila: 3, dia: D, hora: 9, mentor: "Mentor Uno", monitor: "Ana" }]);
  });

  it("sin hoja Salas es error; sin hojas de monitores es aviso", () => {
    expect(leerLibroSalas(libro({ Otra: [["x"]] })).errores[0]!.mensaje).toContain("Falta la hoja Salas");
    expect(leerLibroSalas(libro({ Salas: [["Sala", "Enlace"], [1, "https://a.org/1"]] })).avisos).toHaveLength(1);
  });

  it("número de sala", () => {
    expect([leerSala(3), leerSala("Sala 7"), leerSala("8"), leerSala("Sala 12"), leerSala("dos")]).toEqual([3, 7, 8, 12, null]);
    // Tope de 12 (la hoja Salas manda); 0, 13, negativos y decimales se rechazan.
    expect([leerSala(0), leerSala("0"), leerSala(13), leerSala("Sala 13"), leerSala("-1"), leerSala("8.5")]).toEqual([null, null, null, null, null, null]);
  });
});

describe("ruta del proyecto", () => {
  it("reconoce Básica y Avanzada con sinónimos y rechaza otro texto", () => {
    expect([leerRuta("básica"), leerRuta("Basico"), leerRuta("AVANZADA"), leerRuta(null)]).toEqual([{ ruta: "Básica" }, { ruta: "Básica" }, { ruta: "Avanzada" }, null]);
    expect(leerRuta("intermedia")).toMatchObject({ error: expect.stringContaining("Básica o Avanzada") });
  });

  it("el importador lee la columna Ruta", () => {
    const r = leerLibroProyectos(libro({ Proyectos: [[...ENC_PROYECTOS, "Ruta"], ["C1", "Cali", "App", "G1", "1000000001", "Ana Prueba", null, null, "Avanzada"], ["C2", "Cali", "App 2", "G1", "1000000002", "Luis Prueba", null, null, "otra"]] }));
    expect(r.proyectos.map((p) => [p.codigo, p.ruta])).toEqual([["C1", "Avanzada"]]);
    expect(r.errores[0]).toMatchObject({ fila: 3 });
  });

  it("la plantilla de proyectos trae Ruta", async () => {
    const r = leerLibroProyectos(await leerLibro(await plantilla("proyectos")));
    expect(r.proyectos.map((p) => p.ruta)).toEqual(["Básica", "Avanzada"]);
  });
});

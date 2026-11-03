import { describe, expect, it } from "vitest";
import { resumenPorDia } from "@/lib/agenda";
import { leerDia, leerFechaHora, leerHora, leerLibro } from "@/lib/importar/excel";
import { leerLibroMentores } from "@/lib/importar/mentores";
import { plantilla } from "@/lib/importar/plantillas";
import { leerDocumento, leerLibroProyectos } from "@/lib/importar/proyectos";
import { ENC_CUPOS, ENC_PROYECTOS, horarios, libro } from "./helpers/libros";

describe("lectura de celdas", () => {
  it("días en los formatos del Excel", () => {
    expect(leerDia("Jueves 12 nov")).toBe("2026-11-12");
    expect(leerDia("sábado 21 nov")).toBe("2026-11-21");
    expect(leerDia("12/11/2026")).toBe("2026-11-12");
    expect(leerDia("2026-11-12")).toBe("2026-11-12");
    expect(leerDia(new Date(Date.UTC(2026, 10, 13)))).toBe("2026-11-13");
    expect(leerDia("31 nov")).toBeNull();
    expect(leerDia("TOTAL")).toBeNull();
  });

  it("horas de inicio", () => {
    expect(leerHora("08 am – 09 am")).toBe(8);
    expect(leerHora("11 am – 12 pm")).toBe(11);
    expect(leerHora("04 pm – 05 pm")).toBe(16);
    expect(leerHora("12 pm")).toBe(12);
    expect(leerHora("16:00")).toBe(16);
    expect(leerHora("8:30")).toBeNull();
    expect(leerHora("62 bloques")).toBeNull();
  });

  it("fecha y hora de apertura en hora de Colombia", () => {
    expect(leerFechaHora("2026-11-13 14:00")?.toISOString()).toBe("2026-11-13T19:00:00.000Z");
    expect(leerFechaHora("mañana")).toBeNull();
  });

  it("documentos: números de Excel sí, decimales y notación científica no", () => {
    expect(leerDocumento(1234567890)).toEqual({ doc: "1234567890" });
    expect(leerDocumento("1234567890.0")).toEqual({ doc: "1234567890" });
    expect(leerDocumento("1.234.567.890")).toEqual({ doc: "1234567890" });
    expect(leerDocumento(1234567890.5)).toHaveProperty("error");
    expect(leerDocumento("1,23457E+09")).toHaveProperty("error");
    expect(leerDocumento("12")).toHaveProperty("error");
    expect(leerDocumento(null)).toBeNull();
  });
});

describe("plantillas", () => {
  it("la plantilla de proyectos se lee sin errores", async () => {
    const r = leerLibroProyectos(await leerLibro(await plantilla("proyectos")));
    expect(r.errores).toEqual([]);
    expect(r.proyectos.map((p) => [p.codigo, p.ciudad, p.integrantes.length])).toEqual([["P-001", "Cali", 1], ["P-002", "Cartagena", 2]]);
  });

  it("la plantilla de mentores genera asientos por ciudad, con sobrante y Todas", async () => {
    const r = leerLibroMentores(await leerLibro(await plantilla("mentores")));
    expect(r.errores).toEqual([]);
    expect(resumenPorDia(r.asientos)).toEqual([
      { dia: "2026-11-12", asientos: 20, porCiudad: { Cali: 12, Cartagena: 8 } },
      { dia: "2026-11-13", asientos: 12, porCiudad: { Cartagena: 6, Barranquilla: 6 } },
      { dia: "2026-11-17", asientos: 8, porCiudad: { Barranquilla: 4, "Cartagena + Barranquilla + Medellín + Guayaquil + Quito + Bogotá D.C. + Colonia + Paysandú + Panamá": 4 } },
    ]);
    expect(r.cupos.get("2026-11-13")?.find((c) => c.ciudad === "Barranquilla")?.abre?.toISOString()).toBe("2026-11-13T19:00:00.000Z");
  });
});

describe("libro de proyectos con errores típicos", () => {
  const r = leerLibroProyectos(libro({
    Proyectos: [
      ENC_PROYECTOS,
      ["P-1", "Cali", "Uno", null, "1000000001", "ANA PÉREZ", null, null],
      ["P-1", "Cali", "Dos", null, "1000000002", "Luis Gómez", null, null], // código repetido
      ["P-3", "Cali", "Tres", null, "1000000001", "Otra Persona", null, null], // documento repetido
      ["P-4", "Cali", "Cuatro", null, "1000000004", "Sara Ruiz", "1000000005", null], // pareja sin nombre
      ["P-5", "Cali", "Cinco", null, "1000000006", "Juan Díaz", null, "Sin Documento"], // pareja sin documento
      ["P-6", "Montería", "Seis", null, "1000000007", "Eva Sol", null, null], // ciudad desconocida
      ["P-7", "bogota", "Siete", null, 1000000008, "Tomás Ríos", 1000000008, "Tomás Ríos"], // mismo doc dos veces
      [null, null, null, null, null, null, null, null],
    ],
  }));

  it("acepta la fila buena y normaliza el nombre", () => {
    expect(r.proyectos).toHaveLength(1);
    expect(r.proyectos[0]!.integrantes[0]!.nombre).toBe("Ana Pérez");
  });

  it("reporta cada error con su fila", () => {
    const por = (fila: number) => r.errores.filter((e) => e.fila === fila).map((e) => e.mensaje).join(" ");
    expect(por(3)).toMatch(/código P-1 ya está en la fila 2/);
    expect(por(4)).toMatch(/documento 1000000001 ya está en la fila 2/);
    expect(por(5)).toMatch(/Integrante 2: falta el nombre/);
    expect(por(6)).toMatch(/Integrante 2: falta el documento/);
    expect(por(7)).toMatch(/Ciudad desconocida/);
    expect(por(8)).toMatch(/mismo documento/);
    expect(r.errores.some((e) => e.fila === 9)).toBe(false); // fila vacía
  });

  it("sin la hoja Proyectos, un solo error claro", () => {
    expect(leerLibroProyectos(libro({ Hoja1: [["x"]] })).errores[0]!.mensaje).toMatch(/Falta la hoja Proyectos/);
  });
});

describe("libro de mentores", () => {
  // Jueves 12 con 32 mentores-hora → 128 asientos, como en la pestaña "Proyectos por franja".
  const horas12 = horarios([{ dia: "Jueves 12 nov", horas: [8, 9, 10, 11, 16, 17, 18, 19], mentores: 4 }]);
  const leer = (cupos: (string | number | null)[][], h = horas12) => leerLibroMentores(libro({ Horarios: h, Cupos: [ENC_CUPOS, ...cupos] }));

  it("guía 2026: Cali 77 con sobrante y Cartagena 51 llenan el jueves", () => {
    const r = leer([["Jueves 12 nov", "Cali", 77, "x", null], ["Jueves 12 nov", "Cartagena", 51, null, null]]);
    expect(r.errores).toEqual([]);
    expect(resumenPorDia(r.asientos)[0]!.porCiudad).toEqual({ Cali: 77, Cartagena: 51 });
  });

  it("Cali mínimo 80 + sobrante, Cartagena máximo 40", () => {
    const r = leer([["Jueves 12 nov", "Cali", 80, "x", null], ["Jueves 12 nov", "Cartagena", 40, null, null]]);
    expect(resumenPorDia(r.asientos)[0]!.porCiudad).toEqual({ Cali: 88, Cartagena: 40 });
  });

  it("sin ciudad de sobrante, lo que sobra queda sin ciudad y se avisa", () => {
    const r = leer([["Jueves 12 nov", "Cali", 80, null, null], ["Jueves 12 nov", "Cartagena", 40, null, null]]);
    expect(resumenPorDia(r.asientos)[0]!.porCiudad).toEqual({ Cali: 80, Cartagena: 40, "(sin ciudad)": 8 });
    expect(r.avisos.map((a) => a.mensaje).join()).toMatch(/sobran 8 asientos sin ciudad/);
  });

  it("errores de cupos: exceso, dos sobrantes, sin cupos, clausura, día sin mentores", () => {
    const r = leer([
      ["Jueves 12 nov", "Cali", 100, null, null],
      ["Jueves 12 nov", "Cartagena", 40, "x", null],
      ["Jueves 12 nov", "Barranquilla", null, "x", null],
      ["Jueves 12 nov", "Medellín", null, null, null],
      ["Martes 17 nov", "Cali", 10, null, null],
      ["Martes 17 nov", "Cartagena", 10, null, null],
      ["Jueves 12 nov", "Quito", "muchos", null, null],
    ]);
    const msgs = r.errores.map((e) => e.mensaje).join("\n");
    expect(msgs).toMatch(/ya tiene otra ciudad de sobrante/);
    expect(msgs).toMatch(/Falta Cupos/);
    expect(msgs).toMatch(/Cali ya tuvo su clausura/);
    expect(msgs).toMatch(/2026-11-17 tiene cupos pero ningún mentor/);
    expect(msgs).toMatch(/superan los asientos del día \(128\)/);
    expect(msgs).toMatch(/número entero/);
    expect(r.asientos).toEqual([]); // con errores no se generan asientos
  });

  it("aviso si un mentor de Horarios no está en Mentores, y si N° mentores no cuadra", () => {
    const h = horarios([{ dia: "Jueves 12 nov", horas: [8], mentores: 2 }]);
    h[1]![h[1]!.length - 1] = 3;
    const r = leerLibroMentores(libro({ Mentores: [["N°", "Nombre del mentor", "Correo", "Celular"], ["M1", "Mentor Prueba 1", "m1@ejemplo.org", "300"]], Horarios: h, Cupos: [ENC_CUPOS, ["Jueves 12 nov", "Cali", null, "x", null]] }));
    expect(r.mentores.find((m) => m.nombre === "Mentor Prueba 1")?.correo).toBe("m1@ejemplo.org");
    expect(r.avisos.map((a) => a.mensaje).join("\n")).toMatch(/"Mentor Prueba 2" está en Horarios pero no en Mentores/);
    expect(r.avisos.map((a) => a.mensaje).join("\n")).toMatch(/dice 3, pero hay 2/);
  });

  it("ignora la fila TOTAL y los resúmenes de abajo", () => {
    const h = horarios([{ dia: "Jueves 12 nov", horas: [8], mentores: 1 }]);
    h.push(["TOTAL", "1 bloques", null, 1], [null, null], ["Jueves 12 nov", "9"]);
    const r = leer([["Jueves 12 nov", "Cali", null, "x", null]], h);
    expect(r.errores).toEqual([]);
    expect(r.asientos).toHaveLength(4);
  });

  it("faltan hojas", () => {
    expect(leerLibroMentores(libro({ Horarios: horas12 })).errores[0]!.mensaje).toMatch(/Falta la hoja Cupos/);
  });
});

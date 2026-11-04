import { describe, expect, it } from "vitest";
import { CRITERIOS_DEFECTO, ITEMS_A, type PartesA } from "@/lib/evaluacion/criterios";
import { mensajeEstudiante, tablero, type FilaEstudiante } from "@/lib/evaluacion/tablero";

// Seguimiento general (Paso 15): tablas y mensaje para el estudiante, copiados del prototipo. Datos INVENTADOS.

const A = (v: "si" | "no"): PartesA => Object.fromEntries(ITEMS_A.map(([k]) => [k, v]));
const ev = (o: Partial<NonNullable<FilaEstudiante["ev"]>> = {}): FilaEstudiante["ev"] => ({ a: A("si"), b: { b1: 4, b2: 4 }, noPresento: false, destacado: false, fortaleza: "", mejora: "", percepcion: "", ...o });
let n = 0;
const fila = (o: Partial<FilaEstudiante> = {}): FilaEstudiante => ({
  proyectoId: `p${++n}`, codigo: `C${n}`, nombre: `Ana ${n} Prueba`, documento: `${n}`, correo: "", celular: "", ciudad: "Cali", ruta: "Básica", pareja: null,
  proyecto: "Huerta", descripcion: "", dia: "2026-11-12", hora: "8:00 a. m.", sala: 1, mentor: "Mentor A", monitor: "Monitora A", ev: null, motivo: null, observacion: "", ...o,
});

describe("mensaje para el estudiante", () => {
  it("solo si quedó Aprobado o Excelente; con fortaleza, mejora, percepción, destacado y pareja", () => {
    expect(mensajeEstudiante(fila(), CRITERIOS_DEFECTO)).toEqual({ asunto: "", mensaje: "" });
    expect(mensajeEstudiante(fila({ ev: ev({ noPresento: true }) }), CRITERIOS_DEFECTO)).toEqual({ asunto: "", mensaje: "" });
    const m = mensajeEstudiante(fila({ nombre: "Luisa Prueba", pareja: { nombre: "Sara Prueba", documento: "2" }, ev: ev({ fortaleza: "Explicó muy bien.", mejora: "Probar en celular.", percepcion: "¡Bien!", destacado: true }) }), CRITERIOS_DEFECTO);
    expect(m.asunto).toBe("¡Felicitaciones por tu proyecto final, Luisa! · Jóvenes creaTIvos");
    expect(m.mensaje).toContain("¡Felicitaciones por presentar tu proyecto final, Huerta, junto a Sara!");
    expect(m.mensaje).toContain("Tu resultado: Excelente. Tu aplicación funciona");
    expect(m.mensaje).toContain("Lo que hicieron muy bien:\nExplicó muy bien.");
    expect(m.mensaje).toContain("nominado como uno de los proyectos destacados");
    expect(m.mensaje.endsWith("Mentor A\nEquipo Jóvenes creaTIvos")).toBe(true);
  });

  it("Incompleto no lleva mensaje; Aprobado sí, en singular si es individual", () => {
    expect(mensajeEstudiante(fila({ ev: ev({ b: { b1: 3 } }) }), CRITERIOS_DEFECTO)).toEqual({ asunto: "", mensaje: "" }); // 1 tema de B
    const m = mensajeEstudiante(fila({ ev: ev({ a: A("no"), fortaleza: "Buen catálogo." }) }), CRITERIOS_DEFECTO);
    expect(m.mensaje).toContain("Tu resultado: Aprobado. Cumpliste con el proyecto final");
    expect(m.mensaje).toContain("Lo que hiciste muy bien:\nBuen catálogo.");
    expect(m.mensaje).not.toContain("junto a");
  });
});

describe("Excel sin fórmulas", () => {
  it("el texto que empieza con = + - @ va con apóstrofo; lo demás igual", async () => {
    const { sinFormula } = await import("@/lib/evaluacion/resultados");
    expect(["=HYPERLINK(1)", "+57 300", "-1", "@x", "Ana", 4, "8:00 a. m."].map(sinFormula)).toEqual(["'=HYPERLINK(1)", "'+57 300", "'-1", "'@x", "Ana", 4, "8:00 a. m."]);
  }, 20_000); // importar resultados (exceljs y la base) tarda más que el límite de 5 s cuando corren todas las pruebas
});

describe("tablero", () => {
  it("KPIs, grupos fijos (Básica/Avanzada, Individual/En pareja), parejas, inasistencias por monitor, día y mentor", () => {
    const pareja = { nombre: "Otro", documento: "x" };
    const filas = [
      fila({ ev: ev(), ruta: "Avanzada", ciudad: "Cartagena" }), // Excelente
      fila({ ev: ev({ a: A("no") }) }), // Aprobado
      fila({ ev: ev({ noPresento: true, a: {}, b: {} }), motivo: "Salud", monitor: "Monitor B" }),
      fila({ ev: ev({ noPresento: true, a: {}, b: {} }), monitor: "Monitor B" }), // sin motivo
      fila({ dia: null, mentor: "Sin asignar", monitor: "Sin monitor" }), // pendiente, sin hora
      { ...fila({ proyectoId: "par", pareja, ev: ev() }) }, { ...fila({ proyectoId: "par", pareja, ev: ev({ a: A("no") }) }) },
    ];
    const t = tablero(filas, CRITERIOS_DEFECTO);
    expect(t.kpis).toMatchObject({ evaluados: 6, estudiantes: 7, proyectos: 6, excelentes: 2, noSePresentaron: 2, destacados: 0 });
    expect(t.kpis.pctExcelentes).toBeCloseTo(2 / 4);
    expect(t.resultados.find((r) => r.res === "Pendiente")?.n).toBe(1);
    expect(t.porRuta.map((g) => g.grupo).sort()).toEqual(["Avanzada", "Básica"]);
    expect(t.porModalidad.find((g) => g.grupo === "En pareja")).toMatchObject({ estudiantes: 2, evaluados: 2, excelentes: 0.5 });
    expect(t.parejas).toEqual({ ambos: 0, uno: 1, ninguno: 0 });
    expect(t.inasistencias).toMatchObject({ total: 2, conMotivo: 1, motivos: [{ motivo: "Salud", n: 1 }] });
    expect(t.inasistencias.porMonitor.find((m) => m.monitor === "Monitor B")).toEqual({ monitor: "Monitor B", estudiantes: 2, noSePresentaron: 2, conMotivo: 1, sinMotivo: 1 });
    expect(t.porDia.at(-1)).toEqual({ dia: null, programados: 1, evaluados: 0, noSePresentaron: 0, avance: 0 });
    expect(t.parteA[0]).toMatchObject({ n: 4, si: 0.5 }); // los No se presentó no cuentan en A
    expect(t.porMentor.find((m) => m.mentor === "Mentor A")).toMatchObject({ asignados: 6, evaluados: 6 });
  });

  it("Incompleto cuenta como evaluado pero no como excelente; Parte B, listas y promedios por mentor", () => {
    const filas = [fila({ ev: ev({ b: { b1: 3 } }) }), fila({ ev: ev({ b: { b1: 4, b2: 1 }, destacado: true, fortaleza: "Muy bien" }) })];
    const t = tablero(filas, CRITERIOS_DEFECTO);
    expect(t.kpis).toMatchObject({ evaluados: 2, excelentes: 0, avance: 1 });
    expect(t.porCiudad[0]).toMatchObject({ grupo: "Cali", evaluados: 2, excelentes: 0 }); // como el prototipo: el Incompleto cuenta como evaluado
    expect(t.parteB[0]).toMatchObject({ promedio: 3.5, n: 2 });
    expect(t.destacados).toEqual([{ nombre: filas[1]!.nombre, proyecto: "Huerta", mentor: "Mentor A", res: "Aprobado", fortaleza: "Muy bien" }]);
    expect(t.excelentes).toEqual([]);
    expect(t.porMentor[0]).toMatchObject({ funciona: 1, nivel: 2.75 });
  });

  it("los criterios cambian quién es Excelente", () => {
    const filas = [fila({ ev: ev({ b: { b1: 3, b2: 3 } }) })];
    expect(tablero(filas, CRITERIOS_DEFECTO).kpis.excelentes).toBe(1);
    expect(tablero(filas, { exA: 0.9, exB: 3.5 }).kpis.excelentes).toBe(0);
  });
});

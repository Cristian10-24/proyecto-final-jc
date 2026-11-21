import { describe, expect, it } from "vitest";
import { ALTO, ANCHO, ESCALA, encabezado, escena, RC, textoNoPresentados } from "@/components/evaluacion/seguimiento/escenaReporte";
import { consulta, delta, diaCorto, diaLargo, diaSemana, escribirUrl, ESTADO_VACIO, leerUrl, nf, nFiltros, P } from "@/components/evaluacion/seguimiento/formato";
import type { Reporte } from "@/lib/evaluacion/seguimientoV2";

// Seguimiento v2 · formatos, estado en la URL y escena del reporte del día. Datos INVENTADOS.

describe("formatos", () => {
  it("fechas, porcentajes y decimales con coma", () => {
    expect(diaCorto("2026-11-21")).toBe("21 nov");
    expect(diaSemana("2026-11-21")).toBe("Sábado 21 nov");
    expect(diaLargo("2026-11-12")).toBe("Jueves 12 de noviembre");
    expect(P(0.384)).toBe("38 %");
    expect(P(null)).toBe("—");
    expect(nf(2.46)).toBe("2,5");
    expect(nf(null)).toBe("—");
  });
  it("cambio frente al día anterior: hoy, otro día o nada", () => {
    const dias = ["2026-11-12", "2026-11-13", "2026-11-18"];
    expect(delta([3, 7, 9], dias, "2026-11-18")).toBe("+2 hoy");
    expect(delta([30, 25, 25], dias, "2026-11-13", true)).toBe("−5 pts hoy");
    expect(delta([3, 7, 9], dias, "2026-11-15")).toBe("+4 el 13 nov");
    expect(delta([3, 7, 9], dias, "2026-11-01")).toBeNull();
  });
});

describe("estado en la URL", () => {
  it("ida y vuelta; valores extraños se ignoran", () => {
    const e = { ...ESTADO_VACIO, seccion: "inasistencias" as const, dia: "2026-11-18", ciudad: "Cali", ruta: "Básica", modalidad: "pareja", q: "café", modo: "proy" as const, repDia: "todos" };
    expect(leerUrl(escribirUrl(e))).toEqual(e);
    expect(leerUrl("?seccion=x&dia=ayer&ruta=Otra&modalidad=trio&modo=raro")).toEqual(ESTADO_VACIO);
    expect(escribirUrl(ESTADO_VACIO)).toBe("");
    expect(consulta({ ...e, seccion: "resumen" })).toBe("dia=2026-11-18&ciudad=Cali&ruta=B%C3%A1sica&modalidad=pareja&q=caf%C3%A9&modo=proy");
    expect(nFiltros(e)).toBe(5);
  });
});

const R: Reporte & { dias: string[] } = {
  dia: "2026-11-20", ciudades: 7, dias: ["2026-11-12", "2026-11-20"],
  e: { tot: 116, pres: 109, nsp: 7, pend: 0, exc: 18 },
  p: { tot: 90, pres: 86, exc: 15, apr: 71, des: 14, nsp: 4, nspIndividual: 4, nspPareja: 0, pend: 0 },
  porCiudad: [{ ciudad: "Bogotá D.C.", proyectos: 28, presentados: 26, noPresentados: 2, pendientes: 0, estudiantes: 34 }, { ciudad: "Medellín", proyectos: 15, presentados: 15, noPresentados: 0, pendientes: 0, estudiantes: 20 }],
  noAsistieron: [{ ciudad: "Bogotá D.C.", n: 3 }, { ciudad: "Guayaquil", n: 2 }, { ciudad: "Medellín", n: 1 }, { ciudad: "Paysandú", n: 1 }],
};
const textos = (E: ReturnType<typeof escena>) => E.flatMap((e) => (e.t === "tx" ? [e.runs ? e.runs.map((r) => r.t).join("") : e.txt] : []));

describe("reporte del día (escena 16:9)", () => {
  it("imagen de 3840 × 2160", () => {
    expect(Math.round(ANCHO * ESCALA)).toBe(3840);
    expect(Math.round(ALTO * ESCALA)).toBe(2160);
  });
  it("los textos del reporte que se envía (20 de noviembre)", () => {
    const t = textos(escena(R, "2026-11-21"));
    expect(t).toEqual(expect.arrayContaining([
      "Jóvenes creaTIvos", "Reporte de evaluación", "Viernes 20 de noviembre de 2026", "Siete ciudades", "109 / 116", "86 / 90",
      "proyectos presentados", "Proyectos presentados por ciudad", "26 / 28 · 34 estudiantes", "No presentados: 4, todos individuales",
      "Asistencia de estudiantes", "94 %", "109 asistieron", "7 no asistieron", "3 de Bogotá D.C.", "2 de Guayaquil",
    ]));
    expect(t.join(" ")).toContain("Evaluados = se presentaron y fueron");
    expect(t.join(" ")).toMatch(/proyectos excelentes \(18\s+estudiantes\) y 71\s+aprobados|proyectos excelentes \(18 estudiantes\) y 71 aprobados/);
  });
  it("todo cabe en el lienzo", () => {
    for (const e of escena(R, "2026-11-21")) if (e.t === "r") { expect(e.x + e.w).toBeLessThanOrEqual(ANCHO); expect(e.y + e.h).toBeLessThanOrEqual(ALTO); }
  });
  it("hoy en curso: pendientes en gris y «en curso»; acumulado: «Del … al …»", () => {
    const hoy = { ...R, dia: "2026-11-21", p: { ...R.p, pend: 3 }, porCiudad: [{ ...R.porCiudad[0], pendientes: 3 }] };
    const E = escena(hoy, "2026-11-21");
    expect(textos(E)).toContain("Pendientes por evaluar: 3");
    expect(E.some((e) => e.t === "r" && e.fill === RC.gr2)).toBe(true);
    expect(encabezado(hoy, "2026-11-21").sub).toBe("Siete ciudades · en curso");
    expect(encabezado({ ...R, dia: null }, "2026-11-21")).toEqual({ fecha: "Del 12 al 20 de noviembre de 2026", sub: "Siete ciudades · acumulado" });
  });
  it("no presentados individuales y en pareja", () => {
    expect(textoNoPresentados({ ...R, p: { ...R.p, nsp: 3, nspIndividual: 1, nspPareja: 2 } })).toBe("No presentados: 3 (1 individual y 2 en pareja)");
    expect(textoNoPresentados({ ...R, p: { ...R.p, nsp: 0, nspIndividual: 0 } })).toBe("No presentados: 0");
  });
});

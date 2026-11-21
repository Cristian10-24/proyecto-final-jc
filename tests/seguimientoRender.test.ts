import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Criterios from "@/components/evaluacion/seguimiento/Criterios";
import Inasistencias from "@/components/evaluacion/seguimiento/Inasistencias";
import Mentores from "@/components/evaluacion/seguimiento/Mentores";
import Resultados from "@/components/evaluacion/seguimiento/Resultados";
import Resumen from "@/components/evaluacion/seguimiento/Resumen";
import { CRITERIOS_DEFECTO as CR, ITEMS_A, type PartesA } from "@/lib/evaluacion/criterios";
import type { SeguimientoV2 } from "@/lib/evaluacion/resultados";
import { agendadas, filtrarBase, paresAB, parejas, sinAgendar, sinAgendarFilas, vistaModo, type FiltroV2, type Modo } from "@/lib/evaluacion/seguimientoV2";
import type { FilaEstudiante } from "@/lib/evaluacion/tablero";

// Seguimiento v2 · render de cada sub-sección (escritorio y celular) y la regla de conteo en todos los bloques:
// los sin agendar SOLO aparecen en el bloque «Sin agendar» de Inasistencias. Datos INVENTADOS.

const A = (v: "si" | "no"): PartesA => Object.fromEntries(ITEMS_A.map(([k]) => [k, v]));
type Ev = NonNullable<FilaEstudiante["ev"]>;
const EXC: Ev = { a: A("si"), b: { b1: 4, b2: 4, b3: 3 }, noPresento: false, destacado: false, fortaleza: "", mejora: "", percepcion: "" };
const APR: Ev = { ...EXC, a: A("no"), b: { b1: 2, b2: 1 } };
const NSP: Ev = { ...EXC, a: {}, b: {}, noPresento: true };
let n = 0;
const fila = (o: Partial<FilaEstudiante> = {}): FilaEstudiante => ({
  proyectoId: `p${++n}`, codigo: `C${n}`, nombre: `Agendada ${n}`, documento: `${n}`, correo: "", celular: "", ciudad: "Cali", ruta: "Básica", pareja: null,
  proyecto: `Proyecto ${n}`, descripcion: "", dia: "2026-11-12", hora: "8:00 a. m.", sala: 1, mentor: `Mentor ${n % 4}`, monitor: "Monitora A", ev: null, motivo: null, observacion: "", ...o,
});
const FILAS: FilaEstudiante[] = [
  ...[1, 2, 3, 4, 5, 6].map((i) => fila({ ev: i % 3 ? EXC : APR, ciudad: i % 2 ? "Cali" : "Medellín", ruta: i % 2 ? "Básica" : "Avanzada", dia: i < 4 ? "2026-11-12" : "2026-11-13" })),
  fila({ ev: { ...EXC, destacado: true, fortaleza: "Demo sin fallas" } }),
  fila({ ev: NSP, motivo: "Salud" }), fila({ ev: NSP }),
  fila({ proyectoId: "par", nombre: "Ana Pareja", pareja: { nombre: "Beto Pareja", documento: "b" }, ev: EXC }),
  fila({ proyectoId: "par", nombre: "Beto Pareja", pareja: { nombre: "Ana Pareja", documento: "a" }, ev: APR }),
  // Sin agendar
  fila({ dia: null, hora: "", nombre: "Zoe Sinfecha", proyecto: "Huerta sin hora", mentor: "Sin asignar", monitor: "Sin monitor" }),
  fila({ dia: null, hora: "", nombre: "Iker Sinfecha", proyecto: "Taller sin hora", mentor: "Sin asignar", monitor: "Sin monitor", ciudad: "Medellín" }),
];

function datos(f: FiltroV2 = {}, modo: Modo = "est"): SeguimientoV2 {
  const base = filtrarBase(FILAS, f), ag = agendadas(base), dia = f.dia ? ag.filter((x) => x.dia === f.dia) : ag;
  return {
    hoy: "2026-11-13", dias: ["2026-11-12", "2026-11-13"], ciudades: ["Cali", "Medellín"], criterios: CR,
    est: vistaModo(dia, ag, CR, "est", new Set(), modo === "est"), proy: vistaModo(dia, ag, CR, "proy", new Set(), modo === "proy"), parejas: parejas(dia, CR),
    cupos: { ofrecidos: 4, ocupados: 1, libres: 3, porDia: [{ dia: "2026-11-13", ocupados: 1, libres: 3 }], porMentor: [{ mentor: "Mentor 1", libres: 3 }] },
    cuposHoy: { desde: "11:40 a. m.", porHora: [{ hora: "2:00 p. m.", ocupados: 1, libres: 3 }], ocupados: 1, libres: 3 },
    sinAgendar: sinAgendar(sinAgendarFilas(base)), sinProyecto: [{ ciudad: "Cali", participantes: 2, proyectos: 1, estudiantes: 1 }], paresAB: paresAB(dia, CR),
  };
}
const html = (c: unknown, p: object) => renderToStaticMarkup(createElement(c as React.FC<object>, p));
const SECCIONES = { Resumen, Resultados, Inasistencias, Mentores } as const;
const props = (d: SeguimientoV2, modo: Modo, movil: boolean) => ({ d, modo, movil, dia: "", ciudad: "", onIrSinAgendar: () => {} });

describe("render de cada sub-sección", () => {
  for (const movil of [false, true]) for (const modo of ["est", "proy"] as const) {
    it(`${movil ? "celular" : "escritorio"} · ${modo}`, () => {
      const d = datos({}, modo);
      for (const [nombre, C] of Object.entries(SECCIONES)) expect(html(C, props(d, modo, movil)).length, nombre).toBeGreaterThan(300);
      expect(html(Criterios, { inicial: CR, pares: d.paresAB, editable: true, onGuardado: () => {} })).toContain("Guardar criterios");
    });
  }
  it("Resumen: textos del diseño y la nota de «evaluados»", () => {
    const t = html(Resumen, props(datos(), "est", false));
    for (const x of ["estudiantes evaluados", "incluye a quienes no se presentaron", "Estudiantes agendados", "de avance", "de los que se presentaron fueron excelentes", "resultados excelentes", "no se presentaron", "estudiantes destacados", "Quedan 3 cupos libres hoy para reprogramar", "Ver sin agendar", "cupos desde ahora"])
      expect(t).toContain(x);
    const p = html(Resumen, props(datos({}, "proy"), "proy", false));
    expect(p).toContain("Proyectos agendados");
    expect(p).toContain("proyectos evaluados");
  });
  it("Resultados: radar en escritorio y barras en el celular", () => {
    expect(html(Resultados, props(datos(), "est", false))).toContain("Radar de criterios de la Parte A");
    expect(html(Resultados, props(datos(), "est", true))).not.toContain("Radar de criterios de la Parte A");
  });
  it("Criterios: vista previa y solo lectura sin permiso", () => {
    const d = datos();
    expect(html(Criterios, { inicial: CR, pares: d.paresAB, editable: true, onGuardado: () => {} })).toContain(`quedarían <b>${d.est.c.exc} estudiantes excelentes`);
    const ro = html(Criterios, { inicial: CR, pares: d.paresAB, editable: false, onGuardado: () => {} });
    expect(ro).not.toContain("Guardar criterios");
    expect(ro).toContain("disabled");
  });
});

describe("regla de conteo en todos los bloques", () => {
  const SIN = ["Zoe Sinfecha", "Iker Sinfecha", "Huerta sin hora", "Taller sin hora"];
  for (const modo of ["est", "proy"] as const) {
    it(`los sin agendar solo salen en «Sin agendar» (${modo})`, () => {
      const d = datos({}, modo);
      for (const [nombre, C] of Object.entries(SECCIONES)) {
        let t = html(C, props(d, modo, false));
        if (nombre === "Inasistencias") { expect(t).toContain("No cuentan en las estadísticas"); t = t.slice(0, t.indexOf('id="sin-agendar"')); }
        for (const x of SIN) expect(t, `${nombre} · ${x}`).not.toContain(x);
        expect(t, nombre).not.toContain("Sin asignar</b>");
      }
      expect(d[modo].c.tot).toBe(modo === "est" ? 11 : 10);
    });
  }
  it("el bloque «Sin agendar» lista sus proyectos y respeta ciudad, no el día", () => {
    expect(html(Inasistencias, props(datos(), "est", false))).toContain("1. Sin día ni hora: 2 proyectos · 2 estudiantes");
    expect(html(Inasistencias, props(datos({ ciudad: "Medellín", dia: "2026-11-12" }), "est", false))).toContain("1. Sin día ni hora: 1 proyecto · 1 estudiante");
  });
  it("«Contar por» proyectos: la pareja cuenta una vez", () => {
    const d = datos({}, "proy");
    expect(d.proy.c.tot).toBe(d.est.c.tot - 1);
  });
});

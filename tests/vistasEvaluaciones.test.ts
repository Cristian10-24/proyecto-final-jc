import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GrupoMovil, GrupoWeb } from "@/components/evaluacion/MentorPanel";
import type { FilaEvaluacion, ResultadoIntegrante } from "@/lib/evaluacion/datos";
import {
  accionFila, agruparEval, diaEval, escribirFiltrosEval, filtrarBaseEval, filtrarEstadoEval, FILTROS_EVAL_VACIOS, leerFiltrosEval,
  monitoresEval, OPCIONES_ESTADO, resumenEval,
} from "@/lib/vistas/listaEvaluaciones";

// Vistas del mentor · Paso 2: «Mis evaluaciones» y «Evaluaciones» (filtros en la URL, estado, resumen, bloques, render).

const D = "2026-11-12", D2 = "2026-11-13";
const iso = (dia: string, h: number, m: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + ((h + 5) * 60 + m) * 60_000).toISOString(); // COL = UTC-5
const int = (i: number, nombre: string, res: ResultadoIntegrante["res"], motivo?: string): ResultadoIntegrante =>
  ({ i, nombre, res, a: null, b: null, nb: 0, ...(motivo ? { motivo: motivo as ResultadoIntegrante["motivo"] } : {}) });
const MON = { nombre: "Valeria Monitora", celular: "3104456789" };
const fila = (id: string, dia: string, h: number, m: number, ints: ResultadoIntegrante[], extra: Partial<FilaEvaluacion> = {}): FilaEvaluacion => ({
  id, codigo: `C-${id}`, proyecto: `Proyecto ${id}`, ciudad: "Cali", ruta: "Básica", dia, inicio: iso(dia, h, m), mentorId: "m1",
  pareja: ints.length > 1, sala: 2, enlace: "https://meet.example.test/2", monitor: MON, integrantes: ints, destacado: false, borrador: false, ...extra,
});
const FILAS: FilaEvaluacion[] = [
  fila("a", D, 19, 0, [int(0, "Camilo Rueda", "Aprobado")]),
  fila("b", D, 19, 15, [int(0, "Yesenia Mosquera", "Excelente")], { destacado: true }),
  fila("c", D, 19, 30, [int(0, "Óscar Pardo", "No se presentó")]),
  fila("d", D, 19, 45, [int(0, "Laura Ríos", "Pendiente"), int(1, "Juan Cruz", "No se presentó", "Salud")], { borrador: true }),
  fila("e", D, 20, 0, [int(0, "Diana Vega", "Pendiente")], { monitor: { nombre: "Santiago Lemus", celular: null } }),
  fila("f", D2, 15, 0, [int(0, "Martina Silva", "Incompleto")], { ciudad: "Paysandú", sala: undefined, enlace: undefined, monitor: null, mentorId: "m2" }),
];

describe("filtros en la URL", () => {
  it("ida y vuelta, y valores desconocidos ignorados", () => {
    const f = { ...FILTROS_EVAL_VACIOS, dia: D, estado: "evaluados" as const, monitor: "Valeria Monitora", q: "laura" };
    expect(leerFiltrosEval(escribirFiltrosEval(f))).toEqual(f);
    expect(escribirFiltrosEval(FILTROS_EVAL_VACIOS)).toBe("");
    expect(leerFiltrosEval("?dia=ayer&estado=ahora&sala=3")).toEqual(FILTROS_EVAL_VACIOS);
  });
  it("día por defecto: hoy si hay presentaciones hoy; si no, todas las fechas", () => {
    expect(diaEval(FILTROS_EVAL_VACIOS, [D, D2], D2)).toBe(D2);
    expect(diaEval(FILTROS_EVAL_VACIOS, [D, D2], "2026-11-20")).toBe("todos");
    expect(diaEval({ ...FILTROS_EVAL_VACIOS, dia: D }, [D, D2], D2)).toBe(D);
  });
  it("Estado: las del prototipo + «Inasistencias sin motivo registrado»", () => {
    expect(OPCIONES_ESTADO.map((o) => o.texto)).toEqual(["Todos los estados", "Pendientes", "Evaluados", "No se presentó", "Destacados", "Inasistencias sin motivo registrado"]);
  });
});

describe("filtrar", () => {
  const ids = (x: FilaEvaluacion[]) => x.map((y) => y.id);
  it("Evaluados y Destacados listan todo lo evaluado (de cualquier día con «todas las fechas»)", () => {
    expect(ids(filtrarEstadoEval(FILAS, "evaluados"))).toEqual(["a", "b", "f"]);
    expect(ids(filtrarEstadoEval(FILAS, "destacados"))).toEqual(["b"]);
    expect(ids(filtrarEstadoEval(FILAS, "pendientes"))).toEqual(["d", "e"]);
    expect(ids(filtrarEstadoEval(FILAS, "ausentes"))).toEqual(["c", "d"]);
    expect(ids(filtrarEstadoEval(FILAS, "sinMotivo"))).toEqual(["c"]);
    expect(ids(filtrarEstadoEval(FILAS, ""))).toEqual(ids(FILAS));
  });
  it("Monitor (nombre o «sin»), mentor, ciudad, día y buscador (sin tildes; también código)", () => {
    const f = FILTROS_EVAL_VACIOS;
    expect(ids(filtrarBaseEval(FILAS, { ...f, monitor: "Santiago Lemus" }, "todos"))).toEqual(["e"]);
    expect(ids(filtrarBaseEval(FILAS, { ...f, monitor: "sin" }, "todos"))).toEqual(["f"]);
    expect(ids(filtrarBaseEval(FILAS, { ...f, mentor: "m2" }, "todos"))).toEqual(["f"]);
    expect(ids(filtrarBaseEval(FILAS, { ...f, ciudad: "Paysandú" }, "todos"))).toEqual(["f"]);
    expect(ids(filtrarBaseEval(FILAS, f, D2))).toEqual(["f"]);
    expect(ids(filtrarBaseEval(FILAS, { ...f, q: "oscar" }, "todos"))).toEqual(["c"]);
    expect(ids(filtrarBaseEval(FILAS, { ...f, q: "C-e" }, "todos"))).toEqual(["e"]);
  });
  it("opciones del filtro Monitor", () => {
    expect(monitoresEval(FILAS)).toEqual({ nombres: ["Santiago Lemus", "Valeria Monitora"], hayVacios: true });
  });
});

describe("resumen y acción", () => {
  it("por persona: evaluados, no se presentaron, pendientes y % listo", () => {
    expect(resumenEval(FILAS)).toEqual({ estudiantes: 7, evaluados: 3, ausentes: 2, pendientes: 2, pct: 71 });
    expect(resumenEval([])).toMatchObject({ estudiantes: 0, pct: 0 });
  });
  it("Evaluar si alguien está pendiente; si no, Revisar; coordinación siempre Ver", () => {
    expect(accionFila(FILAS[3]!, false)).toBe("Evaluar");
    expect(accionFila(FILAS[0]!, false)).toBe("Revisar");
    expect(accionFila(FILAS[2]!, false)).toBe("Revisar");
    expect(accionFila(FILAS[3]!, true)).toBe("Ver");
  });
});

describe("agrupar por día y bloque", () => {
  it("horas seguidas de la misma sala, mentor y monitor = un bloque; otro monitor = otro bloque", () => {
    const g = agruparEval(FILAS);
    expect(g.map((d) => d.dia)).toEqual([D, D2]);
    expect(g[0]!.bloques.map((b) => [b.sala, b.desde, b.hasta, b.monitor?.nombre, b.filas.map((x) => x.id).join("")])).toEqual([
      [2, 19, 20, "Valeria Monitora", "abcd"], [2, 20, 21, "Santiago Lemus", "e"],
    ]);
    expect(g[1]!.bloques[0]).toMatchObject({ sala: null, monitor: null });
  });
});

describe("render de los grupos (web y móvil)", () => {
  const props = (verTodos: boolean) => ({ verTodos, nombreMentor: new Map([["m1", "Julián Restrepo"], ["m2", "Paola Lozano"]]), soloLectura: () => verTodos, onAbrir: () => {} });
  const [dia1, dia2] = agruparEval(FILAS);
  const web = (b = dia1!.bloques[0]!, verTodos = false) => renderToStaticMarkup(createElement(GrupoWeb, { b, ...props(verTodos) }));
  const movil = (b = dia1!.bloques[0]!, verTodos = false) => renderToStaticMarkup(createElement(GrupoMovil, { b, ...props(verTodos) }));

  it("cabecera: sala y horas, n proyectos, monitor a cargo con Llamar y WhatsApp sin texto, Abrir sala", () => {
    const h = web();
    expect(h).toContain("Sala 2 · 7:00 a 8:00 p. m.");
    expect(h).toContain("4 proyectos");
    expect(h).toContain("Monitor a cargo");
    expect(h).toContain("Valeria Monitora");
    expect(h).toContain('href="tel:+573104456789"');
    expect(h).toContain('href="https://wa.me/573104456789"');
    expect(h).toContain("Abrir sala");
    expect(h).not.toContain("Mentor:");
  });
  it("chips por integrante en pareja, destacado, motivo y borrador; Evaluar o Revisar", () => {
    const h = web();
    expect(h).toContain("Laura: Pendiente");
    expect(h).toContain("Juan: No se presentó");
    expect(h).toContain("Juan: Motivo: Salud");
    expect(h).toContain("★ Destacado");
    expect(h).toContain("Borrador sin guardar");
    expect(h).toContain('aria-label="Evaluar a Laura Ríos y Juan Cruz"');
    expect(h).toContain('aria-label="Revisar evaluación de Camilo Rueda"');
    expect(h).toContain("Proyecto d · Ruta básica · Cali · En pareja");
  });
  it("sin reloj: ni «Ahora», ni «Siguiente», ni «Son las», ni «Ir a ahora»", () => {
    for (const h of [web(), movil(), web(dia2!.bloques[0]!, true)]) for (const t of [">Ahora<", "Siguiente", "Son las", "Ir a ahora"]) expect(h).not.toContain(t);
  });
  it("fondo por estado (estadoFila): presente y ausente", () => {
    const h = web();
    const filas = h.split('class="').filter((c) => c.includes("fila") || c.includes("tarjeta"));
    expect(filas.some((c) => c.includes("presente"))).toBe(true);
    expect(filas.some((c) => c.includes("ausente"))).toBe(true);
  });
  it("coordinación: «Mentor: nombre», botón Ver; sin monitor; Uruguay con hora UY", () => {
    const h = web(dia2!.bloques[0]!, true);
    expect(h).toContain("Mentor: <b");
    expect(h).toContain("Paola Lozano");
    expect(h).toContain("Sin monitor");
    expect(h).toContain("Sala por asignar");
    expect(h).toContain('aria-label="Ver evaluación de Martina Silva"');
    expect(h).toContain("Paysandú · Uruguay");
    expect(h).toMatch(/\d:00 p\. m\. UY/);
    expect(h).not.toContain("Abrir sala");
  });
  it("móvil: botón a todo el ancho «Evaluar» / «Revisar evaluación» / «Ver evaluación»", () => {
    expect(movil()).toContain(">Revisar evaluación<");
    expect(movil()).toContain(">Evaluar<");
    expect(movil(dia2!.bloques[0]!, true)).toContain(">Ver evaluación<");
  });
});

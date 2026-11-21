import { describe, expect, it } from "vitest";
import { CRITERIOS_DEFECTO as CR, ITEMS_A, type PartesA } from "@/lib/evaluacion/criterios";
import {
  agendadas, cuenta, filtrarBase, horaMin, mentoresAtipicos, parejas, reporte, sinAgendar, sinAgendarFilas, unidades, vistaModo,
} from "@/lib/evaluacion/seguimientoV2";
import { tablero, type FilaEstudiante } from "@/lib/evaluacion/tablero";

// Seguimiento v2 · Paso 2: cálculos puros. Datos INVENTADOS.

const A = (v: "si" | "no" | "parcial"): PartesA => Object.fromEntries(ITEMS_A.map(([k]) => [k, v]));
type Ev = NonNullable<FilaEstudiante["ev"]>;
const EXC: Ev = { a: A("si"), b: { b1: 4, b2: 4, b3: 3 }, noPresento: false, destacado: false, fortaleza: "", mejora: "", percepcion: "" };
const APR: Ev = { ...EXC, a: A("no"), b: { b1: 2, b2: 1 } };
const INC: Ev = { ...EXC, a: { a1: "si" }, b: { b1: 3 } };
const NSP: Ev = { ...EXC, a: {}, b: {}, noPresento: true };
let n = 0;
const fila = (o: Partial<FilaEstudiante> = {}): FilaEstudiante => ({
  proyectoId: `p${++n}`, codigo: `C${n}`, nombre: `Estudiante ${n}`, documento: `${n}`, correo: "", celular: "", ciudad: "Cali", ruta: "Básica", pareja: null,
  proyecto: `Proyecto ${n}`, descripcion: "", dia: "2026-11-12", hora: "8:00 a. m.", sala: 1, mentor: "Mentor A", monitor: "Monitora A", ev: null, motivo: null, observacion: "", ...o,
});
/** Pareja: dos filas del mismo proyecto. */
function pareja(e1: Ev | null, e2: Ev | null, o: Partial<FilaEstudiante> = {}): FilaEstudiante[] {
  const id = `p${++n}`, d1 = `${++n}`, d2 = `${++n}`;
  return [
    fila({ proyectoId: id, documento: d1, nombre: `Ana ${d1}`, proyecto: `Pareja ${id}`, pareja: { nombre: `Beto ${d2}`, documento: d2 }, ev: e1, ...o }),
    fila({ proyectoId: id, documento: d2, nombre: `Beto ${d2}`, proyecto: `Pareja ${id}`, pareja: { nombre: `Ana ${d1}`, documento: d1 }, ev: e2, ...o }),
  ];
}

// Escenario: 2 días, 2 ciudades, rutas y modalidades, sin agendar y motivos.
const FILAS: FilaEstudiante[] = [
  fila({ ev: { ...EXC, destacado: true, fortaleza: "Muy claro" } }),
  fila({ ev: APR, mentor: "Mentor B" }),
  fila({ ev: INC, ciudad: "Medellín", ruta: "Avanzada" }),
  fila({ ev: NSP, motivo: "Salud", monitor: "Monitor B" }),
  fila({ ev: NSP, monitor: "Monitor B" }),
  fila({ dia: "2026-11-13", hora: "2:00 p. m." }),
  fila({ dia: "2026-11-13", ev: EXC, ciudad: "Medellín", motivo: "Otro" }), // motivo y luego se presentó (reprogramado)
  ...pareja(EXC, APR),
  ...pareja(NSP, EXC, { ciudad: "Medellín", ruta: "Avanzada" }),
  ...pareja(NSP, NSP, { dia: "2026-11-13", motivo: "No avisó" }),
  ...pareja(null, NSP),
  ...pareja(EXC, EXC, { ev: { ...EXC, destacado: true } }),
  // Sin agendar
  fila({ dia: null, hora: "", mentor: "Sin asignar", monitor: "Sin monitor" }),
  ...pareja(null, null, { dia: null, hora: "", mentor: "Sin asignar", monitor: "Sin monitor", ciudad: "Medellín" }),
];
const AG = agendadas(FILAS), SA = sinAgendarFilas(FILAS);
/** v2 manda fracciones y promedios con 4 decimales: para comparar con tablero() se redondea igual. */
const r4 = <T,>(x: T): T => JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v)));

describe("paridad con el seguimiento de hoy (por estudiantes, todos los días y ciudades)", () => {
  const hoy = tablero(FILAS, CR), soloSA = tablero(SA, CR), v = vistaModo(AG, AG, CR, "est", new Set());
  it("los conteos = los de hoy menos exactamente lo que aporta «Sin agendar»", () => {
    expect(v.c.tot).toBe(hoy.kpis.estudiantes - soloSA.kpis.estudiantes);
    expect(v.c.ev).toBe(hoy.kpis.evaluados - soloSA.kpis.evaluados);
    expect(v.c.exc).toBe(hoy.kpis.excelentes - soloSA.kpis.excelentes);
    expect(v.c.nsp).toBe(hoy.kpis.noSePresentaron - soloSA.kpis.noSePresentaron);
    expect(v.c.des).toBe(hoy.kpis.destacados - soloSA.kpis.destacados);
    expect(new Set(AG.map((f) => f.proyectoId)).size).toBe(hoy.kpis.proyectos - soloSA.kpis.proyectos);
    for (const r of hoy.resultados) expect(cuenta(unidades(AG, CR, "est")).tot ? r.n - soloSA.resultados.find((x) => x.res === r.res)!.n : 0).toBe(
      { Excelente: v.c.exc, Aprobado: v.c.apr, Incompleto: v.c.inc, "No se presentó": v.c.nsp, Pendiente: v.c.pend }[r.res]);
  });
  it("tasas, Parte A y B, grupos, motivos, monitor, mentor y día = tablero() de las filas agendadas", () => {
    const t = r4(tablero(AG, CR));
    expect(v.c.avance).toBe(t.kpis.avance);
    expect(v.c.pctExc).toBe(t.kpis.pctExcelentes);
    expect(v.parteA.map(({ k, titulo, si, n }) => ({ k, titulo, si, n }))).toEqual(t.parteA);
    expect(v.parteB).toEqual(t.parteB);
    const g = (x: typeof v.porRuta) => x.map((y) => ({ grupo: y.grupo, estudiantes: y.c.tot, evaluados: y.c.pres, noSePresentaron: y.c.nsp, excelentes: y.c.pctExc, nivel: y.c.nivel }));
    expect(g(v.porRuta)).toEqual(t.porRuta);
    expect(g(v.porCiudad)).toEqual(t.porCiudad);
    expect(g(v.porModalidad)).toEqual(t.porModalidad);
    const pm = (x: { motivo: string; n: number }[]) => [...x].sort((a, b) => a.motivo.localeCompare(b.motivo));
    expect(pm(v.motivos)).toEqual(pm(t.inasistencias.motivos)); // empates: v2 ordena por nombre
    expect(v.porMonitor.map((m) => ({ monitor: m.monitor, estudiantes: m.c.tot, noSePresentaron: m.c.nsp, conMotivo: m.c.conMotivo, sinMotivo: m.sinMotivo }))).toEqual(t.inasistencias.porMonitor);
    expect(v.porMentor.map((m) => ({ mentor: m.mentor, asignados: m.c.tot, evaluados: m.c.ev, avance: m.c.avance, funciona: m.c.funciona, nivel: m.c.nivel }))).toEqual(t.porMentor);
    expect(v.dias.map((d) => ({ dia: d.dia, programados: d.d.tot, evaluados: d.d.pres, noSePresentaron: d.d.nsp, avance: d.d.avance }))).toEqual(t.porDia);
    expect(parejas(AG, CR)).toEqual(t.parejas);
    expect(v.destacados.map((x) => x.nombre)).toEqual(t.destacados.map((x) => x.nombre));
    expect(v.excelentes.map((x) => [x.nombre, x.a, x.b])).toEqual(t.excelentes.map((x) => [x.nombre, x.a, x.b]));
  });
  it("hoy, «Sin fecha», «Sin asignar» y «Sin monitor» de los sin agendar sí entraban; ahora no entran en nada", () => {
    expect(hoy.porDia.some((d) => d.dia === null)).toBe(true);
    expect(v.dias.some((d) => d.dia === null)).toBe(false);
    expect(v.porMentor.some((m) => m.mentor === "Sin asignar")).toBe(false);
    expect(v.porMonitor.some((m) => m.monitor === "Sin monitor")).toBe(false);
  });
});

describe("coherencia", () => {
  for (const modo of ["est", "proy"] as const) {
    it(`las sumas cuadran (${modo})`, () => {
      const v = vistaModo(AG, AG, CR, modo, new Set()), c = v.c;
      expect(c.exc + c.apr + c.inc + c.nsp + c.pend).toBe(c.tot);
      expect(c.ev).toBe(c.tot - c.pend);
      expect(c.pres + c.nsp).toBe(c.ev);
      expect(v.porCiudad.reduce((s, g) => s + g.c.tot, 0)).toBe(c.tot);
      expect(v.porRuta.reduce((s, g) => s + g.c.tot, 0)).toBe(c.tot);
      expect(v.porModalidad.reduce((s, g) => s + g.c.tot, 0)).toBe(c.tot);
      expect(v.porMentor.reduce((s, g) => s + g.c.tot, 0)).toBe(c.tot);
      expect(v.porMonitor.reduce((s, g) => s + g.c.nsp, 0)).toBe(c.nsp);
      expect(v.dias.reduce((s, d) => s + d.d.tot, 0)).toBe(c.tot);
      expect(v.dias.at(-1)!.acum).toEqual(c);
      expect(v.inasistencias.length).toBe(c.nsp);
      expect(v.excelentes.length).toBe(c.exc);
    });
  }
  it("por proyecto una pareja nunca cuenta dos veces", () => {
    const p = unidades(AG, CR, "proy");
    expect(p.length).toBe(new Set(AG.map((f) => f.proyectoId)).size);
    expect(new Set(p.map((u) => u.proyectoId)).size).toBe(p.length);
    expect(p.reduce((s, u) => s + u.n, 0)).toBe(AG.length);
  });
});

describe("reglas por proyecto", () => {
  const p = (fs: FilaEstudiante[]) => unidades(fs, CR, "proy")[0];
  it("el mejor resultado; presentado si alguno se presentó", () => {
    expect(p(pareja(EXC, APR)).res).toBe("Excelente");
    expect(p(pareja(NSP, APR)).res).toBe("Aprobado");
    expect(p(pareja(NSP, INC)).res).toBe("Incompleto");
    expect(p(pareja(NSP, null)).res).toBe("Pendiente");
    expect(p(pareja(NSP, NSP)).res).toBe("No se presentó");
    expect(p(pareja(null, null)).res).toBe("Pendiente");
  });
  it("destacado solo si un integrante presentado lo tiene; Parte A el mejor; B el promedio de los presentados", () => {
    expect(p(pareja({ ...NSP, destacado: true }, APR)).destacado).toBe(false);
    expect(p(pareja(APR, { ...EXC, destacado: true })).destacado).toBe(true);
    const u = p(pareja({ ...APR, a: A("parcial") }, { ...APR, a: { ...A("no"), a1: "si" }, b: { b1: 4, b2: 4 } }));
    expect(u.items[0]).toBe("si");
    expect(u.items[1]).toBe("parcial");
    expect(u.a).toBe(Math.max(0.5, 1 / 7));
    expect(u.b).toBeCloseTo((1.5 + 4) / 2);
    expect(p(pareja(NSP, NSP)).a).toBeNull();
  });
  it("motivo del proyecto = el primero registrado", () => {
    expect(p(pareja(NSP, NSP, { motivo: "Salud" })).motivo).toBe("Salud");
  });
});

describe("filtros", () => {
  it("ciudad, ruta, modalidad y búsqueda (sin tildes; una pareja entra entera)", () => {
    expect(filtrarBase(FILAS, { ciudad: "Medellín" }).every((f) => f.ciudad === "Medellín")).toBe(true);
    expect(filtrarBase(FILAS, { ruta: "Avanzada" }).every((f) => f.ruta === "Avanzada")).toBe(true);
    expect(filtrarBase(FILAS, { modalidad: "pareja" }).every((f) => f.pareja)).toBe(true);
    expect(filtrarBase(FILAS, { modalidad: "individual" }).every((f) => !f.pareja)).toBe(true);
    const pa = FILAS.find((f) => f.pareja)!;
    const r = filtrarBase(FILAS, { q: pa.nombre.toUpperCase() });
    expect(r.map((f) => f.proyectoId)).toEqual([pa.proyectoId, pa.proyectoId]);
    expect(filtrarBase([fila({ proyecto: "Café Andino" })], { q: "cafe" })).toHaveLength(1);
  });
  it("el día solo deja la tendencia completa", () => {
    const d = AG.filter((f) => f.dia === "2026-11-13"), v = vistaModo(d, AG, CR, "est", new Set());
    expect(v.c.tot).toBe(d.length);
    expect(v.dias.map((x) => x.dia)).toEqual(["2026-11-12", "2026-11-13"]);
  });
});

describe("«No se presentaron» por ciudad (como hoy) y sin agendar", () => {
  it("cuenta también el «No» del monitor sin evaluación guardada", () => {
    const f = fila({ ciudad: "Pasto" }), v = vistaModo([f], [f], CR, "est", new Set([`${f.proyectoId}|${f.documento}`]));
    expect(v.noSePresentaronCiudad).toEqual([{ ciudad: "Pasto", n: 1, tot: 1, pres: 0 }]);
    expect(v.c.nsp).toBe(0);
  });
  it("sin agendar: proyectos, estudiantes y «Sin monitor» por ciudad", () => {
    const s = sinAgendar(SA, new Map([[SA[0].proyectoId, "Laura Monitora"]]));
    expect(s.estudiantes).toBe(3);
    expect(s.proyectos).toHaveLength(2);
    expect(s.porCiudad).toEqual([{ ciudad: "Cali", proyectos: 1, estudiantes: 1, sinMonitor: 0 }, { ciudad: "Medellín", proyectos: 1, estudiantes: 2, sinMonitor: 1 }]);
  });
});

describe("mentores atípicos", () => {
  it("marca al que se aleja mucho de las medianas y no a los demás", () => {
    const us = ["M1", "M2", "M3", "M4", "M5"].flatMap((m) => [1, 2, 3].map(() => fila({ mentor: m, ev: { ...APR, a: { ...A("no"), a1: "si", a2: "si" } } })));
    const raro = [1, 2, 3].map(() => fila({ mentor: "Raro", ev: EXC }));
    const r = mentoresAtipicos(unidades([...us, ...raro], CR, "est"));
    expect(r.lista.filter((x) => x.atipico).map((x) => x.mentor)).toEqual(["Raro"]);
    expect(r.medFunciona).toBeCloseTo(2 / 7);
  });
  it("con menos de 3 mentores válidos no marca a nadie", () => {
    expect(mentoresAtipicos(unidades([fila({ ev: EXC }), fila({ ev: EXC }), fila({ ev: EXC })], CR, "est")).lista.every((x) => !x.atipico)).toBe(true);
  });
});

describe("reporte del día", () => {
  it("evaluados = se presentaron; aprobados = presentados no excelentes; no presentados individuales y en pareja", () => {
    const r = reporte(FILAS, CR, null);
    const est = unidades(AG, CR, "est");
    expect(r.e.tot).toBe(AG.length);
    expect(r.e.pres).toBe(est.filter((u) => ["Excelente", "Aprobado", "Incompleto"].includes(u.res)).length);
    expect(r.e.pres + r.e.nsp + r.e.pend).toBe(r.e.tot);
    expect(r.p.exc + r.p.apr).toBe(r.p.pres);
    expect(r.p.pres + r.p.nsp + r.p.pend).toBe(r.p.tot);
    expect(r.p.nspIndividual + r.p.nspPareja).toBe(r.p.nsp);
    expect(r.porCiudad.reduce((s, c) => s + c.proyectos, 0)).toBe(r.p.tot);
    expect(r.porCiudad.reduce((s, c) => s + c.estudiantes, 0)).toBe(r.e.tot);
    expect(r.noAsistieron.reduce((s, c) => s + c.n, 0)).toBe(r.e.nsp);
    expect(reporte(FILAS, CR, "2026-11-13").e.tot).toBe(AG.filter((f) => f.dia === "2026-11-13").length);
  });
});

it("horaMin ordena la hora de Colombia", () => {
  expect(["2:00 p. m.", "8:15 a. m.", "12:00 p. m."].sort((a, b) => horaMin(a) - horaMin(b))).toEqual(["8:15 a. m.", "12:00 p. m.", "2:00 p. m."]);
});

describe("tamaño con volumen de producción", () => {
  it("≈ 700 estudiantes (10 ciudades, 16 mentores, 7 días): los dos modos + sin agendar < 150 KB", () => {
    const ciudades = ["Barranquilla", "Bogotá D.C.", "Cartagena", "Medellín", "Cali", "Guayaquil", "Quito", "Panamá", "Paysandú", "Colonia"];
    const dias = ["2026-11-12", "2026-11-13", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
    const evs = [EXC, { ...EXC, destacado: true, fortaleza: "Explicó con claridad cómo fluye la información entre frontend y backend." }, APR, APR, NSP, null, INC];
    const fs: FilaEstudiante[] = [];
    for (let i = 0; i < 540; i++) {
      const o: Partial<FilaEstudiante> = {
        ciudad: ciudades[i % 10], dia: dias[i % 7], hora: `${8 + (i % 10)}:00 a. m.`, mentor: `Mentora Número ${i % 16} Apellido Largo`,
        monitor: `Monitor ${i % 14} Apellido`, ruta: i % 3 ? "Básica" : "Avanzada", motivo: i % 9 === 0 ? "Calamidad familiar" : null, proyecto: `Emprendimiento ${i} Gourmet`,
      };
      if (i % 5 === 0) fs.push(...pareja(evs[i % 7], evs[(i + 1) % 7], o)); else fs.push(fila({ ...o, nombre: `Nombre${i} Apellido Apellido`, ev: evs[i % 7] }));
    }
    for (let i = 0; i < 40; i++) fs.push(fila({ dia: null, hora: "", mentor: "Sin asignar", monitor: "Sin monitor", ciudad: ciudades[i % 10], nombre: `Sin Hora ${i} Apellido` }));
    const ag = agendadas(fs);
    // Listas solo del modo pedido (el peor caso: por estudiantes); del otro modo, solo cifras.
    const r = { est: vistaModo(ag, ag, CR, "est", new Set()), proy: vistaModo(ag, ag, CR, "proy", new Set(), false), sinAgendar: sinAgendar(sinAgendarFilas(fs)) };
    const kb = JSON.stringify(r).length / 1024;
    console.log(`Tamaño con ${fs.length} estudiantes: ${kb.toFixed(1)} KB`);
    expect(kb).toBeLessThan(150);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { cargarDemo } from "./helpers/foto-base";

// Seguimiento v2 · Paso 2: con la DEMO en la base LOCAL de pruebas.
// - Paridad: por estudiantes, todos los días y ciudades, cada número nuevo = el de hoy (seguimiento v1) menos
//   exactamente lo que aporta «Sin agendar».
// - El reporte por proyectos sale igual a la lógica del reporte que se envía (la del 20 de noviembre), escrita aparte.
// - Tamaño de las respuestas (se refrescan cada minuto).

usarBaseLocal(5);
const db = await import("@/lib/db");
const { filasEstudiantes, seguimiento, seguimientoV2, reporteDia } = await import("@/lib/evaluacion/resultados");
const { tablero } = await import("@/lib/evaluacion/tablero");
const { calc } = await import("@/lib/evaluacion/criterios");
const { criterios } = await import("@/lib/evaluacion/datos");

const HOY = "2026-11-20";
const AHORA = new Date("2026-11-20T16:40:00Z"); // 11:40 a. m. COL

beforeAll(async () => { cargarDemo(HOY); await db.closeDb(); }, 180_000);
afterAll(() => db.closeDb());

describe("paridad con el seguimiento de hoy", () => {
  it("por estudiantes: hoy − «Sin agendar» = v2, en KPI, resultados, motivos, monitor y mentor", async () => {
    const [v1, v2, filas, crit] = await Promise.all([seguimiento(), seguimientoV2({}, AHORA), filasEstudiantes(), criterios()]);
    const sa = tablero(filas.filter((f) => f.dia === null), crit), c = v2.est.c;
    expect(sa.kpis.estudiantes).toBe(v2.sinAgendar.estudiantes);
    expect(v2.sinAgendar.estudiantes).toBeGreaterThan(0);
    expect(c.tot).toBe(v1.kpis.estudiantes - sa.kpis.estudiantes);
    expect(c.ev).toBe(v1.kpis.evaluados - sa.kpis.evaluados);
    expect(c.exc).toBe(v1.kpis.excelentes - sa.kpis.excelentes);
    expect(c.nsp).toBe(v1.kpis.noSePresentaron - sa.kpis.noSePresentaron);
    expect(c.des).toBe(v1.kpis.destacados - sa.kpis.destacados);
    expect(v2.proy.c.tot).toBe(v1.kpis.proyectos - sa.kpis.proyectos);
    const r = (res: string, t: typeof v1) => t.resultados.find((x) => x.res === res)!.n;
    expect([c.exc, c.apr, c.inc, c.nsp, c.pend]).toEqual(["Excelente", "Aprobado", "Incompleto", "No se presentó", "Pendiente"].map((x) => r(x, v1) - r(x, { ...v1, ...sa })));
    const suma = (l: { motivo: string; n: number }[]) => l.reduce((s, x) => s + x.n, 0);
    expect(suma(v2.est.motivos)).toBe(suma(v1.inasistencias.motivos) - suma(sa.inasistencias.motivos));
    for (const m of v2.est.porMentor) expect(m.c.tot).toBe(v1.porMentor.find((x) => x.mentor === m.mentor)!.asignados - (sa.porMentor.find((x) => x.mentor === m.mentor)?.asignados ?? 0));
    for (const m of v2.est.porMonitor) expect(m.c.nsp).toBe(v1.inasistencias.porMonitor.find((x) => x.monitor === m.monitor)!.noSePresentaron - (sa.inasistencias.porMonitor.find((x) => x.monitor === m.monitor)?.noSePresentaron ?? 0));
    // «No se presentaron» por ciudad, como hoy (los sin agendar no tienen día: nunca entraban).
    expect(v2.est.noSePresentaronCiudad.map((x) => ({ ciudad: x.ciudad, estudiantes: x.n })).sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es"))).toEqual(v1.noSePresentaronCiudad);
    expect(v2.sinProyecto).toEqual(v1.sinProyecto);
    expect(v2.criterios).toEqual(v1.criterios);
  });

  it("con ciudad y día: igual que v1 con ese filtro, menos los sin agendar", async () => {
    const ciudad = (await seguimiento()).ciudades[0];
    const [v1, v2] = await Promise.all([seguimiento({ dia: HOY, ciudad }), seguimientoV2({ dia: HOY, ciudad }, AHORA)]);
    // v1 con día ya solo trae agendados de ese día.
    expect(v2.est.c.tot).toBe(v1.kpis.estudiantes);
    expect(v2.est.c.exc).toBe(v1.kpis.excelentes);
    expect(v2.est.c.nsp).toBe(v1.kpis.noSePresentaron);
    expect(v2.proy.c.tot).toBe(v1.kpis.proyectos);
  });
});

/** Lógica del reporte que se envía (prototipo 02, datosReporte), escrita aparte sobre las filas por estudiante. */
function reporteEnviado(filas: Awaited<ReturnType<typeof filasEstudiantes>>, crit: Awaited<ReturnType<typeof criterios>>, dia: string | null) {
  const fs = filas.filter((f) => f.dia !== null && (!dia || f.dia === dia));
  const pres = (r: string) => r === "Excelente" || r === "Aprobado" || r === "Incompleto";
  const ests = fs.map((f) => ({ f, r: calc(f.ev, crit).res as string }));
  const ids = [...new Set(fs.map((f) => f.proyectoId))];
  const up = ids.map((id) => {
    const m = ests.filter((x) => x.f.proyectoId === id), rs = m.map((x) => x.r);
    const r = ["Excelente", "Aprobado", "Incompleto"].find((k) => rs.includes(k)) ?? (rs.includes("Pendiente") ? "Pendiente" : "No se presentó");
    return { id, r, ciudad: m[0].f.ciudad, n: m.length, pareja: m.length > 1, destacado: m.some((x) => pres(x.r) && x.f.ev?.destacado) };
  });
  const pp = { tot: up.length, pres: up.filter((x) => pres(x.r)).length, exc: up.filter((x) => x.r === "Excelente").length };
  return {
    e: { tot: ests.length, pres: ests.filter((x) => pres(x.r)).length, nsp: ests.filter((x) => x.r === "No se presentó").length, pend: ests.filter((x) => x.r === "Pendiente").length },
    p: { ...pp, apr: pp.pres - pp.exc, des: up.filter((x) => x.destacado && pres(x.r)).length, nsp: up.filter((x) => x.r === "No se presentó").length, nspInd: up.filter((x) => x.r === "No se presentó" && !x.pareja).length },
    excEst: ests.filter((x) => x.r === "Excelente").length,
    ciudades: [...new Set(up.map((x) => x.ciudad))].map((c) => { const l = up.filter((x) => x.ciudad === c); return [c, l.length, l.filter((x) => pres(x.r)).length, l.reduce((s, x) => s + x.n, 0)]; }).sort((a, b) => (b[1] as number) - (a[1] as number) || String(a[0]).localeCompare(String(b[0]), "es")),
  };
}

describe("reporte del día (oficial)", () => {
  for (const dia of ["2026-11-12", HOY, null]) {
    it(`por proyectos = lógica del reporte enviado (${dia ?? "todos los días"})`, async () => {
      const [r, filas, crit] = await Promise.all([reporteDia(dia), filasEstudiantes(), criterios()]);
      const x = reporteEnviado(filas, crit, dia);
      expect(r.e).toEqual({ ...x.e, exc: x.excEst });
      expect(r.p).toMatchObject({ tot: x.p.tot, pres: x.p.pres, exc: x.p.exc, apr: x.p.apr, des: x.p.des, nsp: x.p.nsp, nspIndividual: x.p.nspInd });
      expect(r.porCiudad.map((c) => [c.ciudad, c.proyectos, c.presentados, c.estudiantes])).toEqual(x.ciudades);
      expect(r.p.tot).toBeGreaterThan(0);
    });
  }
  it("no depende de filtros: siempre todas las ciudades", async () => {
    const [r, filas] = await Promise.all([reporteDia(null), filasEstudiantes()]);
    expect(r.ciudades).toBe(new Set(filas.filter((f) => f.dia).map((f) => f.ciudad)).size);
    expect(r.ciudades).toBeGreaterThan(1);
  });
});

describe("tamaño de la respuesta (se refresca cada minuto)", () => {
  it("seguimiento y reporte < 150 KB sin comprimir y sin documento, correo ni celular", async () => {
    const [v2, rep, filas] = await Promise.all([seguimientoV2({}, AHORA), reporteDia(null), filasEstudiantes()]);
    const t = JSON.stringify(v2), tr = JSON.stringify(rep);
    console.log(`Tamaño · seguimiento: ${(t.length / 1024).toFixed(1)} KB · reporte: ${(tr.length / 1024).toFixed(1)} KB · filas: ${filas.length}`);
    expect(t.length).toBeLessThan(150 * 1024);
    expect(tr.length).toBeLessThan(150 * 1024);
    for (const f of filas.slice(0, 200)) {
      if (f.documento.length > 3) expect(t).not.toContain(`"${f.documento}"`);
      if (f.correo) expect(t).not.toContain(f.correo);
      if (f.celular) expect(t).not.toContain(f.celular);
    }
  });
});

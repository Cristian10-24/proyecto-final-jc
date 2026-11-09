import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Fase 4 · Paso 24 · Carga de los mentores. Regla fija: la hora del estudiante NUNCA cambia (solo el mentor, en el
// mismo bloque, hacia un asiento libre). Objetivos en orden: juntar, evitar huecos, equilibrar. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const k = await import("@/lib/cargaMentores");
const { inicioUTC } = await import("@/lib/edicion");

const D = "2026-11-12";
const H = (h: number, m = 0) => inicioUTC(D, h, m);
type A = { _id: ObjectId; inicio: Date; mentorId: string; ciudades: string[]; proyectoId: ObjectId | null };
const nombre = (id: string) => `Mentor ${id}`;

/** Escenario: `asientos(m, hora, bloques)` crea asientos libres; `poner(m, hora, bloque)` pone un proyecto nuevo. */
function escenario() {
  const lista: A[] = [];
  const proyectos = new Map<string, { _id: ObjectId; codigo: string; nombre: string; ciudad: string }>();
  const evaluados = new Set<string>();
  const asientos = (m: string, hora: number, bloques = [0, 1, 2, 3], ciudades = ["Cali"]) => {
    for (const b of bloques) lista.push({ _id: new ObjectId(), inicio: H(hora, b * 15), mentorId: m, ciudades, proyectoId: null });
  };
  const poner = (m: string, hora: number, bloque: number, evaluado = false) => {
    const a = lista.find((x) => x.mentorId === m && x.inicio.getTime() === H(hora, bloque * 15).getTime());
    if (!a || a.proyectoId) throw new Error("asiento inexistente u ocupado");
    const _id = new ObjectId();
    a.proyectoId = _id;
    proyectos.set(String(_id), { _id, codigo: `P-${proyectos.size}`, nombre: `App ${proyectos.size}`, ciudad: "Cali" });
    if (evaluado) evaluados.add(String(_id));
    return String(_id);
  };
  const calcular = (orden = false) => k.cargaDia(D, lista, proyectos, evaluados, orden, nombre);
  return { lista, asientos, poner, calcular, evaluados };
}

/** Invariantes de cualquier resultado: misma hora exacta, destino libre al empezar y único, nunca un evaluado. */
function invariantes(e: ReturnType<typeof escenario>, r: ReturnType<typeof k.cargaDia>) {
  const porId = new Map(e.lista.map((a) => [String(a._id), a]));
  const destinos = new Set<string>();
  for (const p of r.resumen.flatMap((x) => x.propuestas)) {
    const de = porId.get(p.desde)!, a = porId.get(p.hacia)!;
    expect(a.inicio.getTime()).toBe(de.inicio.getTime()); // la hora del estudiante nunca cambia
    expect(p.inicio).toBe(de.inicio.toISOString());
    expect(String(de.proyectoId)).toBe(p.proyecto.id);
    expect(a.proyectoId).toBeNull();
    expect(destinos.has(p.hacia)).toBe(false);
    destinos.add(p.hacia);
    expect(e.evaluados.has(p.proyecto.id)).toBe(false);
  }
}

describe("objetivo 1 · juntar (sin mover la hora)", () => {
  it("3 mentores con 1 proyecto cada uno a las 8 (bloques distintos) → los 3 al mismo mentor", () => {
    const e = escenario();
    for (const m of ["a", "b", "c"]) e.asientos(m, 8);
    e.poner("a", 8, 0); e.poner("b", 8, 1); e.poner("c", 8, 2);
    const r = e.calcular();
    invariantes(e, r);
    const h8 = r.resumen[0]!;
    expect([h8.mentoresAntes, h8.mentoresDespues, h8.propuestas.length, h8.noSePuede]).toEqual([3, 1, 2, false]);
    expect(new Set(h8.propuestas.map((p) => p.a)).size).toBe(1);
    expect(h8.propuestas.every((p) => p.motivo === "juntar")).toBe(true);
    expect(r.indicadores).toMatchObject({ antes: { mentores: 3, horasPocas: 3 }, despues: { mentores: 1, horasPocas: 0, maximo: 3 } });
  });

  it("los 3 en el MISMO bloque: no se proponen cambios y se marca «No se puede juntar sin mover la hora»", () => {
    const e = escenario();
    for (const m of ["a", "b", "c"]) e.asientos(m, 8);
    for (const m of ["a", "b", "c"]) e.poner(m, 8, 0);
    expect(e.calcular().resumen[0]).toMatchObject({ propuestas: [], noSePuede: true, mentoresDespues: 3 });
  });

  it("solo hacia mentores con asiento en ese bloque (disponibles)", () => {
    const e = escenario();
    e.asientos("a", 8, [0]); e.asientos("b", 8, [1]); // cada uno solo en su bloque
    e.poner("a", 8, 0); e.poner("b", 8, 1);
    expect(e.calcular().resumen[0]).toMatchObject({ propuestas: [], noSePuede: true });
    e.asientos("c", 8); // c disponible toda la hora
    const r = e.calcular();
    invariantes(e, r);
    expect(r.resumen[0]!.propuestas.map((p) => p.a)).toEqual(["Mentor c", "Mentor c"]);
  });

  it("nunca mueve proyectos evaluados: su mentor se queda y recibe a los demás", () => {
    const e = escenario();
    for (const m of ["a", "b"]) e.asientos(m, 9);
    const ev = e.poner("a", 9, 0, true); e.poner("b", 9, 1); e.poner("b", 9, 2);
    const r = e.calcular();
    invariantes(e, r);
    expect(r.resumen[0]!.propuestas.map((p) => p.a)).toEqual(["Mentor a", "Mentor a"]);
    expect(r.resumen[0]!.propuestas.some((p) => p.proyecto.id === ev)).toBe(false);
    const e2 = escenario();
    for (const m of ["a", "b"]) e2.asientos(m, 9);
    e2.poner("a", 9, 0, true); e2.poner("b", 9, 1, true);
    expect(e2.calcular().resumen[0]!.propuestas).toEqual([]);
  });

  it("gana juntar aunque cree un hueco (objetivo 1 antes que 2)", () => {
    const e = escenario();
    e.asientos("a", 7, [0, 1]); e.asientos("a", 9); e.poner("a", 9, 0); e.poner("a", 9, 1); e.poner("a", 9, 2);
    e.asientos("b", 7, [0]); e.poner("b", 7, 0);
    e.asientos("c", 7, [1]); e.poner("c", 7, 1);
    const r = e.calcular();
    invariantes(e, r);
    const h7 = r.resumen.find((x) => x.hora === 7)!;
    expect(h7.propuestas.map((p) => [p.a, p.motivo])).toEqual([["Mentor a", "juntar"], ["Mentor a", "juntar"]]);
    expect(r.indicadores.despues.horasSueltas).toBe(2); // a queda con 7 y 9 sueltas: se acepta
  });
});

describe("objetivo 2 · evitar huecos", () => {
  it("a con 6 y 8, b con 7 (a disponible a las 7) → la 7 pasa a a y nadie queda suelto", () => {
    const e = escenario();
    for (const h of [6, 7, 8]) e.asientos("a", h);
    e.asientos("b", 7);
    for (const b of [0, 1, 2]) { e.poner("a", 6, b); e.poner("a", 8, b); e.poner("b", 7, b); }
    const r = e.calcular();
    invariantes(e, r);
    const h7 = r.resumen.find((x) => x.hora === 7)!;
    expect(h7.propuestas.map((p) => [p.de, p.a, p.motivo])).toEqual(Array(3).fill(["Mentor b", "Mentor a", "huecos"]));
    expect(r.indicadores).toMatchObject({ antes: { horasSueltas: 2 }, despues: { horasSueltas: 0, mentores: 1 } });
  });
});

describe("objetivo 3 · equilibrar", () => {
  it("a con 5 horas seguidas y b disponible sin ninguna → b recibe horas completas, sin huecos", () => {
    const e = escenario();
    for (let h = 6; h <= 10; h++) { e.asientos("a", h); e.asientos("b", h); for (const b of [0, 1, 2]) e.poner("a", h, b); }
    const r = e.calcular();
    invariantes(e, r);
    const desp = r.despues;
    expect(desp.map((m) => m.nombre).sort()).toEqual(["Mentor a", "Mentor b"]);
    expect(Math.max(...desp.map((m) => m.horas.filter((x) => x.proyectos).length))).toBeLessThan(5);
    expect(r.indicadores.despues.horasSueltas).toBe(0);
    for (const x of r.resumen) expect(x.mentoresDespues).toBe(1); // horas completas
    expect(r.resumen.flatMap((x) => x.propuestas).every((p) => p.motivo === "equilibrar")).toBe(true);
  });

  it("no equilibra si eso abre un hueco (objetivo 2 antes que 3)", () => {
    const e = escenario();
    for (const h of [6, 7, 8]) e.asientos("a", h);
    e.asientos("b", 7); // b solo disponible en la del medio
    for (const h of [6, 7, 8]) for (const b of [0, 1, 2]) e.poner("a", h, b);
    expect(e.calcular().resumen.flatMap((x) => x.propuestas)).toEqual([]);
  });
});

describe("aplicar en el orden propuesto no deshace nada", () => {
  /** Aplica las propuestas de la hora con orden 1 sobre el escenario, recalcula y repite. */
  function aplicarEnOrden(e: ReturnType<typeof escenario>) {
    const visitas = new Map<string, Set<string>>(); // proyecto → mentores por los que pasó
    for (const a of e.lista) if (a.proyectoId) visitas.set(String(a.proyectoId), new Set([a.mentorId]));
    let vueltas = 0;
    for (;;) {
      const r = e.calcular();
      invariantes(e, r);
      const siguiente = r.resumen.find((x) => x.orden === 1);
      if (!siguiente) return vueltas;
      for (const p of siguiente.propuestas) {
        const de = e.lista.find((x) => String(x._id) === p.desde)!, a = e.lista.find((x) => String(x._id) === p.hacia)!;
        // Nunca vuelve a un mentor por el que ya pasó.
        expect(visitas.get(p.proyecto.id)!.has(a.mentorId)).toBe(false);
        visitas.get(p.proyecto.id)!.add(a.mentorId);
        a.proyectoId = de.proyectoId; de.proyectoId = null;
      }
      if (++vueltas > 30) throw new Error("no termina");
    }
  }

  it("equilibrar 5 horas seguidas: termina sin volver atrás", () => {
    const e = escenario();
    for (let h = 6; h <= 10; h++) { e.asientos("a", h); e.asientos("b", h); for (const b of [0, 1, 2]) e.poner("a", h, b); }
    expect(aplicarEnOrden(e)).toBeGreaterThan(0);
  });

  it("varios mentores con horas de 1 o 2 proyectos (como la demo): termina sin volver atrás", () => {
    const e = escenario();
    for (const m of ["a", "b", "c", "d"]) for (let h = 8; h <= 11; h++) e.asientos(m, h);
    e.poner("a", 8, 0); e.poner("a", 9, 1); e.poner("a", 9, 3); e.poner("a", 10, 2); e.poner("a", 11, 0);
    e.poner("b", 8, 1); e.poner("c", 8, 2); e.poner("d", 9, 0);
    aplicarEnOrden(e);
  });
});

describe("la hora nunca cambia (escenarios al azar)", () => {
  it("200 días al azar cumplen las invariantes", () => {
    let semilla = 7;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let n = 0; n < 200; n++) {
      const e = escenario();
      const mentores = ["a", "b", "c", "d", "e"].slice(0, 2 + Math.floor(azar() * 4));
      for (const m of mentores) for (let h = 8; h <= 11; h++) if (azar() < 0.7) e.asientos(m, h, [0, 1, 2, 3].filter(() => azar() < 0.8));
      for (const a of [...e.lista]) if (azar() < 0.4) e.poner(a.mentorId, a.inicio.getUTCHours() - 5, a.inicio.getUTCMinutes() / 15, azar() < 0.15);
      const r = e.calcular(azar() < 0.5);
      invariantes(e, r);
      for (const x of r.resumen) expect(x.mentoresDespues).toBeLessThanOrEqual(x.mentoresAntes);
    }
  });
});

describe("con la base: aplicar y disponibilidad", () => {
  const ADMIN = { rol: "admin" as const, usuario: "admin.p" };
  let ids: ObjectId[] = [];
  beforeAll(async () => {
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
    const c = await db.collections();
    const now = new Date();
    ids = Array.from({ length: 4 }, () => new ObjectId());
    await c.proyectos.insertMany(ids.map((_id, i) => ({ _id, codigo: `P-${i}`, ciudad: "Cali", nombre: `=App ${i}`, monitor: null, integrantes: [{ documento: String(9300000000 + i), nombre: "Persona" }], creadoEn: now, actualizadoEn: now })));
    await c.mentores.insertMany([{ _id: "a", nombre: "Ana Mentora" }, { _id: "b", nombre: "Beto Mentor" }, { _id: "c", nombre: "Caro Mentora" }]);
    await c.dias.insertOne({ _id: D, ciudades: [{ ciudad: "Cali", cupos: null, sobrante: true, abre: null }] });
    const s = (inicio: Date, mentorId: string, proyectoId: ObjectId | null = null) => ({ _id: new ObjectId(), dia: D, inicio, mentorId, ciudades: ["Cali"], proyectoId });
    await c.asientos.insertMany([
      s(H(8), "a", ids[0]), s(H(8, 15), "b", ids[1]), // a y b: un solo asiento cada uno a las 8
      ...[0, 15, 30, 45].map((m) => s(H(8, m), "c")), // c disponible toda la hora
    ]);
  });
  afterAll(() => db.closeDb());

  it("propone pasar a c; si c deja de estar disponible (Franjas), ya no lo propone", async () => {
    let r = (await k.cargaMentores(D)).dia!;
    expect(r.resumen[0]!.propuestas.map((p) => p.a)).toEqual(["Caro Mentora", "Caro Mentora"]);
    const { quitarMentor, agregarMentor } = await import("@/lib/franjas");
    expect(await quitarMentor(D, 8, "c", ADMIN)).toMatchObject({ ok: true });
    r = (await k.cargaMentores(D)).dia!;
    expect(r.resumen[0]).toMatchObject({ propuestas: [], noSePuede: true });
    expect(await agregarMentor(D, 8, "c", ADMIN)).toMatchObject({ ok: true });
    expect((await k.cargaMentores(D)).dia!.resumen[0]!.propuestas).toHaveLength(2);
  });

  it("aplicar: mismo bloque, otro mentor, en el historial; rechaza si cambió y se recalcula", async () => {
    const c = await db.collections();
    const props = (await k.cargaMentores(D)).dia!.resumen[0]!.propuestas;
    const [p, q] = [props[0]!, props[1]!];
    const id = (s: string) => new ObjectId(s);
    const antes = (await c.asientos.findOne({ proyectoId: id(p.proyecto.id) }))!;
    expect(await k.aplicarPropuesta(id(p.proyecto.id), id(p.desde), id(p.hacia), ADMIN)).toMatchObject({ ok: true });
    const despues = (await c.asientos.findOne({ proyectoId: id(p.proyecto.id) }))!;
    expect(despues.inicio.getTime()).toBe(antes.inicio.getTime());
    expect(despues.mentorId).toBe("c");
    expect(await c.changeLog.findOne({ proyectoId: id(p.proyecto.id), accion: "cambiar_hora", motivo: /Mismo horario para el estudiante/ })).toBeTruthy();
    expect(await k.aplicarPropuesta(id(p.proyecto.id), id(p.desde), id(p.hacia), ADMIN)).toMatchObject({ ok: false, error: "cambio" });
    await c.asientos.updateOne({ _id: id(q.hacia) }, { $set: { proyectoId: ids[3] } });
    expect(await k.aplicarPropuesta(id(q.proyecto.id), id(q.desde), id(q.hacia), ADMIN)).toMatchObject({ ok: false, error: "sin_cupo" });
    await c.asientos.updateOne({ _id: id(q.hacia) }, { $set: { proyectoId: null } });
    const otroBloque = (await c.asientos.findOne({ mentorId: "c", inicio: { $ne: new Date(q.inicio) }, proyectoId: null }))!;
    expect(await k.aplicarPropuesta(id(q.proyecto.id), id(q.desde), otroBloque._id, ADMIN)).toMatchObject({ ok: false, error: "datos" });
    await c.evalResultados.insertOne({ _id: `${q.proyecto.id}|x`, proyectoId: id(q.proyecto.id), documento: "x", noPresento: false } as never);
    expect(await k.aplicarPropuesta(id(q.proyecto.id), id(q.desde), id(q.hacia), ADMIN)).toMatchObject({ ok: false, error: "ya_evaluado" });
    expect((await k.cargaMentores(D)).dia!.resumen[0]!.propuestas.some((x) => x.proyecto.id === q.proyecto.id)).toBe(false);
  });

  it("Excel: Resumen, Carga, Propuestas y No se puede juntar; nombres como texto", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await k.cargaMentoresExcel()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Carga", "Propuestas", "No se puede juntar"]);
    expect(wb.getWorksheet("Resumen")!.rowCount).toBe(2);
    const valores = wb.worksheets.flatMap((w) => w.getSheetValues().flat().map(String));
    expect(valores.some((v) => v.startsWith("="))).toBe(false);
  });
});

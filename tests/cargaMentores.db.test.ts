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
    e.asientos("d", 8); // el día tiene presentaciones a las 8: entre 7 y 9 sí hay hueco
    const r = e.calcular();
    invariantes(e, r);
    const h7 = r.resumen.find((x) => x.hora === 7)!;
    expect(h7.propuestas.map((p) => [p.a, p.motivo])).toEqual([["Mentor a", "juntar"], ["Mentor a", "juntar"]]);
    expect(r.indicadores.despues.horasSueltas).toBe(2); // a queda con 7 y 9 sueltas: se acepta
  });
});

describe("objetivo 2 · evitar huecos", () => {
  it("entre la mañana y la tarde (horas sin presentaciones) no hay hueco", () => {
    expect([...k.sueltas([11, 16], [8, 9, 10, 11, 16, 17])]).toEqual([]);
    expect(k.huecos(new Map([["a", new Set([11, 16])]]), [8, 9, 10, 11, 16, 17])).toBe(0);
    expect(k.huecos(new Map([["a", new Set([10, 16])]]), [8, 9, 10, 11, 16, 17])).toBe(1);
  });

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

describe("ajustes a «Equilibrar» y movimientos directos", () => {
  /** Aplica TODAS las propuestas de una vez y recalcula; devuelve el resultado nuevo. */
  function aplicarTodas(e: ReturnType<typeof escenario>) {
    const r = e.calcular();
    const ida = new Map<string, string>(); // proyecto → mentor del que salió
    for (const p of r.resumen.flatMap((x) => x.propuestas)) {
      const de = e.lista.find((x) => String(x._id) === p.desde)!, a = e.lista.find((x) => String(x._id) === p.hacia)!;
      ida.set(p.proyecto.id, de.mentorId);
      a.proyectoId = de.proyectoId; de.proyectoId = null;
    }
    return { despues: e.calcular(), ida };
  }

  it("cada proyecto aparece a lo sumo en una propuesta y, aplicadas todas, nada vuelve atrás", () => {
    const e = escenario();
    for (const m of ["a", "b", "c", "d"]) for (let h = 8; h <= 11; h++) e.asientos(m, h);
    e.poner("a", 8, 0); e.poner("a", 9, 1); e.poner("a", 9, 3); e.poner("a", 10, 2); e.poner("a", 11, 0);
    e.poner("b", 8, 1); e.poner("c", 8, 2); e.poner("d", 9, 0);
    for (let h = 8; h <= 11; h++) for (const b of [0, 1, 2]) if (!e.lista.find((x) => x.mentorId === "c" && x.inicio.getTime() === H(h, b * 15).getTime())!.proyectoId && h > 9) e.poner("c", h, b);
    const r = e.calcular();
    invariantes(e, r);
    const ids = r.resumen.flatMap((x) => x.propuestas.map((p) => p.proyecto.id));
    expect(new Set(ids).size).toBe(ids.length);
    const { despues, ida } = aplicarTodas(e);
    for (const p of despues.resumen.flatMap((x) => x.propuestas)) expect(e.lista.find((x) => String(x._id) === p.hacia)!.mentorId).not.toBe(ida.get(p.proyecto.id));
  });

  it("con pocos proyectos no se reparten horas de 1 o 2 (como la demo)", () => {
    const e = escenario();
    for (const m of ["a", "b", "c", "d", "e"]) for (let h = 8; h <= 11; h++) e.asientos(m, h);
    e.poner("a", 8, 0); e.poner("a", 8, 1); e.poner("a", 9, 0); e.poner("a", 9, 2); e.poner("a", 10, 1); e.poner("a", 11, 3);
    const r = e.calcular();
    expect(r.resumen.flatMap((x) => x.propuestas)).toEqual([]);
    expect(r.indicadores.despues.mentores).toBe(1);
  });

  it("equilibrar mueve horas completas de 3 o más y nunca parte una hora", () => {
    const e = escenario();
    for (let h = 6; h <= 10; h++) { e.asientos("a", h); e.asientos("b", h); for (const b of [0, 1, 2]) e.poner("a", h, b); }
    const r = e.calcular();
    invariantes(e, r);
    for (const x of r.resumen) {
      if (!x.propuestas.length) continue;
      expect(x.propuestas).toHaveLength(3); // la hora entera
      expect(new Set(x.propuestas.map((p) => p.a)).size).toBe(1);
      expect(x.mentoresDespues).toBe(1);
    }
    const horasDe = (m: string) => r.despues.find((f) => f.nombre === `Mentor ${m}`)?.horas.filter((y) => y.proyectos).length ?? 0;
    expect(Math.abs(horasDe("a") - horasDe("b"))).toBeLessThan(2);
    expect(r.despues.every((f) => f.horas.every((y) => !y.proyectos || y.proyectos >= 3))).toBe(true);
  });

  it("solo equilibra con diferencia de 2 o más horas", () => {
    const uno = escenario();
    for (const h of [6, 7]) { uno.asientos("a", h); uno.asientos("b", h); for (const b of [0, 1, 2]) uno.poner("a", h, b); }
    uno.asientos("b", 8); for (const b of [0, 1, 2]) uno.poner("b", 8, b);
    expect(uno.calcular().resumen.flatMap((x) => x.propuestas)).toEqual([]); // 2 y 1: diferencia 1
    const dos = escenario();
    for (const h of [6, 7, 8]) { dos.asientos("a", h); dos.asientos("b", h); for (const b of [0, 1, 2]) dos.poner("a", h, b); }
    const r = dos.calcular(); // 3 y 0: se pasa una hora completa (sin abrir huecos)
    expect(r.resumen.flatMap((x) => x.propuestas)).toHaveLength(3);
    expect(r.indicadores.despues.horasSueltas).toBe(0);
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
      const ids = r.resumen.flatMap((x) => x.propuestas.map((p) => p.proyecto.id));
      expect(new Set(ids).size).toBe(ids.length); // cada proyecto se mueve a lo sumo una vez
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
    expect(await k.aplicarPropuesta(id(q.proyecto.id), id(q.desde), id(q.hacia), ADMIN)).toMatchObject({ ok: false, error: "con_datos" });
    expect((await k.cargaMentores(D)).dia!.resumen[0]!.propuestas.some((x) => x.proyecto.id === q.proyecto.id)).toBe(false);
  });

  it("fuera de las propuestas y rechazados: «No se presentó», asistencia o notas del monitor, borrador; y bloques a menos de 30 min", async () => {
    const c = await db.collections();
    // Base nueva: tres proyectos a las 9, cada uno con un mentor distinto, y d disponible toda la hora.
    await c.asientos.deleteMany({}); await c.evalResultados.deleteMany({}); await c.evalMonitor.deleteMany({}); await c.evalBorradores.deleteMany({});
    const s = (inicio: Date, mentorId: string, proyectoId: ObjectId | null = null) => ({ _id: new ObjectId(), dia: D, inicio, mentorId, ciudades: ["Cali"], proyectoId });
    await c.asientos.insertMany([s(H(9), "a", ids[0]), s(H(9, 15), "b", ids[1]), s(H(9, 30), "c", ids[2]), ...[0, 15, 30, 45].map((m) => s(H(9, m), "d"))]);
    await c.mentores.updateOne({ _id: "d" }, { $set: { nombre: "Dani Mentor" } }, { upsert: true });
    const ANTES = new Date("2026-11-11T12:00:00Z");
    const props = async (ahora = ANTES) => (await k.cargaMentores(D, ahora)).dia!.resumen.flatMap((x) => x.propuestas).map((p) => p.proyecto.codigo).sort();
    expect(await props()).toEqual(["P-0", "P-1", "P-2"]);
    await c.evalResultados.insertOne({ _id: `${ids[0]}|x`, proyectoId: ids[0]!, documento: "x", noPresento: true } as never); // «No se presentó»
    await c.evalMonitor.insertOne({ _id: `${ids[1]}|x`, proyectoId: ids[1]!, documento: "x", asistencia: null, motivo: null, observacion: "Nota", actualizadoEn: new Date(), actualizadoPor: "moni" } as never);
    await c.evalBorradores.insertOne({ _id: String(ids[2]), usuario: "m", datos: {}, actualizadoEn: new Date() } as never);
    expect(await props()).toEqual([]);
    // Aplicar (con los ids de antes) también lo rechaza, dentro de la transacción.
    const libre = (await c.asientos.findOne({ mentorId: "d", inicio: H(9) }))!;
    const desde = (await c.asientos.findOne({ proyectoId: ids[0] }))!;
    expect(await k.aplicarPropuesta(ids[0]!, desde._id, libre._id, ADMIN, ANTES)).toMatchObject({ ok: false, error: "con_datos" });
    // Sin datos, pero a menos de 30 min: ni propuesta ni aplicar.
    await c.evalResultados.deleteMany({}); await c.evalMonitor.deleteMany({}); await c.evalBorradores.deleteMany({});
    const cerca = new Date(H(9, 30).getTime() - 20 * 60e3); // 9:10: los tres bloques (9:00, 9:15, 9:30) empiezan en menos de 30 min
    expect(await props(cerca)).toEqual([]);
    expect(await k.aplicarPropuesta(ids[0]!, desde._id, libre._id, ADMIN, cerca)).toMatchObject({ ok: false, error: "por_empezar" });
    expect(await props(new Date(H(9).getTime() - 31 * 60e3))).toEqual(["P-0", "P-1", "P-2"]);
  });

  it("Cambiar mentor (Tablero u Horarios) a menos de 30 min: pide confirmación y lo anota", async () => {
    const { cambiarHora } = await import("@/lib/admin");
    const c = await db.collections();
    const ahora = new Date();
    const pronto = new Date(Math.ceil((ahora.getTime() + 10 * 60e3) / 900e3) * 900e3); // próximo bloque en menos de 30 min
    const s = (mentorId: string, proyectoId: ObjectId | null = null) => ({ _id: new ObjectId(), dia: D, inicio: pronto, mentorId, ciudades: ["Cali"], proyectoId });
    const [viejo, otro] = [s("a", ids[3]), s("e")];
    await c.asientos.deleteMany({ proyectoId: ids[3] });
    await c.asientos.insertMany([viejo, otro]);
    const pid = ids[3]!;
    expect(await cambiarHora(pid, pronto, { otraCiudad: false, motivo: "", asiento: otro._id }, ADMIN)).toMatchObject({ ok: false, error: "en_curso", mensaje: expect.stringMatching(/por empezar o en curso/) });
    expect((await c.asientos.findOne({ proyectoId: pid }))!.mentorId).toBe("a");
    expect(await cambiarHora(pid, pronto, { otraCiudad: false, motivo: "El mentor no llegó", asiento: otro._id, confirmarEnCurso: true }, ADMIN)).toMatchObject({ ok: true });
    expect((await c.asientos.findOne({ proyectoId: pid }))!.mentorId).toBe("e");
    expect(await c.changeLog.findOne({ proyectoId: pid, accion: "cambiar_hora", nuevo: /presentación por empezar o en curso/ })).toBeTruthy();
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

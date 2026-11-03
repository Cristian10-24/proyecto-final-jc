import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Tablero de horarios (Paso 16) contra la base LOCAL: sus datos y las acciones de Horarios que usa (cambiar hora,
// cambiar mentor, liberar) con la lógica común de mover.ts. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const admin = await import("@/lib/admin");
const { datosTablero } = await import("@/lib/tableroHorarios");
const { inicioUTC } = await import("@/lib/edicion");

const D = "2026-11-12", D2 = "2026-11-13";
const actor = { rol: "admin" as const, usuario: "admin.p" };
const P: Record<string, ObjectId> = {};
const S: Record<string, ObjectId> = {};

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections(), now = new Date();
  await c.mentores.insertMany([{ _id: "mentor-a", nombre: "Mentor A" }, { _id: "mentor-b", nombre: "Mentor B" }]);
  await c.dias.insertMany([
    { _id: D, ciudades: [{ ciudad: "Cali", cupos: 4, sobrante: false, abre: null }, { ciudad: "Cartagena", cupos: 4, sobrante: false, abre: null }] },
    { _id: D2, ciudades: [{ ciudad: "Cartagena", cupos: 4, sobrante: false, abre: null }] },
  ]);
  for (const [k, ciudad] of [["T1", "Cali"], ["T2", "Cali"], ["T3", "Cartagena"], ["T4", "Cali"]] as const) {
    P[k] = new ObjectId();
    await c.proyectos.insertOne({ _id: P[k]!, codigo: k, ciudad, nombre: `App ${k}`, ruta: "Básica", creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: `Persona ${k}`, documento: `55${k.slice(1)}0` }] });
  }
  const asiento = async (clave: string, dia: string, h: number, m: number, mentorId: string, ciudades: string[], proyecto?: string) => {
    S[clave] = new ObjectId();
    await c.asientos.insertOne({ _id: S[clave]!, dia, inicio: inicioUTC(dia, h, m), mentorId, ciudades, proyectoId: proyecto ? P[proyecto]! : null });
  };
  await asiento("a8", D, 8, 0, "mentor-a", ["Cali"], "T1");
  await asiento("b8", D, 8, 0, "mentor-b", ["Cali"]); // libre, mismo bloque (cambiar mentor)
  await asiento("a815", D, 8, 15, "mentor-a", ["Cali"], "T2");
  await asiento("b815", D, 8, 15, "mentor-b", ["Cartagena"], "T3"); // bloque lleno
  await asiento("a830", D, 8, 30, "mentor-a", ["Cartagena"]); // libre, de otra ciudad
  await asiento("d2", D2, 9, 0, "mentor-a", ["Cartagena"]);
  await c.planSalas.insertOne({ _id: `${D}|8|1`, dia: D, hora: 8, sala: 1, mentorId: "mentor-a", monitor: null, origen: null });
  // T2: evaluado (no se mueve). T1: uno No se presentó (se limpia al mover o liberar).
  await c.evalResultados.insertOne({ _id: `${P.T2!.toHexString()}|5520`, proyectoId: P.T2!, documento: "5520", mentorId: "mentor-a", a: {}, b: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "", noPresento: false, actualizadoEn: now, actualizadoPor: "m" });
});
afterAll(() => db.closeDb());

describe("datos del tablero", () => {
  it("horas con 4 bloques y capacidad usada/total, tarjetas con mentor y sala, y Sin hora", async () => {
    const d = await datosTablero(D);
    expect(d.dias).toEqual([D, D2]);
    expect(d.ciudadesDia.map((x) => x.ciudad).sort()).toEqual(["Cali", "Cartagena"]);
    expect(d.horas.map((h) => h.hora)).toEqual([8]);
    expect(d.horas[0]!.bloques.map((b) => [b.ocupados, b.total])).toEqual([[1, 2], [2, 2], [0, 1], [0, 0]]);
    const t1 = d.horas[0]!.bloques[0]!.tarjetas[0]!;
    expect(t1).toMatchObject({ codigo: "T1", mentor: "Mentor A", sala: 1, estado: "pendiente", evaluado: false });
    expect(d.horas[0]!.bloques[1]!.tarjetas.find((t) => t.codigo === "T2")).toMatchObject({ evaluado: true });
    expect(d.horas[0]!.bloques[0]!.asientosLibres).toEqual([{ id: String(S.b8), mentor: "Mentor B", ciudades: ["Cali"] }]);
    expect(d.sinHora.map((t) => t.codigo)).toEqual(["T4"]);
    expect(d.diasPorCiudad.Cali).toEqual([D]);
  });
});

describe("acciones (las de Horarios, con mover.ts)", () => {
  it("bloque lleno: no se mueve", async () => {
    expect(await admin.cambiarHora(P.T1!, inicioUTC(D, 8, 15), { otraCiudad: true, motivo: "Tablero" }, actor)).toMatchObject({ ok: false, error: "sin_cupo" });
  });

  it("asiento de otra ciudad: solo con otraCiudad", async () => {
    expect(await admin.cambiarHora(P.T4!, inicioUTC(D, 8, 30), { otraCiudad: false, motivo: "Tablero" }, actor)).toMatchObject({ ok: false, error: "sin_cupo" });
    expect(await admin.cambiarHora(P.T4!, inicioUTC(D, 8, 30), { otraCiudad: true, motivo: "Tablero" }, actor)).toMatchObject({ ok: true });
    const log = await (await db.collections()).changeLog.findOne({ proyectoId: P.T4, accion: "cambiar_hora" });
    expect(log?.nuevo).toMatch(/asiento de Cartagena/);
  });

  it("un asiento elegido de otra ciudad sin otraCiudad no se toma", async () => {
    const c = await db.collections();
    const libre = new ObjectId();
    await c.asientos.insertOne({ _id: libre, dia: D, inicio: inicioUTC(D, 8, 45), mentorId: "mentor-b", ciudades: ["Cartagena"], proyectoId: null });
    expect(await admin.cambiarHora(P.T3!, inicioUTC(D, 8, 45), { otraCiudad: false, motivo: "", asiento: libre }, actor)).toMatchObject({ ok: true }); // T3 es de Cartagena
    expect(await admin.cambiarHora(P.T4!, inicioUTC(D, 8, 45), { otraCiudad: false, motivo: "", asiento: S.b815! }, actor)).toMatchObject({ ok: false, error: "sin_cupo" });
  });

  it("el tablero y un estudiante quieren el mismo cupo a la vez: solo uno lo toma", async () => {
    const c = await db.collections(), { reservar } = await import("@/lib/reservas");
    const inicio = inicioUTC(D, 10, 0), now = new Date();
    await c.asientos.insertOne({ _id: new ObjectId(), dia: D, inicio, mentorId: "mentor-b", ciudades: ["Cali"], proyectoId: null });
    const T5 = new ObjectId();
    await c.proyectos.insertOne({ _id: T5, codigo: "T5", ciudad: "Cali", nombre: "App T5", creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: "Persona T5", documento: "5550" }] });
    const [r1, r2] = await Promise.all([admin.cambiarHora(P.T4!, inicio, { otraCiudad: false, motivo: "Tablero" }, actor), reservar("5550", inicio, new Date("2026-11-01T12:00:00Z"))]);
    expect([r1.ok, "ok" in r2 ? r2.ok : false].filter(Boolean)).toHaveLength(1);
    expect(await c.asientos.countDocuments({ inicio, proyectoId: { $type: "objectId" } })).toBe(1);
    expect(await c.asientos.countDocuments({ proyectoId: P.T4 })).toBe(1); // nunca dos asientos ni ninguno
  });

  it("ya evaluado: no se mueve ni se libera", async () => {
    expect(await admin.cambiarHora(P.T2!, inicioUTC(D2, 9, 0), { otraCiudad: true, motivo: "" }, actor)).toMatchObject({ ok: false, error: "ya_evaluado" });
    expect(await admin.liberar(P.T2!, "", actor)).toMatchObject({ ok: false, error: "ya_evaluado" });
    expect((await (await db.collections()).asientos.findOne({ _id: S.a815 }))?.proyectoId).toEqual(P.T2);
  });

  it("anular la evaluación (admin): se guarda una copia, queda changeLog y el proyecto vuelve a poder moverse", async () => {
    const c = await db.collections();
    const lista = await admin.listarProyectos({ q: "T2" });
    expect(lista[0]?.evaluado).toBe(true);
    expect(lista[0]?.evaluadoEn).toBeDefined();
    expect(await admin.anularEvaluacion(P.T2!, "Versión vieja", actor, "2020-01-01T00:00:00.000Z")).toMatchObject({ ok: false, error: "cambio" });
    expect(await admin.anularEvaluacion(new ObjectId(), "No existe", actor)).toMatchObject({ ok: false, error: "sin_proyecto" });
    expect(await admin.anularEvaluacion(P.T2!, "Se evaluó al proyecto equivocado", actor, lista[0]!.evaluadoEn)).toEqual({ ok: true });
    expect(await c.evalResultados.countDocuments({ proyectoId: P.T2 })).toBe(0);
    const copia = await c.evalAnuladas.findOne({ proyectoId: P.T2 });
    expect([copia?.evaluaciones.length, copia?.motivo, copia?.anuladoPor]).toEqual([1, "Se evaluó al proyecto equivocado", "admin.p"]);
    const log = await c.changeLog.findOne({ proyectoId: P.T2, accion: "anular_evaluacion" });
    expect([log?.anterior, log?.nuevo, log?.motivo]).toEqual(["Persona: Pendiente", "Pendiente", "Se evaluó al proyecto equivocado"]);
    expect((await admin.listarProyectos({ q: "T2" }))[0]?.evaluado).toBe(false);
    expect(await admin.anularEvaluacion(P.T2!, "otra vez", actor)).toMatchObject({ ok: false, error: "sin_evaluacion" });
    expect(await c.evalAnuladas.countDocuments({ proyectoId: P.T2 })).toBe(1); // el intento fallido no copia nada
    expect(await c.changeLog.countDocuments({ proyectoId: P.T2, accion: "anular_evaluacion" })).toBe(1);
    expect(await admin.cambiarHora(P.T2!, inicioUTC(D2, 9, 0), { otraCiudad: true, motivo: "" }, actor)).toMatchObject({ ok: true }); // ya se puede mover
  });

  it("cambiar mentor en el mismo bloque toma exactamente el asiento elegido", async () => {
    const c = await db.collections();
    await c.evalResultados.insertOne({ _id: `${P.T1!.toHexString()}|5510`, proyectoId: P.T1!, documento: "5510", mentorId: "mentor-a", a: {}, b: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "", noPresento: true, actualizadoEn: new Date(), actualizadoPor: "m" });
    expect(await admin.cambiarHora(P.T1!, inicioUTC(D, 8, 0), { otraCiudad: true, motivo: "Tablero: cambio de mentor", asiento: S.b8! }, actor)).toMatchObject({ ok: true });
    expect((await c.asientos.findOne({ _id: S.b8 }))?.proyectoId).toEqual(P.T1);
    expect((await c.asientos.findOne({ _id: S.a8 }))?.proyectoId).toBeNull();
    expect(await c.evalResultados.countDocuments({ proyectoId: P.T1 })).toBe(0); // el No se presentó vuelve a Pendiente
    expect((await c.changeLog.findOne({ proyectoId: P.T1, accion: "cambiar_hora" }))?.nuevo).toMatch(/mentor-b/);
    expect(await admin.cambiarHora(P.T1!, inicioUTC(D, 8, 0), { otraCiudad: true, motivo: "", asiento: S.b8! }, actor)).toMatchObject({ ok: false, error: "misma_hora" });
  });

  it("liberar: queda sin hora y aparece en Sin hora", async () => {
    expect(await admin.liberar(P.T1!, "Tablero", actor)).toEqual({ ok: true });
    expect((await datosTablero(D)).sinHora.map((t) => t.codigo)).toContain("T1");
    expect(await admin.liberar(P.T1!, "", actor)).toMatchObject({ ok: false, error: "sin_hora" });
  });

  it("asignar hora a un proyecto sin hora (soltar desde Sin hora)", async () => {
    expect(await admin.cambiarHora(P.T1!, inicioUTC(D, 8, 0), { otraCiudad: false, motivo: "Tablero" }, actor)).toMatchObject({ ok: true });
    expect((await (await db.collections()).asientos.findOne({ proyectoId: P.T1 }))?.inicio).toEqual(inicioUTC(D, 8, 0));
  });
});

describe("anular mientras el mentor guarda", () => {
  it("nunca queda una evaluación vigente que también esté en anuladas; el mentor la vuelve a ver Pendiente", async () => {
    const c = await db.collections(), ev = await import("@/lib/evaluacion/datos");
    const pid = new ObjectId(), now = new Date(), inicio = inicioUTC(D, 11, 0);
    await c.proyectos.insertOne({ _id: pid, codigo: "T9", ciudad: "Cali", nombre: "App T9", creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: "Persona T9", documento: "5590" }] });
    await c.asientos.insertOne({ _id: new ObjectId(), dia: D, inicio, mentorId: "mentor-a", ciudades: ["Cali"], proyectoId: pid });
    const mentor = { id: new ObjectId().toHexString(), usuario: "mentor.a", nombre: "Mentor A", rol: "mentor" as const, ciudades: [], mentorId: "mentor-a" };
    const A = Object.fromEntries(["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((k) => [k, "si"])) as never;
    const form = (n: number) => ({ a: A, b: [{ b1: n, b2: n }], destacado: false, fortaleza: "", mejora: "", percepcion: "" });
    expect(await ev.guardarEvaluacion(mentor, String(pid), form(2))).toMatchObject({ ok: true });
    for (let i = 0; i < 5; i++) {
      await Promise.all([admin.anularEvaluacion(pid, `carrera ${i}`, actor), ev.guardarEvaluacion(mentor, String(pid), form(3))]);
      const vigentes = await c.evalResultados.find({ proyectoId: pid }).toArray();
      const copias = (await c.evalAnuladas.find({ proyectoId: pid }).toArray()).flatMap((x) => x.evaluaciones);
      for (const v of vigentes) expect(copias.some((x) => x._id === v._id && x.actualizadoEn.getTime() === v.actualizadoEn.getTime())).toBe(false);
    }
    await admin.anularEvaluacion(pid, "fin", actor);
    const d = await ev.detalleEvaluacion(mentor, String(pid));
    if ("error" in d) throw new Error(d.error);
    expect(d.integrantes[0]!.res).toBe("Pendiente");
    expect(await ev.guardarEvaluacion(mentor, String(pid), form(4))).toMatchObject({ ok: true }); // se puede volver a evaluar
  });
});

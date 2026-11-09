import { ObjectId } from "mongodb";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Paso 25 · «Cambiar mentor (mismo bloque)» desde Horarios (y el Tablero), filtro por mentor y buscador del Tablero,
// contra la base LOCAL. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const admin = await import("@/lib/admin");
const { mentoresLibres } = await import("@/lib/cambioMentor");
const { buscarTablero } = await import("@/lib/tableroHorarios");
const { inicioUTC, diaCOL } = await import("@/lib/edicion");

const D = "2026-11-12", D2 = "2026-11-13";
const ANTES = new Date("2026-11-09T12:00:00Z");
const actor = { rol: "admin" as const, usuario: "admin.p" };
const P: Record<string, ObjectId> = {};
const S: Record<string, ObjectId> = {};

async function sembrar() {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections(), now = new Date();
  await c.mentores.insertMany(["a", "b", "c", "d", "e"].map((x) => ({ _id: `mentor-${x}`, nombre: `Mentor ${x.toUpperCase()}` })));
  for (const [k, ciudad] of [["T1", "Cali"], ["T2", "Cali"], ["T3", "Cali"], ["T4", "Cali"], ["T5", "Cali"], ["T6", "Cali"]] as const) {
    P[k] = new ObjectId();
    await c.proyectos.insertOne({ _id: P[k]!, codigo: `PF-${k}`, ciudad, nombre: `App ${k}`, ruta: "Básica", creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: `Persona ${k}`, documento: `77${k.slice(1)}01` }] });
  }
  const asiento = async (clave: string, inicio: Date, mentorId: string, ciudades: string[], proyecto?: string) => {
    S[clave] = new ObjectId();
    await c.asientos.insertOne({ _id: S[clave]!, dia: diaCOL(inicio), inicio, mentorId, ciudades, proyectoId: proyecto ? P[proyecto]! : null });
  };
  await asiento("a8", inicioUTC(D, 8, 0), "mentor-a", ["Cali"], "T1"); // el proyecto que cambia de mentor
  await asiento("b8", inicioUTC(D, 8, 0), "mentor-b", ["Cali"]); // libre: B ya tiene uno en esta hora
  await asiento("c8", inicioUTC(D, 8, 0), "mentor-c", ["Cartagena"]); // libre, asiento de otra ciudad
  await asiento("d8", inicioUTC(D, 8, 0), "mentor-d", ["Cali"], "T4"); // ocupado: no aparece
  await asiento("b815", inicioUTC(D, 8, 15), "mentor-b", ["Cali"], "T2");
  await asiento("e815", inicioUTC(D, 8, 15), "mentor-e", ["Cali"]); // libre en OTRO bloque: no aparece
  await asiento("b9d2", inicioUTC(D2, 9, 0), "mentor-b", ["Cali"], "T3");
}
beforeEach(sembrar);
afterAll(() => db.closeDb());

const asientoDe = async (k: string) => (await db.collections()).asientos.findOne({ proyectoId: P[k]! });

describe("mentores disponibles en el bloque exacto", () => {
  it("solo los asientos libres del mismo bloque, con su carga y primero quien ya tiene proyectos en esa hora", async () => {
    const r = await mentoresLibres(P.T1!, ANTES);
    expect(r).toMatchObject({ ok: true, inicio: inicioUTC(D, 8, 0).toISOString(), mentor: "Mentor A", bloqueo: null, enCurso: false });
    if (!r.ok) throw new Error();
    expect(r.opciones).toEqual([
      { asiento: String(S.b8), mentor: "Mentor B", ciudades: ["Cali"], deSuCiudad: true, enHora: 1, enDia: 1, total: 2 },
      { asiento: String(S.c8), mentor: "Mentor C", ciudades: ["Cartagena"], deSuCiudad: false, enHora: 0, enDia: 0, total: 0 },
    ]);
  });

  it("sin otro mentor libre: lista vacía", async () => {
    const c = await db.collections();
    await c.asientos.updateOne({ _id: S.b8! }, { $set: { proyectoId: P.T5! } });
    await c.asientos.updateOne({ _id: S.c8! }, { $set: { proyectoId: P.T6! } });
    const r = await mentoresLibres(P.T1!, ANTES);
    expect(r.ok && r.opciones).toEqual([]);
  });

  it("proyecto sin hora o inexistente", async () => {
    expect(await mentoresLibres(P.T5!, ANTES)).toEqual({ ok: false, error: "sin_hora" });
    expect(await mentoresLibres(new ObjectId(), ANTES)).toEqual({ ok: false, error: "sin_proyecto" });
  });
});

describe("cambiar mentor desde Horarios (mismo bloque)", () => {
  const cambiar = (k: string, inicio: Date, asiento: ObjectId, extra: Record<string, unknown> = {}) =>
    admin.cambiarHora(P[k]!, inicio, { otraCiudad: true, motivo: "Horarios: cambio de mentor", asiento, mismoBloque: true, ...extra }, actor);

  it("mantiene el bloque exacto, cambia solo el mentor y deja changeLog", async () => {
    expect(await cambiar("T1", inicioUTC(D, 8, 0), S.b8!)).toMatchObject({ ok: true, inicio: inicioUTC(D, 8, 0).toISOString() });
    const a = await asientoDe("T1");
    expect(a).toMatchObject({ _id: S.b8!, mentorId: "mentor-b" });
    expect(a!.inicio.toISOString()).toBe(inicioUTC(D, 8, 0).toISOString());
    await expect((await db.collections()).asientos.findOne({ _id: S.a8! })).resolves.toMatchObject({ proyectoId: null });
    const log = await (await db.collections()).changeLog.findOne({ proyectoId: P.T1!, accion: "cambiar_hora" });
    expect(log).toMatchObject({ anterior: expect.stringContaining("mentor-a"), nuevo: expect.stringContaining("mentor-b"), motivo: "Horarios: cambio de mentor" });
  });

  it("nunca cambia de hora: un asiento de otro bloque se rechaza", async () => {
    expect(await cambiar("T1", inicioUTC(D, 8, 15), S.e815!)).toMatchObject({ ok: false, error: "cambio" });
    expect(await asientoDe("T1")).toMatchObject({ _id: S.a8! });
  });

  it("no deja elegir un mentor sin asiento libre", async () => {
    expect(await cambiar("T1", inicioUTC(D, 8, 0), S.d8!)).toMatchObject({ ok: false, error: "sin_cupo" });
    expect(await asientoDe("T1")).toMatchObject({ _id: S.a8! });
    expect(await asientoDe("T4")).toMatchObject({ _id: S.d8! });
  });

  it("si el asiento se ocupa entre elegir y guardar, rechaza con aviso", async () => {
    const r = await mentoresLibres(P.T1!, ANTES);
    const elegido = r.ok ? new ObjectId(r.opciones[0]!.asiento) : null;
    await (await db.collections()).asientos.updateOne({ _id: elegido! }, { $set: { proyectoId: P.T5! } }); // un estudiante lo tomó
    expect(await cambiar("T1", inicioUTC(D, 8, 0), elegido!)).toMatchObject({ ok: false, error: "sin_cupo", mensaje: expect.any(String) });
    expect(await asientoDe("T1")).toMatchObject({ _id: S.a8! });
    expect(await asientoDe("T5")).toMatchObject({ _id: elegido! });
  });

  it("dos cambios a la vez al mismo asiento: solo uno gana", async () => {
    const c = await db.collections();
    // T1 y T4 (ambos a las 8:00) quieren el asiento libre de B.
    const [x, y] = await Promise.all([cambiar("T1", inicioUTC(D, 8, 0), S.b8!), cambiar("T4", inicioUTC(D, 8, 0), S.b8!)]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(await c.asientos.countDocuments({ _id: S.b8!, proyectoId: { $type: "objectId" } })).toBe(1);
  });

  it.each([
    ["evaluación guardada", "evalResultados"],
    ["«No se presentó»", "noPresento"],
    ["asistencia o notas del monitor", "evalMonitor"],
    ["borrador del mentor", "evalBorradores"],
  ])("respeta la exclusión: %s", async (_n, tipo) => {
    const c = await db.collections(), now = new Date(), doc = "77101";
    if (tipo === "evalResultados" || tipo === "noPresento")
      await c.evalResultados.insertOne({ _id: `${P.T1!.toHexString()}|${doc}`, proyectoId: P.T1!, documento: doc, mentorId: "mentor-a", a: {}, b: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "", noPresento: tipo === "noPresento", actualizadoEn: now, actualizadoPor: "m" });
    if (tipo === "evalMonitor")
      await c.evalMonitor.insertOne({ _id: `${P.T1!.toHexString()}|${doc}`, proyectoId: P.T1!, documento: doc, asistencia: "si", motivo: null, observacion: "", actualizadoEn: now, actualizadoPor: "moni" } as never);
    if (tipo === "evalBorradores")
      await c.evalBorradores.insertOne({ _id: String(P.T1!), usuario: "m", datos: {}, actualizadoEn: now } as never);
    expect(await mentoresLibres(P.T1!, ANTES)).toMatchObject({ ok: true, bloqueo: "con_datos" });
    expect(await cambiar("T1", inicioUTC(D, 8, 0), S.b8!)).toMatchObject({ ok: false });
    expect(await asientoDe("T1")).toMatchObject({ _id: S.a8! });
  });

  it("a menos de 30 minutos pide confirmación y la anota", async () => {
    const c = await db.collections();
    const pronto = new Date(Math.ceil((Date.now() + 10 * 60e3) / 60e3) * 60e3);
    await c.asientos.insertMany([
      { _id: new ObjectId(), dia: diaCOL(pronto), inicio: pronto, mentorId: "mentor-a", ciudades: ["Cali"], proyectoId: P.T6! },
      { _id: S.pronto = new ObjectId(), dia: diaCOL(pronto), inicio: pronto, mentorId: "mentor-c", ciudades: ["Cali"], proyectoId: null },
    ]);
    expect(await mentoresLibres(P.T6!)).toMatchObject({ ok: true, enCurso: true });
    expect(await cambiar("T6", pronto, S.pronto)).toMatchObject({ ok: false, error: "en_curso" });
    expect(await cambiar("T6", pronto, S.pronto, { confirmarEnCurso: true })).toMatchObject({ ok: true });
    expect((await c.changeLog.findOne({ proyectoId: P.T6! }))?.nuevo).toMatch(/por empezar o en curso/);
  });

  it("proyecto sin hora: no hay cambio de mentor", async () => {
    expect(await cambiar("T5", inicioUTC(D, 8, 0), S.b8!)).toMatchObject({ ok: false, error: "sin_hora" });
    expect(await asientoDe("T5")).toBeNull();
  });
});

describe("filtro por mentor y buscador del Tablero", () => {
  it("Horarios filtra todos los proyectos de un mentor (cualquier día)", async () => {
    expect((await admin.listarProyectos({ mentor: "mentor-b" })).map((p) => p.codigo).sort()).toEqual(["PF-T2", "PF-T3"]);
    expect(await admin.listarProyectos({ mentor: "mentor-c" })).toEqual([]);
    expect((await admin.listarProyectos({ mentor: "mentor-b", q: "T3" })).map((p) => p.codigo)).toEqual(["PF-T3"]);
  });

  it("busca por nombre, integrante, código o documento y dice el día (sin devolver documentos)", async () => {
    const admin_ = { documentoParcial: true }, coord = { documentoParcial: false };
    for (const q of ["App T3", "Persona T3", "PF-T3", "77301"]) {
      for (const o of [admin_, coord]) {
        const r = await buscarTablero(q, o);
        expect(r).toEqual([{ id: String(P.T3), codigo: "PF-T3", proyecto: "App T3", ciudad: "Cali", dia: D2, inicio: inicioUTC(D2, 9, 0).toISOString() }]);
      }
    }
    expect(await buscarTablero("PF-T5", admin_)).toMatchObject([{ dia: null, inicio: null }]);
    expect(JSON.stringify(await buscarTablero("App", admin_))).not.toMatch(/77\d01/);
    expect(await buscarTablero("(.*", admin_)).toEqual([]);
  });

  it("coordinación no adivina documentos por prefijo: solo el documento exacto", async () => {
    expect(await buscarTablero("773", { documentoParcial: false })).toEqual([]);
    expect((await buscarTablero("773", { documentoParcial: true })).map((r) => r.codigo)).toEqual(["PF-T3"]);
  });
});

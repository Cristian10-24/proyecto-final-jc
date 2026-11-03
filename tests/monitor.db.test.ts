import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { SessionUser } from "@/lib/auth";

// Vista del monitor en las presentaciones (Paso 12) contra la base LOCAL: solo los proyectos de sus salas (de
// cualquier ciudad), asistencia y motivo, reprogramar en su ciudad y días, y sugerir cambios. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const mon = await import("@/lib/evaluacion/monitor");
const ev = await import("@/lib/evaluacion/datos");
const { diaCOL, inicioUTC } = await import("@/lib/edicion");

// Días futuros (la reprogramación solo usa cupos que aún no empiezan).
const D = diaCOL(new Date(Date.now() + 10 * 86400_000)), D2 = diaCOL(new Date(Date.now() + 11 * 86400_000));
const usuario = (u: string, rol: SessionUser["rol"], extra: Partial<SessionUser> = {}): SessionUser => ({ id: new ObjectId().toHexString(), usuario: u, nombre: `Prueba ${u}`, rol, ciudades: ["Cali"], ...extra });
const mon1 = usuario("mon.uno", "monitor"), mon2 = usuario("mon.dos", "monitor"), monSin = usuario("mon.tres", "monitor");
const mentorA = usuario("mentor.a", "mentor", { mentorId: "mentor-a" }), admin = usuario("admin.p", "admin");

const P: Record<string, ObjectId> = {};
const S: Record<string, ObjectId> = {};
async function asiento(clave: string, dia: string, hora: number, min: number, mentorId: string, ciudad: string, proyecto?: string) {
  const _id = new ObjectId();
  await (await db.collections()).asientos.insertOne({ _id, dia, inicio: inicioUTC(dia, hora, min), mentorId, ciudades: [ciudad], proyectoId: proyecto ? P[proyecto]! : null });
  S[clave] = _id;
}
async function proyecto(codigo: string, ciudad: string, nombres: string[]) {
  const _id = new ObjectId(), now = new Date();
  await (await db.collections()).proyectos.insertOne({
    _id, codigo, ciudad, nombre: `App ${codigo}`, creadoEn: now, actualizadoEn: now,
    integrantes: nombres.map((nombre, i) => ({ nombre, documento: `77${codigo.replace(/\D/g, "")}00${i}`, correo: `${codigo.toLowerCase()}${i}@correo.test`, celular: "300 555 0000" })),
  });
  P[codigo] = _id;
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.mentores.insertMany([{ _id: "mentor-a", nombre: "Mentor A" }, { _id: "mentor-b", nombre: "Mentor B" }]);
  await c.dias.insertMany([
    { _id: D, ciudades: [{ ciudad: "Cali", cupos: 4, sobrante: false, abre: null }, { ciudad: "Cartagena", cupos: 4, sobrante: false, abre: null }] },
    { _id: D2, ciudades: [{ ciudad: "Cartagena", cupos: 4, sobrante: false, abre: null }] },
  ]);
  await proyecto("P1", "Cali", ["Ana Uno", "Beto Uno"]);
  await proyecto("P2", "Cartagena", ["Carla Dos"]);
  await proyecto("P3", "Cali", ["Dario Tres"]);
  await proyecto("P4", "Cartagena", ["Elena Cuatro"]);
  await proyecto("P5", "Cali", ["Felipe Cinco"]); // sin hora
  await asiento("a8", D, 8, 0, "mentor-a", "Cali", "P1");
  await asiento("a815", D, 8, 15, "mentor-a", "Cartagena", "P2");
  await asiento("b8", D, 8, 0, "mentor-b", "Cali", "P3");
  await asiento("a9", D, 9, 0, "mentor-a", "Cali"); // libre, Cali
  await asiento("a915", D, 9, 15, "mentor-a", "Cartagena"); // libre, Cartagena
  await asiento("b2", D2, 8, 0, "mentor-b", "Cali"); // libre, pero Cali no presenta ese día
  await asiento("a2", D2, 8, 0, "mentor-a", "Cartagena", "P4"); // mismo mentor y hora que la sala de mon1, otro día
  await asiento("a215", D2, 8, 15, "mentor-a", "Cartagena"); // libre, Cartagena, sala sin monitor
  await c.planSalas.insertMany([
    { _id: `${D}|8|1`, dia: D, hora: 8, sala: 1, mentorId: "mentor-a", monitor: "mon.uno", origen: "importado" },
    { _id: `${D}|8|2`, dia: D, hora: 8, sala: 2, mentorId: "mentor-b", monitor: "mon.dos", origen: "importado" },
    { _id: `${D}|9|1`, dia: D, hora: 9, sala: 1, mentorId: "mentor-a", monitor: "mon.uno", origen: "automatico" },
  ]);
});
afterAll(() => db.closeDb());

describe("quién ve qué", () => {
  it("el monitor ve sus salas (también las vacías) y solo sus proyectos, de cualquier ciudad", async () => {
    const r = await mon.listaSalas(mon1);
    expect(r.salas.map((x) => [x.hora, x.sala, x.mentor])).toEqual([[8, 1, "Mentor A"], [9, 1, "Mentor A"]]);
    expect(r.filas.map((f) => [f.codigo, f.ciudad])).toEqual([["P1", "Cali"], ["P2", "Cartagena"]]);
    expect((await mon.listaSalas(mon2)).filas.map((f) => f.codigo)).toEqual(["P3"]);
    expect(await mon.listaSalas(monSin)).toEqual({ salas: [], filas: [] });
    expect(await mon.listaSalas(mentorA)).toEqual({ salas: [], filas: [] });
    expect(await mon.listaSalas(admin)).toEqual({ salas: [], filas: [] });
  });

  it("no abre ni escribe en proyectos de otras salas", async () => {
    expect(await mon.detalleSala(mon2, String(P.P1))).toEqual({ error: "otra_sala" });
    expect(await mon.anotar(mon2, String(P.P1), 0, { asistencia: "si", motivo: null, observacion: "" })).toEqual({ error: "otra_sala" });
    expect(await mon.cuposReprogramar(mon2, String(P.P1))).toEqual({ error: "otra_sala" });
    expect(await mon.reprogramar(mon2, String(P.P1), String(S.a9), "Prueba")).toEqual({ error: "otra_sala" });
    expect(await mon.sugerirCambio(mon2, String(P.P1), "Otro día", "Prueba")).toEqual({ error: "otra_sala" });
    expect(await mon.detalleSala(mentorA, String(P.P1))).toEqual({ error: "otra_sala" });
    expect(await mon.detalleSala(mon1, "no-es-un-id")).toEqual({ error: "no_existe" });
    expect(await mon.anotar(mon1, new ObjectId().toHexString(), 0, { asistencia: "si", motivo: null, observacion: "" })).toEqual({ error: "no_existe" });
    expect(await mon.anotar(mon1, String(P.P5), 0, { asistencia: "si", motivo: null, observacion: "" })).toEqual({ error: "sin_hora" });
  });

  it("mismo mentor y misma hora, pero otro día: no es su sala", async () => {
    expect(await mon.detalleSala(mon1, String(P.P4))).toEqual({ error: "otra_sala" });
    expect(await mon.sugerirCambio(mon1, String(P.P4), "Otro día", "Prueba")).toEqual({ error: "otra_sala" });
  });

  it("la ficha trae el contacto completo y el documento enmascarado", async () => {
    const d = await mon.detalleSala(mon1, String(P.P1));
    if ("error" in d) throw new Error(d.error);
    expect(d.mentor).toBe("Mentor A");
    expect(d.integrantes[0]).toMatchObject({ correo: "p10@correo.test", celular: "300 555 0000", documento: "•••• 1000" });
  });
});

describe("asistencia, motivo y observación", () => {
  it("se guarda por integrante, deja changeLog y el mentor ve el motivo", async () => {
    expect(await mon.anotar(mon1, String(P.P1), 1, { asistencia: "no", motivo: "Salud", observacion: "Avisó por WhatsApp" })).toEqual({ ok: true });
    const fila = (await mon.listaSalas(mon1)).filas.find((f) => f.codigo === "P1")!;
    expect(fila.integrantes.map((x) => [x.asistencia, x.motivo ?? null])).toEqual([[null, null], ["no", "Salud"]]);
    expect((await ev.listaEvaluaciones(mentorA)).find((f) => f.codigo === "P1")!.integrantes[1]!.motivo).toBe("Salud");
    const det = await ev.detalleEvaluacion(mentorA, String(P.P1));
    if ("error" in det) throw new Error(det.error);
    expect(det.integrantes[1]!.monitor).toEqual({ motivo: "Salud", observacion: "Avisó por WhatsApp" });
    expect(det.integrantes[1]!.res).toBe("Pendiente"); // no cambia la evaluación del mentor
    const log = await (await db.collections()).changeLog.findOne({ proyectoId: P.P1, accion: "nota_monitor" });
    expect(log?.nuevo).toBe("Beto: no se presentó · Salud · con observación");
  });

  it("quien se presentó no lleva motivo", async () => {
    await mon.anotar(mon1, String(P.P1), 0, { asistencia: "si", motivo: "Otro", observacion: "" });
    const n = await (await db.collections()).evalMonitor.findOne({ proyectoId: P.P1, documento: "771000" });
    expect([n?.asistencia, n?.motivo]).toEqual(["si", null]);
  });
});

describe("reprogramar", () => {
  it("ofrece solo cupos libres de su ciudad en sus días habilitados", async () => {
    const r = await mon.cuposReprogramar(mon1, String(P.P1));
    if ("error" in r) throw new Error(r.error);
    expect(r.cupos.map((x) => x.id)).toEqual([String(S.a9)]); // ni el de Cartagena ni el del día que Cali no presenta
    expect(await mon.reprogramar(mon1, String(P.P1), String(S.a915), "Cita médica")).toEqual({ error: "sin_cupo" });
    expect(await mon.reprogramar(mon1, String(P.P1), String(S.b2), "Cita médica")).toEqual({ error: "sin_cupo" });
  });

  it("mueve el proyecto, libera el cupo anterior, vuelve a Pendiente quien no se presentó y deja changeLog", async () => {
    const c = await db.collections();
    await c.evalResultados.insertOne({
      _id: `${P.P1!.toHexString()}|771001`, proyectoId: P.P1!, documento: "771001", mentorId: "mentor-a", a: {}, b: {}, destacado: false,
      fortaleza: "", mejora: "", percepcion: "", noPresento: true, actualizadoEn: new Date(), actualizadoPor: "mentor.a",
    });
    const r = await mon.reprogramar(mon1, String(P.P1), String(S.a9), "Cita médica");
    expect(r).toMatchObject({ ok: true, mentor: "Mentor A", sigueEnTusSalas: true });
    expect((await c.asientos.findOne({ _id: S.a8 }))?.proyectoId).toBeNull();
    expect((await c.asientos.findOne({ _id: S.a9 }))?.proyectoId).toEqual(P.P1);
    expect(await c.evalResultados.countDocuments({ proyectoId: P.P1 })).toBe(0);
    expect((await c.evalMonitor.find({ proyectoId: P.P1 }).sort({ documento: 1 }).toArray()).map((n) => [n.asistencia, n.motivo])).toEqual([[null, null], [null, "Salud"]]);
    const log = await c.changeLog.findOne({ proyectoId: P.P1, accion: "cambiar_hora" });
    expect([log?.motivo, log?.actor.usuario]).toEqual(["Cita médica", "mon.uno"]);
  });

  it("no reprograma si ya hay una evaluación guardada", async () => {
    const c = await db.collections();
    await c.evalResultados.insertOne({
      _id: `${P.P3!.toHexString()}|773000`, proyectoId: P.P3!, documento: "773000", mentorId: "mentor-b", a: {}, b: {}, destacado: false,
      fortaleza: "", mejora: "", percepcion: "", noPresento: false, actualizadoEn: new Date(), actualizadoPor: "mentor.b",
    });
    expect(await mon.reprogramar(mon2, String(P.P3), String(S.a8), "Prueba")).toEqual({ error: "ya_evaluado" });
    expect((await c.asientos.findOne({ _id: S.b8 }))?.proyectoId).toEqual(P.P3);
    expect((await c.asientos.findOne({ _id: S.a8 }))?.proyectoId).toBeNull();
  });

  it("el mentor guarda mientras el monitor reprograma: nunca quedan las dos (evaluación con el mentor anterior)", async () => {
    const mentorA = usuario("mentor.a", "mentor", { mentorId: "mentor-a" });
    const form = { a: { a1: "si", a2: "si", a3: "si", a4: "si", a5: "si", a6: "si", a7: "si" }, b: [{ b1: 3, b2: 3 }, { b1: 3, b2: 3 }], destacado: false, fortaleza: "", mejora: "", percepcion: "" } as const;
    const [g, r] = await Promise.all([ev.guardarEvaluacion(mentorA, String(P.P1), structuredClone(form) as never), mon.reprogramar(mon1, String(P.P1), String(S.a8), "Choque")]);
    expect("ok" in g && "ok" in r).toBe(false);
    const c = await db.collections();
    if ("ok" in r) expect(await c.evalResultados.countDocuments({ proyectoId: P.P1 })).toBe(0);
  });

  it("dos reprogramaciones a la vez del mismo proyecto: solo una pasa", async () => {
    const rs = await Promise.all([mon.reprogramar(mon1, String(P.P2), String(S.a915), "Uno"), mon.reprogramar(mon1, String(P.P2), String(S.a915), "Dos")]);
    expect(rs.filter((r) => "ok" in r)).toHaveLength(1);
    const c = await db.collections();
    expect(await c.asientos.countDocuments({ proyectoId: P.P2 })).toBe(1);
    expect((await c.asientos.findOne({ _id: S.a915 }))?.proyectoId).toEqual(P.P2);
  });
});

describe("sugerir un cambio especial", () => {
  it("queda pendiente para el admin (una por proyecto) y se ve en la lista", async () => {
    expect(await mon.sugerirCambio(mon1, String(P.P2), "Pasarlo a otro día", "Viaja")).toEqual({ ok: true });
    expect(await mon.sugerirCambio(mon1, String(P.P2), "Otra cosa", "Otra")).toEqual({ error: "ya_sugerido" });
    expect((await mon.listaSalas(mon1)).filas.find((f) => f.codigo === "P2")!.sugerencia).toBe(true);
    const d = await mon.detalleSala(mon1, String(P.P2));
    if ("error" in d) throw new Error(d.error);
    expect(d.sugerencia).toMatchObject({ detalle: "Pasarlo a otro día", motivo: "Viaja" });
    expect(await (await db.collections()).changeLog.countDocuments({ proyectoId: P.P2, accion: "sugerir_cambio" })).toBe(1);
  });

  it("si lo reprograma a una sala ajena, deja de verlo y de poder escribirlo", async () => {
    expect(await mon.reprogramar(mon1, String(P.P2), String(S.a215), "Viaja el jueves")).toMatchObject({ ok: true, sigueEnTusSalas: false });
    expect((await mon.listaSalas(mon1)).filas.map((f) => f.codigo)).not.toContain("P2");
    expect(await mon.detalleSala(mon1, String(P.P2))).toEqual({ error: "otra_sala" });
    expect(await mon.anotar(mon1, String(P.P2), 0, { asistencia: "si", motivo: null, observacion: "" })).toEqual({ error: "otra_sala" });
  });
});

import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { SessionUser } from "@/lib/auth";

// Bandeja de cambios sugeridos (Paso 14) contra la base LOCAL: aprobar (también otro día u otra ciudad), rechazar,
// dos admins a la vez y lo que ve el monitor. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const mon = await import("@/lib/evaluacion/monitor");
const sug = await import("@/lib/sugerencias");
const { diaCOL, inicioUTC } = await import("@/lib/edicion");

const D = diaCOL(new Date(Date.now() + 10 * 86400_000)), D2 = diaCOL(new Date(Date.now() + 11 * 86400_000));
const mon1: SessionUser = { id: new ObjectId().toHexString(), usuario: "mon.uno", nombre: "Monitora Uno", rol: "monitor", ciudades: ["Cali"] };
const admin = { rol: "admin" as const, usuario: "admin.p" }, admin2 = { rol: "admin" as const, usuario: "admin.q" };
const P: Record<string, ObjectId> = {};
const S: Record<string, ObjectId> = {};

async function proyecto(codigo: string, ciudad: string, dia: string | null, hora = 8, min = 0) {
  const c = await db.collections();
  const _id = new ObjectId(), now = new Date();
  await c.proyectos.insertOne({ _id, codigo, ciudad, nombre: `App ${codigo}`, creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: `Persona ${codigo}`, documento: `88${codigo.replace(/\D/g, "")}0` }] });
  P[codigo] = _id;
  if (dia) await c.asientos.insertOne({ _id: new ObjectId(), dia, inicio: inicioUTC(dia, hora, min), mentorId: "mentor-a", ciudades: [ciudad], proyectoId: _id });
}
async function libre(clave: string, dia: string, hora: number, min: number, ciudad: string) {
  const _id = new ObjectId();
  await (await db.collections()).asientos.insertOne({ _id, dia, inicio: inicioUTC(dia, hora, min), mentorId: "mentor-b", ciudades: [ciudad], proyectoId: null });
  S[clave] = _id;
}
let colecciones: Awaited<ReturnType<typeof db.collections>>;
const c2 = () => colecciones;
const sugerencia = async (codigo: string) => String((await (await db.collections()).cambiosSugeridos.findOne({ proyectoId: P[codigo] }, { sort: { creadoEn: -1 } }))!._id);

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  colecciones = c;
  await c.mentores.insertMany([{ _id: "mentor-a", nombre: "Mentor A" }, { _id: "mentor-b", nombre: "Mentor B" }]);
  await c.users.insertOne({ _id: new ObjectId(), usuario: "mon.uno", nombre: "Monitora Uno", rol: "monitor", ciudades: ["Cali"], activo: true, passwordHash: "x", creadoEn: new Date() });
  await c.dias.insertMany([
    { _id: D, ciudades: [{ ciudad: "Cali", cupos: 4, sobrante: false, abre: null }] },
    { _id: D2, ciudades: [{ ciudad: "Cartagena", cupos: 4, sobrante: false, abre: null }] },
  ]);
  await proyecto("P1", "Cali", D, 8, 0);
  await proyecto("P2", "Cali", D, 8, 15);
  await proyecto("P3", "Cali", D, 8, 30);
  await libre("d2", D2, 9, 0, "Cartagena"); // Cali no presenta ese día
  await libre("d9", D, 9, 0, "Cali");
  await libre("d915", D, 9, 15, "Cali");
  await c.planSalas.insertOne({ _id: `${D}|8|1`, dia: D, hora: 8, sala: 1, mentorId: "mentor-a", monitor: "mon.uno", origen: "importado" });
  for (const x of ["P1", "P2", "P3"]) expect(await mon.sugerirCambio(mon1, String(P[x]), `Mover ${x} a otro día`, "Viaja")).toEqual({ ok: true });
});
afterAll(() => db.closeDb());

describe("bandeja", () => {
  it("pendientes con proyecto, ciudad, hora actual, monitor, texto y fecha; contador", async () => {
    const b = await sug.bandeja();
    expect(b.pendientes.map((x) => [x.codigo, x.ciudad, x.monitor, x.detalle, x.motivo, x.hora?.mentor])).toEqual([
      ["P1", "Cali", "Monitora Uno", "Mover P1 a otro día", "Viaja", "Mentor A"],
      ["P2", "Cali", "Monitora Uno", "Mover P2 a otro día", "Viaja", "Mentor A"],
      ["P3", "Cali", "Monitora Uno", "Mover P3 a otro día", "Viaja", "Mentor A"],
    ]);
    expect(await sug.pendientes()).toBe(3);
  });
});

describe("aprobar", () => {
  it("a otro día de otra ciudad: sin otraCiudad no cabe (y no cambia nada); con otraCiudad mueve y deja changeLog", async () => {
    const id = await sugerencia("P1"), c = await db.collections();
    const d2 = (await c.asientos.findOne({ _id: S.d2 }))!.inicio.toISOString();
    expect(await sug.aprobar(id, new Date(d2), false, admin)).toEqual({ error: "sin_cupo" });
    expect((await c.cambiosSugeridos.findOne({ _id: new ObjectId(id) }))?.estado).toBe("pendiente");
    const r = await sug.aprobar(id, new Date(d2), true, admin);
    expect(r).toMatchObject({ ok: true });
    expect((await c.asientos.findOne({ _id: S.d2 }))?.proyectoId).toEqual(P.P1);
    const s = await c.cambiosSugeridos.findOne({ _id: new ObjectId(id) });
    expect([s?.estado, s?.resueltoPor, s?.nuevo]).toEqual(["aprobado", "admin.p", `${D2} 9:00 a. m. · mentor-b · asiento de Cartagena`]);
    expect(await c.changeLog.countDocuments({ proyectoId: P.P1, accion: { $in: ["cambiar_hora", "aprobar_cambio"] } })).toBe(2);
    expect(await sug.aprobar(id, new Date(d2), true, admin)).toEqual({ error: "ya_resuelta" });
  });

  it("misma hora o proyecto sin hora: no se aprueba", async () => {
    const id = await sugerencia("P2"), c = await db.collections();
    const actual = (await c.asientos.findOne({ proyectoId: P.P2 }))!.inicio;
    expect(await sug.aprobar(id, actual, false, admin)).toEqual({ error: "misma_hora" });
    expect(await sug.aprobar("no-es-id", actual, false, admin)).toEqual({ error: "no_existe" });
    await proyecto("P9", "Cali", null);
    const sinHora = await c.cambiosSugeridos.insertOne({ proyectoId: P.P9!, anterior: "-", detalle: "x", motivo: "y", estado: "pendiente", creadoPor: "mon.uno", creadoEn: new Date() });
    expect(await sug.aprobar(String(sinHora.insertedId), actual, true, admin)).toEqual({ error: "sin_hora" });
    await c.cambiosSugeridos.deleteOne({ _id: sinHora.insertedId });
  });

  it("dos admins aprueban a la vez: solo uno la resuelve, el otro recibe ya_resuelta y su cupo sigue libre; se limpian No se presentó y borrador", async () => {
    const id = await sugerencia("P2"), c = await db.collections();
    await c.evalResultados.insertOne({
      _id: `${P.P2!.toHexString()}|8820`, proyectoId: P.P2!, documento: "8820", mentorId: "mentor-a", a: {}, b: {}, destacado: false,
      fortaleza: "", mejora: "", percepcion: "", noPresento: true, actualizadoEn: new Date(), actualizadoPor: "mentor.a",
    });
    await c.evalBorradores.insertOne({ _id: String(P.P2), usuario: "mentor.a", datos: {}, actualizadoEn: new Date() });
    const [i9, i915] = await Promise.all([S.d9, S.d915].map(async (x) => (await c.asientos.findOne({ _id: x }))!.inicio));
    const rs = await Promise.all([sug.aprobar(id, i9!, false, admin), sug.aprobar(id, i915!, false, admin2)]);
    const gana = rs.findIndex((r) => "ok" in r);
    expect(gana).toBeGreaterThanOrEqual(0);
    expect(rs[1 - gana]).toEqual({ error: "ya_resuelta" });
    expect(await c.asientos.countDocuments({ proyectoId: P.P2 })).toBe(1);
    expect((await c.asientos.findOne({ _id: [S.d915, S.d9][gana] }))?.proyectoId).toBeNull();
    expect((await c.cambiosSugeridos.findOne({ _id: new ObjectId(id) }))?.resueltoPor).toBe([admin, admin2][gana]!.usuario);
    expect(await c.changeLog.countDocuments({ proyectoId: P.P2, accion: "aprobar_cambio" })).toBe(1);
    expect(await c.evalResultados.countDocuments({ proyectoId: P.P2 })).toBe(0);
    expect(await c.evalBorradores.countDocuments({ _id: String(P.P2) })).toBe(0);
  });

  it("no mueve un proyecto ya evaluado (y la sugerencia sigue pendiente)", async () => {
    const id = await sugerencia("P3"), c = await db.collections();
    await c.evalResultados.insertOne({
      _id: `${P.P3!.toHexString()}|8830`, proyectoId: P.P3!, documento: "8830", mentorId: "mentor-a", a: {}, b: {}, destacado: false,
      fortaleza: "", mejora: "", percepcion: "", noPresento: false, actualizadoEn: new Date(), actualizadoPor: "mentor.a",
    });
    const libreAun = await c.asientos.findOne({ dia: D, proyectoId: null, ciudades: "Cali" });
    expect(await sug.aprobar(id, libreAun!.inicio, false, admin)).toEqual({ error: "ya_evaluado" });
    expect((await c.cambiosSugeridos.findOne({ _id: new ObjectId(id) }))?.estado).toBe("pendiente");
  });
});

describe("rechazar", () => {
  it("con motivo; el monitor lo ve en la ficha y puede sugerir otra vez", async () => {
    const id = await sugerencia("P3"), c = await db.collections();
    expect(await sug.rechazar(id, "No hay cupos ese día", admin)).toEqual({ ok: true });
    expect(await sug.rechazar(id, "Otra vez", admin)).toEqual({ error: "ya_resuelta" });
    expect(await sug.rechazar(new ObjectId().toHexString(), "x", admin)).toEqual({ error: "no_existe" });
    const d = await mon.detalleSala(mon1, String(P.P3));
    if ("error" in d) throw new Error(d.error);
    expect(d.sugerencia).toMatchObject({ estado: "rechazado", respuesta: "No hay cupos ese día" });
    expect(await c.changeLog.countDocuments({ proyectoId: P.P3, accion: "rechazar_cambio", motivo: "No hay cupos ese día" })).toBe(1);
    expect(await mon.sugerirCambio(mon1, String(P.P3), "Otro intento", "Sigue sin poder")).toEqual({ ok: true });
    expect(await sug.pendientes()).toBe(1);
  });

  it("el monitor ve sus sugerencias resueltas aunque el proyecto ya no esté en sus salas", async () => {
    const r = await mon.listaSalas(mon1);
    expect(r.filas.map((f) => f.codigo)).not.toContain("P1");
    expect(r.sugerencias.find((x) => x.proyecto === "App P1")).toMatchObject({ estado: "aprobado" });
    expect(r.sugerencias.map((x) => x.estado).sort()).toEqual(["aprobado", "aprobado", "pendiente", "rechazado"]);
    expect(r.sugerencias.find((x) => x.estado === "rechazado")?.respuesta).toBe("No hay cupos ese día");
    expect(r.sugerencias.find((x) => x.proyecto === "App P1")?.nuevo).toMatch(/asiento de Cartagena/);
    // En la ficha, otro monitor de esa sala solo ve que hay una pendiente (sin el texto).
    await c2().planSalas.updateOne({ _id: `${D}|8|1` }, { $set: { monitor: "mon.dos" } });
    const d = await mon.detalleSala({ ...mon1, usuario: "mon.dos" }, String(P.P3));
    if ("error" in d) throw new Error(d.error);
    expect(d.sugerencia).toEqual({ detalle: "", motivo: "", creadoEn: expect.any(String), estado: "pendiente", deOtro: true });
    await c2().planSalas.updateOne({ _id: `${D}|8|1` }, { $set: { monitor: "mon.uno" } });
    // Otro monitor no ve las sugerencias de mon.uno; otro rol, ninguna.
    expect((await mon.listaSalas({ ...mon1, usuario: "mon.dos" })).sugerencias).toEqual([]);
    expect((await mon.listaSalas({ ...mon1, rol: "admin" })).sugerencias).toEqual([]);
  });
});

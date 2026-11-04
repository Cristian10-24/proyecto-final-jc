import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { ENC_CUPOS, horarios, libro } from "./helpers/libros";

// Franjas y mentores (Paso 17b) contra la base LOCAL: agregar y quitar mentores de una hora. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const fr = await import("@/lib/franjas");
const { aplicarMentores, previaMentores } = await import("@/lib/importar/aplicar");
const { leerLibroMentores } = await import("@/lib/importar/mentores");
const { inicioUTC } = await import("@/lib/edicion");

const D = "2026-11-12";
const actor = { rol: "admin" as const, usuario: "admin.p" };
const libroMentores = () => leerLibroMentores(libro({
  Horarios: horarios([{ dia: "Jueves 12 nov", horas: [8, 9], mentores: 3 }, { dia: "Viernes 13 nov", horas: [16], mentores: 2 }]),
  Cupos: [ENC_CUPOS, ["Jueves 12 nov", "Cali", 10, "x", null], ["Jueves 12 nov", "Cartagena", 8, null, null], ["Viernes 13 nov", "Barranquilla", null, "x", "2026-11-13 14:00"]],
}));
let M: string[] = [];
const P = new ObjectId();

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  await aplicarMentores(libroMentores(), actor);
  const c = await db.collections();
  M = (await c.asientos.distinct("mentorId", { dia: D, inicio: inicioUTC(D, 8, 0) })).sort();
  await c.mentores.insertOne({ _id: "extra", nombre: "Mentora Extra" });
  const now = new Date();
  await c.proyectos.insertOne({ _id: P, codigo: "F1", ciudad: "Cali", nombre: "App F1", creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: "Persona F1", documento: "7700001" }] });
});
afterAll(() => db.closeDb());

describe("datos", () => {
  it("todas las horas de la edición; las de 0 mentores ese día no se ofrecen; totales y libres por ciudad", async () => {
    const d = await fr.datosFranjas(D);
    expect(M).toHaveLength(3);
    expect(d.dias).toEqual(["2026-11-12", "2026-11-13"]);
    expect(d.horas.map((h) => [h.hora, h.mentores.length, h.total])).toEqual([[8, 3, 12], [9, 3, 12], [16, 0, 0]]);
    expect(d.totales).toEqual({ total: 24, ocupados: 0, libres: 24 });
    expect(d.horas[0]!.libresPorCiudad.reduce((a, x) => a + x.n, 0)).toBe(12);
    expect(d.editadas).toBe(0);
    expect((await fr.datosFranjas("2099-01-01")).dia).toBe("2026-11-12"); // día desconocido → el primero
  });
});

describe("agregar", () => {
  it("crea 4 asientos etiquetados con las reglas del día, deja changeLog y marca la edición", async () => {
    expect(await fr.agregarMentor(D, 16, "extra", actor)).toEqual({ ok: true });
    const c = await db.collections();
    const nuevos = await c.asientos.find({ dia: D, mentorId: "extra" }).toArray();
    expect(nuevos.map((a) => a.inicio)).toEqual([0, 15, 30, 45].map((m) => inicioUTC(D, 16, m)));
    expect(nuevos.every((a) => a.ciudades.length > 0 && a.proyectoId === null)).toBe(true);
    const d = await fr.datosFranjas(D);
    expect(d.totales.total).toBe(28);
    expect(d.horas[2]).toMatchObject({ hora: 16, total: 4, libres: 4, mentores: [{ id: "extra", nombre: "Mentora Extra", ocupados: 0 }] });
    expect(d.editadas).toBe(1);
    expect(await c.changeLog.findOne({ accion: "franjas" })).toMatchObject({ actor, nuevo: expect.stringMatching(/\+ Mentora Extra/) });
  });

  it("sin duplicados en la misma hora; mentor o día inexistente", async () => {
    expect(await fr.agregarMentor(D, 16, "extra", actor)).toMatchObject({ ok: false, error: "duplicado" });
    expect(await fr.agregarMentor(D, 8, M[0]!, actor)).toMatchObject({ ok: false, error: "duplicado" });
    expect(await fr.agregarMentor(D, 16, "nadie", actor)).toMatchObject({ ok: false, error: "no_existe" });
    expect(await fr.agregarMentor("2026-11-20", 8, "extra", actor)).toMatchObject({ ok: false, error: "no_existe" });
  });

  it("no pasa del número de salas del plan", async () => {
    const c = await db.collections();
    await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 1, enlace: "https://meet.ejemplo.org/1" }], importados: [], disponibilidad: [], actualizadoEn: new Date() });
    expect(await fr.agregarMentor(D, 16, M[0]!, actor)).toMatchObject({ ok: false, error: "sin_salas" });
    await c.salasConfig.deleteMany({});
  });
});

describe("quitar", () => {
  it("si tiene proyectos a esa hora, no se quita y dice cuáles mover", async () => {
    const c = await db.collections();
    await c.asientos.updateOne({ dia: D, mentorId: "extra", inicio: inicioUTC(D, 16, 15) }, { $set: { proyectoId: P } });
    const r = await fr.quitarMentor(D, 16, "extra", actor);
    expect(r).toMatchObject({ ok: false, error: "ocupado", proyectos: [{ codigo: "F1", nombre: "App F1" }] });
    expect(await c.asientos.countDocuments({ mentorId: "extra" })).toBe(4);
    await c.asientos.updateOne({ proyectoId: P }, { $set: { proyectoId: null } });
  });

  it("con sus asientos libres: los borra, deja changeLog; no quita uno que no está a esa hora", async () => {
    expect(await fr.quitarMentor(D, 16, "extra", actor)).toEqual({ ok: true });
    const c = await db.collections();
    expect(await c.asientos.countDocuments({ mentorId: "extra" })).toBe(0);
    expect((await fr.datosFranjas(D)).totales.total).toBe(24);
    expect(await c.changeLog.countDocuments({ accion: "franjas" })).toBe(2);
    expect(await fr.quitarMentor(D, 16, "extra", actor)).toMatchObject({ ok: false, error: "no_existe" });
  });

  it("no deja la capacidad del día por debajo de los cupos de sus reglas (18)", async () => {
    expect(await fr.quitarMentor(D, 8, M[0]!, actor)).toEqual({ ok: true }); // 20 ≥ 18
    expect(await fr.quitarMentor(D, 8, M[1]!, actor)).toMatchObject({ ok: false, error: "reglas" }); // 16 < 18
    expect((await fr.datosFranjas(D)).totales.total).toBe(20);
  });
});

describe("concurrencia", () => {
  it("dos admins agregan a la vez en la última sala libre: solo entra uno; agregar y quitar deja un solo registro", async () => {
    const c = await db.collections();
    await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 1, enlace: "https://meet.ejemplo.org/1" }], importados: [], disponibilidad: [], actualizadoEn: new Date() });
    const rs = await Promise.all([fr.agregarMentor(D, 16, "extra", actor), fr.agregarMentor(D, 16, M[2]!, actor)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toMatchObject({ error: expect.stringMatching(/sin_salas|duplicado|cambio/) });
    expect((await c.asientos.distinct("mentorId", { dia: D, inicio: inicioUTC(D, 16, 0) })).length).toBe(1);
    expect(await c.franjasEditadas.countDocuments({ _id: `${D}|16|extra` })).toBe(1); // upsert: agregado y quitado antes
    await c.salasConfig.deleteMany({});
  });
});

describe("importar Horarios", () => {
  it("avisa en la vista previa y, al aplicar, Horarios vuelve a mandar", async () => {
    expect((await previaMentores(libroMentores())).avisos.map((a) => a.mensaje).join(" ")).toMatch(/Franjas y mentores/);
    await aplicarMentores(libroMentores(), actor);
    expect(await fr.franjasEditadas()).toBe(0);
    expect((await fr.datosFranjas(D)).totales.total).toBe(24);
  });
});

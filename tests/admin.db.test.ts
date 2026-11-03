import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Acciones del admin contra la base LOCAL: liberar, cambiar hora (transacción), monitor y reetiquetar.

usarBaseLocal(5);
const db = await import("@/lib/db");
const admin = await import("@/lib/admin");
const { reservar } = await import("@/lib/reservas");
const { inicioUTC } = await import("@/lib/edicion");

const actor = { rol: "admin" as const, usuario: "admin.prueba" };
const B8 = inicioUTC("2026-11-12", 8, 0), B815 = inicioUTC("2026-11-12", 8, 15), B13 = inicioUTC("2026-11-13", 16, 0);
const ids: Record<string, ObjectId> = {};

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.dias.insertMany([
    { _id: "2026-11-12", ciudades: [{ ciudad: "Cali", cupos: 4, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 2, sobrante: false, abre: null }] },
    { _id: "2026-11-13", ciudades: [{ ciudad: "Barranquilla", cupos: null, sobrante: true, abre: null }] },
  ]);
  const a = (inicio: Date, mentorId: string, ciudades: string[]) => ({ _id: new ObjectId(), dia: inicio.toISOString() < "2026-11-13T05" ? "2026-11-12" : "2026-11-13", inicio, mentorId, ciudades, proyectoId: null });
  await c.asientos.insertMany([
    a(B8, "m1", ["Cali"]), a(B8, "m2", ["Cartagena"]), a(B815, "m1", ["Cali"]), a(B815, "m2", ["Cali"]),
    ...["m1", "m2", "m3", "m4"].map((m) => a(inicioUTC("2026-11-12", 16, 0), m, ["Cartagena"])),
    a(B13, "m1", ["Barranquilla"]),
  ]);
  await c.mentores.insertMany([{ _id: "m1", nombre: "Mentor Uno" }, { _id: "m2", nombre: "Mentor Dos" }]);
  const now = new Date();
  for (const [codigo, ciudad, doc] of [["CALI", "Cali", "8000000001"], ["CTG", "Cartagena", "8000000002"], ["CALI2", "Cali", "8000000003"]] as const) {
    ids[codigo] = new ObjectId();
    await c.proyectos.insertOne({ _id: ids[codigo]!, codigo, ciudad, nombre: `Proyecto ${codigo}`, monitor: null, integrantes: [{ documento: doc, nombre: `Estudiante ${codigo}` }], creadoEn: now, actualizadoEn: now });
  }
  await c.users.insertOne({ _id: new ObjectId(), usuario: "mon.cali", nombre: "Monitor Cali", passwordHash: "x", rol: "monitor", ciudades: ["Cali"], activo: true, creadoEn: now });
  expect((await reservar("8000000001", B8)).ok).toBe(true);
});
afterAll(() => db.closeDb());

describe("lista del tablero", () => {
  it("muestra hora, mentor y monitor; filtra por estado y búsqueda", async () => {
    const todos = await admin.listarProyectos({});
    expect(todos.find((p) => p.codigo === "CALI")).toMatchObject({ hora: { inicio: B8.toISOString(), mentor: "Mentor Uno" }, monitor: null });
    expect((await admin.listarProyectos({ estado: "sin_hora" })).map((p) => p.codigo).sort()).toEqual(["CALI2", "CTG"]);
    expect((await admin.listarProyectos({ q: "8000000002" })).map((p) => p.codigo)).toEqual(["CTG"]);
    expect((await admin.listarProyectos({ q: "(.*" }))).toEqual([]); // la búsqueda no es una expresión regular
  });
});

describe("cambiar hora", () => {
  it("mueve el proyecto de bloque en una transacción y lo registra", async () => {
    const r = await admin.cambiarHora(ids.CALI!, B815, { otraCiudad: false, motivo: "examen en el colegio" }, actor);
    expect(r).toEqual({ ok: true, inicio: B815.toISOString() });
    const c = await db.collections();
    expect(await c.asientos.countDocuments({ proyectoId: ids.CALI })).toBe(1);
    expect(await c.asientos.countDocuments({ inicio: B8, proyectoId: null })).toBe(2); // el viejo quedó libre
    const h = await admin.historial(ids.CALI!);
    expect(h[0]).toMatchObject({ accion: "cambiar_hora", anterior: "2026-11-12 8:00 a. m.", nuevo: "2026-11-12 8:15 a. m.", motivo: "examen en el colegio", actor });
  });

  it("si el bloque no tiene asiento de su ciudad, no cambia nada (rollback)", async () => {
    const c = await db.collections();
    await c.asientos.updateMany({ inicio: B815, proyectoId: null }, { $set: { proyectoId: new ObjectId() } }); // un solo libre quedaba
    const r = await admin.cambiarHora(ids.CALI2!, inicioUTC("2026-11-12", 16, 0), { otraCiudad: false, motivo: "" }, actor);
    expect(r).toMatchObject({ ok: false, error: "sin_cupo" });
    expect(await c.asientos.countDocuments({ proyectoId: ids.CALI2 })).toBe(0);
    // Con la hora actual intacta: CALI sigue en 8:15.
    expect((await c.asientos.findOne({ proyectoId: ids.CALI }))!.inicio).toEqual(B815);
    const r2 = await admin.cambiarHora(ids.CALI!, B13, { otraCiudad: false, motivo: "" }, actor);
    expect(r2).toMatchObject({ ok: false, error: "sin_cupo" });
    expect((await c.asientos.findOne({ proyectoId: ids.CALI }))!.inicio).toEqual(B815);
  });

  it("con otraCiudad puede usar un asiento de otra ciudad y lo anota en el motivo", async () => {
    const r = await admin.cambiarHora(ids.CALI2!, B13, { otraCiudad: true, motivo: "caso especial" }, actor);
    expect(r.ok).toBe(true);
    expect((await admin.historial(ids.CALI2!))[0]!.motivo).toBe("caso especial (asiento de otra ciudad)");
  });

  it("misma hora → error claro", async () => {
    expect(await admin.cambiarHora(ids.CALI!, B815, { otraCiudad: false, motivo: "" }, actor)).toMatchObject({ ok: false, error: "misma_hora" });
  });

  it("bloques libres: de su ciudad, y si la ciudad presenta ese día", async () => {
    const b = await admin.bloquesLibres(ids.CTG!, "2026-11-12", false);
    expect(b).toEqual({ ciudadTieneElDia: true, bloques: [
      { inicio: B8.toISOString(), libres: 1, deSuCiudad: true },
      { inicio: inicioUTC("2026-11-12", 16, 0).toISOString(), libres: 4, deSuCiudad: true },
    ] });
    expect((await admin.bloquesLibres(ids.CTG!, "2026-11-13", false))!.ciudadTieneElDia).toBe(false);
  });
});

describe("liberar y monitor", () => {
  it("liberar deja el asiento libre y registra la hora anterior", async () => {
    expect(await admin.liberar(ids.CALI2!, "se retiró", actor)).toEqual({ ok: true });
    const c = await db.collections();
    expect(await c.asientos.countDocuments({ proyectoId: ids.CALI2 })).toBe(0);
    expect((await admin.historial(ids.CALI2!))[0]).toMatchObject({ accion: "liberar", anterior: "2026-11-13 4:00 p. m.", motivo: "se retiró" });
    expect(await admin.liberar(ids.CALI2!, "", actor)).toMatchObject({ ok: false, error: "sin_hora" });
  });

  it("asignar monitor: solo monitores activos; queda en changeLog", async () => {
    expect(await admin.asignarMonitor(ids.CALI!, "nadie", actor)).toMatchObject({ ok: false, error: "sin_monitor" });
    expect(await admin.asignarMonitor(ids.CALI!, "mon.cali", actor)).toEqual({ ok: true });
    expect((await (await db.collections()).proyectos.findOne({ _id: ids.CALI }))!.monitor).toBe("mon.cali");
    expect((await admin.historial(ids.CALI!))[0]).toMatchObject({ accion: "asignar_monitor", anterior: "(por asignar)", nuevo: "mon.cali" });
  });
});

describe("reetiquetar", () => {
  it("resumen por grupo y reetiqueta solo libres, repartidos", async () => {
    const r = await admin.resumenAsientos("2026-11-12");
    expect(r.grupos.find((g) => g.grupo === "Cartagena")).toMatchObject({ libres: 5, ocupados: 0 });
    const x = await admin.reetiquetar("2026-11-12", "Cartagena", ["Cali"], 2, actor);
    expect(x).toEqual({ ok: true, cambiados: 2 });
    const r2 = await admin.resumenAsientos("2026-11-12");
    expect(r2.grupos.find((g) => g.grupo === "Cartagena")!.libres).toBe(3);
    expect(await admin.reetiquetar("2026-11-12", "Cartagena", ["Cali"], 10, actor)).toMatchObject({ ok: false });
    const c = await db.collections();
    expect(await c.changeLog.countDocuments({ accion: "reetiquetar" })).toBe(1);
  });
});

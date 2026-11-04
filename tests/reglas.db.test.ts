import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { CupoCiudad } from "@/lib/types";

// Editor de reglas de cupos y cierre de inscripciones (Paso 17) contra la base LOCAL. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const rg = await import("@/lib/reglasCupos");
const { reservar } = await import("@/lib/reservas");
const { agenda } = await import("@/lib/estudiante");
const { inicioUTC } = await import("@/lib/edicion");

const D = "2026-11-12";
const actor = { rol: "admin" as const, usuario: "admin.p" };
const cupo = (ciudad: string, cupos: number | null, max: number | null = null, sobrante = false, abre: Date | null = null): CupoCiudad => ({ ciudad, cupos, max, sobrante, abre });
const P: Record<string, ObjectId> = {};

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections(), now = new Date();
  await c.mentores.insertMany([{ _id: "m1", nombre: "Mentor 1" }, { _id: "m2", nombre: "Mentor 2" }]);
  // 2 mentores × 2 horas × 4 bloques = 16 asientos: 12 de Cali y 4 de Cartagena.
  const asientos = [];
  for (const h of [8, 9]) for (const m of ["m1", "m2"]) for (const b of [0, 15, 30, 45])
    asientos.push({ _id: new ObjectId(), dia: D, inicio: inicioUTC(D, h, b), mentorId: m, ciudades: m === "m2" && h === 9 ? ["Cartagena"] : ["Cali"], proyectoId: null });
  await c.asientos.insertMany(asientos);
  await c.dias.insertOne({ _id: D, ciudades: [cupo("Cali", 12), cupo("Cartagena", 4)] });
  for (const [k, ciudad, doc] of [["C1", "Cali", "6600001"], ["C2", "Cali", "6600002"], ["K1", "Cartagena", "6600003"]] as const) {
    P[k] = new ObjectId();
    await c.proyectos.insertOne({ _id: P[k]!, codigo: k, ciudad, nombre: `App ${k}`, creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: `Persona ${k}`, documento: doc }] });
  }
  // Reservas reales (se conservan siempre).
  const ahora = new Date("2026-11-01T12:00:00Z");
  expect(await reservar("6600001", inicioUTC(D, 8, 0), ahora)).toMatchObject({ ok: true });
  expect(await reservar("6600003", inicioUTC(D, 9, 0), ahora)).toMatchObject({ ok: true });
});
afterAll(() => db.closeDb());

describe("vista previa", () => {
  it("cuenta las reservas dentro del cupo de su ciudad y reparte los libres por hora", async () => {
    const p = await rg.previaReglas(D, [cupo("Cali", 8, null, true), cupo("Cartagena", 6)]);
    expect(p.errores).toEqual([]);
    expect([p.capacidad, p.ocupados]).toEqual([16, 2]);
    expect(p.grupos.map((g) => [g.etiqueta, g.cuota, g.reservados, g.libres])).toEqual([["Cartagena", 6, 1, 5], ["Cali", 10, 1, 9]]);
    expect(p.porHora.map((h) => [h.total, h.ocupados])).toEqual([[8, 1], [8, 1]]);
    expect(p.cambios).toBe(2); // dos asientos libres de Cali pasan a Cartagena
  });

  it("errores: suma sobre la capacidad, máximo bajo, ciudad después de su clausura, reservas por encima del cupo", async () => {
    expect((await rg.previaReglas(D, [cupo("Cali", 14), cupo("Cartagena", 4)])).errores[0]).toMatch(/superan/);
    expect((await rg.previaReglas(D, [cupo("Cali", 10, 8, true)])).errores[0]).toMatch(/máximo de Cali/);
    expect((await rg.previaReglas("2026-11-14", [cupo("Cali", 1)])).errores.join(" ")).toMatch(/no tiene asientos|clausura/);
    expect((await rg.previaReglas(D, [cupo("Cali", 12, null, true), cupo("Cartagena", 0)])).errores[0]).toMatch(/Cartagena ya tiene más reservas/);
  });

  it("reserva de una ciudad que ya no está habilitada: se conserva con aviso", async () => {
    const p = await rg.previaReglas(D, [cupo("Cali", 4, null, true)]);
    expect(p.errores).toEqual([]);
    expect(p.avisos[0]).toMatch(/1 reserva de Cartagena se conserva/);
  });
});

describe("aplicar", () => {
  it("solo reetiqueta libres, nadie que reservó se mueve; guarda el día como editado y deja changeLog", async () => {
    const c = await db.collections();
    const antes = await c.asientos.find({ proyectoId: { $type: "objectId" } }).toArray();
    const r = await rg.aplicarReglas(D, [cupo("Cali", 8, null, true), cupo("Cartagena", 6)], actor);
    expect(r).toMatchObject({ ok: true });
    const despues = await c.asientos.find({ proyectoId: { $type: "objectId" } }).toArray();
    expect(despues.map((a) => [String(a._id), String(a.proyectoId), a.ciudades])).toEqual(antes.map((a) => [String(a._id), String(a.proyectoId), a.ciudades]));
    expect(await c.asientos.countDocuments({ dia: D, ciudades: "Cartagena" })).toBe(6);
    const dia = await c.dias.findOne({ _id: D });
    expect([dia?.editadoPor, dia?.ciudades.find((x) => x.ciudad === "Cali")?.sobrante]).toEqual(["admin.p", true]);
    expect(await c.changeLog.countDocuments({ accion: "reglas_cupos" })).toBe(1);
    expect(await rg.diasEditados()).toEqual([D]);
  });

  it("con errores no escribe nada", async () => {
    const c = await db.collections();
    expect(await rg.aplicarReglas(D, [cupo("Cali", 20)], actor)).toMatchObject({ ok: false });
    expect(await c.changeLog.countDocuments({ accion: "reglas_cupos" })).toBe(1);
  });
});

describe("cierre de inscripciones por ciudad", () => {
  it("por defecto 24 h antes del primer bloque; editable en horas y a mano por ciudad", async () => {
    const r = await rg.cierres();
    expect(r.horasAntes).toBe(24);
    expect(r.ciudades.find((x) => x.ciudad === "Cali")).toMatchObject({ primerBloque: inicioUTC(D, 8, 0).toISOString(), cierre: new Date(inicioUTC(D, 8, 0).getTime() - 24 * 3600_000).toISOString(), manual: null });
    await rg.guardarCierre(48, { Cartagena: new Date("2026-11-11T22:00:00Z") }, actor);
    const r2 = await rg.cierres();
    expect(r2.ciudades.find((x) => x.ciudad === "Cali")?.cierre).toBe(new Date(inicioUTC(D, 8, 0).getTime() - 48 * 3600_000).toISOString());
    expect(r2.ciudades.find((x) => x.ciudad === "Cartagena")?.cierre).toBe("2026-11-11T22:00:00.000Z");
    expect(await (await db.collections()).changeLog.countDocuments({ accion: "cierre_inscripciones" })).toBe(1);
  });

  it("el portal: cerrado desde el cierre (agenda y reservar), aún no abre si todos sus días abren después", async () => {
    const tarde = new Date("2026-11-11T23:00:00Z"); // después del cierre de Cartagena y de Cali (48 h)
    expect(await rg.estadoCiudad("Cartagena", tarde)).toEqual({ estado: "cerrado", cierre: "2026-11-11T22:00:00.000Z" });
    expect(await agenda("6600002", undefined, tarde)).toMatchObject({ error: "cerrado" });
    expect(await reservar("6600002", inicioUTC(D, 9, 15), tarde)).toMatchObject({ ok: false, error: "cerrado" });
    const temprano = new Date("2026-11-01T12:00:00Z");
    expect(await rg.estadoCiudad("Cali", temprano)).toEqual({ estado: "abierto" });
    const c = await db.collections();
    await c.dias.updateOne({ _id: D, "ciudades.ciudad": "Cali" }, { $set: { "ciudades.$.abre": new Date("2026-11-05T13:00:00Z") } });
    expect(await rg.estadoCiudad("Cali", temprano)).toEqual({ estado: "antes", abre: "2026-11-05T13:00:00.000Z" });
    expect(await reservar("6600002", inicioUTC(D, 9, 15), temprano)).toMatchObject({ ok: false, error: "aun_no_abre" });
  });
});

describe("más casos", () => {
  it("aplicar mientras estudiantes reservan: ninguna reserva se pierde ni cambia de ciudad", async () => {
    const c = await db.collections(), now = new Date(), ahora = new Date("2026-11-01T12:00:00Z");
    await c.inscripciones.deleteMany({});
    await c.dias.updateOne({ _id: D }, { $set: { "ciudades.$[].abre": null } });
    const docs = Array.from({ length: 6 }, (_, i) => `66100${i}0`);
    for (const [i, doc] of docs.entries())
      await c.proyectos.insertOne({ _id: new ObjectId(), codigo: `R${i}`, ciudad: "Cali", nombre: `R${i}`, creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: `R ${i}`, documento: doc }] });
    const libresCali = await c.asientos.find({ dia: D, proyectoId: null, ciudades: "Cali" }).sort({ inicio: 1 }).toArray();
    const antes = await c.asientos.countDocuments({ dia: D, proyectoId: { $type: "objectId" } });
    const reglas = [cupo("Cali", 4, null, true), cupo("Cartagena", 4, 10)];
    const [r, ...rs] = await Promise.all([rg.aplicarReglas(D, reglas, actor), ...docs.map((d, i) => reservar(d, libresCali[i % libresCali.length]!.inicio, ahora))]);
    const reservadas = await c.asientos.find({ dia: D, proyectoId: { $type: "objectId" } }).toArray();
    const ciudadDe = new Map((await c.proyectos.find({}).toArray()).map((p) => [String(p._id), p.ciudad]));
    for (const a of reservadas) expect(a.ciudades).toContain(ciudadDe.get(String(a.proyectoId)));
    expect(reservadas.length).toBe(antes + rs.filter((x) => x.ok).length);
    if (!r.ok) expect(r.errores.join(" ")).toMatch(/reservó|reservas/);
  });

  it("cierre sin automático cuando la ciudad abre después; el manual sí manda", async () => {
    const c = await db.collections();
    await c.inscripciones.deleteMany({});
    await c.dias.updateOne({ _id: D, "ciudades.ciudad": "Cartagena" }, { $set: { "ciudades.$.abre": new Date(inicioUTC(D, 8, 0).getTime() - 2 * 3600_000) } });
    const k = (await rg.cierres()).ciudades.find((x) => x.ciudad === "Cartagena")!;
    expect([k.sinAutomatico, k.cierre]).toEqual([true, null]);
    expect(await rg.estadoCiudad("Cartagena", new Date(inicioUTC(D, 7, 0)))).toEqual({ estado: "abierto" });
    await rg.guardarCierre(24, { Cartagena: new Date(inicioUTC(D, 7, 30)) }, actor);
    expect(await rg.estadoCiudad("Cartagena", inicioUTC(D, 7, 30))).toMatchObject({ estado: "cerrado" }); // en el instante exacto
    expect(await rg.estadoCiudad("Cartagena", new Date(inicioUTC(D, 7, 30).getTime() - 1))).toEqual({ estado: "abierto" });
  });

  it("la vista previa de mentores avisa de los días editados en pantalla", async () => {
    const { previaMentores } = await import("@/lib/importar/aplicar");
    const p = await previaMentores({ mentores: [], horas: [], cupos: new Map(), asientos: [], errores: [{ hoja: "Horarios", fila: 0, mensaje: "vacío" }], avisos: [] });
    expect(p.avisos.map((a) => a.mensaje).join(" ")).toMatch(new RegExp(`editadas en pantalla para ${D}`));
  });
});

describe("«Todas» en los otros días (cierre técnico)", () => {
  it("dar o quitar días propios a una ciudad cambiaría «Todas» en otro día: se pide hacerlo explícito", async () => {
    const c = await db.collections();
    await c.dias.insertOne({ _id: "2026-11-13", ciudades: [cupo("Todas", null, null, true)] });
    const p = await rg.previaReglas(D, [cupo("Cali", 8, null, true), cupo("Cartagena", 4), cupo("Medellín", 0)]);
    expect(p.errores.join(" ")).toMatch(/Agregar Medellín aquí la saca de «Todas» en 2026-11-13/);
    // Sin cambiar qué ciudades tienen días propios, no hay error.
    expect((await rg.previaReglas(D, [cupo("Cali", 8, null, true), cupo("Cartagena", 4)])).errores).toEqual([]);
    await c.dias.deleteOne({ _id: "2026-11-13" });
  });
});

describe("«Todas»: quitar y clausura (cierre técnico)", () => {
  it("quitarle a una ciudad su único día propio la vuelve a meter en «Todas» de otro día: error", async () => {
    const c = await db.collections();
    await c.dias.insertOne({ _id: "2026-11-13", ciudades: [cupo("Todas", null, null, true)] });
    const p = await rg.previaReglas(D, [cupo("Cartagena", 4, null, true)]);
    expect(p.errores.join(" ")).toMatch(/Quitar a Cali de aquí la vuelve a meter de «Todas» en 2026-11-13/);
    await c.dias.deleteOne({ _id: "2026-11-13" });
  });
  it("si en ese otro día la ciudad ya pasó su clausura, no hay error", async () => {
    const c = await db.collections();
    await c.dias.insertOne({ _id: "2026-11-14", ciudades: [cupo("Todas", null, null, true)] }); // Cali clausura el 14
    expect((await rg.previaReglas(D, [cupo("Cartagena", 4, null, true)])).errores.join(" ")).not.toMatch(/Cali/);
    await c.dias.deleteOne({ _id: "2026-11-14" });
  });
});

import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { CupoCiudad, Proyecto } from "@/lib/types";

// Gestión manual de proyectos contra la base LOCAL: crear, editar, separar pareja, agregar integrante, carreras con
// el portal y "como producción" (sin acciones del admin, nada cambia). Datos INVENTADOS.

usarBaseLocal(10);
const db = await import("@/lib/db");
const g = await import("@/lib/gestionProyectos");
const { reservar } = await import("@/lib/reservas");
const { consultar } = await import("@/lib/estudiante");
const { inicioUTC } = await import("@/lib/edicion");
const { listarProyectos } = await import("@/lib/admin");

const D = "2026-11-12", D2 = "2026-11-18";
const AHORA = new Date("2026-11-01T12:00:00Z");
const actor = { rol: "admin" as const, usuario: "admin.p" };
const cupo = (ciudad: string, cupos: number | null, sobrante = false): CupoCiudad => ({ ciudad, cupos, max: null, sobrante, abre: null });
const H = (h: number, m = 0, dia = D) => inicioUTC(dia, h, m);

async function proyecto(codigo: string, ciudad: string, docs: string[], extra: Partial<Proyecto> = {}) {
  const c = await db.collections(), now = new Date("2026-10-20T12:00:00Z"), _id = new ObjectId();
  await c.proyectos.insertOne({ _id, codigo, ciudad, nombre: `App ${codigo}`, monitor: null, creadoEn: now, actualizadoEn: now, integrantes: docs.map((d, i) => ({ documento: d, nombre: `Persona ${codigo} ${i + 1}`, celular: "+573000000000" })), ...extra });
  return _id;
}
const sinMs = <T,>(x: T) => JSON.parse(JSON.stringify(x));
async function foto() {
  const c = await db.collections();
  return sinMs({ proyectos: await c.proyectos.find({}).sort({ codigo: 1 }).toArray(), asientos: await c.asientos.find({}).sort({ inicio: 1, mentorId: 1 }).toArray() });
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections(), now = new Date();
  await c.mentores.insertMany([{ _id: "m1", nombre: "Mentor 1" }, { _id: "m2", nombre: "Mentor 2" }, { _id: "m3", nombre: "Mentor 3" }]);
  const asientos = [];
  for (const h of [8, 9, 10]) for (const m of ["m1", "m2", "m3"]) for (const b of [0, 15, 30, 45])
    asientos.push({ _id: new ObjectId(), dia: D, inicio: H(h, b), mentorId: m, ciudades: m === "m3" ? ["Cartagena"] : ["Cali"], proyectoId: null });
  for (const b of [0, 15, 30, 45]) asientos.push({ _id: new ObjectId(), dia: D2, inicio: H(8, b, D2), mentorId: "m1", ciudades: ["Cartagena"], proyectoId: null });
  await c.asientos.insertMany(asientos);
  await c.dias.insertMany([{ _id: D, ciudades: [cupo("Cali", 24, true), cupo("Cartagena", 12)] }, { _id: D2, ciudades: [cupo("Cartagena", 4, true)] }]);
  await c.users.insertMany([
    { _id: new ObjectId(), usuario: "mon.cali", nombre: "Monitor Cali", rol: "monitor", ciudades: ["Cali"], activo: true, passwordHash: "x", tokenVersion: 0, creadoEn: now },
    { _id: new ObjectId(), usuario: "mon.ctg", nombre: "Monitor Ctg", rol: "monitor", ciudades: ["Cartagena"], activo: true, passwordHash: "x", tokenVersion: 0, creadoEn: now },
  ]);
});
afterAll(() => db.closeDb());

const nuevo = (docs: { d: string; n: string; cel?: string }[], ciudad = "Cali") => ({
  ciudad, nombre: "Huerta urbana", descripcion: "Riego automático", ruta: "Básica" as const,
  integrantes: docs.map((x) => ({ nombre: x.n, documento: x.d, ...(x.cel ? { celular: x.cel } : {}) })),
});

describe("1. crear", () => {
  it("valida como el importador, queda sin hora con el monitor de la ciudad, y el estudiante elige en el portal", async () => {
    const r = await g.crearProyecto(nuevo([{ d: "71000001", n: "ana  pérez", cel: "300 111 2233" }]), actor);
    expect(r).toMatchObject({ ok: true, codigo: "P-71000001" });
    const c = await db.collections();
    const p = await c.proyectos.findOne({ codigo: "P-71000001" });
    expect(p).toMatchObject({ ciudad: "Cali", monitor: "mon.cali", ruta: "Básica", integrantes: [{ nombre: "Ana Pérez", documento: "71000001", celular: "+573001112233" }] });
    expect(Object.keys(p!).sort()).toEqual(["_id", "actualizadoEn", "ciudad", "codigo", "creadoEn", "descripcion", "integrantes", "monitor", "nombre", "ruta"]);
    expect((await consultar("71000001"))?.hora ?? null).toBeNull();
    expect(await reservar("71000001", H(8), AHORA)).toMatchObject({ ok: true });
    const log = await c.changeLog.findOne({ accion: "crear_proyecto", proyectoId: p!._id });
    // El código P-<documento> es el identificador de siempre (importador); fuera de él, el documento va enmascarado.
    expect(log?.nuevo).toContain("•••• 0001");
    expect(log?.nuevo?.replace("P-71000001", "")).not.toContain("71000001");
  });

  it("rechaza documento repetido, con decimales o con puntos raros, celular inválido y pareja con el mismo documento", async () => {
    expect(await g.crearProyecto(nuevo([{ d: "71000001", n: "Otra Persona" }]), actor)).toMatchObject({ ok: false, error: "documento" });
    expect(await g.crearProyecto(nuevo([{ d: "7100.5", n: "Otra Persona" }]), actor)).toMatchObject({ ok: false, error: "datos" });
    expect(await g.crearProyecto(nuevo([{ d: "71000009", n: "Otra Persona", cel: "12" }]), actor)).toMatchObject({ ok: false, error: "datos" });
    expect(await g.crearProyecto(nuevo([{ d: "71000009", n: "Uno Uno" }, { d: "71000009", n: "Dos Dos" }]), actor)).toMatchObject({ ok: false, error: "datos" });
    expect(await g.crearProyecto({ ...nuevo([{ d: "71000009", n: "Uno Uno" }]), monitor: "no.existe" }, actor)).toMatchObject({ ok: false, error: "datos" });
  });
});

describe("2. editar", () => {
  it("corrige datos y deja changeLog con antes y después, sin documentos completos", async () => {
    const pid = await proyecto("P-72000001", "Cali", ["72000001"]);
    const d = await g.datosProyecto(pid);
    const r = await g.editarProyecto(pid, { ciudad: "Cali", nombre: "Nuevo nombre", ruta: "Avanzada", monitor: "mon.cali", integrantes: [{ nombre: "Persona Corregida", documento: "72000002", celular: "3009998877", correo: "persona.real@ejemplo.org" }] }, { version: d!.version }, actor);
    expect(r).toEqual({ ok: true });
    const c = await db.collections();
    expect(await c.proyectos.findOne({ _id: pid })).toMatchObject({ codigo: "P-72000001", nombre: "Nuevo nombre", ruta: "Avanzada", integrantes: [{ documento: "72000002", celular: "+573009998877" }] });
    const log = await c.changeLog.findOne({ proyectoId: pid, accion: "editar_proyecto" });
    expect(`${log?.anterior} ${log?.nuevo}`).toMatch(/•••• 0001/);
    expect(`${log?.anterior} ${log?.nuevo}`.replaceAll("P-72000001", "")).not.toMatch(/72000001|72000002|3009998877|persona\.real/);
    // Versión vieja → no pisa.
    expect(await g.editarProyecto(pid, { ciudad: "Cali", nombre: "Otro", integrantes: [{ nombre: "Persona Corregida", documento: "72000002" }] }, { version: d!.version }, actor)).toMatchObject({ ok: false, error: "cambio" });
  });

  it("documento de otro proyecto, cambio de cantidad de integrantes y ciudad que no presenta el día de su hora", async () => {
    const pid = await proyecto("P-73000001", "Cali", ["73000001"]);
    const base = { ciudad: "Cali", nombre: "App", integrantes: [{ nombre: "Persona Tres", documento: "71000001" }] };
    expect(await g.editarProyecto(pid, base, {}, actor)).toMatchObject({ ok: false, error: "documento" });
    expect(await g.editarProyecto(pid, { ...base, integrantes: [{ nombre: "Uno Uno", documento: "73000001" }, { nombre: "Dos Dos", documento: "73000002" }] }, {}, actor)).toMatchObject({ ok: false, error: "datos" });
    // Con hora el 18 (solo Cartagena): pasar a Cali pide confirmación; con ella, cambia la ciudad y la hora NO se mueve.
    const ctg = await proyecto("P-73000009", "Cartagena", ["73000009"]);
    expect(await reservar("73000009", H(8, 0, D2), AHORA)).toMatchObject({ ok: true });
    const c = await db.collections();
    const antes = await c.asientos.findOne({ proyectoId: ctg });
    const e = { ciudad: "Cali", nombre: "App P-73000009", integrantes: [{ nombre: "Persona P-73000009 1", documento: "73000009" }] };
    expect(await g.editarProyecto(ctg, e, {}, actor)).toMatchObject({ ok: false, error: "confirmar_ciudad" });
    expect(await g.editarProyecto(ctg, e, { confirmarCiudad: true }, actor)).toEqual({ ok: true });
    expect(await c.asientos.findOne({ proyectoId: ctg })).toEqual(antes);
  });
});

describe("3. separar pareja", () => {
  it("el que queda conserva proyecto, hora y sala; el que sale queda individual sin hora y elige la suya en el portal", async () => {
    const pid = await proyecto("P-74000001", "Cali", ["74000001", "74000002"], { ruta: "Avanzada", monitor: "mon.cali" });
    expect(await reservar("74000001", H(9), AHORA)).toMatchObject({ ok: true });
    const c = await db.collections();
    const asiento = await c.asientos.findOne({ proyectoId: pid });
    const r = await g.separarPareja(pid, { queda: 1, nombreNuevo: "Robot lector" }, actor);
    expect(r).toMatchObject({ ok: true, codigo: "P-74000001-2" }); // P-74000001 ya era el código de la pareja
    expect(await c.proyectos.findOne({ _id: pid })).toMatchObject({ codigo: "P-74000001", integrantes: [{ documento: "74000002" }] });
    expect(await c.asientos.findOne({ proyectoId: pid })).toEqual(asiento);
    expect(await c.proyectos.findOne({ codigo: "P-74000001-2" })).toMatchObject({ nombre: "Robot lector", ciudad: "Cali", ruta: "Avanzada", monitor: "mon.cali", integrantes: [{ documento: "74000001" }] });
    expect((await consultar("74000001"))?.hora ?? null).toBeNull(); // ya no ve la hora de la pareja
    expect((await consultar("74000002"))?.hora).toBeTruthy();
    expect(await reservar("74000001", H(10), AHORA)).toMatchObject({ ok: true });
    expect(await g.separarPareja(pid, { queda: 0 }, actor)).toMatchObject({ ok: false, error: "datos" }); // ya es individual
  });

  it("con evaluación guardada no se separa", async () => {
    const pid = await proyecto("P-75000001", "Cali", ["75000001", "75000002"]);
    const c = await db.collections();
    await c.evalResultados.insertOne({ _id: `${pid.toHexString()}|75000001`, proyectoId: pid, documento: "75000001", mentorId: "m1", a: {}, b: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "", noPresento: false, actualizadoEn: new Date(), actualizadoPor: "m" });
    expect(await g.separarPareja(pid, { queda: 0 }, actor)).toMatchObject({ ok: false, error: "evaluado" });
    expect((await c.proyectos.findOne({ _id: pid }))?.integrantes).toHaveLength(2);
  });
});

describe("4. agregar integrante", () => {
  it("documento nuevo: el individual pasa a pareja", async () => {
    const pid = await proyecto("P-76000001", "Cali", ["76000001"]);
    expect(await g.agregarIntegrante(pid, { nombre: "luis gómez", documento: "76000002", correo: "LUIS@EJEMPLO.ORG" }, {}, actor)).toEqual({ ok: true });
    expect((await (await db.collections()).proyectos.findOne({ _id: pid }))?.integrantes[1]).toEqual({ documento: "76000002", nombre: "Luis Gómez", correo: "luis@ejemplo.org" });
  });

  it("documento de otro proyecto SIN hora: pide confirmar y, al unir, el otro se elimina", async () => {
    const pid = await proyecto("P-77000001", "Cali", ["77000001"]);
    const otro = await proyecto("P-77000002", "Cali", ["77000002"]);
    expect(await g.agregarIntegrante(pid, { nombre: "Persona Dos", documento: "77000002" }, {}, actor)).toMatchObject({ ok: false, error: "confirmar_union", otro: { codigo: "P-77000002", hora: null } });
    expect(await g.agregarIntegrante(pid, { nombre: "Persona Dos", documento: "77000002" }, { unir: true }, actor)).toEqual({ ok: true });
    const c = await db.collections();
    expect(await c.proyectos.findOne({ _id: otro })).toBeNull();
    expect((await c.proyectos.findOne({ _id: pid }))?.integrantes.map((i) => i.documento)).toEqual(["77000001", "77000002"]);
  });

  it("documento de otro proyecto CON hora: elige cuál hora conservar y libera la otra", async () => {
    const c = await db.collections();
    // Conservar la del otro (este no tenía): el asiento del otro pasa a este.
    const p1 = await proyecto("P-78000001", "Cali", ["78000001"]);
    const o1 = await proyecto("P-78000002", "Cali", ["78000002"]);
    expect(await reservar("78000002", H(10, 15), AHORA)).toMatchObject({ ok: true });
    const asientoO = await c.asientos.findOne({ proyectoId: o1 });
    expect(await g.agregarIntegrante(p1, { nombre: "Persona Dos", documento: "78000002" }, { unir: true }, actor)).toMatchObject({ ok: false, error: "confirmar_union" });
    expect(await g.agregarIntegrante(p1, { nombre: "Persona Dos", documento: "78000002" }, { unir: true, conservar: "otro" }, actor)).toEqual({ ok: true });
    expect(await c.asientos.findOne({ _id: asientoO!._id })).toMatchObject({ proyectoId: p1 });
    expect(await c.asientos.countDocuments({ proyectoId: o1 })).toBe(0);
    // Los dos con hora, conservar la de este: la del otro queda libre.
    const p2 = await proyecto("P-79000001", "Cali", ["79000001"]);
    const o2 = await proyecto("P-79000002", "Cali", ["79000002"]);
    expect(await reservar("79000001", H(10, 30), AHORA)).toMatchObject({ ok: true });
    expect(await reservar("79000002", H(10, 45), AHORA)).toMatchObject({ ok: true });
    const deO2 = await c.asientos.findOne({ proyectoId: o2 }), deP2 = await c.asientos.findOne({ proyectoId: p2 });
    expect(await g.agregarIntegrante(p2, { nombre: "Persona Dos", documento: "79000002" }, { unir: true, conservar: "este" }, actor)).toEqual({ ok: true });
    expect(await c.asientos.findOne({ _id: deO2!._id })).toMatchObject({ proyectoId: null });
    expect(await c.asientos.findOne({ _id: deP2!._id })).toMatchObject({ proyectoId: p2 });
    expect((await consultar("79000002"))?.hora?.inicio).toEqual(deP2!.inicio.toISOString());
  });

  it("no une si alguno tiene evaluación o si el otro es pareja", async () => {
    const c = await db.collections();
    const p = await proyecto("P-80000001", "Cali", ["80000001"]);
    await proyecto("P-80000002", "Cali", ["80000002", "80000003"]);
    expect(await g.agregarIntegrante(p, { nombre: "Persona Dos", documento: "80000002" }, { unir: true }, actor)).toMatchObject({ ok: false, error: "datos" });
    const o = await proyecto("P-80000004", "Cali", ["80000004"]);
    await c.evalResultados.insertOne({ _id: `${o.toHexString()}|80000004`, proyectoId: o, documento: "80000004", mentorId: "m1", a: {}, b: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "", noPresento: false, actualizadoEn: new Date(), actualizadoPor: "m" });
    expect(await g.agregarIntegrante(p, { nombre: "Persona Cuatro", documento: "80000004" }, { unir: true }, actor)).toMatchObject({ ok: false, error: "evaluado" });
    expect(await c.proyectos.findOne({ _id: o })).not.toBeNull();
  });
});

describe("5. carreras con el portal", () => {
  it("el estudiante que sale reserva mientras el admin separa: nunca queda una hora suya en el proyecto de la pareja después de separar", async () => {
    const c = await db.collections();
    for (let k = 0; k < 6; k++) {
      const a = `81${k}00001`, b = `81${k}00002`;
      const pid = await proyecto(`P-${a}`, "Cali", [a, b]);
      const [res] = await Promise.all([reservar(a, H(9, 15), AHORA), g.separarPareja(pid, { queda: 1 }, actor)]);
      const propio = await c.proyectos.findOne({ "integrantes.documento": a });
      const asientoDeA = await c.asientos.findOne({ proyectoId: propio!._id });
      const asientoP = await c.asientos.findOne({ proyectoId: pid });
      // O la reserva entró antes (la conserva el que queda, como dice la regla) o después (va al proyecto nuevo de A).
      if (res.ok) expect(!!asientoDeA !== !!asientoP).toBe(true);
      const log = await c.changeLog.findOne({ accion: "reservar", "actor.usuario": a });
      if (asientoP && log) expect(log.fecha.getTime()).toBeLessThanOrEqual((await c.changeLog.findOne({ proyectoId: pid, accion: "separar_pareja" }))!.fecha.getTime() + 1000);
      await c.asientos.updateMany({ inicio: H(9, 15) }, { $set: { proyectoId: null } });
    }
  });

  it("el estudiante de un proyecto que se une reserva a la vez: nunca queda un asiento de un proyecto eliminado", async () => {
    const c = await db.collections();
    for (let k = 0; k < 6; k++) {
      const a = `82${k}00001`, b = `82${k}00002`;
      const pid = await proyecto(`P-${a}`, "Cali", [a]);
      const otro = await proyecto(`P-${b}`, "Cali", [b]);
      await Promise.all([reservar(b, H(9, 30), AHORA), g.agregarIntegrante(pid, { nombre: "Persona Dos", documento: b }, { unir: true, conservar: "otro" }, actor)]);
      expect(await c.asientos.countDocuments({ proyectoId: otro })).toBe(0);
      const vivos = new Set((await c.proyectos.find({}, { projection: { _id: 1 } }).toArray()).map((p) => String(p._id)));
      for (const s of await c.asientos.find({ proyectoId: { $type: "objectId" } }).toArray()) expect(vivos.has(String(s.proyectoId))).toBe(true);
      await c.asientos.updateMany({ inicio: H(9, 30) }, { $set: { proyectoId: null } });
    }
  });
});

describe("6. como producción: sin acciones del admin, nada cambia", () => {
  it("las lecturas nuevas no escriben, y una acción sobre un proyecto no toca los demás", async () => {
    const c = await db.collections();
    // Datos como los reales: individuales y parejas, con y sin hora, sin evaluaciones.
    const ids: ObjectId[] = [];
    for (let k = 0; k < 8; k++) ids.push(await proyecto(`P-90${k}00001`, k % 2 ? "Cartagena" : "Cali", k % 3 ? [`90${k}00001`] : [`90${k}00001`, `90${k}00002`]));
    const horas: Record<number, Date> = { 0: H(10, 0), 1: H(10, 15), 2: H(10, 30), 5: H(10, 45) }; // Cali en m1/m2, Cartagena en m3
    for (const k of [0, 1, 2, 5]) expect(await reservar(`90${k}00001`, horas[k]!, AHORA)).toMatchObject({ ok: true });
    const portalAntes = await Promise.all(ids.map((_, k) => consultar(`90${k}00001`)));
    const antes = await foto();
    // Lo que agrega esta versión sin acción del admin: listar, abrir datos completos.
    await listarProyectos({});
    for (const id of ids) await g.datosProyecto(id);
    expect(await foto()).toEqual(antes);
    expect(await Promise.all(ids.map((_, k) => consultar(`90${k}00001`)))).toEqual(portalAntes);
    // Una acción del admin sobre UN proyecto solo cambia ese proyecto.
    expect(await g.separarPareja(ids[0]!, { queda: 0 }, actor)).toMatchObject({ ok: true });
    const despues = await foto();
    const sinEse = (f: typeof antes) => ({ asientos: f.asientos, proyectos: f.proyectos.filter((p: { _id: string; codigo: string }) => p._id !== String(ids[0]) && !p.codigo.startsWith("P-90000002")) });
    expect(sinEse(despues)).toEqual(sinEse(antes));
  });
});

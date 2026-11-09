import { ObjectId } from "mongodb";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Paso 26 · Un usuario con varios roles, contra la base LOCAL: cambiar roles adicionales (solo el admin, nunca a uno
// mismo ni «Administración», con changeLog) y que siga contando como monitor. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const usuarios = await import("@/lib/usuarios");
const admin = await import("@/lib/admin");
const planSalas = await import("@/lib/planSalas");

const ADMIN = new ObjectId(), KAMI = new ObjectId(), COORD = new ObjectId(), OTRO_ADMIN = new ObjectId(), PROY = new ObjectId();
const actor = { rol: "admin" as const, usuario: "admin.p", id: String(ADMIN) };

beforeEach(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections(), now = new Date();
  await c.mentores.insertMany([{ _id: "kamila-prueba", nombre: "Kamila Prueba" }]);
  await c.users.insertMany([
    { _id: ADMIN, usuario: "admin.p", nombre: "Admin Prueba", rol: "admin", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
    { _id: OTRO_ADMIN, usuario: "admin.q", nombre: "Admin Dos", rol: "admin", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
    { _id: KAMI, usuario: "kamila", nombre: "Kamila Prueba", rol: "monitor", ciudades: ["Panamá"], activo: true, passwordHash: "x", creadoEn: now },
    { _id: COORD, usuario: "coord.p", nombre: "Coordinación Prueba", rol: "coordinador", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
  ]);
  await c.proyectos.insertOne({ _id: PROY, codigo: "PA-1", ciudad: "Panamá", nombre: "App Panamá", ruta: "Básica", creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: "Persona Uno", documento: "880001" }] });
  await c.planSalas.insertOne({ _id: "2026-11-12|8|1", dia: "2026-11-12", hora: 8, sala: 1, mentorId: "kamila-prueba", monitor: null, origen: null });
});
afterAll(() => db.closeDb());

const leer = async (id: ObjectId) => (await db.collections()).users.findOne({ _id: id });
const logs = async () => (await db.collections()).changeLog.find({ accion: "roles_usuario" }).toArray();

describe("cambiar roles adicionales", () => {
  it("agregar coordinación a una monitora: solo cambia rolesExtra, conserva sus ciudades y deja changeLog", async () => {
    const r = await usuarios.cambiarRolesExtra(KAMI, ["coordinador"], actor);
    expect(r.ok).toBe(true);
    const u = await leer(KAMI);
    expect(u).toMatchObject({ rol: "monitor", rolesExtra: ["coordinador"], ciudades: ["Panamá"], activo: true });
    expect(await logs()).toMatchObject([{ anterior: "kamila: ninguno", nuevo: "kamila: Coordinación", actor: { rol: "admin", usuario: "admin.p" } }]);
    expect(usuarios.vistaUsuario(u!)).toMatchObject({ rol: "monitor", rolesExtra: ["coordinador"], ciudades: ["Panamá"] });
  });

  it("quitarlo deja la lista vacía (y otro changeLog); pedir lo mismo no escribe", async () => {
    await usuarios.cambiarRolesExtra(KAMI, ["coordinador"], actor);
    expect(await usuarios.cambiarRolesExtra(KAMI, ["coordinador"], actor)).toMatchObject({ ok: true });
    expect(await logs()).toHaveLength(1);
    await usuarios.cambiarRolesExtra(KAMI, [], actor);
    expect((await leer(KAMI))?.rolesExtra).toEqual([]);
    expect((await logs()).map((l) => l.nuevo)).toEqual(["kamila: Coordinación", "kamila: ninguno"]);
  });

  it("nadie se cambia sus propios roles; a administración no se le dan adicionales", async () => {
    expect(await usuarios.cambiarRolesExtra(ADMIN, ["monitor"], actor)).toMatchObject({ ok: false, error: "propio" });
    expect(await usuarios.cambiarRolesExtra(OTRO_ADMIN, ["coordinador"], actor)).toMatchObject({ ok: false, error: "admin" });
    expect(await usuarios.cambiarRolesExtra(new ObjectId(), ["coordinador"], actor)).toMatchObject({ ok: false, error: "no_existe" });
    expect((await leer(ADMIN))?.rolesExtra).toBeUndefined();
    expect(await logs()).toEqual([]);
  });

  it("el rol principal no se repite como adicional", async () => {
    await usuarios.cambiarRolesExtra(KAMI, ["monitor", "coordinador"], actor);
    expect((await leer(KAMI))?.rolesExtra).toEqual(["coordinador"]);
  });

  it("mentor como adicional: gana su mentorId (como en Horarios) y lo pierde al quitarlo", async () => {
    await usuarios.cambiarRolesExtra(KAMI, ["mentor"], actor);
    expect(await leer(KAMI)).toMatchObject({ rolesExtra: ["mentor"], mentorId: "kamila-prueba" });
    await usuarios.cambiarRolesExtra(KAMI, [], actor);
    expect((await leer(KAMI))?.mentorId).toBeUndefined();
  });

  it("dos admins a la vez: cada cambio que queda tiene su changeLog", async () => {
    const rs = await Promise.all([usuarios.cambiarRolesExtra(KAMI, ["coordinador"], actor), usuarios.cambiarRolesExtra(KAMI, ["mentor"], { ...actor, usuario: "admin.q", id: String(OTRO_ADMIN) })]);
    const ok = rs.filter((r) => r.ok).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(await logs()).toHaveLength(ok);
    for (const r of rs) if (!r.ok) expect(r.error).toBe("cambio");
  });
});

describe("sigue contando como monitor", () => {
  it("con monitor como rol principal y coordinación adicional: se le asignan proyectos y salas", async () => {
    await usuarios.cambiarRolesExtra(KAMI, ["coordinador"], actor);
    expect(await admin.asignarMonitor(PROY, "kamila", actor)).toMatchObject({ ok: true });
    expect(await planSalas.cambiarMonitorSala("2026-11-12|8|1", "kamila", actor)).toMatchObject({ ok: true });
    expect((await planSalas.verPlan()).monitores.map((m) => m.usuario)).toContain("kamila");
  });

  it("coordinación con monitor adicional cuenta como monitor; sin él, no", async () => {
    const c = await db.collections();
    expect(await planSalas.cambiarMonitorSala("2026-11-12|8|1", "coord.p", actor)).toMatchObject({ ok: false, error: "monitor_invalido" });
    await usuarios.cambiarRolesExtra(COORD, ["monitor"], actor);
    await c.users.updateOne({ _id: COORD }, { $set: { ciudades: ["Panamá"] } }); // sus ciudades como monitor (Usuarios las guarda aparte)
    expect(await planSalas.cambiarMonitorSala("2026-11-12|8|1", "coord.p", actor)).toMatchObject({ ok: true });
    expect(await admin.asignarMonitor(PROY, "coord.p", actor)).toMatchObject({ ok: true });
    expect(usuarios.vistaUsuario((await leer(COORD))!)).toMatchObject({ rolesExtra: ["monitor"], ciudades: ["Panamá"] });
    // Al quitarle Monitor, sus ciudades se vacían (no vuelven solas si luego se le devuelve el rol).
    await usuarios.cambiarRolesExtra(COORD, [], actor);
    expect(await leer(COORD)).toMatchObject({ rolesExtra: [], ciudades: [] });
  });

  it("la revisión de nombres cuenta a los monitores por rol adicional", async () => {
    const ux = await import("@/lib/usuariosExcel");
    await usuarios.cambiarRolesExtra(COORD, ["monitor"], actor);
    expect((await ux.revisionNombres()).monitoresSinSalas).toEqual(["Coordinación Prueba", "Kamila Prueba"]);
  });
});

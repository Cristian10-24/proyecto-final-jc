import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Vistas del mentor · única ampliación de lectura: el monitor a cargo del bloque (nombre y celular) en GET
// /api/evaluacion/proyectos y /[id], del plan de salas (día + hora + mentor). Desactivado, sin usuario o sin monitor =
// null («Sin monitor»). Nunca su usuario ni su correo. Mismos permisos: monitor 403. Base LOCAL, datos INVENTADOS.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const lista = await import("@/app/api/evaluacion/proyectos/route");
const ficha = await import("@/app/api/evaluacion/proyectos/[id]/route");

const D = "2026-11-12";
const ids: Record<string, ObjectId> = {};
const P = { a: new ObjectId(), b: new ObjectId(), c: new ObjectId(), d: new ObjectId() };
const PROHIBIDO = ["mon.activa", "mon.inactivo", "mon.fantasma", "@monitores.test"];

type Fila = { id: string; monitor: { nombre: string; celular: string | null } | null };
async function pedirLista(quien: string) {
  estado.token = createToken(ids[quien]!.toHexString(), 0);
  const res = await lista.GET(new Request("http://localhost/api/evaluacion/proyectos"));
  const texto = await res.text();
  return { status: res.status, texto, filas: res.ok ? (JSON.parse(texto).filas as Fila[]) : [] };
}
async function pedirFicha(quien: string, id: ObjectId) {
  estado.token = createToken(ids[quien]!.toHexString(), 0);
  const res = await ficha.GET(new Request(`http://localhost/api/evaluacion/proyectos/${id}`), { params: Promise.resolve({ id: id.toHexString() }) });
  const texto = await res.text();
  return { status: res.status, texto, body: JSON.parse(texto) as { monitorBloque?: Fila["monitor"] } };
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["mentor", "coord", "monA", "monI", "monitorRol"]) ids[k] = new ObjectId();
  const u = (k: string, usuario: string, rol: string, extra: Record<string, unknown> = {}) =>
    ({ _id: ids[k]!, usuario, nombre: `Nombre ${k}`, rol, ciudades: ["Cali"], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0, ...extra });
  await c.users.insertMany([
    u("mentor", "mentor.uno", "mentor", { mentorId: "m1" }), u("coord", "coord.p", "coordinador"),
    u("monA", "mon.activa", "monitor", { celular: "+573101112233", correo: "a@monitores.test" }),
    u("monI", "mon.inactivo", "monitor", { activo: false, celular: "+573109998877", correo: "i@monitores.test" }),
    u("monitorRol", "mon.lector", "monitor"),
  ] as never);
  await c.mentores.insertOne({ _id: "m1", nombre: "Mentor Uno" });
  const proy = (_id: ObjectId, codigo: string, h: number, m: number) => [
    { _id, codigo, ciudad: "Cali", nombre: `App ${codigo}`, ruta: "Básica", creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: `Persona ${codigo}`, documento: `100000000${codigo.length}${h}${m}` }] },
    { _id: new ObjectId(), dia: D, inicio: new Date(Date.UTC(2026, 10, 12, h + 5, m)), mentorId: "m1", ciudades: ["Cali"], proyectoId: _id },
  ] as const;
  for (const [p, codigo, h, m] of [[P.a, "A", 8, 0], [P.b, "B", 9, 0], [P.c, "C", 10, 0], [P.d, "D", 11, 0]] as const) {
    const [pr, as] = proy(p, codigo, h, m);
    await c.proyectos.insertOne(pr as never);
    await c.asientos.insertOne(as as never);
  }
  await c.planSalas.insertMany([
    { _id: `${D}|8|2`, dia: D, hora: 8, sala: 2, mentorId: "m1", monitor: "mon.activa", origen: null },
    { _id: `${D}|9|2`, dia: D, hora: 9, sala: 2, mentorId: "m1", monitor: "mon.inactivo", origen: null },
    { _id: `${D}|10|2`, dia: D, hora: 10, sala: 2, mentorId: "m1", monitor: "mon.fantasma", origen: null },
    { _id: `${D}|11|2`, dia: D, hora: 11, sala: 2, mentorId: "m1", monitor: null, origen: null },
  ] as never);
});
afterAll(() => db.closeDb());

describe("monitor a cargo del bloque (solo lectura)", () => {
  it("lista del mentor: nombre y celular del monitor activo; desactivado, sin usuario o sin monitor = null", async () => {
    const r = await pedirLista("mentor");
    expect(r.status).toBe(200);
    const de = (id: ObjectId) => r.filas.find((f) => f.id === id.toHexString())!.monitor;
    expect(de(P.a)).toEqual({ nombre: "Nombre monA", celular: "+573101112233" });
    expect(de(P.b)).toBeNull();
    expect(de(P.c)).toBeNull();
    expect(de(P.d)).toBeNull();
    for (const x of [...PROHIBIDO, "+573109998877", "Nombre monI"]) expect(r.texto).not.toContain(x);
  });

  it("ficha del proyecto: el mismo monitor; coordinación también lo ve (solo lectura)", async () => {
    expect((await pedirFicha("mentor", P.a)).body.monitorBloque).toEqual({ nombre: "Nombre monA", celular: "+573101112233" });
    expect((await pedirFicha("mentor", P.b)).body.monitorBloque).toBeNull();
    const c = await pedirFicha("coord", P.a);
    expect(c.status).toBe(200);
    expect(c.body.monitorBloque).toEqual({ nombre: "Nombre monA", celular: "+573101112233" });
    for (const x of PROHIBIDO) expect(c.texto).not.toContain(x);
  });

  it("permisos sin cambios: un monitor recibe 403 en la lista y en la ficha", async () => {
    expect((await pedirLista("monitorRol")).status).toBe(403);
    expect((await pedirFicha("monitorRol", P.a)).status).toBe(403);
  });

  it("solo lee: la base queda igual", async () => {
    const c = await db.collections();
    const antes = JSON.stringify(await Promise.all([c.planSalas.find({}).sort({ _id: 1 }).toArray(), c.users.find({}).sort({ _id: 1 }).toArray(), c.changeLog.countDocuments()]));
    await pedirLista("mentor"); await pedirFicha("mentor", P.a); await pedirLista("coord");
    expect(JSON.stringify(await Promise.all([c.planSalas.find({}).sort({ _id: 1 }).toArray(), c.users.find({}).sort({ _id: 1 }).toArray(), c.changeLog.countDocuments()]))).toBe(antes);
  });
});

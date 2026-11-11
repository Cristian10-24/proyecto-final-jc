import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { Evento } from "@/lib/citaciones/contenido";
import type { ClienteCalendario } from "@/lib/citaciones/google";

// Fase 5 · Paso 29 · Rutas /api/admin/citaciones/* contra la base LOCAL, con la sesión real (cookie firmada) y un
// cliente de Google SIMULADO (nunca llama a Google). Solo admin, mismo origen, Zod estricto, sin conexión no se envía
// nada, variable de prueba mal escrita bloquea todo, y en modo prueba solo sale el correo de prueba. Datos INVENTADOS.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", sim: null as null | { cliente: ClienteCalendario; correoPrueba: string | null } };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));
vi.mock("@/lib/citaciones/google", async (original) => {
  const real = await original<typeof import("@/lib/citaciones/google")>();
  return {
    ...real,
    // Con `sim`: conectado con el cliente simulado (con la misma defensa del modo prueba que el real). Sin `sim`: el real.
    entornoCitaciones: (env?: Record<string, string | undefined>) => {
      if (!estado.sim) return real.entornoCitaciones(env);
      const { cliente, correoPrueba } = estado.sim;
      return { estado: { conectado: true, correoPrueba }, cliente: correoPrueba ? real.soloCorreoPrueba(cliente, correoPrueba) : cliente, correoPrueba };
    },
  };
});

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const { inicioUTC } = await import("@/lib/edicion");
const rutaGet = await import("@/app/api/admin/citaciones/route");
const rutaPrevia = await import("@/app/api/admin/citaciones/previa/route");
const rutaAcciones = await import("@/app/api/admin/citaciones/acciones/route");
const rutaTexto = await import("@/app/api/admin/citaciones/texto/route");

const D = "2026-11-12";
const PRUEBA = "yo@prueba.test";
const ids: Record<string, ObjectId> = {};
let proyecto = "";

const get = (q: string) => new Request(`http://localhost/x?${q}`);
const post = (body: unknown, origen?: string) => new Request("http://localhost/x", {
  method: "POST", body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", Host: "localhost", ...(origen ? { Origin: origen } : {}) },
});
const como = (quien: "admin" | "coord" | "monitor" | "mentor" | "monitorCoord") => { estado.token = createToken(ids[quien]!.toHexString(), 0); };

function simulado() {
  const llamadas: { op: string; id: string; evento?: Evento }[] = [];
  const cliente: ClienteCalendario = {
    async guardar(id, evento) { llamadas.push({ op: "guardar", id, evento }); },
    async cancelar(id) { llamadas.push({ op: "cancelar", id }); },
  };
  return { cliente, llamadas };
}

const ENV = ["GOOGLE_CAL_CLIENT_ID", "GOOGLE_CAL_CLIENT_SECRET", "GOOGLE_CAL_REFRESH_TOKEN", "CITACIONES_CORREO_PRUEBA"] as const;
const envAntes = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["admin", "coord", "monitor", "mentor", "monitorCoord"]) ids[k] = new ObjectId();
  await c.users.insertMany([
    { _id: ids.monitor, usuario: "mon.p", nombre: "Monitor Prueba", rol: "monitor", ciudades: ["Cali"], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0 },
    { _id: ids.mentor, usuario: "men.p", nombre: "Mentor Prueba", rol: "mentor", mentorId: "m1", ciudades: [], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0 },
    { _id: ids.monitorCoord, usuario: "moco.p", nombre: "Monitor Coordinación", rol: "monitor", rolesExtra: ["coordinador"], ciudades: ["Cali"], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0 },
    { _id: ids.admin, usuario: "admin.p", nombre: "Admin Prueba", rol: "admin", ciudades: [], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0 },
    { _id: ids.coord, usuario: "coord.p", nombre: "Coordinación Prueba", rol: "coordinador", ciudades: [], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0 },
    { _id: new ObjectId(), usuario: "mon.uno", nombre: "Monitor Uno", correo: "mon1@correo.test", rol: "monitor", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
  ]);
  await c.mentores.insertOne({ _id: "m1", nombre: "Mentora Uno", correo: "m1@correo.test" });
  await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 1, enlace: "https://meet.google.com/uno" }], importados: [], disponibilidad: [], actualizadoEn: now });
  await c.planSalas.insertOne({ _id: `${D}|14|1`, dia: D, hora: 14, sala: 1, mentorId: "m1", monitor: "mon.uno", origen: "importado" });
  const p = new ObjectId();
  proyecto = p.toHexString();
  await c.proyectos.insertOne({ _id: p, codigo: "A", ciudad: "Cali", nombre: "Proyecto A", creadoEn: now, actualizadoEn: now, integrantes: [{ documento: "991", nombre: "Ana", correo: "ana@correo.test" }] });
  await c.asientos.insertOne({ _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 14, 0), mentorId: "m1", ciudades: ["Cali"], proyectoId: p });
});
beforeEach(() => { estado.sim = null; for (const k of ENV) delete process.env[k]; como("admin"); });
afterAll(async () => { for (const k of ENV) if (envAntes[k] === undefined) delete process.env[k]; else process.env[k] = envAntes[k]; await db.closeDb(); });

describe("permisos y validación", () => {
  const todas = async () => [
    (await rutaGet.GET(get(`dia=${D}`))).status,
    (await rutaPrevia.GET(get(`dia=${D}&tipo=participante&clave=${proyecto}`))).status,
    (await rutaAcciones.POST(post({ accion: "marcar_todos", tipo: "mentor", dia: D }))).status,
    (await rutaTexto.POST(post({ texto: "Hola" }))).status,
  ];
  for (const quien of ["coord", "monitor", "mentor", "monitorCoord"] as const)
    it(`${quien} recibe 403 en todas las rutas`, async () => { como(quien); expect(await todas()).toEqual([403, 403, 403, 403]); });
  it("sin sesión: 401 en todas las rutas", async () => { estado.token = ""; expect(await todas()).toEqual([401, 401, 401, 401]); });
  it("variable de prueba mal escrita: la vista previa responde 409 (no muestra invitados como envío real)", async () => {
    process.env.CITACIONES_CORREO_PRUEBA = "no-es-correo";
    expect((await rutaPrevia.GET(get(`dia=${D}&tipo=participante&clave=${proyecto}`))).status).toBe(409);
  });
  it("otro origen: 403 aunque sea admin; campos de más, más de 10 claves o tipo desconocido: 400", async () => {
    expect((await rutaAcciones.POST(post({ accion: "marcar_todos", tipo: "mentor", dia: D }, "https://otro.test"))).status).toBe(403);
    expect((await rutaTexto.POST(post({ texto: "Hola" }, "https://otro.test"))).status).toBe(403);
    expect((await rutaAcciones.POST(post({ accion: "citar", tipo: "mentor", dia: D, claves: ["m1"], extra: 1 }))).status).toBe(400);
    expect((await rutaAcciones.POST(post({ accion: "citar", tipo: "mentor", dia: D, claves: Array.from({ length: 11 }, (_, i) => `k${i}`) }))).status).toBe(400);
    expect((await rutaAcciones.POST(post({ accion: "marcar_todos", tipo: "otro", dia: D }))).status).toBe(400);
    expect((await rutaGet.GET(get(`dia=${D}&secreto=1`))).status).toBe(400);
    expect((await rutaTexto.POST(post({ texto: "x".repeat(4001) }))).status).toBe(400);
  });
});

describe("sin Google conectado", () => {
  it("la pantalla dice no conectado y no expone secretos; citar responde 503 sin escribir nada", async () => {
    const r = await (await rutaGet.GET(get(`dia=${D}&tipo=participante`))).json();
    expect(r.estado).toEqual({ conectado: false, correoPrueba: null });
    expect(r.dias).toEqual([{ dia: D, proyectos: 1 }]);
    expect(r.filas.map((f: { clave: string; estado: string }) => [f.clave, f.estado])).toEqual([[proyecto, "sin_citar"]]);
    expect(r.pendientes).toEqual([proyecto]);
    const res = await rutaAcciones.POST(post({ accion: "citar", tipo: "participante", dia: D, claves: [proyecto] }));
    expect(res.status).toBe(503);
    expect(await (await db.collections()).citaciones.countDocuments()).toBe(0);
  });
  it("con secretos en el entorno, la respuesta nunca los incluye", async () => {
    Object.assign(process.env, { GOOGLE_CAL_CLIENT_ID: "id-secreto-123", GOOGLE_CAL_CLIENT_SECRET: "clave-secreta-456", GOOGLE_CAL_REFRESH_TOKEN: "token-secreto-789" });
    const txt = await (await rutaGet.GET(get(`dia=${D}&tipo=monitor`))).text();
    expect(JSON.parse(txt).estado).toEqual({ conectado: true, correoPrueba: null });
    for (const s of ["id-secreto-123", "clave-secreta-456", "token-secreto-789"]) expect(txt).not.toContain(s);
  });
  it("CITACIONES_CORREO_PRUEBA mal escrita: 409 en todo, también al marcar", async () => {
    process.env.CITACIONES_CORREO_PRUEBA = "no-es-correo";
    const r = await rutaAcciones.POST(post({ accion: "marcar_todos", tipo: "mentor", dia: D }));
    expect(r.status).toBe(409);
    expect(await (await db.collections()).citaciones.countDocuments()).toBe(0);
  });
});

describe("modo prueba (cliente simulado)", () => {
  it("vista previa y citar: el único invitado es el correo de prueba y el título lleva [PRUEBA]", async () => {
    const sim = simulado();
    estado.sim = { cliente: sim.cliente, correoPrueba: PRUEBA };
    const v = await (await rutaPrevia.GET(get(`dia=${D}&tipo=participante&clave=${proyecto}`))).json();
    expect(v.prueba).toBe(PRUEBA);
    expect(v.eventos[0].invitados.map((i: { correo: string }) => i.correo)).toEqual([PRUEBA]);
    const r = await (await rutaAcciones.POST(post({ accion: "citar", tipo: "participante", dia: D, claves: [proyecto, proyecto] }))).json();
    expect(r.resultados).toMatchObject([{ clave: proyecto, ok: true, accion: "citado" }]);
    expect(sim.llamadas).toHaveLength(1);
    expect(sim.llamadas[0]!.evento!.invitados.map((i) => i.correo)).toEqual([PRUEBA]);
    expect(sim.llamadas[0]!.evento!.titulo.startsWith("[PRUEBA] ")).toBe(true);
    const g = await (await rutaGet.GET(get(`dia=${D}&tipo=participante`))).json();
    expect(g.filas[0]).toMatchObject({ estado: "citado", prueba: PRUEBA });
    expect(g.pendientes).toEqual([]);
  });
  it("en modo prueba no se marca nada como citado", async () => {
    estado.sim = { cliente: simulado().cliente, correoPrueba: PRUEBA };
    const r = await (await rutaAcciones.POST(post({ accion: "marcar", tipo: "mentor", dia: D, claves: ["m1"] }))).json();
    expect(r.resultados).toMatchObject([{ ok: false, error: "real_en_prueba" }]);
  });
  it("cancelar lo enviado en prueba", async () => {
    const sim = simulado();
    estado.sim = { cliente: sim.cliente, correoPrueba: PRUEBA };
    const r = await (await rutaAcciones.POST(post({ accion: "cancelar", tipo: "participante", dia: D, claves: [proyecto] }))).json();
    expect(r.resultados).toMatchObject([{ ok: true, accion: "cancelado" }]);
    expect(sim.llamadas.map((l) => l.op)).toEqual(["cancelar"]);
  });
});

describe("modo real (cliente simulado)", () => {
  it("marcar todos como citados (sin evento) no llama a Google y deja changeLog", async () => {
    const sim = simulado();
    estado.sim = { cliente: sim.cliente, correoPrueba: null };
    const r = await (await rutaAcciones.POST(post({ accion: "marcar_todos", tipo: "mentor", dia: D }))).json();
    expect(r.resultados).toMatchObject([{ clave: "m1", ok: true, accion: "marcado" }]);
    expect(sim.llamadas).toHaveLength(0);
    const c = await db.collections();
    expect(await c.changeLog.countDocuments({ accion: "marcar_citado" })).toBe(1);
    const g = await (await rutaGet.GET(get(`dia=${D}&tipo=mentor`))).json();
    expect(g.filas[0]).toMatchObject({ estado: "externo" });
  });
  it("texto «Ten en cuenta»: se guarda con changeLog y GET lo devuelve", async () => {
    const r = await rutaTexto.POST(post({ texto: "Llega 10 minutos antes\nTen la cámara encendida" }));
    expect(r.status).toBe(200);
    expect((await (await rutaGet.GET(get(""))).json()).tenEnCuenta).toBe("Llega 10 minutos antes\nTen la cámara encendida");
    expect(await (await db.collections()).changeLog.countDocuments({ accion: "texto_citacion" })).toBe(1);
    expect((await rutaTexto.POST(post({ texto: "   " }))).status).toBe(400);
  });
});

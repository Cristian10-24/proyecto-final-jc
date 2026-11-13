import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Fase 6 · Entrega B · Paso 3 (prueba PREVIA a mover la ficha): fija las llamadas que hace hoy la ficha del monitor
// (MonitorHoja) y que debe seguir haciendo la página de detalle: GET /api/evaluacion/salas/[id], GET …/cupos y
// POST /api/evaluacion/salas/[id] con los cuerpos EXACTOS de asistencia, motivo, observación, reprogramar y sugerir.
// Se llama a las rutas reales con la sesión y el encabezado de origen del navegador. Base LOCAL, datos INVENTADOS.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const { diaCOL, inicioUTC } = await import("@/lib/edicion");
const ficha = await import("@/app/api/evaluacion/salas/[id]/route");
const cupos = await import("@/app/api/evaluacion/salas/[id]/cupos/route");

const D = diaCOL(new Date(Date.now() + 10 * 86400_000));
const ids: Record<string, ObjectId> = {};
const P = { pareja: new ObjectId(), otro: new ObjectId(), sug: new ObjectId() };
const S = { libre: new ObjectId() };
const ORIGEN = { host: "localhost:3000", origin: "http://localhost:3000" };

/** Exactamente lo que manda hoy MonitorHoja (líneas de `post`, `guardarNota`, `reprogramarCupo` y `sugerir`). */
const CUERPOS = {
  anotarNo: { accion: "anotar", i: 1, asistencia: "no", motivo: "Salud", observacion: "Avisó por WhatsApp." },
  // Al marcar «Sí» la ficha manda motivo null aunque hubiera uno elegido.
  anotarSi: { accion: "anotar", i: 0, asistencia: "si", motivo: null, observacion: "" },
  reprogramar: (asiento: string) => ({ accion: "reprogramar", asiento, motivo: "Cita médica" }),
  sugerir: { accion: "sugerir", detalle: "Pasarlo al lunes", motivo: "Viaja esa semana" },
};

const como = (k: string | null) => { estado.token = k ? createToken(ids[k]!.toHexString(), 0) : ""; };
const ctx = (id: ObjectId) => ({ params: Promise.resolve({ id: id.toHexString() }) });
async function get(k: string | null, id: ObjectId, deCupos = false) {
  como(k);
  const url = `http://localhost:3000/api/evaluacion/salas/${id.toHexString()}${deCupos ? "/cupos" : ""}`;
  const res = await (deCupos ? cupos.GET : ficha.GET)(new Request(url), ctx(id));
  return { status: res.status, body: await res.json() };
}
async function post(k: string | null, id: ObjectId, cuerpo: unknown, origen = ORIGEN) {
  como(k);
  const res = await ficha.POST(new Request(`http://localhost:3000/api/evaluacion/salas/${id.toHexString()}`, {
    method: "POST", headers: { "content-type": "application/json", ...origen }, body: JSON.stringify(cuerpo),
  }), ctx(id));
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["monA", "monB", "mentor", "coord"]) ids[k] = new ObjectId();
  const u = (k: string, usuario: string, rol: string, extra: Record<string, unknown> = {}) =>
    ({ _id: ids[k]!, usuario, nombre: `Nombre ${k}`, rol, ciudades: ["Cali"], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0, ...extra });
  await c.users.insertMany([u("monA", "mon.a", "monitor"), u("monB", "mon.b", "monitor"), u("mentor", "mentor.a", "mentor", { mentorId: "m1" }), u("coord", "coord.p", "coordinador")] as never);
  await c.mentores.insertMany([{ _id: "m1", nombre: "Mentor Uno" }, { _id: "m2", nombre: "Mentor Dos" }]);
  await c.dias.insertOne({ _id: D, ciudades: [{ ciudad: "Cali", cupos: 8, sobrante: false, abre: null }] } as never);
  const p = (_id: ObjectId, codigo: string, ints: string[]) => ({ _id, codigo, ciudad: "Cali", nombre: `App ${codigo}`, creadoEn: now, actualizadoEn: now,
    integrantes: ints.map((nombre, i) => ({ nombre, documento: `9${codigo}${i}`, correo: `${codigo}${i}@correo.test`, celular: "3005550000" })) });
  await c.proyectos.insertMany([p(P.pareja, "11", ["Ana Uno", "Beto Uno"]), p(P.otro, "22", ["Carla Dos"]), p(P.sug, "33", ["Dario Tres"])]);
  await c.asientos.insertMany([
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 0), mentorId: "m1", ciudades: ["Cali"], proyectoId: P.pareja },
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 0), mentorId: "m2", ciudades: ["Cali"], proyectoId: P.otro },
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 15), mentorId: "m1", ciudades: ["Cali"], proyectoId: P.sug },
    { _id: S.libre, dia: D, inicio: inicioUTC(D, 8, 30), mentorId: "m1", ciudades: ["Cali"], proyectoId: null },
  ]);
  await c.planSalas.insertMany([
    { _id: `${D}|8|1`, dia: D, hora: 8, sala: 1, mentorId: "m1", monitor: "mon.a", origen: null },
    { _id: `${D}|8|2`, dia: D, hora: 8, sala: 2, mentorId: "m2", monitor: "mon.b", origen: null },
  ]);
});
afterAll(() => db.closeDb());

describe("lecturas de la ficha", () => {
  it("GET ficha: el monitor de la sala la abre; otro monitor, mentor y coordinación 403; sin sesión 401", async () => {
    const r = await get("monA", P.pareja);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ proyecto: "App 11", sala: 1, evaluado: false });
    expect(r.body.integrantes.map((x: { nombre: string }) => x.nombre)).toEqual(["Ana Uno", "Beto Uno"]);
    for (const k of ["monB", "mentor", "coord"]) expect((await get(k, P.pareja)).status).toBe(403);
    expect((await get(null, P.pareja)).status).toBe(401);
  });
  it("GET cupos: los cupos libres de su ciudad", async () => {
    const r = await get("monA", P.pareja, true);
    expect(r.status).toBe(200);
    expect(r.body.cupos.map((x: { id: string }) => x.id)).toContain(S.libre.toHexString());
  });
});

describe("escrituras de la ficha (mismos cuerpos de hoy)", () => {
  it("asistencia «No» con motivo y observación; «Sí» manda motivo null", async () => {
    expect(await post("monA", P.pareja, CUERPOS.anotarNo)).toEqual({ status: 200, body: { ok: true } });
    expect(await post("monA", P.pareja, CUERPOS.anotarSi)).toEqual({ status: 200, body: { ok: true } });
    const r = await get("monA", P.pareja);
    expect(r.body.integrantes.map((x: { asistencia: string; motivo?: string; observacion: string }) => [x.asistencia, x.motivo ?? null, x.observacion]))
      .toEqual([["si", null, ""], ["no", "Salud", "Avisó por WhatsApp."]]);
  });
  it("sugerir un cambio especial queda pendiente", async () => {
    expect(await post("monA", P.sug, CUERPOS.sugerir)).toEqual({ status: 200, body: { ok: true } });
    expect((await get("monA", P.sug)).body.sugerencia).toMatchObject({ detalle: "Pasarlo al lunes", estado: "pendiente" });
  });
  it("reprogramar al cupo libre", async () => {
    const r = await post("monA", P.pareja, CUERPOS.reprogramar(S.libre.toHexString()));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, sigueEnTusSalas: true });
  });
  it("otro monitor no escribe (403); otro origen se rechaza (403)", async () => {
    expect((await post("monB", P.sug, CUERPOS.anotarSi)).status).toBe(403);
    expect((await post("monA", P.sug, CUERPOS.anotarSi, { host: "localhost:3000", origin: "https://otro.example" })).status).toBe(403);
  });
});

describe("la página de detalle usa las mismas llamadas", () => {
  it("URLs y cuerpos de src/lib/vistas/fichaLlamadas.ts = los de la ficha de antes", async () => {
    const f = await import("@/lib/vistas/fichaLlamadas");
    expect(f.urlFicha("abc")).toBe("/api/evaluacion/salas/abc");
    expect(f.urlCupos("abc")).toBe("/api/evaluacion/salas/abc/cupos");
    expect(f.cuerpoAnotar(1, { asistencia: "no", motivo: "Salud", observacion: "Avisó por WhatsApp." })).toEqual(CUERPOS.anotarNo);
    expect(f.cuerpoAnotar(0, { asistencia: "si", motivo: "Salud", observacion: "" })).toEqual(CUERPOS.anotarSi);
    expect(f.cuerpoReprogramar("x1", "Cita médica")).toEqual(CUERPOS.reprogramar("x1"));
    expect(f.cuerpoSugerir("Pasarlo al lunes", "Viaja esa semana")).toEqual(CUERPOS.sugerir);
    expect(f.faltaMotivo({ asistencia: "no", motivo: null, observacion: "" })).toBe(true);
    expect(f.faltaMotivo({ asistencia: null, motivo: null, observacion: "" })).toBe(false);
  });
});

describe("ajustes del usuario (entrega B)", () => {
  it("«No» SIN motivo se guarda, como siempre (solo se avisa en pantalla)", async () => {
    const f = await import("@/lib/vistas/fichaLlamadas");
    const nota = { asistencia: "no" as const, motivo: null, observacion: "" };
    expect(f.faltaMotivo(nota)).toBe(true); // muestra «Falta registrar el motivo…», no bloquea
    expect(await post("monA", P.sug, f.cuerpoAnotar(0, nota))).toEqual({ status: 200, body: { ok: true } });
    const r = await get("monA", P.sug);
    expect(r.body.integrantes[0]).toMatchObject({ asistencia: "no", observacion: "" });
    expect(r.body.integrantes[0].motivo ?? null).toBeNull();
  });
  it("«No tienes acceso» viene del servidor: otro monitor, mentor y coordinación reciben 403 al pedir la ficha, los cupos o escribir", async () => {
    for (const k of ["monB", "mentor", "coord"]) {
      const ficha = await get(k, P.sug), cup = await get(k, P.sug, true), esc = await post(k, P.sug, CUERPOS.anotarSi);
      expect([k, ficha.status, cup.status, esc.status]).toEqual([k, 403, 403, 403]);
      expect(JSON.stringify(ficha.body)).not.toContain("Dario Tres"); // sin datos del proyecto
    }
  });
});

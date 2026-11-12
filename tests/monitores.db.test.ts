import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Fase 6 · «Monitores» (asignaciones, solo lectura): coordinación y admin ven el plan de salas del día con sus
// proyectos; monitor y mentor 403; sin sesión 401. Sin datos personales de estudiantes. Base LOCAL, datos INVENTADOS.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const { inicioUTC } = await import("@/lib/edicion");
const { cambiosSinMargen, salasSinMonitor, unirBloques } = await import("@/lib/vistas/bloques");
const ruta = await import("@/app/api/evaluacion/monitores/route");

const D1 = "2026-11-19", D2 = "2026-11-20";
const ids: Record<string, ObjectId> = {};
// Datos de estudiantes que NUNCA pueden salir.
const PROHIBIDO = ["Estudiante Secreta", "Otro Estudiante", "10000000", "@x.test", "+573009999999", "3008888888"];

type Vista = { dias: string[]; dia: string | null; celdas: { hora: number; sala: number; mentorId: string; monitor: string | null; proyectos: { minuto: number; nombre: string }[] }[]; monitores: { id: string; nombre: string; celular: string | null }[]; mentores: { id: string; nombre: string; celular: string | null }[]; enlaces: { sala: number; enlace: string }[]; error?: string };
async function pedir(quien: string | null, q = ""): Promise<{ status: number; body: Vista; texto: string }> {
  estado.token = quien ? createToken(ids[quien]!.toHexString(), 0) : "";
  const res = await ruta.GET(new Request(`http://localhost/api/evaluacion/monitores${q ? `?${q}` : ""}`));
  const texto = await res.text();
  return { status: res.status, body: JSON.parse(texto), texto };
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["admin", "coord", "monA", "monB", "monCoord", "mentor"]) ids[k] = new ObjectId();
  const u = (k: string, usuario: string, rol: string, extra: Record<string, unknown> = {}) =>
    ({ _id: ids[k]!, usuario, nombre: `Nombre ${k}`, rol, ciudades: ["Cali"], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0, ...extra });
  await c.users.insertMany([
    u("admin", "admin.p", "admin"), u("coord", "coord.p", "coordinador"),
    u("monA", "mon.a", "monitor", { celular: "+573101112233", correo: "mon.a@monitores.test" }), u("monB", "mon.b", "monitor"),
    u("monCoord", "mon.coord", "monitor", { rolesExtra: ["coordinador"] }), u("mentor", "mentor.uno", "mentor", { mentorId: "m4" }),
  ] as never);
  await c.mentores.insertMany([{ _id: "m4", nombre: "Mentora Cuatro", celular: "+573154027781", correo: "m4@mentores.test" }, { _id: "m6", nombre: "Mentor Seis" }, { _id: "m8", nombre: "Mentor Ocho" }, { _id: "m1", nombre: "Mentor Uno" }]);
  const pl = (dia: string, hora: number, sala: number, mentorId: string, monitor: string | null) => ({ _id: `${dia}|${hora}|${sala}`, dia, hora, sala, mentorId, monitor, origen: null });
  await c.planSalas.insertMany([
    pl(D1, 8, 4, "m4", "mon.a"), pl(D1, 9, 4, "m4", "mon.a"), pl(D1, 10, 6, "m6", "mon.a"),
    pl(D1, 8, 8, "m8", null), pl(D1, 11, 1, "m1", null), // la de las 11 no tiene proyectos: no sale
    pl(D1, 12, 2, "m1", "mon.b"), pl(D2, 8, 1, "m1", "mon.b"),
  ]);
  await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 4, enlace: "https://meet.example.test/sala-4" }, { sala: 6, enlace: "javascript:alert(1)" }], importados: [], disponibilidad: [], actualizadoEn: now } as never);
  const proyecto = (nombre: string, i: number) => ({ _id: new ObjectId(), codigo: nombre, ciudad: "Cali", nombre, monitor: null, creadoEn: now, actualizadoEn: now,
    integrantes: [{ documento: `10000000${i}1`, nombre: "Estudiante Secreta", celular: "+573009999999", correo: `est${i}@x.test` }, { documento: `10000000${i}2`, nombre: "Otro Estudiante", celular: "3008888888" }] });
  const P = ["EcoRuta", "Huerta", "Bici", "Agenda", "Tutor", "Café"].map(proyecto);
  await c.proyectos.insertMany(P);
  const a = (dia: string, h: number, m: number, mentorId: string, proyectoId: ObjectId | null) => ({ _id: new ObjectId(), dia, inicio: inicioUTC(dia, h, m), mentorId, ciudades: ["Cali"], proyectoId });
  await c.asientos.insertMany([
    a(D1, 8, 0, "m4", P[0]!._id), a(D1, 9, 45, "m4", P[1]!._id), a(D1, 9, 15, "m4", null), a(D1, 10, 0, "m6", P[2]!._id),
    a(D1, 8, 30, "m8", P[3]!._id), a(D1, 11, 0, "m1", null), a(D1, 12, 15, "m1", P[4]!._id), a(D2, 8, 0, "m1", P[5]!._id),
  ]);
});
afterAll(() => db.closeDb());

describe("quién entra", () => {
  for (const quien of ["coord", "admin", "monCoord"])
    it(`${quien}: 200`, async () => expect((await pedir(quien, `dia=${D1}`)).status).toBe(200));
  it("monitor y mentor: 403; sin sesión: 401", async () => {
    for (const q of ["monA", "monB", "mentor"]) expect((await pedir(q, `dia=${D1}`)).status).toBe(403);
    expect((await pedir(null)).status).toBe(401);
  });
  for (const q of ["dia=hoy", "x=1", `dia=${D1}&monitor=mon.a`, "dia="])
    it(`filtro inválido (${q}): 400`, async () => {
      const r = await pedir("admin", q);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("datos_invalidos");
    });
});

describe("contenido", () => {
  it("solo horas con proyectos, con monitor, mentor y minutos; celulares del monitor y del mentor o null", async () => {
    const { body } = await pedir("coord", `dia=${D1}`);
    expect(body.dias).toEqual([D1, D2]);
    expect(body.dia).toBe(D1);
    expect(body.celdas.map((x) => [x.hora, x.sala, x.monitor, x.proyectos.map((p) => `${p.minuto} ${p.nombre}`)])).toEqual([
      [8, 4, "mon.a", ["0 EcoRuta"]], [8, 8, null, ["30 Agenda"]], [9, 4, "mon.a", ["45 Huerta"]], [10, 6, "mon.a", ["0 Bici"]], [12, 2, "mon.b", ["15 Tutor"]],
    ]);
    expect(body.monitores).toEqual([{ id: "mon.a", nombre: "Nombre monA", celular: "+573101112233" }, { id: "mon.b", nombre: "Nombre monB", celular: null }]);
    expect(body.mentores.find((m) => m.id === "m4")).toEqual({ id: "m4", nombre: "Mentora Cuatro", celular: "+573154027781" });
    expect(body.mentores.find((m) => m.id === "m6")!.celular).toBeNull();
    expect(body.enlaces).toEqual([{ sala: 4, enlace: "https://meet.example.test/sala-4" }]); // solo https
  });
  it("alertas: Sala 8 sin monitor y mon.a cambia de la Sala 4 (9:45) a la 6 a las 10 sin margen", async () => {
    const b = unirBloques((await pedir("admin", `dia=${D1}`)).body.celdas);
    expect(salasSinMonitor(b).map((x) => [x.sala, x.desde])).toEqual([[8, 8]]);
    expect(cambiosSinMargen(b).map((x) => [x.monitor, x.de.sala, x.a.sala, x.a.desde])).toEqual([["mon.a", 4, 6, 10]]);
  });
  it("un día sin plan: vacío", async () => {
    const r = await pedir("admin", "dia=2026-12-01");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dia: "2026-12-01", celdas: [], monitores: [], mentores: [] });
  });
});

describe("privacidad", () => {
  it("sin datos de estudiantes ni correos; solo los campos permitidos", async () => {
    for (const q of [`dia=${D1}`, `dia=${D2}`, ""]) {
      const r = await pedir("admin", q);
      for (const x of [...PROHIBIDO, "mon.a@monitores.test", "m4@mentores.test"]) expect(r.texto).not.toContain(x);
      expect(Object.keys(r.body).sort()).toEqual(["celdas", "dia", "dias", "enlaces", "mentores", "monitores"]);
      for (const c of r.body.celdas) {
        expect(Object.keys(c).sort()).toEqual(["hora", "mentorId", "monitor", "proyectos", "sala"]);
        for (const p of c.proyectos) expect(Object.keys(p).sort()).toEqual(["minuto", "nombre"]);
      }
      for (const p of [...r.body.monitores, ...r.body.mentores]) expect(Object.keys(p).sort()).toEqual(["celular", "id", "nombre"]);
      expect(r.texto).not.toMatch(/"(documento|correo|integrantes|ciudad|codigo|_id)"/);
    }
  });
});

describe("como producción", () => {
  it("consultar no cambia ningún dato", async () => {
    const base = await db.getDb();
    const foto = async () => {
      const nombres = (await base.listCollections({}, { nameOnly: true }).toArray()).map((x) => x.name).sort();
      return JSON.stringify(await Promise.all(nombres.map(async (n) => [n, await base.collection(n).find({}).sort({ _id: 1 }).toArray()])));
    };
    const antes = await foto();
    for (const quien of ["admin", "coord", "monA", "monCoord", "mentor", null])
      for (const q of ["", `dia=${D1}`, `dia=${D2}`, "x=1"]) await pedir(quien, q);
    expect(await foto()).toBe(antes);
  });
});

import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// «Mis proyectos» (solo lectura): el monitor ve solo los proyectos de sus salas (de cualquier ciudad); coordinación y
// admin, todos con filtro por monitor; mentor 403. Sin documento ni correo. Base LOCAL, datos INVENTADOS.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const { inicioUTC } = await import("@/lib/edicion");
const { misProyectos, diaPorDefecto } = await import("@/lib/misProyectos");
const ruta = await import("@/app/api/monitor/mis-proyectos/route");

const D1 = "2026-11-12", D2 = "2026-11-17";
const ENLACE1 = "https://meet.example.test/sala-1", ENLACE2 = "https://meet.example.test/sala-2";
const ids: Record<string, ObjectId> = {};
const como = (quien: string) => { estado.token = createToken(ids[quien]!.toHexString(), 0); };
type Vista = Awaited<ReturnType<typeof misProyectos>>;
async function pedir(quien: string, q = ""): Promise<{ status: number; body: Vista & { error?: string } }> {
  como(quien);
  const res = await ruta.GET(new Request(`http://localhost/api/monitor/mis-proyectos${q ? `?${q}` : ""}`));
  return { status: res.status, body: await res.json() };
}
const codigos = (v: Vista) => v.proyectos.map((p) => p.codigo);

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["admin", "coord", "monA", "monB", "monCoord", "mentor"]) ids[k] = new ObjectId();
  const u = (k: string, usuario: string, rol: string, extra: Record<string, unknown> = {}) =>
    ({ _id: ids[k]!, usuario, nombre: `Nombre ${k}`, rol, ciudades: ["Medellín"], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0, ...extra });
  await c.users.insertMany([
    u("admin", "admin.p", "admin"), u("coord", "coord.p", "coordinador"),
    // Su ciudad de seguimiento (Medellín) no cuenta: ve sus salas de cualquier ciudad.
    u("monA", "mon.a", "monitor", { correo: "mon.a@x.test" }), u("monB", "mon.b", "monitor"),
    u("monCoord", "mon.coord", "monitor", { rolesExtra: ["coordinador"] }),
    u("mentor", "mentor.dos", "mentor", { mentorId: "m2", celular: "+573110000002", correo: "mentor.dos@x.test" }),
  ] as never);
  await c.mentores.insertMany([
    { _id: "m1", nombre: "Mentor Uno", celular: "+573110000001", correo: "m1@x.test" },
    { _id: "m2", nombre: "Mentor Dos" }, // celular: el de su usuario
    { _id: "m3", nombre: "Mentor Tres" }, // sin celular
  ]);
  await c.planSalas.insertMany([
    { _id: `${D1}|8|1`, dia: D1, hora: 8, sala: 1, mentorId: "m1", monitor: "mon.a", origen: null },
    { _id: `${D1}|8|2`, dia: D1, hora: 8, sala: 2, mentorId: "m2", monitor: "mon.b", origen: null },
    { _id: `${D1}|9|1`, dia: D1, hora: 9, sala: 1, mentorId: "m1", monitor: null, origen: null },
    { _id: `${D2}|8|1`, dia: D2, hora: 8, sala: 1, mentorId: "m3", monitor: "mon.a", origen: null },
  ]);
  await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 1, enlace: ENLACE1 }, { sala: 2, enlace: ENLACE2 }], importados: [], disponibilidad: [], actualizadoEn: now });
  const P = { A: new ObjectId(), B: new ObjectId(), C: new ObjectId(), E: new ObjectId(), S: new ObjectId() };
  const p = (_id: ObjectId, codigo: string, ciudad: string, nombre: string, integrantes: { documento: string; nombre: string; celular?: string; correo?: string }[]) =>
    ({ _id, codigo, ciudad, nombre, monitor: null, creadoEn: now, actualizadoEn: now, integrantes });
  await c.proyectos.insertMany([
    p(P.A, "A", "Cali", "Huerta Solar", [
      { documento: "1111222233", nombre: "Ana Uno", celular: "+573000000001", correo: "ana@x.test" },
      { documento: "4444555566", nombre: "Beto Dos", correo: "beto@x.test" }, // sin celular
    ]),
    p(P.B, "B", "Paysandú", "Café Rápido", [{ documento: "7777888899", nombre: "Lucía Tres", celular: "+59899000000" }]),
    p(P.C, "C", "Bogotá", "Robot Lector", [{ documento: "1212121212", nombre: "Caro Cuatro", celular: "3001234567" }]),
    p(P.E, "E", "Cali", "Eco Bolsa", [{ documento: "3434343434", nombre: "Eva Cinco" }]),
    p(P.S, "S", "Cali", "Sin Hora", [{ documento: "5656565656", nombre: "Sin Hora" }]), // sin asiento: no aparece
  ]);
  await c.asientos.insertMany([
    { _id: new ObjectId(), dia: D1, inicio: inicioUTC(D1, 8, 0), mentorId: "m1", ciudades: ["Cali"], proyectoId: P.A },
    { _id: new ObjectId(), dia: D1, inicio: inicioUTC(D1, 8, 15), mentorId: "m2", ciudades: ["Paysandú"], proyectoId: P.B },
    { _id: new ObjectId(), dia: D1, inicio: inicioUTC(D1, 9, 0), mentorId: "m1", ciudades: ["Cali"], proyectoId: P.E },
    { _id: new ObjectId(), dia: D1, inicio: inicioUTC(D1, 9, 15), mentorId: "m1", ciudades: ["Cali"], proyectoId: null },
    { _id: new ObjectId(), dia: D2, inicio: inicioUTC(D2, 8, 0), mentorId: "m3", ciudades: ["Bogotá"], proyectoId: P.C },
  ]);
});
afterAll(() => db.closeDb());

describe("quién ve qué", () => {
  it("el monitor ve solo los proyectos de sus salas (de cualquier ciudad), ordenados por día y hora", async () => {
    const r = await pedir("monA", "dia=todos");
    expect(r.status).toBe(200);
    expect(r.body.todos).toBe(false);
    expect(codigos(r.body)).toEqual(["A", "C"]);
    expect(r.body.monitores).toEqual([]);
  });

  it("otro monitor no ve los de mon.a, y mon.a no ve los suyos", async () => {
    const b = await pedir("monB", "dia=todos");
    expect(codigos(b.body)).toEqual(["B"]);
    expect(codigos((await pedir("monA", "dia=todos")).body)).not.toContain("B");
  });

  it("monitor sin salas: lista vacía", async () => {
    const c = await db.collections();
    await c.planSalas.updateMany({ monitor: "mon.b" }, { $set: { monitor: "mon.x" } });
    try {
      const r = await pedir("monB");
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ dia: null, dias: [], proyectos: [] });
    } finally {
      await c.planSalas.updateMany({ monitor: "mon.x" }, { $set: { monitor: "mon.b" } });
    }
  });

  for (const quien of ["coord", "admin", "monCoord"])
    it(`${quien} ve todos, con la lista de monitores`, async () => {
      const r = await pedir(quien, "dia=todos");
      expect(r.status).toBe(200);
      expect(r.body.todos).toBe(true);
      expect(codigos(r.body)).toEqual(["A", "B", "E", "C"]);
      expect(r.body.monitores.map((m) => m.usuario)).toEqual(["mon.a", "mon.b"]);
    });

  it("mentor recibe 403 y sin sesión 401", async () => {
    expect((await pedir("mentor")).status).toBe(403);
    estado.token = "";
    expect((await ruta.GET(new Request("http://localhost/api/monitor/mis-proyectos"))).status).toBe(401);
  });
});

describe("datos de cada proyecto", () => {
  it("día, hora (UY para Paysandú), sala con enlace, integrantes y mentor con celular o «sin registrar»", async () => {
    const { body } = await pedir("admin", "dia=todos");
    const de = (cod: string) => body.proyectos.find((x) => x.codigo === cod)!;
    expect(de("A")).toMatchObject({
      dia: D1, horaCOL: "8:00 a. m.", horaUY: null, sala: 1, enlace: ENLACE1, ciudad: "Cali", proyecto: "Huerta Solar",
      integrantes: [{ nombre: "Ana Uno", celular: "+573000000001" }, { nombre: "Beto Dos", celular: null }],
      mentor: { nombre: "Mentor Uno", celular: "+573110000001" }, monitor: { usuario: "mon.a", nombre: "Nombre monA" },
    });
    // 8:15 toma la sala de las 8 de su mentor; mentor sin celular en Horarios → el de su usuario.
    expect(de("B")).toMatchObject({ horaCOL: "8:15 a. m.", horaUY: "10:15 a. m.", sala: 2, enlace: ENLACE2, mentor: { nombre: "Mentor Dos", celular: "+573110000002" } });
    expect(de("E")).toMatchObject({ sala: 1, monitor: null });
    expect(de("C")).toMatchObject({ dia: D2, mentor: { nombre: "Mentor Tres", celular: null } });
  });

  it("la respuesta no trae documento ni correo de nadie", async () => {
    for (const quien of ["admin", "coord", "monA", "monB"]) {
      const txt = JSON.stringify((await pedir(quien, "dia=todos")).body);
      expect(txt).not.toMatch(/1111222233|4444555566|7777888899|1212121212|3434343434|@x\.test|documento|correo/i);
    }
  });
});

describe("filtros", () => {
  it("día por defecto: hoy si hay presentaciones; si no, el primer día con proyectos", async () => {
    expect(diaPorDefecto([D1, D2], D2)).toBe(D2);
    expect(diaPorDefecto([D1, D2], "2026-11-11")).toBe(D1);
    expect(diaPorDefecto([], D1)).toBeNull();
    const admin = { _id: ids.admin!, usuario: "admin.p", nombre: "a", rol: "admin" as const, ciudades: [], activo: true } as never;
    expect(codigos(await misProyectos(admin, {}, D2))).toEqual(["C"]);
    const r = await pedir("admin"); // sin día: el de la regla con la fecha real
    expect(r.body.dia).toBe(diaPorDefecto([D1, D2]));
    expect(r.body.dias).toEqual([D1, D2]);
  });

  it("día, ciudad, sala, monitor y búsqueda (sin tildes) por proyecto o integrante", async () => {
    expect(codigos((await pedir("admin", `dia=${D2}`)).body)).toEqual(["C"]);
    expect(codigos((await pedir("admin", "dia=todos&ciudad=Paysandú")).body)).toEqual(["B"]);
    expect(codigos((await pedir("admin", "dia=todos&sala=2")).body)).toEqual(["B"]);
    expect(codigos((await pedir("admin", "dia=todos&monitor=mon.a")).body)).toEqual(["A", "C"]);
    expect(codigos((await pedir("admin", "dia=todos&monitor=sin")).body)).toEqual(["E"]);
    expect(codigos((await pedir("admin", "dia=todos&q=cafe")).body)).toEqual(["B"]);
    expect(codigos((await pedir("admin", "dia=todos&q=BETO")).body)).toEqual(["A"]);
    expect(codigos((await pedir("admin", `dia=${D1}&ciudad=Cali&sala=1`)).body)).toEqual(["A", "E"]);
    const r = await pedir("admin", "dia=todos&ciudad=Cali");
    expect(r.body.ciudades).toEqual(["Bogotá", "Cali", "Paysandú"]); // las opciones no dependen del filtro
    expect(r.body.salas).toEqual([1, 2]);
  });

  it("el monitor no puede ampliar su alcance con el filtro de monitor", async () => {
    expect(codigos((await pedir("monA", "dia=todos&monitor=mon.b")).body)).toEqual(["A", "C"]);
  });

  for (const q of ["sala=abc", "dia=12-11-2026", "otro=1", `q=${"x".repeat(81)}`, "sala=0"])
    it(`filtro inválido (${q.slice(0, 20)}): 400`, async () => {
      const r = await pedir("admin", q);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("datos_invalidos");
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
    for (const quien of ["admin", "coord", "monA", "monB", "monCoord", "mentor"])
      for (const q of ["", "dia=todos", `dia=${D1}&q=ana`]) await pedir(quien, q);
    expect(await foto()).toBe(antes);
  });
});

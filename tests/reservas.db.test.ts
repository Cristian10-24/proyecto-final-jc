import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Reserva atómica contra la base LOCAL, con el mismo pool bajo que en Vercel (5).

usarBaseLocal(5);
const db = await import("@/lib/db");
const { reservar } = await import("@/lib/reservas");
const { POST } = await import("@/app/api/estudiante/reservar/route");
const { inicioUTC } = await import("@/lib/edicion");

const AHORA = new Date("2026-11-05T12:00:00Z");
const B1 = inicioUTC("2026-11-12", 8, 0);
const B2 = inicioUTC("2026-11-12", 8, 15);
const B3 = inicioUTC("2026-11-13", 16, 0);
const docCali = (i: number) => String(3_000_000_000 + i);

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.dias.insertMany([
    { _id: "2026-11-12", ciudades: [{ ciudad: "Cali", cupos: 80, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 40, sobrante: false, abre: null }] },
    { _id: "2026-11-13", ciudades: [{ ciudad: "Barranquilla", cupos: null, sobrante: true, abre: new Date("2026-11-13T19:00:00Z") }] },
  ]);
  const asiento = (inicio: Date, mentorId: string, ciudades: string[]) => ({ _id: new ObjectId(), dia: inicio.toISOString() < "2026-11-13T05" ? "2026-11-12" : "2026-11-13", inicio, mentorId, ciudades, proyectoId: null });
  await c.asientos.insertMany([
    // B1: 200 asientos de Cali para 300 proyectos de Cali.
    ...Array.from({ length: 200 }, (_, i) => asiento(B1, `m${i}`, ["Cali"])),
    ...Array.from({ length: 5 }, (_, i) => asiento(B2, `m${i}`, ["Cartagena"])),
    ...Array.from({ length: 5 }, (_, i) => asiento(B2, `c${i}`, ["Cali"])),
    ...Array.from({ length: 3 }, (_, i) => asiento(B3, `m${i}`, ["Barranquilla"])),
  ]);
  const now = new Date();
  await c.proyectos.insertMany([
    ...Array.from({ length: 300 }, (_, i) => ({ _id: new ObjectId(), codigo: `C-${i}`, ciudad: "Cali", nombre: `Proyecto ${i}`, integrantes: [{ documento: docCali(i), nombre: "Estudiante Prueba" }], creadoEn: now, actualizadoEn: now })),
    { _id: new ObjectId(), codigo: "PAR", ciudad: "Cartagena", nombre: "Pareja", integrantes: [{ documento: "4000000001", nombre: "Ana Prueba" }, { documento: "4000000002", nombre: "Luis Prueba" }], creadoEn: now, actualizadoEn: now },
    { _id: new ObjectId(), codigo: "BAQ", ciudad: "Barranquilla", nombre: "Barranquilla", integrantes: [{ documento: "5000000001", nombre: "Eva Prueba" }], creadoEn: now, actualizadoEn: now },
  ]);
});
afterAll(() => db.closeDb());

describe("concurrencia", () => {
  it("300 reservas simultáneas por 200 asientos: 200 ganan, 100 'sin_cupo', ninguna doble", async () => {
    const t0 = Date.now();
    const r = await Promise.all(Array.from({ length: 300 }, (_, i) => reservar(docCali(i), B1, AHORA)));
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(r.filter((x) => x.ok)).toHaveLength(200);
    expect(r.filter((x) => !x.ok && x.error === "sin_cupo")).toHaveLength(100);

    const { asientos } = await db.collections();
    const ocupados = await asientos.find({ inicio: B1, proyectoId: { $ne: null } }).toArray();
    expect(ocupados).toHaveLength(200);
    expect(new Set(ocupados.map((a) => String(a.proyectoId))).size).toBe(200);
  });

  it("los dos integrantes de una pareja reservan 20 veces a la vez: un solo asiento", async () => {
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => reservar(i % 2 ? "4000000001" : "4000000002", B2, AHORA)));
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.filter((x) => !x.ok && x.error === "ya_tiene_hora")).toHaveLength(19);
    const { asientos, proyectos } = await db.collections();
    const par = await proyectos.findOne({ codigo: "PAR" });
    expect(await asientos.countDocuments({ proyectoId: par!._id })).toBe(1);
  });

  it("ningún proyecto tiene dos asientos", async () => {
    const { asientos } = await db.collections();
    const dobles = await asientos.aggregate([{ $match: { proyectoId: { $ne: null } } }, { $group: { _id: "$proyectoId", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
    expect(dobles).toEqual([]);
  });
});

describe("reglas de la reserva", () => {
  it("toma solo asientos de su ciudad", async () => {
    // Quedan 5 asientos de Cali en B2: un proyecto de Cali sin hora los toma, nunca los de Cartagena.
    const r = await reservar(docCali(250), B2, AHORA);
    expect(r).toMatchObject({ ok: true });
    const { asientos } = await db.collections();
    const a = await asientos.findOne({ inicio: B2, proyectoId: { $ne: null }, ciudades: "Cali" });
    expect(a).not.toBeNull();
  });

  it("errores: sin proyecto, ya tiene hora, día de otra ciudad, aún no abre, bloque pasado", async () => {
    expect(await reservar("9999999999", B1, AHORA)).toMatchObject({ ok: false, error: "sin_proyecto" });
    expect(await reservar(docCali(0), B2, AHORA)).toMatchObject({ ok: false, error: "ya_tiene_hora", inicio: B1 });
    expect(await reservar(docCali(260), B3, AHORA)).toMatchObject({ ok: false, error: "dia_no_disponible" });
    expect(await reservar("5000000001", B3, AHORA)).toMatchObject({ ok: false, error: "aun_no_abre" });
    expect(await reservar("5000000001", B3, new Date("2026-11-13T19:00:00Z"))).toMatchObject({ ok: true });
    expect(await reservar(docCali(270), B1, new Date("2026-11-12T13:00:00Z"))).toMatchObject({ ok: false, error: "bloque_pasado" });
  });

  it("cada reserva queda en changeLog", async () => {
    const { changeLog } = await db.collections();
    expect(await changeLog.countDocuments({ accion: "reservar" })).toBe(200 + 1 + 1 + 1);
  });
});

describe("ruta POST /api/estudiante/reservar", () => {
  const llamar = (body: unknown, ip = "10.0.0.1") => POST(new Request("http://localhost/api/estudiante/reservar", {
    method: "POST", headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost", "x-real-ip": ip }, body: JSON.stringify(body),
  }));

  it("valida el cuerpo con Zod estricto", async () => {
    expect((await llamar({ documento: "123", inicio: B1.toISOString() })).status).toBe(400);
    expect((await llamar({ documento: "1000000001", inicio: "mañana" })).status).toBe(400);
    expect((await llamar({ documento: "1000000001", inicio: B1.toISOString(), extra: 1 })).status).toBe(400);
  });

  it("rechaza otro origen", async () => {
    const r = await POST(new Request("http://localhost/api/estudiante/reservar", { method: "POST", headers: { host: "localhost", origin: "https://otro.example" }, body: "{}" }));
    expect(r.status).toBe(403);
  });

  it("documento inexistente: 404 y cuenta como fallo de la IP", async () => {
    const r = await llamar({ documento: "8000000001", inicio: B1.toISOString() }, "10.0.0.2");
    expect(r.status).toBe(404);
    expect((await r.json()).mensaje).toMatch(/No encontramos/);
  });

  it("límite por documento: después de 15 intentos responde 429", async () => {
    const doc = docCali(280);
    const codigos: number[] = [];
    for (let i = 0; i < 16; i++) codigos.push((await llamar({ documento: doc, inicio: inicioUTC("2025-01-01", 8).toISOString() }, `10.1.0.${i}`)).status);
    expect(codigos.slice(0, 15).every((c) => c === 409)).toBe(true); // bloque pasado
    expect(codigos[15]).toBe(429);
  });
});

describe("límite por documento con peticiones simultáneas", () => {
  it("30 intentos a la vez con el mismo documento: pasan 15, el resto 429", async () => {
    const r = await Promise.all(Array.from({ length: 30 }, (_, i) => POST(new Request("http://localhost/api/estudiante/reservar", {
      method: "POST", headers: { "content-type": "application/json", host: "localhost", "x-real-ip": `10.2.0.${i}` },
      body: JSON.stringify({ documento: docCali(290), inicio: inicioUTC("2025-01-01", 8).toISOString() }),
    }))));
    expect(r.filter((x) => x.status === 429)).toHaveLength(15);
  });
});

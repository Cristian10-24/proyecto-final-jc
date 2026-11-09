import { ObjectId } from "mongodb";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Portal del estudiante contra la base LOCAL: devuelve solo lo permitido, enmascarado.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { agenda, consultar, enmascararCorreo, enmascararNumero } = await import("@/lib/estudiante");
const { reservar } = await import("@/lib/reservas");
const consultarRuta = (await import("@/app/api/estudiante/consultar/route")).POST;
const agendaRuta = (await import("@/app/api/estudiante/agenda/route")).POST;
const { inicioUTC } = await import("@/lib/edicion");

const AHORA = new Date("2026-11-05T12:00:00Z");
const ABRE_BAQ = new Date("2026-11-13T19:00:00Z");
let individual: ObjectId;

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.dias.insertMany([
    { _id: "2026-11-12", ciudades: [{ ciudad: "Cali", cupos: 80, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 40, sobrante: false, abre: null }] },
    { _id: "2026-11-13", ciudades: [{ ciudad: "Cartagena", cupos: 4, sobrante: false, abre: null }, { ciudad: "Barranquilla", cupos: null, sobrante: true, abre: ABRE_BAQ }] },
    { _id: "2026-11-17", ciudades: [{ ciudad: "Todas", cupos: null, sobrante: true, abre: null }] },
  ]);
  const a = (dia: string, h: number, m: number, mentorId: string, ciudades: string[]) => ({ _id: new ObjectId(), dia, inicio: inicioUTC(dia, h, m), mentorId, ciudades, proyectoId: null });
  await c.asientos.insertMany([
    a("2026-11-12", 8, 0, "m1", ["Cali"]), a("2026-11-12", 8, 0, "m2", ["Cali"]), a("2026-11-12", 8, 15, "m1", ["Cali"]),
    a("2026-11-12", 16, 0, "m1", ["Cartagena"]),
    a("2026-11-13", 16, 0, "m1", ["Barranquilla"]),
    a("2026-11-17", 8, 0, "m1", ["Cartagena", "Barranquilla", "Medellín"]),
  ]);
  const now = new Date();
  individual = new ObjectId();
  await c.proyectos.insertMany([
    { _id: individual, codigo: "P-7000000001", ciudad: "Cali", nombre: "App de reciclaje", descripcion: "Mapa de reciclaje.", grupo: "G1", monitor: "mon.cali",
      integrantes: [{ documento: "7000000001", nombre: "Valentina Prueba", celular: "+573001234567", correo: "valentina@ejemplo.org" }], creadoEn: now, actualizadoEn: now },
    { _id: new ObjectId(), codigo: "P-7000000002", ciudad: "Cartagena", nombre: "Guía por voz",
      integrantes: [{ documento: "7000000002", nombre: "Andrés Prueba", celular: "+573009998877" }, { documento: "7000000003", nombre: "Mariana Prueba", correo: "ma@ejemplo.org" }], creadoEn: now, actualizadoEn: now },
  ]);
});
afterAll(() => db.closeDb());
afterEach(() => { delete process.env.STUDENT_PORTAL_OPENS_AT; delete process.env.STUDENT_PORTAL_ENABLED; });

describe("máscaras", () => {
  it("documento y celular: últimos 4; correo: 2 letras y el dominio", () => {
    expect(enmascararNumero("1144087321")).toBe("•••• 7321");
    expect(enmascararNumero("+573001234567")).toBe("•••• 4567");
    expect(enmascararCorreo("valentina@gmail.com")).toBe("va•••@gmail.com");
    expect(enmascararCorreo("ma@ejemplo.org")).toBe("m•••@ejemplo.org");
  });
});

describe("consultar", () => {
  it("devuelve solo lo permitido, con documento, celular y correo enmascarados", async () => {
    const v = await consultar("7000000001");
    expect(v).toEqual({
      proyecto: { nombre: "App de reciclaje", descripcion: "Mapa de reciclaje.", ciudad: "Cali" },
      integrantes: [{ nombre: "Valentina Prueba", documento: "•••• 0001", celular: "•••• 4567", correo: "va•••@ejemplo.org", tu: true }],
      hora: null,
      edicion: { version: expect.any(String), puede: true }, // Paso 23
    });
    const json = JSON.stringify(v);
    for (const secreto of ["7000000001", "3001234567", "valentina@", "G1", "mon.cali", "P-7000000001", String(individual)]) expect(json).not.toContain(secreto);
  });

  it("entra con el documento de cualquiera de la pareja; quien consulta va primero", async () => {
    const v = await consultar("7000000003");
    expect(v!.integrantes.map((i) => [i.nombre, i.tu])).toEqual([["Mariana Prueba", true], ["Andrés Prueba", false]]);
    expect(JSON.stringify(v)).not.toContain("7000000002");
  });

  it("si la pareja ya reservó: hora con elegidaPor 'pareja'; para quien reservó, 'tu'", async () => {
    const r = await reservar("7000000002", inicioUTC("2026-11-12", 16, 0), AHORA);
    expect(r.ok).toBe(true);
    expect((await consultar("7000000003"))!.hora).toEqual({ inicio: "2026-11-12T21:00:00.000Z", elegidaPor: "pareja" });
    expect((await consultar("7000000002"))!.hora!.elegidaPor).toBe("tu");
  });

  it("documento inexistente → null", async () => {
    expect(await consultar("7999999999")).toBeNull();
  });
});

describe("agenda", () => {
  it("días de su ciudad: disponible, aún no abre o sin horas; nunca conteos", async () => {
    expect(await agenda("7000000001", undefined, AHORA)).toEqual({ dias: [{ dia: "2026-11-12", estado: "disponible" }] });
    const c = await db.collections();
    const now = new Date();
    await c.proyectos.insertOne({ _id: new ObjectId(), codigo: "P-7000000009", ciudad: "Barranquilla", nombre: "B", integrantes: [{ documento: "7000000009", nombre: "Eva Prueba" }], creadoEn: now, actualizadoEn: now });
    // Barranquilla tiene días propios (el 13): la fila Todas del 17 no le aplica.
    // Paso 17: si todos sus días abren después, la ciudad entera "aún no abre" (el portal muestra la fecha).
    expect(await agenda("7000000009", undefined, AHORA)).toEqual({ error: "aun_no_abre", abre: ABRE_BAQ.toISOString() });
    await c.proyectos.insertOne({ _id: new ObjectId(), codigo: "P-7000000010", ciudad: "Medellín", nombre: "M", integrantes: [{ documento: "7000000010", nombre: "Juan Prueba" }], creadoEn: now, actualizadoEn: now });
    expect(await agenda("7000000010", undefined, AHORA)).toEqual({ dias: [{ dia: "2026-11-17", estado: "disponible" }] });
  });

  it("bloques libres de un día, sin repetir y en orden; día de otra ciudad no", async () => {
    expect(await agenda("7000000001", "2026-11-12", AHORA)).toEqual({ dia: "2026-11-12", bloques: ["2026-11-12T13:00:00.000Z", "2026-11-12T13:15:00.000Z"] });
    expect(await agenda("7000000001", "2026-11-13", AHORA)).toEqual({ error: "dia_no_disponible" });
  });

  it("si ya tiene hora, no ofrece días", async () => {
    expect(await agenda("7000000003", undefined, AHORA)).toMatchObject({ error: "ya_tiene_hora", hora: { elegidaPor: "pareja" } });
  });

  it("un día sin bloques libres queda 'sin_horas'", async () => {
    const c = await db.collections();
    const cali = await c.asientos.find({ dia: "2026-11-12", ciudades: "Cali" }).toArray();
    for (const x of cali) await c.asientos.updateOne({ _id: x._id }, { $set: { proyectoId: new ObjectId() } }); // índice único: uno distinto por asiento
    expect(await agenda("7000000001", undefined, AHORA)).toEqual({ dias: [{ dia: "2026-11-12", estado: "sin_horas" }] });
    await c.asientos.updateMany({ dia: "2026-11-12", ciudades: "Cali" }, { $set: { proyectoId: null } });
  });
});

describe("rutas", () => {
  const llamar = (ruta: typeof consultarRuta, body: unknown, ip = "10.3.0.1") => ruta(new Request("http://localhost/api/estudiante/x", {
    method: "POST", headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost", "x-real-ip": ip }, body: JSON.stringify(body),
  }));

  it("consultar: 200 con datos enmascarados; 404; 400 con campos de más", async () => {
    const ok = await llamar(consultarRuta, { documento: "7.000.000.001" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).integrantes[0].documento).toBe("•••• 0001");
    expect((await llamar(consultarRuta, { documento: "7999999999" })).status).toBe(404);
    expect((await llamar(consultarRuta, { documento: "7000000001", otro: 1 })).status).toBe(400);
  });

  it("agenda: valida el día", async () => {
    expect((await llamar(agendaRuta, { documento: "7000000001", dia: "12/11" })).status).toBe(400);
    expect((await llamar(agendaRuta, { documento: "7000000001", dia: "2026-11-13" })).status).toBe(403);
  });

  it("portal aún no abierto o cerrado → 403 con el motivo", async () => {
    process.env.STUDENT_PORTAL_OPENS_AT = "2099-01-01T13:00:00Z";
    const r = await llamar(consultarRuta, { documento: "7000000001" });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: "aun_no_abre", abre: "2099-01-01T13:00:00.000Z" });
    delete process.env.STUDENT_PORTAL_OPENS_AT;
    process.env.STUDENT_PORTAL_ENABLED = "false";
    expect(await (await llamar(agendaRuta, { documento: "7000000001" })).json()).toMatchObject({ error: "cerrado" });
  });
});

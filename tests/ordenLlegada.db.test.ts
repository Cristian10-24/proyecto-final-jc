import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Fase 4 · Modo orden de llegada contra la base LOCAL, con el pool de Vercel (5): tope por ciudad y día sin pasarse
// en simultáneo, etiquetas ignoradas (y sin tocar), apagado = como antes.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { reservar } = await import("@/lib/reservas");
const { agenda } = await import("@/lib/estudiante");
const { cambiarModo, estadoModo, ocupacionCiudad } = await import("@/lib/modoCupos");
const { liberarProyecto } = await import("@/lib/mover");
const { inicioUTC } = await import("@/lib/edicion");

const AHORA = new Date("2026-11-05T12:00:00Z");
const ADMIN = { rol: "admin" as const, usuario: "admin.prueba" };
const J = "2026-11-12", V = "2026-11-13";
// Jueves: 15 bloques (8:00 a 11:30) × 4 mentores = 60 asientos, TODOS con etiqueta de Cali.
const BLOQUES_J = Array.from({ length: 15 }, (_, i) => inicioUTC(J, 8 + Math.floor(i / 4), (i % 4) * 15));
const BLOQUES_V = Array.from({ length: 15 }, (_, i) => inicioUTC(V, 8 + Math.floor(i / 4), (i % 4) * 15));
const doc = (pref: number, i: number) => String(pref * 100_000_000 + i);
const CTG = (i: number) => doc(41, i), BAQ = (i: number) => doc(51, i), CALI = (i: number) => doc(31, i);

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.dias.insertMany([
    { _id: J, ciudades: [{ ciudad: "Cali", cupos: 20, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 20, max: 30, sobrante: false, abre: null }] },
    { _id: V, ciudades: [{ ciudad: "Barranquilla", cupos: 5, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 10, sobrante: false, abre: null }] },
  ]);
  const asiento = (dia: string, inicio: Date, mentorId: string, ciudades: string[]) => ({ _id: new ObjectId(), dia, inicio, mentorId, ciudades, proyectoId: null });
  await c.asientos.insertMany([
    ...BLOQUES_J.flatMap((b) => [0, 1, 2, 3].map((m) => asiento(J, b, `m${m}`, ["Cali"]))),
    ...BLOQUES_V.flatMap((b) => [0, 1, 2, 3].map((m) => asiento(V, b, `m${m}`, m < 2 ? ["Cartagena"] : ["Barranquilla"]))),
  ]);
  const now = new Date();
  const p = (codigo: string, ciudad: string, docs: string[]) => ({ _id: new ObjectId(), codigo, ciudad, nombre: codigo, integrantes: docs.map((d) => ({ documento: d, nombre: "Estudiante Prueba" })), creadoEn: now, actualizadoEn: now });
  await c.proyectos.insertMany([
    ...Array.from({ length: 160 }, (_, i) => p(`CTG-${i}`, "Cartagena", [CTG(i)])),
    ...Array.from({ length: 40 }, (_, i) => p(`BAQ-${i}`, "Barranquilla", [BAQ(i)])),
    ...Array.from({ length: 5 }, (_, i) => p(`CALI-${i}`, "Cali", [CALI(i)])),
    p("PAR", "Barranquilla", ["4200000001", "4200000002"]),
  ]);
});
afterAll(() => db.closeDb());

describe("apagado (sin documento de ajustes): como antes", () => {
  it("Cartagena no toma un asiento de Cali y no ve el jueves con horas", async () => {
    expect(await estadoModo()).toMatchObject({ ordenLlegada: false });
    expect(await reservar(CTG(150), BLOQUES_J[0]!, AHORA)).toMatchObject({ ok: false, error: "sin_cupo" });
    const a = await agenda(CTG(150), undefined, AHORA);
    expect(a).toMatchObject({ dias: expect.arrayContaining([{ dia: J, estado: "sin_horas" }]) });
    // Reserva hecha ANTES de encender (asiento de su etiqueta): luego cuenta para el tope del viernes.
    expect(await reservar(CTG(159), BLOQUES_V[0]!, AHORA)).toMatchObject({ ok: true });
    const c = await db.collections();
    expect(await c.ajustes.countDocuments()).toBe(0);
    expect(await c.candadosCupo.countDocuments()).toBe(0);
  });
});

describe("encendido", () => {
  it("al encender: solo el ajuste, los candados y el changeLog; ningún asiento cambia", async () => {
    const c = await db.collections();
    const antes = await c.asientos.find({}).sort({ _id: 1 }).toArray();
    await cambiarModo(true, ADMIN);
    expect(await c.asientos.find({}).sort({ _id: 1 }).toArray()).toEqual(antes);
    expect(await c.candadosCupo.countDocuments()).toBe(4); // (jueves y viernes) × 2 ciudades
    expect(await c.changeLog.countDocuments({ accion: "modo_cupos" })).toBe(1);
  });

  it("agenda: Cartagena ve todas las horas libres del jueves (asientos de Cali)", async () => {
    expect(await agenda(CTG(150), J, AHORA)).toEqual({ dia: J, bloques: BLOQUES_J.map((b) => b.toISOString()) });
  });

  it("se siguen respetando los días por ciudad y la apertura", async () => {
    // Barranquilla no presenta el jueves: no toma sus asientos aunque estén libres.
    expect(await reservar(BAQ(39), BLOQUES_J[0]!, AHORA)).toMatchObject({ ok: false, error: "dia_no_disponible" });
    expect(await agenda(BAQ(39), J, AHORA)).toEqual({ error: "dia_no_disponible" });
    // Apertura futura de Cartagena el viernes: aun_no_abre (se deja como estaba al terminar).
    const c = await db.collections();
    await c.dias.updateOne({ _id: V, "ciudades.ciudad": "Cartagena" }, { $set: { "ciudades.$.abre": new Date("2026-11-06T12:00:00Z") } });
    try {
      expect(await reservar(CTG(150), BLOQUES_V[1]!, AHORA)).toMatchObject({ ok: false, error: "aun_no_abre" });
    } finally {
      await c.dias.updateOne({ _id: V, "ciudades.ciudad": "Cartagena" }, { $set: { "ciudades.$.abre": null } });
    }
  });

  it("los dos integrantes de una pareja reservan 20 veces a la vez: un solo asiento", async () => {
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => reservar(i % 2 ? "4200000001" : "4200000002", BLOQUES_V[14]!, AHORA)));
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.filter((x) => !x.ok && x.error === "ya_tiene_hora")).toHaveLength(19);
    const c = await db.collections();
    const par = await c.proyectos.findOne({ codigo: "PAR" });
    expect(await c.asientos.countDocuments({ proyectoId: par!._id })).toBe(1);
  });

  it("120 estudiantes de Cartagena a la vez el jueves (tope 30, 60 libres): exactamente 30 reservas", async () => {
    const t0 = Date.now();
    const r = await Promise.all(Array.from({ length: 120 }, (_, i) => reservar(CTG(i), BLOQUES_J[i % 15]!, AHORA)));
    const ms = Date.now() - t0;
    expect(r.filter((x) => x.ok)).toHaveLength(30);
    expect(r.every((x) => x.ok || x.error === "dia_lleno" || x.error === "sin_cupo")).toBe(true);
    expect((await ocupacionCiudad("Cartagena")).get(J)).toBe(30);
    const c = await db.collections();
    const ocupados = await c.asientos.find({ dia: J, proyectoId: { $ne: null } }).toArray();
    expect(ocupados).toHaveLength(30);
    expect(new Set(ocupados.map((a) => String(a.proyectoId))).size).toBe(30);
    expect(ocupados.every((a) => a.ciudades.join() === "Cali")).toBe(true); // la etiqueta no se tocó
    expect(ms).toBeLessThan(45_000);
  });

  it("al tope, el jueves desaparece para Cartagena y la reserva responde dia_lleno", async () => {
    expect(await agenda(CTG(140), J, AHORA)).toEqual({ error: "dia_no_disponible" });
    expect(await agenda(CTG(140), undefined, AHORA)).toMatchObject({ dias: expect.arrayContaining([{ dia: J, estado: "sin_horas" }]) });
    expect(await reservar(CTG(140), BLOQUES_J[14]!, AHORA)).toMatchObject({ ok: false, error: "dia_lleno" });
  });

  it("la ciudad de sobrante (Cali) no tiene tope y sigue tomando los libres", async () => {
    const r = await Promise.all(Array.from({ length: 5 }, (_, i) => reservar(CALI(i), BLOQUES_J[14]!, AHORA)));
    expect(r.filter((x) => x.ok).length).toBeGreaterThan(0);
  });

  it("viernes, en simultáneo: Cartagena (tope = cupos 10) y Barranquilla (sobrante, sin tope)", async () => {
    const r = await Promise.all([
      ...Array.from({ length: 40 }, (_, i) => reservar(CTG(120 + i), BLOQUES_V[i % 15]!, AHORA).then((x) => ({ ciudad: "Cartagena", x }))),
      ...Array.from({ length: 40 }, (_, i) => reservar(BAQ(i), BLOQUES_V[(i + 7) % 15]!, AHORA).then((x) => ({ ciudad: "Barranquilla", x }))),
    ]);
    // La reserva de antes de encender cuenta: 1 + 9 nuevas = tope 10.
    expect(r.filter((y) => y.ciudad === "Cartagena" && y.x.ok)).toHaveLength(9);
    expect((await ocupacionCiudad("Cartagena")).get(V)).toBe(10);
    // Barranquilla toma de cualquier asiento libre (también los de etiqueta Cartagena).
    expect((await ocupacionCiudad("Barranquilla")).get(V)).toBeGreaterThan(20);
    const c = await db.collections();
    const dobles = await c.asientos.aggregate([{ $match: { proyectoId: { $ne: null } } }, { $group: { _id: "$proyectoId", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]).toArray();
    expect(dobles).toEqual([]);
  });

  it("liberar a la vez que otros reservan al tope: nunca pasa de 30", async () => {
    const c = await db.collections();
    const uno = await c.asientos.findOne({ dia: J, proyectoId: { $ne: null } }, { sort: { inicio: 1 } });
    const p = await c.proyectos.findOne({ _id: uno!.proyectoId!, ciudad: "Cartagena" });
    expect(p).not.toBeNull();
    await Promise.all([
      db.transaccion((s) => liberarProyecto(s, p!._id, "admin.prueba", AHORA).then(() => undefined)),
      ...Array.from({ length: 6 }, (_, i) => reservar(CTG(100 + i), BLOQUES_J[i]!, AHORA)),
    ]);
    const n = (await ocupacionCiudad("Cartagena")).get(J) ?? 0;
    expect(n).toBeGreaterThanOrEqual(29);
    expect(n).toBeLessThanOrEqual(30);
  });

});

describe("apagar vuelve a como estaba", () => {
  it("las reservas en asientos de otra ciudad se conservan y Cartagena vuelve a ver solo sus etiquetas", async () => {
    const c = await db.collections();
    const antes = await c.asientos.find({}).sort({ _id: 1 }).toArray();
    await cambiarModo(false, ADMIN);
    expect(await c.asientos.find({}).sort({ _id: 1 }).toArray()).toEqual(antes);
    expect(await reservar(CTG(159), BLOQUES_J[14]!, AHORA)).toMatchObject({ ok: false });
    expect(await c.changeLog.countDocuments({ accion: "modo_cupos" })).toBe(2);
  });
});

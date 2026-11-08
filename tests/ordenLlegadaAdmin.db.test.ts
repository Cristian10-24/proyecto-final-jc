import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Fase 4 · Paso 20: el tope del modo orden de llegada en las acciones del admin, del monitor (moverProyecto con
// "respetar") y de la bandeja, contra la base LOCAL. Con el modo apagado, todo como antes.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { reservar } = await import("@/lib/reservas");
const { bloquesLibres, cambiarHora } = await import("@/lib/admin");
const { aprobar } = await import("@/lib/sugerencias");
const { resumen } = await import("@/lib/seguimiento");
const { editarProyecto } = await import("@/lib/gestionProyectos");
const { datosTablero } = await import("@/lib/tableroHorarios");
const { cambiarModo, conCandado, ocupacionCiudad } = await import("@/lib/modoCupos");
const { Falla, moverProyecto } = await import("@/lib/mover");
const { inicioUTC } = await import("@/lib/edicion");

const AHORA = new Date("2026-11-05T12:00:00Z");
const ADMIN = { rol: "admin" as const, usuario: "admin.prueba" };
const J = "2026-11-12", V = "2026-11-13", M = "2026-11-17";
const bloque = (dia: string, i: number) => inicioUTC(dia, 8 + Math.floor(i / 4), (i % 4) * 15);
const CTG = (i: number) => String(4_100_000_000 + i);
const pid = async (doc: string) => (await (await db.collections()).proyectos.findOne({ "integrantes.documento": doc }))!._id;

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.dias.insertMany([
    { _id: J, ciudades: [{ ciudad: "Cali", cupos: 2, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 2, sobrante: false, abre: null }] },
    { _id: V, ciudades: [{ ciudad: "Cartagena", cupos: 1, sobrante: false, abre: null }, { ciudad: "Barranquilla", cupos: 1, sobrante: true, abre: null }] },
    { _id: M, ciudades: [{ ciudad: "Cartagena", cupos: 3, sobrante: false, abre: null }, { ciudad: "Barranquilla", cupos: 1, sobrante: true, abre: null }] },
  ]);
  const asiento = (dia: string, i: number, m: number, ciudades: string[]) => ({ _id: new ObjectId(), dia, inicio: bloque(dia, i), mentorId: `m${m}`, ciudades, proyectoId: null });
  await c.asientos.insertMany([
    ...[0, 1].flatMap((i) => [0, 1, 2, 3].map((m) => asiento(J, i, m, ["Cali"]))),
    ...[0, 1].flatMap((i) => [0, 1].map((m) => asiento(V, i, m, ["Barranquilla"]))),
    ...[0, 1, 2].flatMap((i) => [0, 1, 2, 3].map((m) => asiento(M, i, m, ["Barranquilla"]))),
  ]);
  const now = new Date();
  await c.proyectos.insertMany(Array.from({ length: 20 }, (_, i) => ({
    _id: new ObjectId(), codigo: `CTG-${i}`, ciudad: "Cartagena", nombre: `Proyecto ${i}`, integrantes: [{ documento: CTG(i), nombre: "Estudiante Prueba" }], creadoEn: now, actualizadoEn: now,
  })));
});
afterAll(() => db.closeDb());

describe("modo apagado: como antes", () => {
  it("el admin no toma un asiento de otra ciudad sin «otraCiudad», y el tablero lo marca apagado", async () => {
    expect(await cambiarHora(await pid(CTG(19)), bloque(J, 0), { otraCiudad: false, motivo: "" }, ADMIN)).toMatchObject({ ok: false, error: "sin_cupo" });
    expect((await datosTablero(J)).ordenLlegada).toBe(false);
    const b = await bloquesLibres(await pid(CTG(19)), J);
    expect(b).toMatchObject({ ordenLlegada: false });
    expect(b!.bloques.every((x) => !x.deSuCiudad)).toBe(true);
    expect(b).not.toHaveProperty("tope");
  });
});

describe("modo encendido", () => {
  beforeAll(async () => { await cambiarModo(true, ADMIN); });

  it("dos estudiantes llenan el tope del jueves (2)", async () => {
    expect(await reservar(CTG(0), bloque(J, 0), AHORA)).toMatchObject({ ok: true });
    expect(await reservar(CTG(1), bloque(J, 0), AHORA)).toMatchObject({ ok: true });
  });

  it("bloques del admin: todos los libres valen y dice el tope", async () => {
    const b = await bloquesLibres(await pid(CTG(2)), J);
    expect(b!.bloques.every((x) => x.deSuCiudad)).toBe(true);
    expect(b).toMatchObject({ ordenLlegada: true, tope: { tope: 2, lleva: 2 } });
    // Un proyecto que ya está ese día no se cuenta a sí mismo.
    expect(await bloquesLibres(await pid(CTG(0)), J)).toMatchObject({ tope: { tope: 2, lleva: 1 } });
    expect((await datosTablero(J)).ordenLlegada).toBe(true);
  });

  it("el admin sobre el tope: advertencia sin confirmar; con confirmación pasa y queda en el historial", async () => {
    const p2 = await pid(CTG(2));
    const r = await cambiarHora(p2, bloque(J, 1), { otraCiudad: false, motivo: "" }, ADMIN);
    expect(r).toMatchObject({ ok: false, error: "tope" });
    expect(!r.ok && r.mensaje).toMatch(/Cartagena ya tiene 2 de 2 el jueves 12/);
    const c = await db.collections();
    expect(await c.asientos.findOne({ proyectoId: p2 })).toBeNull(); // la transacción se deshizo
    expect(await cambiarHora(p2, bloque(J, 1), { otraCiudad: false, motivo: "", confirmarTope: true }, ADMIN)).toMatchObject({ ok: true });
    expect((await ocupacionCiudad("Cartagena")).get(J)).toBe(3);
    expect((await c.changeLog.findOne({ proyectoId: p2, accion: "cambiar_hora" }))!.nuevo).toMatch(/sobre el tope/);
  });

  it("moverse dentro del mismo día no pide confirmación aunque la ciudad esté sobre el tope", async () => {
    expect(await cambiarHora(await pid(CTG(0)), bloque(J, 1), { otraCiudad: false, motivo: "" }, ADMIN)).toMatchObject({ ok: true });
  });

  it("el monitor (respetar) no pasa el tope: Falla «tope» y nada cambia", async () => {
    expect(await reservar(CTG(3), bloque(V, 0), AHORA)).toMatchObject({ ok: true }); // viernes: tope 1, lleno
    const c = await db.collections();
    const p0 = await pid(CTG(0));
    const antes = await c.asientos.findOne({ proyectoId: p0 });
    const libreV = await c.asientos.findOne({ dia: V, proyectoId: null });
    await expect(conCandado((s) => moverProyecto(s, p0, antes!._id, [{ _id: libreV!._id }], "monitor.prueba", AHORA).then(() => undefined)))
      .rejects.toBeInstanceOf(Falla);
    expect((await c.asientos.findOne({ proyectoId: p0 }))!._id).toEqual(antes!._id);
    expect((await ocupacionCiudad("Cartagena")).get(V)).toBe(1);
  });

  it("bandeja: aprobar sobre el tope pide confirmación", async () => {
    const c = await db.collections();
    const p1 = await pid(CTG(1));
    const { insertedId } = await c.cambiosSugeridos.insertOne({ proyectoId: p1, anterior: "", detalle: "Pasarlo al viernes", motivo: "Viaje", estado: "pendiente", creadoPor: "monitor.prueba", creadoEn: AHORA } as never);
    const r = await aprobar(String(insertedId), bloque(V, 1), false, ADMIN);
    expect(r).toMatchObject({ error: "tope" });
    expect((r as { mensaje?: string }).mensaje).toMatch(/Cartagena ya tiene 1 de 1 el viernes 13/);
    expect(await c.cambiosSugeridos.findOne({ _id: insertedId })).toMatchObject({ estado: "pendiente" }); // no se reclamó
    expect(await aprobar(String(insertedId), bloque(V, 1), false, ADMIN, true)).toMatchObject({ ok: true });
    expect((await ocupacionCiudad("Cartagena")).get(V)).toBe(2);
  });

  it("editar la ciudad de un proyecto con hora (a una ciudad con tope ese día) escribe el candado y no mueve la hora", async () => {
    const c = await db.collections();
    const now = new Date();
    const { insertedId } = await c.proyectos.insertOne({ _id: new ObjectId(), codigo: "BAQ-1", ciudad: "Barranquilla", nombre: "Proyecto Barranquilla", integrantes: [{ documento: "5100000001", nombre: "Eva Prueba" }], creadoEn: now, actualizadoEn: now });
    expect(await reservar("5100000001", bloque(V, 1), AHORA)).toMatchObject({ ok: true }); // Barranquilla: sin tope
    const antes = (await c.candadosCupo.findOne({ _id: `${V}|Cartagena` }))!.v;
    const asiento = await c.asientos.findOne({ proyectoId: insertedId });
    expect(await editarProyecto(insertedId, { ciudad: "Cartagena", nombre: "Proyecto Barranquilla", integrantes: [{ nombre: "Eva Prueba", documento: "5100000001" }] }, { confirmarCiudad: true }, ADMIN)).toMatchObject({ ok: true });
    expect((await c.candadosCupo.findOne({ _id: `${V}|Cartagena` }))!.v).toBe(antes + 1);
    expect(await c.asientos.findOne({ proyectoId: insertedId })).toEqual(asiento);
  });

  it("resumen de coordinación: libres de Cartagena = lo que aún puede tomar", async () => {
    // Jueves 3 de 2 y viernes 2 de 1 (sin libres para ella); martes 17: tope 3, 12 libres → 3.
    const r = await resumen();
    expect(r.ciudades.find((x) => x.ciudad === "Cartagena")).toMatchObject({ asientosLibres: 3, dias: [M] });
  });

  it("concurrencia: estudiantes y admin (sin confirmar) a la vez el martes con tope 3 → nunca más de 3", async () => {
    const r = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) => reservar(CTG(4 + i), bloque(M, i % 3), AHORA)),
      ...Array.from({ length: 4 }, async (_, i) => cambiarHora(await pid(CTG(12 + i)), bloque(M, i % 3), { otraCiudad: false, motivo: "" }, ADMIN)),
    ]);
    expect(r.filter((x) => x.ok)).toHaveLength(3);
    expect((await ocupacionCiudad("Cartagena")).get(M)).toBe(3);
  });

  it("concurrencia: el monitor (respetar) y estudiantes a la vez con el tope casi lleno → nunca lo pasan", async () => {
    const c = await db.collections();
    // Libera uno del martes (queda 2 de 3) y compiten: 3 proyectos del jueves movidos por «el monitor» y 4 estudiantes.
    const uno = await c.asientos.findOne({ dia: M, proyectoId: { $ne: null } });
    await c.asientos.updateOne({ _id: uno!._id }, { $set: { proyectoId: null }, $unset: { reservadoEn: "" } });
    const delJueves = await c.asientos.find({ dia: J, proyectoId: { $ne: null } }).toArray();
    const libresM = await c.asientos.find({ dia: M, proyectoId: null }).limit(3).toArray();
    const monitor = delJueves.slice(0, 3).map((a, i) => conCandado((s) => moverProyecto(s, a.proyectoId!, a._id, [{ _id: libresM[i]!._id }], "monitor.prueba", AHORA).then(() => undefined)).then(() => true, () => false));
    const estudiantes = Array.from({ length: 4 }, (_, i) => reservar(CTG(16 + i), bloque(M, i % 3), AHORA).then((x) => x.ok));
    const ok = (await Promise.all([...monitor, ...estudiantes])).filter(Boolean);
    expect(ok).toHaveLength(1);
    expect((await ocupacionCiudad("Cartagena")).get(M)).toBe(3);
  });
});

import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { Evento } from "@/lib/citaciones/contenido";
import type { ClienteCalendario } from "@/lib/citaciones/google";

// Fase 5 · Paso 28 · Servicio de citaciones contra la base LOCAL, con un cliente de Google SIMULADO (nunca llama a
// Google): contenido e invitados, no duplicar, desactualizadas, marcar como citado, cancelar, errores de la API y modo
// prueba. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const reg = await import("@/lib/citaciones/registro");
const { ErrorGoogle } = await import("@/lib/citaciones/google");
const { inicioUTC } = await import("@/lib/edicion");

const D = "2026-11-12";
const ADMIN = { rol: "admin" as const, usuario: "admin.p" };
const P: Record<string, ObjectId> = {};

type Llamada = { op: "guardar" | "cancelar"; id: string; evento?: Evento; existe?: boolean };
function simulado(op: { falla?: (id: string, e?: Evento) => boolean; demoraMs?: number } = {}) {
  const llamadas: Llamada[] = [];
  const cliente: ClienteCalendario = {
    async guardar(id, evento, existe) {
      if (op.demoraMs) await new Promise((ok) => setTimeout(ok, op.demoraMs));
      llamadas.push({ op: "guardar", id, evento, existe });
      if (op.falla?.(id, evento)) throw new ErrorGoogle(400, "invalid", "Google respondió 400 (invalid): Invalid attendee email.");
    },
    async cancelar(id) { llamadas.push({ op: "cancelar", id }); if (op.falla?.(id)) throw new ErrorGoogle(503, "backendError", "Google respondió 503"); },
  };
  return { cliente, llamadas, real: { cliente, correoPrueba: null }, prueba: { cliente, correoPrueba: "yo@prueba.test" } };
}

async function proyecto(codigo: string, integrantes: { nombre: string; correo?: string; celular?: string }[], hora: number, min: number, mentorId: string) {
  const c = await db.collections(), _id = new ObjectId(), now = new Date();
  await c.proyectos.insertOne({ _id, codigo, ciudad: "Cali", nombre: `Proyecto ${codigo}`, creadoEn: now, actualizadoEn: now, integrantes: integrantes.map((i, n) => ({ documento: `99${codigo}${n}`, ...i })) });
  await c.asientos.insertOne({ _id: new ObjectId(), dia: D, inicio: inicioUTC(D, hora, min), mentorId, ciudades: ["Cali"], proyectoId: _id });
  P[codigo] = _id;
}
const filas = (tipo: "participante" | "mentor" | "monitor", prueba: string | null = null) => reg.filasDelDia(D, tipo, prueba);
const fila = async (tipo: "participante" | "mentor" | "monitor", clave: string, prueba: string | null = null) => (await filas(tipo, prueba)).find((f) => f.clave === clave);

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  await c.mentores.insertMany([{ _id: "m1", nombre: "Mentora Uno", correo: "m1@correo.test", celular: "+573009990001" }, { _id: "m2", nombre: "Mentor Dos", correo: "m2@correo.test" }]);
  await c.users.insertMany([
    { _id: new ObjectId(), usuario: "mon.uno", nombre: "Monitor Uno", correo: "mon1@correo.test", celular: "+573008880001", rol: "monitor", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
    { _id: new ObjectId(), usuario: "mon.dos", nombre: "Monitora Dos", correo: "mon2@correo.test", rol: "monitor", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
    { _id: new ObjectId(), usuario: "mon.tres", nombre: "Monitor Tres", correo: "mon3@correo.test", rol: "monitor", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
  ]);
  await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 1, enlace: "https://meet.google.com/uno" }, { sala: 2, enlace: "https://meet.google.com/dos" }, { sala: 3, enlace: "https://meet.google.com/tres" }], importados: [], disponibilidad: [], actualizadoEn: now });
  await c.planSalas.insertMany([
    { _id: `${D}|14|1`, dia: D, hora: 14, sala: 1, mentorId: "m1", monitor: "mon.uno", origen: "importado" },
    { _id: `${D}|14|2`, dia: D, hora: 14, sala: 2, mentorId: "m2", monitor: "mon.dos", origen: "importado" },
    { _id: `${D}|16|1`, dia: D, hora: 16, sala: 1, mentorId: "m1", monitor: "mon.uno", origen: "importado" },
  ]);
  await proyecto("A", [{ nombre: "Ana", correo: "ana@correo.test", celular: "+573001110001" }, { nombre: "Beto", correo: "beto@correo.test" }], 14, 0, "m1");
  await proyecto("B", [{ nombre: "Carla", correo: "carla@correo.test" }], 14, 15, "m1");
  await proyecto("C", [{ nombre: "Dani", correo: "dani@correo.test" }], 14, 0, "m2");
  await proyecto("S", [{ nombre: "Sin Correo" }], 14, 30, "m2");
  await proyecto("E", [{ nombre: "Eva", correo: "eva@correo.test" }], 16, 0, "m1");
});
afterAll(() => db.closeDb());

describe("citar participantes", () => {
  it("un evento con sus integrantes; registro citado y changeLog", async () => {
    const s = simulado();
    const r = await reg.citar("participante", D, String(P.A), ADMIN, s.real);
    expect(r).toMatchObject({ ok: true, accion: "citado" });
    expect(s.llamadas).toHaveLength(1);
    const [l] = s.llamadas;
    expect(l!.existe).toBe(false);
    expect(l!.evento!.titulo).toBe("Proyecto Final JC 2026 · Presentación de Proyecto A");
    expect(l!.evento!.invitados.map((i) => i.correo)).toEqual(["ana@correo.test", "beto@correo.test"]);
    expect(l!.evento!.descripcion).toContain("Monitor a cargo: Monitor Uno");
    const c = await db.collections();
    const doc = await c.citaciones.findOne({ tipo: "participante", clave: String(P.A), dia: D });
    expect(doc).toMatchObject({ estado: "citado", ids: [l!.id], citadoPor: "admin.p" });
    expect(doc!.idsPlan).toBeUndefined();
    expect(doc!.bloqueoHasta).toBeUndefined();
    expect(await c.changeLog.findOne({ accion: "citar", proyectoId: P.A })).toBeTruthy();
    expect(await fila("participante", String(P.A))).toMatchObject({ estado: "citado", conEventos: true });
  });

  it("citar otra vez no duplica: actualiza el mismo evento", async () => {
    const s = simulado();
    const antes = (await (await db.collections()).citaciones.findOne({ clave: String(P.A) }))!.ids[0];
    expect(await reg.citar("participante", D, String(P.A), ADMIN, s.real)).toMatchObject({ ok: true, accion: "actualizado" });
    expect(s.llamadas).toEqual([expect.objectContaining({ op: "guardar", id: antes, existe: true })]);
    expect(await (await db.collections()).citaciones.countDocuments({ clave: String(P.A) })).toBe(1);
  });

  it("dos envíos a la vez: uno espera (ocupado) y Google recibe una sola llamada", async () => {
    const s = simulado({ demoraMs: 150 });
    const rs = await Promise.all([reg.citar("participante", D, String(P.B), ADMIN, s.real), reg.citar("participante", D, String(P.B), ADMIN, s.real)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toMatchObject({ error: "ocupado" });
    expect(s.llamadas).toHaveLength(1);
    expect(await (await db.collections()).citaciones.countDocuments({ clave: String(P.B) })).toBe(1);
  });

  it("sin correo: no se puede citar y no se escribe nada", async () => {
    const s = simulado();
    expect(await reg.citar("participante", D, String(P.S), ADMIN, s.real)).toMatchObject({ ok: false, error: "no_se_puede" });
    expect(s.llamadas).toEqual([]);
    expect(await (await db.collections()).citaciones.findOne({ clave: String(P.S) })).toBeNull();
    expect(await fila("participante", String(P.S))).toMatchObject({ estado: "no_se_puede", bloqueo: "Ningún integrante tiene correo." });
  });

  it("desactualizada si cambia el monitor de la sala; «Actualizar» reemplaza el mismo evento", async () => {
    const c = await db.collections();
    await c.planSalas.updateOne({ _id: `${D}|14|1` }, { $set: { monitor: "mon.tres" } });
    expect(await fila("participante", String(P.A))).toMatchObject({ estado: "desactualizado", cambios: ["el monitor"] });
    const s = simulado();
    expect(await reg.citar("participante", D, String(P.A), ADMIN, s.real)).toMatchObject({ ok: true, accion: "actualizado" });
    expect(s.llamadas[0]!.evento!.descripcion).toContain("Monitor a cargo: Monitor Tres");
    expect(await fila("participante", String(P.A))).toMatchObject({ estado: "citado" });
    await c.planSalas.updateOne({ _id: `${D}|14|1` }, { $set: { monitor: "mon.uno" } });
    expect((await fila("participante", String(P.A)))!.estado).toBe("desactualizado");
    await reg.citar("participante", D, String(P.A), ADMIN, simulado().real);
  });

  it("desactualizada si cambia la hora; si pasa a otro día, la fila queda «sobra» para cancelarla", async () => {
    const c = await db.collections();
    await c.asientos.updateOne({ proyectoId: P.B }, { $set: { inicio: inicioUTC(D, 14, 45) } });
    expect(await fila("participante", String(P.B))).toMatchObject({ estado: "desactualizado", cambios: ["la hora"] });
    await c.asientos.updateOne({ proyectoId: P.B }, { $set: { dia: "2026-11-13", inicio: inicioUTC("2026-11-13", 14, 45) } });
    expect(await fila("participante", String(P.B))).toMatchObject({ estado: "sobra" });
    const s = simulado();
    expect(await reg.cancelar("participante", D, String(P.B), ADMIN, s.real)).toMatchObject({ ok: true, accion: "cancelado" });
    expect(s.llamadas.map((l) => l.op)).toEqual(["cancelar"]);
    expect(await fila("participante", String(P.B))).toBeUndefined();
    expect(await c.changeLog.findOne({ accion: "cancelar_citacion", proyectoId: P.B })).toBeTruthy();
    await c.asientos.updateOne({ proyectoId: P.B }, { $set: { dia: D, inicio: inicioUTC(D, 14, 15) } });
    expect(await fila("participante", String(P.B))).toMatchObject({ estado: "sin_citar", canceladoEn: expect.any(String) });
  });
});

describe("errores de la API y lotes", () => {
  it("si uno falla sigue con los demás y lo marca Error; el reintento usa el mismo evento", async () => {
    const s = simulado({ falla: (_id, e) => !!e?.titulo.includes("Proyecto C") });
    const rs = await reg.citarVarias("participante", D, [String(P.C), String(P.E), String(P.B)], ADMIN, { ...s.real, pausaMs: 0 });
    expect(rs.map((r) => r.ok)).toEqual([false, true, true]);
    expect(rs[0]).toMatchObject({ error: "google", mensaje: "Google respondió 400 (invalid): Invalid attendee email." });
    const f = await fila("participante", String(P.C));
    expect(f).toMatchObject({ estado: "error", error: "Google respondió 400 (invalid): Invalid attendee email." });
    const idFallido = s.llamadas[0]!.id;
    const c = await db.collections();
    expect((await c.citaciones.findOne({ clave: String(P.C) }))!.idsPlan).toEqual([idFallido]);
    const otra = simulado();
    expect(await reg.citar("participante", D, String(P.C), ADMIN, otra.real)).toMatchObject({ ok: true, accion: "citado" });
    expect(otra.llamadas[0]).toMatchObject({ id: idFallido, existe: false });
    expect(await fila("participante", String(P.C))).toMatchObject({ estado: "citado" });
  });

  it("pendientes: sin citar, desactualizadas y con error (nunca las que no se pueden)", async () => {
    const fs = await filas("participante");
    expect(fs.filter((f) => reg.esPendiente(f, null)).map((f) => f.nombre)).toEqual([]);
    expect(fs.find((f) => f.clave === String(P.S))!.estado).toBe("no_se_puede");
  });
});

describe("mentores y monitores", () => {
  it("marcar todos como citados (sin crear eventos), con changeLog; repetir no los marca dos veces", async () => {
    const s = simulado();
    const r = await reg.marcarCitado("mentor", D, "todos", ADMIN, null);
    expect(r.marcados.map((m) => m.clave).sort()).toEqual(["m1", "m2"]);
    expect(s.llamadas).toEqual([]);
    expect(await fila("mentor", "m1")).toMatchObject({ estado: "externo", externo: true, conEventos: false });
    expect(await (await db.collections()).changeLog.countDocuments({ accion: "marcar_citado" })).toBe(2);
    const otra = await reg.marcarCitado("mentor", D, "todos", ADMIN, null);
    expect(otra.marcados).toEqual([]);
    expect(otra.omitidos.map((o) => o.mensaje)).toEqual(["Ya estaba marcada como citada.", "Ya estaba marcada como citada."]);
    expect((await reg.marcarCitado("monitor", D, ["mon.uno"], ADMIN, null)).marcados.map((m) => m.clave)).toEqual(["mon.uno"]);
  });

  it("lo marcado se desactualiza si cambia; «Actualizar» crea un evento nuevo y avisa", async () => {
    const c = await db.collections();
    await c.planSalas.deleteOne({ _id: `${D}|16|1` });
    await c.planSalas.insertOne({ _id: `${D}|16|3`, dia: D, hora: 16, sala: 3, mentorId: "m1", monitor: "mon.uno", origen: "admin" });
    expect(await fila("mentor", "m1")).toMatchObject({ estado: "desactualizado", externo: true, cambios: ["la sala", "el enlace"] });
    const s = simulado();
    const r = await reg.citar("mentor", D, "m1", ADMIN, s.real);
    expect(r).toMatchObject({ ok: true, accion: "actualizado", aviso: expect.stringMatching(/cancela a mano/) });
    expect(s.llamadas).toHaveLength(2); // dos franjas: 14:00–14:30 y 16:00–16:15
    expect(s.llamadas.every((l) => l.existe === false && l.evento!.invitados.length === 1 && l.evento!.invitados[0]!.correo === "m1@correo.test")).toBe(true);
    expect(s.llamadas[1]!.evento!.descripcion).toContain("Sala 3: https://meet.google.com/tres");
    // Con eventos de la app, marcar como citado ya no la toca.
    expect((await reg.marcarCitado("mentor", D, ["m1"], ADMIN, null)).omitidos[0]!.mensaje).toMatch(/Tiene eventos de la app/);
  });

  it("si una franja desaparece, su evento sobrante se cancela al actualizar", async () => {
    const c = await db.collections();
    const ids = (await c.citaciones.findOne({ tipo: "mentor", clave: "m1" }))!.ids;
    expect(ids).toHaveLength(2);
    await c.asientos.updateOne({ proyectoId: P.E }, { $set: { proyectoId: null } });
    expect(await fila("mentor", "m1")).toMatchObject({ estado: "desactualizado", cambios: expect.arrayContaining(["los proyectos"]) });
    const s = simulado();
    await reg.citar("mentor", D, "m1", ADMIN, s.real);
    expect(s.llamadas.map((l) => `${l.op} ${l.id}`)).toEqual([`guardar ${ids[0]}`, `cancelar ${ids[1]}`]);
    expect((await c.citaciones.findOne({ tipo: "mentor", clave: "m1" }))!.ids).toEqual([ids[0]]);
    await c.asientos.updateOne({ inicio: inicioUTC(D, 16), mentorId: "m1" }, { $set: { proyectoId: P.E } });
  });

  it("el evento del monitor lleva el contacto de sus integrantes; el del mentor no", async () => {
    const pm = await reg.vistaPrevia(D, "monitor", "mon.uno", null);
    expect(pm!.eventos[0]!.descripcion).toContain("Ana · Celular: +573001110001 · Correo: ana@correo.test");
    expect(pm!.eventos[0]!.descripcion).not.toContain("dani@correo.test"); // sala de otro monitor
    const pt = await reg.vistaPrevia(D, "mentor", "m1", null);
    expect(pt!.eventos.map((e) => e.descripcion).join()).not.toMatch(/(ana|beto|carla|eva)@correo\.test/);
  });
});

describe("modo prueba", () => {
  it("todo va solo al correo de prueba con [PRUEBA]; en modo real cuenta como sin citar", async () => {
    const s = simulado();
    expect(await reg.citar("monitor", D, "mon.dos", ADMIN, s.prueba)).toMatchObject({ ok: true });
    expect(s.llamadas[0]!.evento!.titulo).toBe("[PRUEBA] Proyecto Final JC 2026 · Monitoría de salas");
    expect(s.llamadas[0]!.evento!.invitados).toEqual([{ correo: "yo@prueba.test", nombre: "Prueba" }]);
    expect(await fila("monitor", "mon.dos", "yo@prueba.test")).toMatchObject({ estado: "citado", prueba: "yo@prueba.test" });
    const real = await fila("monitor", "mon.dos");
    expect(real).toMatchObject({ estado: "sin_citar", soloPrueba: true });
    expect(reg.esPendiente(real!, null)).toBe(true);
    // Citar de verdad reutiliza el evento de prueba (Google le quita el correo de prueba y avisa a los reales).
    const r2 = simulado();
    await reg.citar("monitor", D, "mon.dos", ADMIN, r2.real);
    expect(r2.llamadas[0]).toMatchObject({ id: s.llamadas[0]!.id, existe: true });
    expect(r2.llamadas[0]!.evento!.invitados).toEqual([{ correo: "mon2@correo.test", nombre: "Monitora Dos" }]);
    expect((await (await db.collections()).citaciones.findOne({ tipo: "monitor", clave: "mon.dos" }))!.prueba).toBeUndefined();
  });

  it("en modo prueba nunca se toca lo citado de verdad (ni citar ni cancelar ni pendientes)", async () => {
    const s = simulado();
    expect(await reg.citar("participante", D, String(P.A), ADMIN, s.prueba)).toMatchObject({ ok: false, error: "real_en_prueba" });
    expect(await reg.cancelar("participante", D, String(P.A), ADMIN, s.prueba)).toMatchObject({ ok: false, error: "real_en_prueba" });
    expect(await reg.citar("mentor", D, "m2", ADMIN, s.prueba)).toMatchObject({ ok: false, error: "real_en_prueba" }); // marcado por fuera
    expect(s.llamadas).toEqual([]);
    const c = await db.collections();
    await c.planSalas.updateOne({ _id: `${D}|14|2` }, { $set: { monitor: null } });
    const f = await fila("mentor", "m2", "yo@prueba.test");
    expect(f!.estado).toBe("desactualizado");
    expect(reg.esPendiente(f!, "yo@prueba.test")).toBe(false);
    expect(reg.esPendiente(f!, null)).toBe(true);
    await c.planSalas.updateOne({ _id: `${D}|14|2` }, { $set: { monitor: "mon.dos" } });
    expect((await c.citaciones.findOne({ clave: "_" }))).toBeNull();
  });
});

describe("revisión de seguridad", () => {
  it("si otro envío toma la fila mientras tanto, el primero no le pisa el estado", async () => {
    const c = await db.collections();
    const s = simulado({ demoraMs: 200 });
    const envio = reg.citar("participante", D, String(P.E), ADMIN, s.real);
    await new Promise((ok) => setTimeout(ok, 80));
    await c.citaciones.updateOne({ tipo: "participante", clave: String(P.E), dia: D }, { $set: { bloqueoId: "otro-envio" } });
    expect(await envio).toMatchObject({ ok: false, error: "ocupado" });
    const doc = await c.citaciones.findOne({ tipo: "participante", clave: String(P.E), dia: D });
    expect(doc!.bloqueoId).toBe("otro-envio");
    expect(doc!.estado).toBe("citado"); // el estado anterior, intacto
    await c.citaciones.updateOne({ _id: doc!._id }, { $unset: { bloqueoId: "", bloqueoHasta: "" } });
  });

  it("en modo prueba no se marca nada como citado", async () => {
    const r = await reg.marcarCitado("monitor", D, "todos", ADMIN, "yo@prueba.test");
    expect(r.marcados).toEqual([]);
    expect(r.omitidos.every((o) => o.error === "real_en_prueba")).toBe(true);
  });

  it("modo prueba rechazado en una fila real no le cambia nada (ni nombre ni fecha)", async () => {
    const c = await db.collections();
    const antes = await c.citaciones.findOne({ tipo: "participante", clave: String(P.A), dia: D });
    await reg.citar("participante", D, String(P.A), ADMIN, simulado().prueba);
    const despues = await c.citaciones.findOne({ tipo: "participante", clave: String(P.A), dia: D });
    expect(despues).toEqual(antes);
  });
});

describe("texto «Ten en cuenta»", () => {
  it("se guarda limpio, deja changeLog, sale en la vista previa y no desactualiza lo citado", async () => {
    expect(await reg.guardarTenEnCuenta("  Llega temprano  \n\n<b>Trae</b> tu proyecto\n", ADMIN)).toEqual({ ok: true, texto: "Llega temprano\nb Trae /b tu proyecto" });
    expect(await reg.guardarTenEnCuenta(" \n ", ADMIN)).toMatchObject({ ok: false });
    expect(await (await db.collections()).changeLog.countDocuments({ accion: "texto_citacion" })).toBe(1);
    const v = await reg.vistaPrevia(D, "participante", String(P.A), "yo@prueba.test");
    expect(v!.eventos[0]!.descripcion).toMatch(/• Llega temprano\n• b Trae \/b tu proyecto$/);
    expect(v!.eventos[0]!.titulo.startsWith("[PRUEBA] ")).toBe(true);
    expect(await fila("participante", String(P.A))).toMatchObject({ estado: "citado" });
  });
});

describe("como producción", () => {
  it("leer filas y vistas previas no escribe nada", async () => {
    const c = await db.collections();
    const antes = JSON.stringify(await Promise.all([c.citaciones.find({}).toArray(), c.changeLog.countDocuments({}), c.asientos.find({}).toArray(), c.planSalas.find({}).toArray(), c.proyectos.find({}).toArray(), c.users.find({}).toArray()]));
    for (const t of ["participante", "mentor", "monitor"] as const) for (const f of await filas(t)) await reg.vistaPrevia(D, t, f.clave, null);
    const despues = JSON.stringify(await Promise.all([c.citaciones.find({}).toArray(), c.changeLog.countDocuments({}), c.asientos.find({}).toArray(), c.planSalas.find({}).toArray(), c.proyectos.find({}).toArray(), c.users.find({}).toArray()]));
    expect(despues).toBe(antes);
  });
});

import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { SessionUser } from "@/lib/auth";

// Monitor por proyecto (rama feature/monitor-por-proyecto) contra la base LOCAL, con datos INVENTADOS que imitan el
// caso real: un bloque de 6:00 p. m. (Sala 1) con 4 proyectos y su monitora; el admin asigna a mano a otro monitor
// tres de ellos. Solo cambia el monitor: sala, enlace, mentor, reserva y lo ya anotado se conservan.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const { inicioUTC } = await import("@/lib/edicion");
const mon = await import("@/lib/evaluacion/monitor");
const { monitoresDe } = await import("@/lib/evaluacion/datos");
const { filasEstudiantes } = await import("@/lib/evaluacion/resultados");
const { misProyectos, proyectosVisibles } = await import("@/lib/misProyectos");
const { miCiudad } = await import("@/lib/vistas/miCiudad");
const { asignacionesMonitores } = await import("@/lib/vistas/monitores");
const { cronogramaExcel } = await import("@/lib/seguimiento");
const { monitorEfectivo, vigente } = await import("@/lib/evaluacion/monitorEfectivo");
const rutaAdmin = await import("@/app/api/admin/monitor-proyecto/route");
const rutaSala = await import("@/app/api/evaluacion/salas/[id]/route");
const rutaSalas = await import("@/app/api/evaluacion/salas/route");
const rutaMis = await import("@/app/api/monitor/mis-proyectos/route");

const D = "2026-11-19", CIUDAD = "Ciudad Prueba";
const ids: Record<string, ObjectId> = {};
const P: Record<string, ObjectId> = {};
const A: Record<string, ObjectId> = {};
const sesion = (k: string, usuario: string, rol: SessionUser["rol"], extra: Partial<SessionUser> = {}): SessionUser =>
  ({ id: ids[k]!.toHexString(), usuario, nombre: `Nombre ${k}`, rol, ciudades: [CIUDAD], ...extra });
let kam: SessionUser, bry: SessionUser, otro: SessionUser, admin: SessionUser, coord: SessionUser;

function como(quien: string | null) { estado.token = quien ? createToken(ids[quien]!.toHexString(), 0) : ""; }
const json = (url: string, body: unknown, origin = "http://localhost") =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", host: "localhost", origin }, body: JSON.stringify(body) });
async function admin_(quien: string | null, body: unknown, origin?: string) {
  como(quien);
  const r = await rutaAdmin.POST(json("http://localhost/api/admin/monitor-proyecto", body, origin));
  return { status: r.status, body: await r.json() };
}
const asignar = (proyecto: string, monitor: string, extra: Record<string, unknown> = {}) => admin_("admin", { accion: "asignar", proyectoId: String(P[proyecto]), monitor, ...extra });
const quitar = (proyecto: string) => admin_("admin", { accion: "quitar", proyectoId: String(P[proyecto]) });
async function detalle(quien: string, proyecto: string) {
  como(quien);
  const r = await rutaSala.GET(new Request(`http://localhost/api/evaluacion/salas/${P[proyecto]}`), { params: Promise.resolve({ id: String(P[proyecto]) }) });
  return { status: r.status, body: await r.json() };
}
async function anotar(quien: string, proyecto: string, observacion: string) {
  como(quien);
  const r = await rutaSala.POST(json(`http://localhost/api/evaluacion/salas/${P[proyecto]}`, { accion: "anotar", i: 0, asistencia: "si", motivo: null, observacion }), { params: Promise.resolve({ id: String(P[proyecto]) }) });
  return { status: r.status, body: await r.json() };
}
async function salas(quien: string) {
  como(quien);
  return (await rutaSalas.GET(new Request("http://localhost/api/evaluacion/salas"))).json();
}
async function mis(quien: string) {
  como(quien);
  return (await rutaMis.GET(new Request("http://localhost/api/monitor/mis-proyectos?dia=todos"))).json();
}
async function columnaMonitor(): Promise<Record<string, string>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await cronogramaExcel()) as unknown as ArrayBuffer);
  const out: Record<string, string> = {};
  wb.worksheets[0]!.eachRow((row, n) => { if (n > 1) out[String(row.getCell(9).value)] = String(row.getCell(7).value); });
  return out;
}

/** Todo lo que se ve del monitor en las vistas y exportes (para comparar antes y después). */
async function vistas() {
  const fn = await monitoresDe(await (await db.collections()).asientos.find({ proyectoId: { $type: "objectId" } }).sort({ inicio: 1 }).toArray());
  const asis = await (await db.collections()).asientos.find({ proyectoId: { $type: "objectId" } }).sort({ inicio: 1, mentorId: 1 }).toArray();
  return {
    salasKam: await mon.listaSalas(kam), salasBry: await mon.listaSalas(bry), salasOtro: await mon.listaSalas(otro),
    visKam: await proyectosVisibles(kam), visBry: await proyectosVisibles(bry), misAdmin: await misProyectos(admin, { dia: "todos" }),
    ciudad: await miCiudad(kam), panel: await asignacionesMonitores(D, D), filas: await filasEstudiantes(),
    mentor: asis.map((a) => fn(a)), cronograma: await columnaMonitor(),
  };
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["admin", "coord", "kam", "bry", "otro", "mentor"]) ids[k] = new ObjectId();
  const u = (k: string, usuario: string, rol: string, extra: Record<string, unknown> = {}) =>
    ({ _id: ids[k]!, usuario, nombre: `Nombre ${k}`, rol, ciudades: [CIUDAD], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0, ...extra });
  await c.users.insertMany([
    u("admin", "admin.p", "admin"), u("coord", "coord.p", "coordinador"), u("kam", "kam.p", "monitor", { celular: "+573101112233" }),
    u("bry", "bry.p", "monitor"), u("otro", "otro.p", "monitor"), u("mentor", "mentor.s", "mentor", { mentorId: "m-s" }),
  ] as never);
  kam = sesion("kam", "kam.p", "monitor"); bry = sesion("bry", "bry.p", "monitor"); otro = sesion("otro", "otro.p", "monitor");
  admin = sesion("admin", "admin.p", "admin"); coord = sesion("coord", "coord.p", "coordinador");
  await c.mentores.insertMany([{ _id: "m-s", nombre: "Mentor Santi" }, { _id: "m-x", nombre: "Mentor Equis" }, { _id: "m-y", nombre: "Mentor Ye" }]);
  await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 1, enlace: "https://meet.example.test/sala-1" }, { sala: 3, enlace: "https://meet.example.test/sala-3" }], importados: [], disponibilidad: [], actualizadoEn: now } as never);
  await c.planSalas.insertMany([
    { _id: `${D}|18|1`, dia: D, hora: 18, sala: 1, mentorId: "m-s", monitor: "kam.p", origen: "importado" },
    { _id: `${D}|18|3`, dia: D, hora: 18, sala: 3, mentorId: "m-x", monitor: "otro.p", origen: "importado" },
    { _id: `${D}|19|4`, dia: D, hora: 19, sala: 4, mentorId: "m-y", monitor: null, origen: "importado" },
  ] as never);
  const proyecto = (codigo: string, nombre: string) => {
    P[codigo] = new ObjectId();
    return { _id: P[codigo], codigo, ciudad: CIUDAD, nombre, monitor: "kam.p", creadoEn: now, actualizadoEn: now,
      integrantes: [{ documento: `9900${codigo.replace(/\D/g, "")}1`, nombre: `Estudiante ${codigo}`, celular: "3001234567" }] };
  };
  await c.proyectos.insertMany([proyecto("G1", "Guardianes del mar"), proyecto("V2", "Vivero de bonsai"), proyecto("P3", "Partyeveryday"), proyecto("F4", "FarmaOne"), proyecto("X5", "Proyecto de Otro")]);
  const asiento = (k: string, h: number, m: number, mentorId: string, p: string | null) => {
    A[k] = new ObjectId();
    return { _id: A[k], dia: D, inicio: inicioUTC(D, h, m), mentorId, ciudades: [CIUDAD], proyectoId: p ? P[p]! : null };
  };
  await c.asientos.insertMany([
    asiento("g", 18, 0, "m-s", "G1"), asiento("v", 18, 15, "m-s", "V2"), asiento("p", 18, 30, "m-s", "P3"), asiento("f", 18, 45, "m-s", "F4"),
    asiento("x", 18, 15, "m-x", "X5"), asiento("libre", 19, 0, "m-y", null),
  ]);
});
afterAll(() => db.closeDb());

describe("monitorEfectivo (pura)", () => {
  const p = new ObjectId(), inicio = new Date("2026-11-19T23:15:00Z");
  const e = { proyectoId: p, dia: D, horaInicio: inicio, mentorId: "m-s", monitorId: "bry.p", creadoPor: "admin.p", creadoEn: inicio };
  it("sin excepción: el del bloque (o null)", () => {
    expect(monitorEfectivo({ inicio, mentorId: "m-s", proyectoId: p }, "kam.p", null)).toEqual({ monitor: "kam.p", manual: false });
    expect(monitorEfectivo({ inicio, mentorId: "m-s", proyectoId: p }, null)).toEqual({ monitor: null, manual: false });
  });
  it("con excepción vigente: la excepción; si cambió la hora, el mentor o el proyecto, deja de aplicar", () => {
    expect(monitorEfectivo({ inicio, mentorId: "m-s", proyectoId: p }, "kam.p", e)).toEqual({ monitor: "bry.p", manual: true });
    expect(vigente(e, { inicio: new Date(inicio.getTime() + 900_000), mentorId: "m-s", proyectoId: p })).toBe(false);
    expect(vigente(e, { inicio, mentorId: "m-x", proyectoId: p })).toBe(false);
    expect(vigente(e, { inicio, mentorId: "m-s", proyectoId: new ObjectId() })).toBe(false);
  });
});

let antes: Awaited<ReturnType<typeof vistas>>;

describe("caso real: tres proyectos del bloque pasan a otro monitor", () => {
  it("sin excepción todo es como hoy (Kamelia ve los 4; Bryan nada) y sin campos nuevos", async () => {
    // Kamelia ya había anotado en Vivero antes del cambio.
    expect((await anotar("kam", "V2", "Llegó a tiempo")).status).toBe(200);
    antes = await vistas();
    expect(antes.salasKam.filas.map((f) => f.codigo)).toEqual(["G1", "V2", "P3", "F4"]);
    expect(antes.salasBry).toEqual({ salas: [], filas: [], sugerencias: [] });
    expect(JSON.stringify(antes)).not.toContain("manual");
    for (const c of antes.panel.celdas) for (const p of c.proyectos) expect(Object.keys(p).sort()).toEqual(["minuto", "nombre"]);
  });

  it("el admin asigna a Bryan Vivero, Partyeveryday y FarmaOne (con motivo) y deja changeLog con antes y después", async () => {
    for (const k of ["V2", "P3", "F4"]) expect((await asignar(k, "bry.p", { motivo: "Bryan es su monitor responsable" })).body).toEqual({ ok: true });
    const log = await (await db.collections()).changeLog.find({ accion: "monitor_proyecto", proyectoId: P.V2 }).toArray();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ anterior: "Nombre kam (kam.p) · monitor del bloque", motivo: "Bryan es su monitor responsable", actor: { rol: "admin", usuario: "admin.p" } });
    expect(log[0]!.nuevo).toContain("Nombre bry (bry.p) · asignado a mano");
    // Nada más cambia: reserva, plan de salas y notas.
    const c = await db.collections();
    expect((await c.asientos.findOne({ _id: A.v }))!.proyectoId).toEqual(P.V2);
    expect(await c.planSalas.countDocuments({ monitor: "bry.p" })).toBe(0);
  });

  it("Bryan ve los 3 en Mis proyectos, en su sala real (Sala 1 con su enlace) y con «Asignado a mano»; Kamelia solo Guardianes", async () => {
    const b = await salas("bry");
    expect(b.filas.map((f: { codigo: string; manual?: boolean }) => [f.codigo, f.manual])).toEqual([["V2", true], ["P3", true], ["F4", true]]);
    expect(b.salas.map((s: { hora: number; sala: number; enlace?: string }) => [s.hora, s.sala, s.enlace])).toEqual([[18, 1, "https://meet.example.test/sala-1"]]);
    const mb = await mis("bry");
    expect(mb.proyectos.map((x: { codigo: string; sala: number; enlace: string; manual?: boolean; monitor: { usuario: string } }) => [x.codigo, x.sala, x.enlace, x.manual, x.monitor.usuario]))
      .toEqual(["V2", "P3", "F4"].map((k) => [k, 1, "https://meet.example.test/sala-1", true, "bry.p"]));
    const k = await salas("kam");
    expect(k.filas.map((f: { codigo: string; manual?: boolean }) => [f.codigo, f.manual])).toEqual([["G1", undefined]]);
    expect((await mis("kam")).proyectos.map((x: { codigo: string }) => x.codigo)).toEqual(["G1"]);
  });

  it("Bryan abre el detalle (sala 1, enlace y lo que anotó Kamelia); Kamelia recibe 403 en esos y sigue con Guardianes", async () => {
    const r = await detalle("bry", "V2");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sala: 1, enlace: "https://meet.example.test/sala-1", mentor: "Mentor Santi" });
    expect(r.body.integrantes[0]).toMatchObject({ asistencia: "si", observacion: "Llegó a tiempo" });
    for (const p of ["V2", "P3", "F4"]) expect((await detalle("kam", p)).status).toBe(403);
    expect((await detalle("kam", "G1")).status).toBe(200);
    expect((await detalle("bry", "G1")).status).toBe(403);
  });

  it("vistas y exportes muestran a Bryan en esos 3 y a Kamelia en Guardianes", async () => {
    const v = await vistas();
    expect(v.ciudad && "filas" in v.ciudad ? v.ciudad.filas.map((f) => [f.proyecto, f.monitor]) : null).toEqual([
      ["Guardianes del mar", "Nombre kam"], ["Proyecto de Otro", "Nombre otro"], ["Vivero de bonsai", "Nombre bry"], ["Partyeveryday", "Nombre bry"], ["FarmaOne", "Nombre bry"],
    ]);
    const celda = v.panel.celdas.find((c) => c.sala === 1)!;
    expect(celda.monitor).toBe("kam.p");
    expect(celda.proyectos.map((p) => [p.nombre, p.monitor])).toEqual([["Guardianes del mar", undefined], ["Vivero de bonsai", "bry.p"], ["Partyeveryday", "bry.p"], ["FarmaOne", "bry.p"]]);
    expect(v.panel.monitores.map((m) => m.id).sort()).toEqual(["bry.p", "kam.p", "otro.p"]);
    expect(Object.fromEntries(v.filas.map((f) => [f.codigo, f.monitor]))).toMatchObject({ G1: "Nombre kam", V2: "Nombre bry", P3: "Nombre bry", F4: "Nombre bry", X5: "Nombre otro" });
    expect(v.mentor.map((m) => m?.nombre)).toEqual(["Nombre kam", "Nombre bry", "Nombre otro", "Nombre bry", "Nombre bry"]);
    expect(v.cronograma).toMatchObject({ "Guardianes del mar": "Nombre kam", "Vivero de bonsai": "Nombre bry", "FarmaOne": "Nombre bry" });
    // Coordinación (todos): la fila trae al monitor efectivo.
    expect(v.misAdmin.proyectos.filter((x) => x.monitor?.usuario === "bry.p").map((x) => x.codigo)).toEqual(["V2", "P3", "F4"]);
  });

  it("quitar la excepción vuelve todo exactamente a como estaba", async () => {
    for (const k of ["V2", "P3", "F4"]) expect((await quitar(k)).body).toEqual({ ok: true });
    expect(await vistas()).toEqual(antes);
    expect((await quitar("V2")).status).toBe(409); // ya no hay
    const log = await (await db.collections()).changeLog.find({ accion: "monitor_proyecto", proyectoId: P.F4 }).sort({ fecha: 1 }).toArray();
    expect(log.at(-1)).toMatchObject({ anterior: "Nombre bry (bry.p) · asignado a mano", nuevo: "Nombre kam (kam.p) · monitor del bloque" });
  });

  it("con la excepción, Bryan guarda asistencia y observación; Kamelia no puede (403) y lo de Bryan se conserva", async () => {
    expect((await asignar("P3", "bry.p")).status).toBe(200);
    expect((await anotar("bry", "P3", "Presentó completo")).status).toBe(200);
    expect((await anotar("kam", "P3", "Intento")).status).toBe(403);
    const n = await (await db.collections()).evalMonitor.findOne({ proyectoId: P.P3 });
    expect(n).toMatchObject({ observacion: "Presentó completo", actualizadoPor: "bry.p" });
    expect((await detalle("bry", "P3")).body.integrantes[0].observacion).toBe("Presentó completo");
  });
});

describe("validación por franja de 15 minutos", () => {
  it("error si el monitor ya tiene otro proyecto que empieza a la misma hora en otra sala", async () => {
    const r = await asignar("V2", "otro.p");
    expect(r).toMatchObject({ status: 409, body: { error: "franja" } });
    expect(r.body.mensaje).toContain("Proyecto de Otro");
    expect(await (await db.collections()).monitorExcepciones.countDocuments({ proyectoId: P.V2 })).toBe(0);
  });
  it("si solo tiene otra sala en esa hora: aviso; con confirmar guarda", async () => {
    const r = await asignar("F4", "otro.p");
    expect(r).toMatchObject({ status: 409, body: { error: "aviso" } });
    expect(r.body.mensaje).toContain("Sala 3");
    expect(await (await db.collections()).monitorExcepciones.countDocuments({ proyectoId: P.F4 })).toBe(0);
    expect((await asignar("F4", "otro.p", { confirmar: true })).body).toEqual({ ok: true });
    expect((await quitar("F4")).status).toBe(200);
  });
  it("Bryan con otro proyecto en la misma franja (por excepción) también choca", async () => {
    // P3 (6:30, Sala 1) es de Bryan: X5 (6:15, Sala 3) da aviso por la otra sala; con confirmar se guarda. Luego V2 (6:15) choca.
    expect((await asignar("X5", "bry.p")).body.error).toBe("aviso");
    expect((await asignar("X5", "bry.p", { confirmar: true })).status).toBe(200);
    expect((await asignar("V2", "bry.p")).body.error).toBe("franja");
    expect((await quitar("X5")).status).toBe(200);
  });
  it("monitor del bloque, inexistente o sin hora: error claro", async () => {
    expect((await asignar("G1", "kam.p")).body.error).toBe("igual");
    expect((await asignar("G1", "nadie.p")).body.error).toBe("monitor");
    expect((await asignar("G1", "mentor.s")).body.error).toBe("monitor");
  });
});

describe("reprogramar deja la excepción sin efecto", () => {
  it("si el proyecto cambia de hora, Bryan deja de verlo y no puede escribir; la sala nueva manda", async () => {
    const c = await db.collections();
    // P3 tiene excepción a Bryan. Se mueve a las 7:00 p. m. (Sala 4, sin monitor).
    await c.asientos.updateOne({ _id: A.p }, { $set: { proyectoId: null } });
    await c.asientos.updateOne({ _id: A.libre }, { $set: { proyectoId: P.P3 } });
    expect((await salas("bry")).filas).toEqual([]);
    expect((await detalle("bry", "P3")).status).toBe(403);
    expect((await anotar("bry", "P3", "x")).status).toBe(403);
    const panel = await asignacionesMonitores(D, D);
    expect(panel.celdas.find((x) => x.sala === 4)!.proyectos).toEqual([{ minuto: 0, nombre: "Partyeveryday" }]);
    // El documento queda guardado pero sin efecto; quitarlo lo limpia.
    expect((await quitar("P3")).status).toBe(200);
    const log = await c.changeLog.find({ accion: "monitor_proyecto", proyectoId: P.P3 }).sort({ fecha: 1 }).toArray();
    expect(log.at(-1)!.anterior).toContain("(ya sin efecto)");
    // Se devuelve a su hora para el resto de pruebas.
    await c.asientos.updateOne({ _id: A.libre }, { $set: { proyectoId: null } });
    await c.asientos.updateOne({ _id: A.p }, { $set: { proyectoId: P.P3 } });
  });
});

describe("solo el admin", () => {
  it("coordinación, monitores y mentor: 403; sin sesión: 401 (GET y POST)", async () => {
    for (const q of ["coord", "kam", "bry", "mentor"]) {
      expect((await admin_(q, { accion: "asignar", proyectoId: String(P.V2), monitor: "bry.p" })).status).toBe(403);
      como(q);
      expect((await rutaAdmin.GET(new Request(`http://localhost/api/admin/monitor-proyecto?dia=${D}`))).status).toBe(403);
    }
    expect((await admin_(null, { accion: "quitar", proyectoId: String(P.V2) })).status).toBe(401);
    expect(await (await db.collections()).monitorExcepciones.countDocuments({})).toBe(0);
  });
  it("otro origen: 403; datos de más o inválidos: 400", async () => {
    expect((await admin_("admin", { accion: "asignar", proyectoId: String(P.V2), monitor: "bry.p" }, "https://otro.example")).status).toBe(403);
    expect((await asignar("V2", "bry.p", { extra: 1 })).status).toBe(400);
    expect((await admin_("admin", { accion: "asignar", proyectoId: "no-es-id", monitor: "bry.p" })).status).toBe(400);
    expect((await admin_("admin", { accion: "borrar", proyectoId: String(P.V2) })).status).toBe(400);
    como("admin");
    expect((await rutaAdmin.GET(new Request("http://localhost/api/admin/monitor-proyecto?dia=hoy"))).status).toBe(400);
  });
  it("el admin lee los proyectos del día con su monitor del bloque, su excepción y los monitores activos", async () => {
    expect((await asignar("F4", "bry.p", { motivo: "Prueba" })).status).toBe(200);
    como("admin");
    const r = await (await rutaAdmin.GET(new Request(`http://localhost/api/admin/monitor-proyecto?dia=${D}`))).json();
    expect(r.monitores.map((m: { usuario: string }) => m.usuario)).toEqual(["bry.p", "kam.p", "otro.p"]);
    const f = r.proyectos.find((p: { id: string }) => p.id === String(P.F4));
    expect(f).toMatchObject({ hora: 18, minuto: 45, mentorId: "m-s", bloque: { usuario: "kam.p" }, excepcion: { monitor: { usuario: "bry.p" }, motivo: "Prueba" } });
    expect(JSON.stringify(r)).not.toContain("Estudiante");
    expect((await quitar("F4")).status).toBe(200);
  });
});

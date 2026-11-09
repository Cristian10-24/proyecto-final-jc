import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { Proyecto } from "@/lib/types";

// Fase 4 · Paso 23 · El estudiante edita nombre y descripción contra la base LOCAL: validación, solo esos campos,
// versión (no pisa al admin), evaluado, historial y revertir. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const e = await import("@/lib/edicionEstudiante");
const { consultar } = await import("@/lib/estudiante");
const { historial } = await import("@/lib/admin");
const g = await import("@/lib/gestionProyectos");
const sp = await import("@/lib/sinProyecto");

const ADMIN = { rol: "admin" as const, usuario: "admin.p" };
async function proyecto(codigo: string, docs: string[], extra: Partial<Proyecto> = {}) {
  const c = await db.collections(), now = new Date("2026-10-20T12:00:00Z"), _id = new ObjectId();
  await c.proyectos.insertOne({ _id, codigo, ciudad: "Cali", nombre: `App ${codigo}`, descripcion: "Original", grupo: "G1", monitor: "moni", creadoEn: now, actualizadoEn: now, integrantes: docs.map((d, i) => ({ documento: d, nombre: `Persona ${i + 1}`, celular: "+573000000000" })), ...extra });
  return _id;
}
const version = async (doc: string) => (await consultar(doc))!.edicion!.version;

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
});
afterAll(() => db.closeDb());

describe("texto", () => {
  it("limpia controles, espacios y aplica NFC; rechaza < > y largos", () => {
    expect(e.textoPlano("  Mi\u0000   app\n\tde  éxito‮ ")).toBe("Mi app de éxito");
    expect(e.validarEdicion("ab", "")).toMatchObject({ ok: false, campo: "nombre" });
    expect(e.validarEdicion("x".repeat(121), "")).toMatchObject({ ok: false, campo: "nombre" });
    expect(e.validarEdicion("App válida", "y".repeat(601))).toMatchObject({ ok: false, campo: "descripcion" });
    expect(e.validarEdicion("<script>", "")).toMatchObject({ ok: false, campo: "nombre" });
    expect(e.validarEdicion("Ñandú", "Descripción con tildes, ñ y «comillas»")).toEqual({ nombre: "Ñandú", descripcion: "Descripción con tildes, ñ y «comillas»" });
    expect(e.validarEdicion("x".repeat(120), "y".repeat(600))).not.toHaveProperty("ok");
  });
});

describe("edición desde el portal", () => {
  it("cualquier integrante edita; solo cambian nombre, descripción y actualizadoEn; historial con antes y después", async () => {
    const pid = await proyecto("P-9100000001", ["9100000001", "9100000002"]);
    const c = await db.collections();
    const antes = (await c.proyectos.findOne({ _id: pid }))!;
    expect((await consultar("9100000002"))!.edicion).toMatchObject({ puede: true });
    const r = await e.editarDesdePortal("9100000002", { nombre: "  Tienda  verde ", descripcion: "Vendemos plantas.", version: await version("9100000002") });
    expect(r).toMatchObject({ ok: true, proyecto: { nombre: "Tienda verde", descripcion: "Vendemos plantas." } });
    const despues = (await c.proyectos.findOne({ _id: pid }))!;
    const { nombre, descripcion, actualizadoEn, ...resto } = despues;
    const { nombre: n0, descripcion: d0, actualizadoEn: a0, ...resto0 } = antes;
    expect(resto).toEqual(resto0); // ningún otro campo cambia
    expect([nombre, descripcion]).toEqual(["Tienda verde", "Vendemos plantas."]);
    expect(actualizadoEn.getTime()).toBeGreaterThan(a0.getTime());
    expect([n0, d0]).toEqual(["App P-9100000001", "Original"]);
    const log = (await c.changeLog.findOne({ proyectoId: pid, accion: "editar_proyecto" }))!;
    expect(log).toMatchObject({ actor: { rol: "estudiante", usuario: "•••• 0002" }, cambio: { nombre: ["App P-9100000001", "Tienda verde"], descripcion: ["Original", "Vendemos plantas."] } });
    expect(JSON.stringify(log)).not.toContain("9100000002");
    // Descripción vacía: se quita el campo.
    expect(await e.editarDesdePortal("9100000001", { nombre: "Tienda verde", descripcion: "  ", version: await version("9100000001") })).toMatchObject({ ok: true });
    expect((await c.proyectos.findOne({ _id: pid }))!.descripcion).toBeUndefined();
  });

  it("versión vieja (el admin cambió el proyecto mientras tanto) no pisa nada", async () => {
    const pid = await proyecto("P-9100000003", ["9100000003"]);
    const v = await version("9100000003");
    expect(await g.editarProyecto(pid, { ciudad: "Cali", nombre: "Nombre del admin", monitor: null, integrantes: [{ nombre: "Persona 1", documento: "9100000003", celular: "+573000000000" }] }, {}, ADMIN)).toMatchObject({ ok: true });
    expect(await e.editarDesdePortal("9100000003", { nombre: "Del estudiante", descripcion: "", version: v })).toMatchObject({ ok: false, error: "cambio" });
    expect((await (await db.collections()).proyectos.findOne({ _id: pid }))!.nombre).toBe("Nombre del admin");
  });

  it("dos ediciones a la vez con la misma versión: solo una se guarda", async () => {
    await proyecto("P-9100000004", ["9100000004", "9100000005"]);
    const v = await version("9100000004");
    const rs = await Promise.all([
      e.editarDesdePortal("9100000004", { nombre: "Uno", descripcion: "", version: v }),
      e.editarDesdePortal("9100000005", { nombre: "Dos", descripcion: "", version: v }),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it("con evaluación guardada no se edita; marcado o sin proyecto tampoco", async () => {
    const pid = await proyecto("P-9100000006", ["9100000006"]);
    const c = await db.collections();
    await c.evalResultados.insertOne({ _id: `${pid.toHexString()}|9100000006`, proyectoId: pid, documento: "9100000006", noPresento: false } as never);
    expect((await consultar("9100000006"))!.edicion).toMatchObject({ puede: false });
    expect(await e.editarDesdePortal("9100000006", { nombre: "Nuevo", descripcion: "", version: await version("9100000006") })).toMatchObject({ ok: false, error: "evaluado" });
    const marcado = await proyecto("P-9100000007", ["9100000007"]);
    const v = await version("9100000007");
    await sp.marcarSinProyecto(marcado, "", ADMIN);
    expect(await e.editarDesdePortal("9100000007", { nombre: "Nuevo", descripcion: "", version: v })).toMatchObject({ ok: false, error: "no_inscrito" });
    expect(await e.editarDesdePortal("9199999999", { nombre: "Nuevo", descripcion: "", version: v })).toMatchObject({ ok: false, error: "sin_proyecto" });
  });
});

describe("revertir (admin)", () => {
  it("vuelve al antes si nadie lo cambió después; queda en el historial; luego ya no es revertible", async () => {
    const pid = await proyecto("P-9100000008", ["9100000008"]);
    await e.editarDesdePortal("9100000008", { nombre: "Cambio raro", descripcion: "Texto raro", version: await version("9100000008") });
    let h = await historial(pid);
    const entrada = h.find((x) => x.accion === "editar_proyecto")!;
    expect(entrada).toMatchObject({ revertible: true });
    expect(await e.revertirEdicion(pid, new ObjectId(entrada.id), ADMIN)).toMatchObject({ ok: true });
    const p = (await (await db.collections()).proyectos.findOne({ _id: pid }))!;
    expect([p.nombre, p.descripcion]).toEqual(["App P-9100000008", "Original"]);
    h = await historial(pid);
    expect(h[0]).toMatchObject({ accion: "editar_proyecto", motivo: "Revertido el cambio del estudiante", actor: { usuario: "admin.p" } });
    expect(h.some((x) => x.revertible)).toBe(false);
    expect(await e.revertirEdicion(pid, new ObjectId(entrada.id), ADMIN)).toMatchObject({ ok: false, error: "cambio" });
  });

  it("si el nombre cambió después, no se revierte; una entrada que no es del estudiante tampoco", async () => {
    const pid = await proyecto("P-9100000009", ["9100000009"]);
    await e.editarDesdePortal("9100000009", { nombre: "Primero", descripcion: "", version: await version("9100000009") });
    await e.editarDesdePortal("9100000009", { nombre: "Segundo", descripcion: "", version: await version("9100000009") });
    const h = await historial(pid);
    const viejo = h.filter((x) => x.accion === "editar_proyecto").at(-1)!;
    expect(viejo.revertible).toBeUndefined();
    expect(await e.revertirEdicion(pid, new ObjectId(viejo.id), ADMIN)).toMatchObject({ ok: false, error: "cambio" });
    const otro = await (await db.collections()).changeLog.insertOne({ proyectoId: pid, accion: "editar_proyecto", actor: ADMIN, fecha: new Date() });
    expect(await e.revertirEdicion(pid, otro.insertedId, ADMIN)).toMatchObject({ ok: false, error: "no_existe" });
    expect(await e.revertirEdicion(new ObjectId(), otro.insertedId, ADMIN)).toMatchObject({ ok: false, error: "no_existe" });
  });
});

describe("correcciones del revisor de seguridad", () => {
  it("rellenos invisibles no cuentan como nombre", () => {
    expect(e.validarEdicion("\u3164\u3164\u3164", "")).toMatchObject({ ok: false, campo: "nombre" });
    expect(e.textoPlano("a\u00adb\u2060c")).toBe("a b c");
  });

  it("A→B, B→C, C→B: solo la última entrada es revertible", async () => {
    const pid = await proyecto("P-9100000030", ["9100000030"]);
    for (const n of ["Nombre B", "Nombre C", "Nombre B"]) await e.editarDesdePortal("9100000030", { nombre: n, descripcion: "", version: await version("9100000030") });
    const h = (await historial(pid)).filter((x) => x.accion === "editar_proyecto");
    expect(h.map((x) => !!x.revertible)).toEqual([true, false, false]);
    expect(await e.revertirEdicion(pid, new ObjectId(h[2]!.id), ADMIN)).toMatchObject({ ok: false, error: "cambio" });
    expect(await e.revertirEdicion(pid, new ObjectId(h[0]!.id), ADMIN)).toMatchObject({ ok: true });
    expect((await (await db.collections()).proyectos.findOne({ _id: pid }))!.nombre).toBe("Nombre C");
  });

  it("si se evalúa en el mismo instante, el cambio se deshace", async () => {
    const pid = await proyecto("P-9100000031", ["9100000031"]);
    const c = await db.collections();
    const v = await version("9100000031");
    const [r] = await Promise.all([
      e.editarDesdePortal("9100000031", { nombre: "Cambio a la vez", descripcion: "", version: v }),
      c.evalResultados.insertOne({ _id: `${pid.toHexString()}|9100000031`, proyectoId: pid, documento: "9100000031", noPresento: false } as never),
    ]);
    const p = (await c.proyectos.findOne({ _id: pid }))!;
    // Evaluado: el nombre queda el original (o el cambio se rechazó antes de escribir).
    expect(p.nombre).toBe("App P-9100000031");
    expect(r).toMatchObject({ ok: false, error: "evaluado" });
  });

  it("el importador avisa si reemplaza un nombre que cambió el estudiante", async () => {
    const { leerLibroProyectos } = await import("@/lib/importar/proyectos");
    const { previaProyectos } = await import("@/lib/importar/aplicar");
    const { libro } = await import("./helpers/libros");
    await proyecto("P-9100000032", ["9100000032"]);
    await e.editarDesdePortal("9100000032", { nombre: "Nombre del estudiante", descripcion: "", version: await version("9100000032") });
    const enc = ["Ciudad", "Nombre del proyecto", "Nombre 1", "Documento 1"];
    const previa = await previaProyectos(leerLibroProyectos(libro({ Proyectos: [enc, ["Cali", "Nombre del Excel", "Persona Uno", "9100000032"]] })));
    expect(previa.avisos.map((x) => x.mensaje).join(" ")).toMatch(/el estudiante cambió el nombre/);
  });
});

describe("ruta POST /api/estudiante/editar", () => {
  const ruta = () => import("@/app/api/estudiante/editar/route");
  const llamar = async (body: unknown, ip = "10.3.0.1", origin = "http://localhost") => (await ruta()).POST(new Request("http://localhost/api/estudiante/editar", {
    method: "POST", headers: { "content-type": "application/json", host: "localhost", origin, "x-real-ip": ip }, body: JSON.stringify(body),
  }));

  it("otro origen 403; cuerpo inválido o con campos de más 400; documento inexistente 404 (fallo de la IP)", async () => {
    await proyecto("P-9100000020", ["9100000020"]);
    const v = await version("9100000020");
    expect((await llamar({ documento: "9100000020", nombre: "App", descripcion: "", version: v }, "10.3.0.1", "https://otro.example")).status).toBe(403);
    expect((await llamar({ documento: "9100000020", nombre: "App", descripcion: "", version: v, ciudad: "Lima" })).status).toBe(400);
    expect((await llamar({ documento: "9100000020", nombre: "App", descripcion: "", version: "ayer" })).status).toBe(400);
    expect((await llamar({ documento: "9100000020", nombre: "x".repeat(401), descripcion: "", version: v })).status).toBe(400);
    expect((await llamar({ documento: "9199999998", nombre: "App nueva", descripcion: "", version: v }, "10.3.0.9")).status).toBe(404);
    const c = await db.collections();
    expect((await c.rateLimits.findOne({ _id: { $regex: "^ip:10.3.0.9:" } }))?.count).toBe(1);
    const ok = await llamar({ documento: "9100000020", nombre: "App nueva", descripcion: "", version: v });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, proyecto: { nombre: "App nueva" } });
    expect((await llamar({ documento: "9100000020", nombre: "ab", descripcion: "", version: v })).status).toBe(400);
  });

  it("cuenta para el límite por documento", async () => {
    await proyecto("P-9100000021", ["9100000021"]);
    const v = await version("9100000021");
    const r = await Promise.all(Array.from({ length: 20 }, (_, i) => llamar({ documento: "9100000021", nombre: `App ${i}`, descripcion: "", version: v }, `10.4.0.${i}`)));
    expect(r.filter((x) => x.status === 429).length).toBeGreaterThanOrEqual(5);
  });
});

describe("casos del revisor de pruebas", () => {
  const ruta = () => import("@/app/api/estudiante/editar/route");
  const llamar = async (body: unknown, ip = "10.5.0.1") => (await ruta()).POST(new Request("http://localhost/api/estudiante/editar", {
    method: "POST", headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost", "x-real-ip": ip }, body: JSON.stringify(body),
  }));

  it("la ruta responde 409 evaluado, 409 versión vieja, 403 no inscrito y 400 con el campo", async () => {
    const c = await db.collections();
    const ev = await proyecto("P-9100000040", ["9100000040"]);
    const v = await version("9100000040");
    await c.evalResultados.insertOne({ _id: `${ev.toHexString()}|9100000040`, proyectoId: ev, documento: "9100000040", noPresento: false } as never);
    expect((await llamar({ documento: "9100000040", nombre: "Otro", descripcion: "", version: v })).status).toBe(409);
    await proyecto("P-9100000041", ["9100000041"]);
    expect((await llamar({ documento: "9100000041", nombre: "Otro", descripcion: "", version: new Date(0).toISOString() })).status).toBe(409);
    await sp.agregarParticipante({ nombre: "Sin Proyecto Uno", documento: "9100000042", ciudad: "Cali" }, ADMIN);
    expect((await llamar({ documento: "9100000042", nombre: "Otro", descripcion: "", version: v })).status).toBe(403);
    const r = await llamar({ documento: "9100000041", nombre: "ab", descripcion: "", version: await version("9100000041") });
    expect([r.status, (await r.json()).campo]).toEqual([400, "nombre"]);
  });

  it("guardar sin cambios no escribe ni deja historial; «No se presentó» no bloquea", async () => {
    const pid = await proyecto("P-9100000043", ["9100000043"]);
    const c = await db.collections();
    await c.evalResultados.insertOne({ _id: `${pid.toHexString()}|9100000043`, proyectoId: pid, documento: "9100000043", noPresento: true } as never);
    const v = await version("9100000043");
    expect((await consultar("9100000043"))!.edicion!.puede).toBe(true);
    expect(await e.editarDesdePortal("9100000043", { nombre: "App P-9100000043", descripcion: "Original", version: v })).toMatchObject({ ok: true, version: v });
    expect(await c.changeLog.countDocuments({ proyectoId: pid })).toBe(0);
    expect((await c.proyectos.findOne({ _id: pid }))!.actualizadoEn.toISOString()).toBe(v);
  });

  it("revertir a un «antes» sin descripción quita el campo; revertible solo en ediciones del estudiante", async () => {
    const pid = await proyecto("P-9100000044", ["9100000044"], { descripcion: undefined });
    const c = await db.collections();
    await c.proyectos.updateOne({ _id: pid }, { $unset: { descripcion: "" } });
    await e.editarDesdePortal("9100000044", { nombre: "Con texto", descripcion: "Nueva", version: await version("9100000044") });
    const h = await historial(pid);
    expect(await e.revertirEdicion(pid, new ObjectId(h[0]!.id), ADMIN)).toMatchObject({ ok: true });
    expect((await c.proyectos.findOne({ _id: pid }))!).not.toHaveProperty("descripcion");
    expect((await historial(pid)).filter((x) => x.revertible)).toEqual([]);
  });

  it("el importador no avisa si el Excel trae lo mismo, ni si solo lo editó el admin", async () => {
    const { leerLibroProyectos } = await import("@/lib/importar/proyectos");
    const { previaProyectos } = await import("@/lib/importar/aplicar");
    const { libro } = await import("./helpers/libros");
    await proyecto("P-9100000045", ["9100000045"]);
    await e.editarDesdePortal("9100000045", { nombre: "Igual", descripcion: "", version: await version("9100000045") });
    const enc = ["Ciudad", "Nombre del proyecto", "Nombre 1", "Documento 1"];
    let previa = await previaProyectos(leerLibroProyectos(libro({ Proyectos: [enc, ["Cali", "Igual", "Persona Uno", "9100000045"]] })));
    expect(previa.avisos.some((x) => /estudiante/.test(x.mensaje))).toBe(false);
    await proyecto("P-9100000046", ["9100000046"]);
    previa = await previaProyectos(leerLibroProyectos(libro({ Proyectos: [enc, ["Cali", "Distinto", "Persona Uno", "9100000046"]] })));
    expect(previa.avisos.some((x) => /estudiante/.test(x.mensaje))).toBe(false);
  });

  it("el cronograma escribe un nombre que parece fórmula como texto", async () => {
    const pid = await proyecto("P-9100000047", ["9100000047"]);
    const c = await db.collections();
    await c.asientos.insertOne({ _id: new ObjectId(), dia: "2026-11-12", inicio: new Date("2026-11-12T13:00:00Z"), mentorId: "m1", ciudades: ["Cali"], proyectoId: pid });
    await e.editarDesdePortal("9100000047", { nombre: "=HYPERLINK(\"x\")", descripcion: "", version: await version("9100000047") });
    const { cronogramaExcel } = await import("@/lib/seguimiento");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await cronogramaExcel()) as unknown as ArrayBuffer);
    const celdas = wb.worksheets.flatMap((ws) => ws.getSheetValues().flat().map(String));
    expect(celdas).toContain("'=HYPERLINK(\"x\")");
  });
});

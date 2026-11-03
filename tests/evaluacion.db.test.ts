import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { SessionUser } from "@/lib/auth";
import type { Formulario, PartesA } from "@/lib/evaluacion/criterios";

// Evaluación contra la base LOCAL: dueño del proyecto, pareja, "No se presentó", borrador, changeLog y
// 7 mentores guardando a la vez. Datos INVENTADOS.

usarBaseLocal(10);
const db = await import("@/lib/db");
const ev = await import("@/lib/evaluacion/datos");

const DIA = "2026-11-12";
const mentor = (n: number): SessionUser => ({ id: new ObjectId().toHexString(), usuario: `mentor.${n}`, nombre: `Mentor Prueba ${n}`, rol: "mentor", ciudades: [], mentorId: `mentor-prueba-${n}` });
const admin: SessionUser = { id: new ObjectId().toHexString(), usuario: "admin.prueba", nombre: "Admin Prueba", rol: "admin", ciudades: [] };
const coord: SessionUser = { ...admin, usuario: "coord.prueba", rol: "coordinador" };
const monitor: SessionUser = { ...admin, usuario: "mon.prueba", rol: "monitor", ciudades: ["Cali"] };
const m1 = mentor(1), m2 = mentor(2);

const A_SI: PartesA = { a1: "si", a2: "si", a3: "si", a4: "si", a5: "si", a6: "si", a7: "si" };
const form = (f: Partial<Formulario> & { b: Formulario["b"] }): Formulario => ({ a: A_SI, destacado: false, fortaleza: "Muy bien", mejora: "Probar más", percepcion: "", ...f });

/** Proyecto con hora: mentor n, a las 8 + k/4 (bloques de 15 min). */
const ids: Record<string, string> = {};
async function proyecto(codigo: string, mentorN: number, bloque: number, nombres: string[]) {
  const c = await db.collections();
  const _id = new ObjectId(), now = new Date();
  await c.proyectos.insertOne({
    _id, codigo, ciudad: "Cali", nombre: `App ${codigo}`, ruta: "Básica", creadoEn: now, actualizadoEn: now,
    integrantes: nombres.map((nombre, i) => ({ nombre, documento: `${codigo.charCodeAt(0)}${codigo.replace(/\D/g, "")}00${i}` })),
  });
  const inicio = new Date(Date.UTC(2026, 10, 12, 13, bloque * 15)); // 8 am COL
  await c.asientos.insertOne({ _id: new ObjectId(), dia: DIA, inicio, mentorId: `mentor-prueba-${mentorN}`, ciudades: ["Cali"], proyectoId: _id });
  ids[codigo] = _id.toHexString();
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  await proyecto("C1", 1, 0, ["Ana Prueba"]);
  await proyecto("C2", 1, 1, ["Luis Prueba", "Sara Prueba"]);
  await proyecto("C3", 2, 0, ["Juan Prueba"]);
  for (let n = 1; n <= 7; n++) await proyecto(`L${n}`, n, 3, [`Carga ${n}`]);
});
afterAll(() => db.closeDb());

describe("quién ve y quién evalúa", () => {
  it("el mentor ve solo sus proyectos, ordenados por hora; coordinación y admin ven todos; el monitor, ninguno", async () => {
    expect((await ev.listaEvaluaciones(m1, { dia: DIA })).map((f) => f.codigo)).toEqual(["C1", "C2", "L1"]);
    expect((await ev.listaEvaluaciones(m1, { mentor: "mentor-prueba-2" })).map((f) => f.codigo)).toEqual(["C1", "C2", "L1"]); // ignora el filtro
    expect((await ev.listaEvaluaciones(coord, { mentor: "mentor-prueba-2" })).map((f) => f.codigo)).toEqual(["C3", "L2"]);
    expect(await ev.listaEvaluaciones(admin)).toHaveLength(10);
    expect(await ev.listaEvaluaciones(monitor)).toEqual([]);
    expect(await ev.listaEvaluaciones({ ...m1, mentorId: undefined })).toEqual([]);
  });

  it("un mentor no abre ni califica el proyecto de otro; coordinación solo lee", async () => {
    expect(await ev.detalleEvaluacion(m1, ids.C3!)).toEqual({ error: "otro_mentor" });
    expect(await ev.guardarEvaluacion(m1, ids.C3!, form({ b: [{ b1: 4, b2: 4 }] }))).toEqual({ error: "otro_mentor" });
    expect(await ev.marcarAsistencia(m1, ids.C3!, 0, true)).toEqual({ error: "otro_mentor" });
    expect(await ev.guardarBorrador(m1, ids.C3!, { a: { a1: "si" } })).toEqual({ error: "otro_mentor" });
    expect(await ev.detalleEvaluacion(coord, ids.C3!)).toMatchObject({ editable: false, proyecto: "App C3" });
    expect(await ev.guardarEvaluacion(coord, ids.C3!, form({ b: [{ b1: 4, b2: 4 }] }))).toEqual({ error: "solo_lectura" });
    expect(await ev.detalleEvaluacion(m1, new ObjectId().toHexString())).toEqual({ error: "no_existe" });
    expect(await ev.detalleEvaluacion(m1, "no-es-un-id")).toEqual({ error: "no_existe" });
  });

  it("el detalle no muestra el documento completo", async () => {
    const d = await ev.detalleEvaluacion(m1, ids.C1!);
    expect("error" in d ? null : d.integrantes[0]!.documento).toBe("•••• 1000");
  });
});

describe("guardar", () => {
  it("exige A completa y 2 temas de B; no escribe nada si falta", async () => {
    const r = await ev.guardarEvaluacion(m1, ids.C1!, form({ a: { a1: "si" }, b: [{ b1: 3 }] }));
    expect(r).toEqual({ error: "faltan", faltan: ["• Parte A: 6 puntos sin marcar.", "• Parte B: solo 1 tema calificado (mínimo 2)."] });
    expect(await ev.guardarEvaluacion(m1, ids.C1!, form({ b: [{ b1: 3, b2: 3 }, {}] }))).toEqual({ error: "integrantes" });
    expect(await (await db.collections()).evalResultados.countDocuments()).toBe(0);
  });

  it("guarda, calcula el resultado y deja changeLog", async () => {
    const r = await ev.guardarEvaluacion(m1, ids.C1!, form({ b: [{ b1: 3, b2: 4 }], destacado: true }));
    expect(r).toMatchObject({ ok: true, resultados: [{ nombre: "Ana Prueba", res: "Excelente", a: 1, b: 3.5, nb: 2 }] });
    const log = await (await db.collections()).changeLog.findOne({ accion: "evaluar", proyectoId: new ObjectId(ids.C1!) });
    expect(log).toMatchObject({ nuevo: "Ana: Excelente · destacado", actor: { rol: "mentor", usuario: "mentor.1" } });
    expect((await ev.listaEvaluaciones(m1)).find((f) => f.codigo === "C1")).toMatchObject({ destacado: true, integrantes: [{ res: "Excelente" }] });
  });

  it("los criterios editados cambian el resultado mostrado", async () => {
    await (await db.collections()).evalConfig.insertOne({ _id: "criterios", exA: 1, exB: 4, actualizadoEn: new Date() });
    expect((await ev.listaEvaluaciones(m1)).find((f) => f.codigo === "C1")!.integrantes[0]!.res).toBe("Aprobado");
    await (await db.collections()).evalConfig.deleteMany({});
  });
});

describe("pareja y No se presentó", () => {
  it("No se presentó: borra su B, el otro sigue Pendiente, y queda en changeLog", async () => {
    const r = await ev.marcarAsistencia(m1, ids.C2!, 1, true);
    expect(r).toMatchObject({ ok: true, resultados: [{ nombre: "Luis Prueba", res: "Pendiente" }, { nombre: "Sara Prueba", res: "No se presentó" }] });
    expect(await (await db.collections()).changeLog.countDocuments({ accion: "no_presento", nuevo: "Sara Prueba" })).toBe(1);
  });

  it("al guardar, quien no se presentó y no tiene B sigue así; A y cierre se copian a la pareja", async () => {
    const r = await ev.guardarEvaluacion(m1, ids.C2!, form({ a: { ...A_SI, a7: "no" }, b: [{ b1: 2, b2: 3 }, {}] }));
    expect(r).toMatchObject({ ok: true, resultados: [{ res: "Aprobado" }, { res: "No se presentó" }] });
    const d = await ev.detalleEvaluacion(m1, ids.C2!);
    expect("error" in d ? null : d.guardado).toMatchObject({ a: { a7: "no" }, b: [{ b1: 2, b2: 3 }, {}], fortaleza: "Muy bien" });
    expect("error" in d ? null : d.integrantes.map((x) => x.noPresento)).toEqual([false, true]);
  });

  it("si todos los de la pareja están como No se presentó y no hay B, no hay nada que guardar", async () => {
    await ev.marcarAsistencia(m1, ids.C2!, 0, true);
    expect(await ev.guardarEvaluacion(m1, ids.C2!, form({ b: [{}, {}] }))).toEqual({ error: "todos_no_presento" });
  });

  it("Deshacer: vuelve a poder calificarse, conserva A y queda Incompleto hasta calificar B", async () => {
    const r = await ev.marcarAsistencia(m1, ids.C2!, 0, false);
    expect(r).toMatchObject({ ok: true, resultados: [{ res: "Incompleto" }, { res: "No se presentó" }] });
    expect(await (await db.collections()).changeLog.countDocuments({ accion: "presente" })).toBe(1);
  });

  it("calificar la B de quien estaba como No se presentó lo marca presente", async () => {
    const r = await ev.guardarEvaluacion(m1, ids.C2!, form({ b: [{ b1: 4, b2: 4 }, { b3: 3, b4: 3 }] }));
    expect(r).toMatchObject({ ok: true, resultados: [{ res: "Excelente" }, { res: "Excelente" }] });
  });
});

describe("borrador", () => {
  it("no cuenta para el resultado, se recupera si es más nuevo y se borra al guardar", async () => {
    expect(await ev.guardarBorrador(m2, ids.C3!, { a: { a1: "parcial" }, fortaleza: "a medias" })).toEqual({ ok: true });
    expect((await ev.listaEvaluaciones(m2)).find((f) => f.codigo === "C3")).toMatchObject({ borrador: true, integrantes: [{ res: "Pendiente" }] });
    const d = await ev.detalleEvaluacion(m2, ids.C3!);
    expect("error" in d ? null : d.borrador).toEqual({ a: { a1: "parcial" }, fortaleza: "a medias" });
    expect("error" in (await ev.detalleEvaluacion(admin, ids.C3!)) ? null : ((await ev.detalleEvaluacion(admin, ids.C3!)) as { borrador: unknown }).borrador).toBeNull();

    await ev.guardarEvaluacion(m2, ids.C3!, form({ b: [{ b1: 1, b2: 1 }] }));
    const c = await db.collections();
    expect(await c.evalBorradores.countDocuments({ _id: ids.C3! })).toBe(0);
    expect(await ev.guardarBorrador(m2, ids.C3!, { b: [{}, {}] })).toEqual({ error: "integrantes" });
  });
});

describe("carga", () => {
  it("7 mentores guardando a la vez (borrador y evaluación)", async () => {
    const mentores = Array.from({ length: 7 }, (_, i) => mentor(i + 1));
    const r = await Promise.all(mentores.flatMap((m, i) => [
      ev.guardarBorrador(m, ids[`L${i + 1}`]!, { a: { a1: "si" } }),
      ev.guardarEvaluacion(m, ids[`L${i + 1}`]!, form({ b: [{ b1: 3, b2: 3 }] })),
    ]));
    expect(r.every((x) => "ok" in x)).toBe(true);
    const c = await db.collections();
    expect(await c.changeLog.countDocuments({ accion: "evaluar", proyectoId: { $in: mentores.map((_, i) => new ObjectId(ids[`L${i + 1}`]!)) } })).toBe(7);
    for (let n = 1; n <= 7; n++) expect((await ev.listaEvaluaciones(mentor(n))).find((f) => f.codigo === `L${n}`)!.integrantes[0]!.res).toBe("Excelente");
  });
});

describe("usuarios mentor", () => {
  it("el mentor debe existir en Horarios y no puede tenerlo otro usuario", async () => {
    const { errorMentor } = await import("@/lib/usuarios");
    const c = await db.collections();
    expect(await errorMentor("mentor-prueba-1")).toBeNull(); // sin Horarios importado no se puede comprobar
    await c.mentores.insertOne({ _id: "mentor-prueba-1", nombre: "Mentor Prueba 1" });
    expect(await errorMentor("mentor-inventado")).toContain("hoja Horarios");
    expect(await errorMentor("mentr-prueba-1", undefined, "Mentr Prueba 1")).toBe("No hay un mentor \"Mentr Prueba 1\" en la hoja Horarios. ¿Quisiste decir \"Mentor Prueba 1\"? Escríbelo igual que allí.");
    const _id = new ObjectId();
    await c.users.insertOne({ _id, usuario: "mentor.1", nombre: "Mentor Prueba 1", passwordHash: "x", rol: "mentor", ciudades: [], mentorId: "mentor-prueba-1", activo: true, creadoEn: new Date() });
    expect(await errorMentor("mentor-prueba-1")).toBe("Ya hay un usuario para ese mentor.");
    expect(await errorMentor("mentor-prueba-1", _id)).toBeNull(); // el mismo usuario al editarse
    await expect(c.users.insertOne({ _id: new ObjectId(), usuario: "mentor.dos", nombre: "mentor prueba 1", passwordHash: "x", rol: "mentor", ciudades: [], mentorId: "mentor-prueba-1", activo: true, creadoEn: new Date() }))
      .rejects.toThrow("E11000"); // índice único
  });

  it("si el proyecto pasó a otro mentor, el anterior ya no puede guardar", async () => {
    const c = await db.collections();
    await c.asientos.updateOne({ proyectoId: new ObjectId(ids.C1!) }, { $set: { mentorId: "mentor-prueba-3" } });
    expect(await ev.guardarEvaluacion(m1, ids.C1!, form({ b: [{ b1: 4, b2: 4 }] }))).toEqual({ error: "otro_mentor" });
    expect(await ev.detalleEvaluacion(mentor(3), ids.C1!)).toMatchObject({ editable: true, guardado: { destacado: true } }); // el nuevo mentor ve lo calificado
  });
});

describe("sala y enlace", () => {
  it("cada proyecto lleva la sala de su mentor en esa hora; solo enlaces https", async () => {
    const c = await db.collections();
    await c.salasConfig.replaceOne({ _id: "actual" }, { salas: [{ sala: 1, enlace: "https://meet.ejemplo.org/1" }, { sala: 2, enlace: "javascript:alert(1)" }], importados: [], disponibilidad: [], actualizadoEn: new Date() }, { upsert: true });
    await c.planSalas.insertMany([
      { _id: `${DIA}|8|1`, dia: DIA, hora: 8, sala: 1, mentorId: "mentor-prueba-1", monitor: null, origen: null },
      { _id: `${DIA}|8|2`, dia: DIA, hora: 8, sala: 2, mentorId: "mentor-prueba-2", monitor: null, origen: null },
    ]);
    const lista = await ev.listaEvaluaciones(admin, { dia: DIA });
    expect(lista.find((f) => f.codigo === "C2")).toMatchObject({ sala: 1, enlace: "https://meet.ejemplo.org/1" });
    const c3 = lista.find((f) => f.codigo === "C3")!;
    expect([c3.sala, c3.enlace]).toEqual([2, undefined]);
    expect(lista.find((f) => f.codigo === "L4")!.sala).toBeUndefined(); // 8:45, sin plan para mentor 4
    const d = await ev.detalleEvaluacion(mentor(1), ids.L1!);
    expect("error" in d ? null : d.sala).toBe(1);
    expect(await ev.mentoresConProyectos()).toEqual([{ id: "mentor-prueba-1", nombre: "Mentor Prueba 1" }]); // solo los que están en Horarios
  });
});

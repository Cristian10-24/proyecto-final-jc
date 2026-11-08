import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { libro } from "./helpers/libros";
import type { CupoCiudad, Proyecto } from "@/lib/types";

// Fase 4 · Paso 21 · «Sin proyecto» contra la base LOCAL: participantes (uno por uno y Excel), convertir, un documento
// nunca a la vez en un proyecto y aquí, marcar/quitar marca, portal, estadísticas y carreras. Datos INVENTADOS.

usarBaseLocal(10);
const db = await import("@/lib/db");
const sp = await import("@/lib/sinProyecto");
const g = await import("@/lib/gestionProyectos");
const { reservar } = await import("@/lib/reservas");
const { consultar, agenda } = await import("@/lib/estudiante");
const { inicioUTC } = await import("@/lib/edicion");
const { cambiarHora, listarProyectos } = await import("@/lib/admin");
const { resumen, seguimiento: seguimientoInscripcion } = await import("@/lib/seguimiento");
const { seguimiento: seguimientoEval, filasEstudiantes } = await import("@/lib/evaluacion/resultados");
const { leerLibroProyectos } = await import("@/lib/importar/proyectos");
const { previaProyectos } = await import("@/lib/importar/aplicar");
const { datosTablero } = await import("@/lib/tableroHorarios");

const D = "2026-11-12";
const AHORA = new Date("2026-11-01T12:00:00Z");
const ADMIN = { rol: "admin" as const, usuario: "admin.p" };
const COORD = { rol: "coordinador" as const, ciudades: [] as string[] };
const cupo = (ciudad: string, cupos: number | null, sobrante = false): CupoCiudad => ({ ciudad, cupos, max: null, sobrante, abre: null });
const H = (h: number, m = 0) => inicioUTC(D, h, m);

async function proyecto(codigo: string, ciudad: string, docs: string[], extra: Partial<Proyecto> = {}) {
  const c = await db.collections(), now = new Date("2026-10-20T12:00:00Z"), _id = new ObjectId();
  await c.proyectos.insertOne({ _id, codigo, ciudad, nombre: `App ${codigo}`, monitor: null, creadoEn: now, actualizadoEn: now, integrantes: docs.map((d, i) => ({ documento: d, nombre: `Persona ${codigo} ${i + 1}` })), ...extra });
  return _id;
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.dias.insertOne({ _id: D, ciudades: [cupo("Cali", null, true), cupo("Cartagena", null, true)] });
  await c.asientos.insertMany(Array.from({ length: 40 }, (_, i) => ({ _id: new ObjectId(), dia: D, inicio: H(8 + Math.floor(i / 8), (i % 4) * 15), mentorId: `m${i % 8}`, ciudades: ["Cali", "Cartagena"], proyectoId: null })));
  await c.users.insertOne({ _id: new ObjectId(), usuario: "moni.cali", nombre: "Moni Cali", passwordHash: "x", rol: "monitor", ciudades: ["Cali"], activo: true, creadoEn: new Date() });
});
afterAll(() => db.closeDb());

describe("participantes sin proyecto", () => {
  it("agregar uno: valida, asigna el monitor de la ciudad y deja historial", async () => {
    expect(await sp.agregarParticipante({ nombre: "ana", documento: "1.234.567", ciudad: "Cali" }, ADMIN)).toMatchObject({ ok: false, campo: "documento" });
    expect(await sp.agregarParticipante({ nombre: "Ana", documento: "7100000001", ciudad: "Lima" }, ADMIN)).toMatchObject({ ok: false, campo: "ciudad" });
    expect(await sp.agregarParticipante({ nombre: "Ana", documento: "7100000001", ciudad: "Cali", celular: "12" }, ADMIN)).toMatchObject({ ok: false, campo: "celular" });
    const r = await sp.agregarParticipante({ nombre: "ana maría lópez", documento: "7100000001", ciudad: "Cali", celular: "3001234567" }, ADMIN);
    expect(r).toMatchObject({ ok: true });
    const c = await db.collections();
    expect(await c.sinProyecto.findOne({ documento: "7100000001" })).toMatchObject({ nombre: "Ana María López", ciudad: "Cali", celular: "+573001234567", monitor: "moni.cali", creadoPor: "admin.p" });
    expect(await c.changeLog.findOne({ accion: "sin_proyecto", proyectoId: { $exists: false } })).toBeTruthy();
    // Repetido y documento que ya está en un proyecto.
    expect(await sp.agregarParticipante({ nombre: "Otra", documento: "7100000001", ciudad: "Cali" }, ADMIN)).toMatchObject({ ok: false, error: "repetido" });
    await proyecto("P-7100000099", "Cali", ["7100000099"]);
    expect(await sp.agregarParticipante({ nombre: "Otra", documento: "7100000099", ciudad: "Cali" }, ADMIN)).toMatchObject({ ok: false, error: "en_proyecto" });
    expect(await c.sinProyecto.countDocuments({ documento: "7100000099" })).toBe(0);
  });

  it("un documento en «Sin proyecto» no entra a un proyecto por crear, editar, agregar integrante ni importar", async () => {
    await sp.agregarParticipante({ nombre: "Bea Ruiz", documento: "7100000002", ciudad: "Cali" }, ADMIN);
    const ent = (doc: string) => ({ ciudad: "Cali", nombre: "App Bea", integrantes: [{ nombre: "Bea Ruiz", documento: doc }] });
    expect(await g.crearProyecto(ent("7100000002"), ADMIN)).toMatchObject({ ok: false, error: "sin_proyecto" });
    const pid = await proyecto("P-7100000010", "Cali", ["7100000010"]);
    expect(await g.buscarDocumento(pid, "7100000002")).toMatchObject({ ok: false, error: "sin_proyecto" });
    expect(await g.agregarIntegrante(pid, { documento: "7100000002", nombre: "Bea Ruiz" }, {}, ADMIN)).toMatchObject({ ok: false, error: "sin_proyecto" });
    expect(await g.editarProyecto(pid, { ciudad: "Cali", nombre: "App", integrantes: [{ nombre: "Persona", documento: "7100000002" }] }, {}, ADMIN)).toMatchObject({ ok: false, error: "sin_proyecto" });
    const enc = ["Ciudad", "Nombre del proyecto", "Nombre 1", "Documento 1"];
    const previa = await previaProyectos(leerLibroProyectos(libro({ Proyectos: [enc, ["Cali", "Otra app", "Bea Ruiz", "7100000002"]] })));
    expect(previa.errores.map((e) => e.mensaje).join(" ")).toMatch(/Sin proyecto/);
    const c = await db.collections();
    expect(await c.proyectos.countDocuments({ "integrantes.documento": "7100000002" })).toBe(0);
  });

  it("convertir: crea el proyecto (sin hora), marca el registro como convertido y no se repite", async () => {
    const c = await db.collections();
    const reg = (await c.sinProyecto.findOne({ documento: "7100000002" }))!;
    const r = await g.convertirEnProyecto(reg._id, { nombre: "Tienda de Bea", descripcion: "Ventas en línea" }, ADMIN);
    expect(r).toMatchObject({ ok: true, codigo: "P-7100000002" });
    const p = (await c.proyectos.findOne({ codigo: "P-7100000002" }))!;
    expect(p).toMatchObject({ ciudad: "Cali", nombre: "Tienda de Bea", monitor: "moni.cali", integrantes: [{ documento: "7100000002", nombre: "Bea Ruiz" }] });
    expect(await c.sinProyecto.findOne({ _id: reg._id })).toMatchObject({ proyectoId: p._id });
    expect((await c.sinProyecto.findOne({ _id: reg._id }))!.convertidoEn).toBeInstanceOf(Date);
    expect(await g.convertirEnProyecto(reg._id, { nombre: "Otra" }, ADMIN)).toMatchObject({ ok: false, error: "cambio" });
    expect(await c.changeLog.findOne({ proyectoId: p._id, accion: "crear_proyecto", motivo: "Desde «Sin proyecto»" })).toBeTruthy();
    // Ya convertido: no se quita ni vuelve a entrar.
    expect(await sp.quitarParticipante(reg._id, ADMIN)).toMatchObject({ ok: false, error: "no_existe" });
    expect(await sp.agregarParticipante({ nombre: "Bea", documento: "7100000002", ciudad: "Cali" }, ADMIN)).toMatchObject({ ok: false, error: "en_proyecto" });
    expect((await sp.listarSinProyecto()).participantes.find((x) => x.documento === "7100000002")).toMatchObject({ convertido: { codigo: "P-7100000002" } });
  });

  it("quitar uno cargado por error: lo borra y deja historial", async () => {
    await sp.agregarParticipante({ nombre: "Error Carga", documento: "7100000003", ciudad: "Cartagena" }, ADMIN);
    const c = await db.collections();
    const reg = (await c.sinProyecto.findOne({ documento: "7100000003" }))!;
    expect(await sp.quitarParticipante(reg._id, ADMIN)).toMatchObject({ ok: true });
    expect(await c.sinProyecto.countDocuments({ documento: "7100000003" })).toBe(0);
    expect(await c.changeLog.findOne({ accion: "quitar_sin_proyecto", anterior: /Error Carga/ })).toBeTruthy();
  });

  it("portal: el participante ve «No tienes un proyecto inscrito» y no reserva; un documento desconocido sigue igual", async () => {
    expect(await consultar("7100000001")).toBeNull();
    expect(await sp.noInscrito("7100000001")).toBe(true);
    expect(await sp.noInscrito("7199999999")).toBe(false);
    expect(await reservar("7100000001", H(9), AHORA)).toMatchObject({ ok: false, error: "no_inscrito" });
    expect(await reservar("7199999999", H(9), AHORA)).toMatchObject({ ok: false, error: "sin_proyecto" });
  });
});

describe("Excel de participantes", () => {
  it("encabezados con sinónimos, errores por fila, repetidos y vista previa sin escribir", async () => {
    const c = await db.collections();
    const antes = await c.sinProyecto.countDocuments();
    const l = await sp.leerSinProyecto(libro({ "Sin proyecto": [
      ["Nombre completo", "Cédula", "Sede", "Teléfono", "E-mail", "Monitor"],
      ["carla gómez", 7100000020, "cali", "300 123 4567", "carla@correo.com", "Moni Cali"],
      ["Dario Paz", "7100000021", "Cartagena", null, null, "Nadie"],
      ["Sin Ciudad", "7100000022", "Lima", null, null, null],
      ["Malo Doc", 71000000.5, "Cali", null, null, null],
      ["Repetida", 7100000020, "Cali", null, null, null],
      ["Ya Está", "7100000001", "Cali", null, null, null],
      ["Con Proyecto", "7100000010", "Cali", null, null, null],
    ] }));
    expect(l.errores.map((e) => e.fila)).toEqual([4, 5, 6]);
    const previa = await sp.previaSinProyecto(l);
    expect(previa.nuevos.map((n) => n.nombre)).toEqual(["Carla Gómez", "Dario Paz"]);
    expect(previa.nuevos[1]!.aviso).toMatch(/Nadie/);
    expect(previa.yaRegistrados.map((x) => x.fila)).toEqual([7]);
    expect(previa.enProyecto).toMatchObject([{ fila: 8, codigo: "P-7100000010" }]);
    expect(JSON.stringify(previa.nuevos)).not.toContain("7100000020"); // documento enmascarado
    expect(await c.sinProyecto.countDocuments()).toBe(antes);
    const r = await sp.aplicarSinProyecto(previa.validos, ADMIN);
    expect(r).toEqual({ agregados: 2, omitidos: [] });
    expect(await c.sinProyecto.findOne({ documento: "7100000020" })).toMatchObject({ ciudad: "Cali", celular: "+573001234567", correo: "carla@correo.com", monitor: "moni.cali" });
    expect(await c.sinProyecto.findOne({ documento: "7100000021" })).toMatchObject({ ciudad: "Cartagena", monitor: null });
  });

  it("sin encabezados obligatorios: un error y nada más", async () => {
    const l = await sp.leerSinProyecto(libro({ Hoja1: [["Nombre", "Ciudad"], ["Ana", "Cali"]] }));
    expect(l.filas).toEqual([]);
    expect(l.errores[0]!.mensaje).toMatch(/Documento/);
  });
});

describe("marcar un proyecto «Sin proyecto»", () => {
  it("con hora no se marca; sin hora sí: no reserva, no recibe hora del admin, no cuenta, y al quitar la marca vuelve", async () => {
    const c = await db.collections();
    const conHora = await proyecto("P-7200000001", "Cali", ["7200000001"]);
    expect(await reservar("7200000001", H(8), AHORA)).toMatchObject({ ok: true });
    expect(await sp.marcarSinProyecto(conHora, "", ADMIN)).toMatchObject({ ok: false, error: "tiene_hora" });
    expect((await c.proyectos.findOne({ _id: conHora }))!.sinProyecto).toBeUndefined();

    const pid = await proyecto("P-7200000002", "Cali", ["7200000002", "7200000003"]);
    const totalAntes = (await resumen()).total;
    const filasAntes = (await filasEstudiantes()).length;
    expect(await sp.marcarSinProyecto(pid, "Se retiraron", ADMIN)).toMatchObject({ ok: true });
    expect(await sp.marcarSinProyecto(pid, "", ADMIN)).toMatchObject({ ok: false, error: "cambio" });
    expect((await c.proyectos.findOne({ _id: pid }))!.sinProyecto).toMatchObject({ por: "admin.p", motivo: "Se retiraron" });
    expect(await c.changeLog.findOne({ proyectoId: pid, accion: "sin_proyecto", motivo: "Se retiraron" })).toBeTruthy();

    // Portal y reserva.
    expect(await consultar("7200000003")).toBeNull();
    expect(await agenda("7200000003", undefined, AHORA)).toEqual({ error: "sin_proyecto" });
    expect(await sp.noInscrito("7200000003")).toBe(true);
    expect(await reservar("7200000003", H(9), AHORA)).toMatchObject({ ok: false, error: "no_inscrito" });
    // Admin: no le da hora; Horarios lo muestra en su filtro y no en "Sin hora"; Tablero no lo ofrece.
    expect(await cambiarHora(pid, H(9), { otraCiudad: false, motivo: "" }, ADMIN)).toMatchObject({ ok: false, error: "marcado" });
    expect(await c.asientos.countDocuments({ proyectoId: pid })).toBe(0);
    expect((await listarProyectos({ estado: "sin_proyecto" })).map((p) => p.codigo)).toEqual(["P-7200000002"]);
    expect((await listarProyectos({ estado: "sin_hora" })).some((p) => p.codigo === "P-7200000002")).toBe(false);
    expect((await listarProyectos({ q: "P-7200000002" }))[0]).toMatchObject({ sinProyecto: { motivo: "Se retiraron" } });
    expect((await datosTablero(D)).sinHora.some((t) => JSON.stringify(t).includes("P-7200000002"))).toBe(false);
    // Estadísticas: no cuenta en inscripción ni en el seguimiento de evaluaciones; sí en su apartado.
    expect((await resumen()).total).toBe(totalAntes - 1);
    expect((await seguimientoInscripcion(COORD)).some((f) => f.codigo === "P-7200000002")).toBe(false);
    expect((await filasEstudiantes()).length).toBe(filasAntes - 2);
    const ev = await seguimientoEval();
    expect(ev.sinProyecto.find((x) => x.ciudad === "Cali")).toMatchObject({ proyectos: 1 });
    expect(ev.sinProyecto.find((x) => x.ciudad === "Cali")!.estudiantes).toBe(ev.sinProyecto.find((x) => x.ciudad === "Cali")!.participantes + 2);
    expect((await seguimientoEval({ ciudad: "Cartagena" })).sinProyecto.every((x) => x.ciudad === "Cartagena")).toBe(true);

    expect(await sp.quitarMarca(pid, ADMIN)).toMatchObject({ ok: true });
    expect(await sp.quitarMarca(pid, ADMIN)).toMatchObject({ ok: false, error: "cambio" });
    expect((await c.proyectos.findOne({ _id: pid }))!.sinProyecto).toBeUndefined();
    expect(await reservar("7200000003", H(9), AHORA)).toMatchObject({ ok: true });
    expect((await resumen()).total).toBe(totalAntes);
  });

  it("carrera marcar ↔ reservar: nunca queda un proyecto marcado con hora", async () => {
    const c = await db.collections();
    for (let i = 0; i < 12; i++) {
      const doc = String(7300000000 + i);
      const pid = await proyecto(`P-${doc}`, "Cartagena", [doc]);
      const libre = (await c.asientos.findOne({ proyectoId: null }))!;
      const [r, m] = await Promise.all([reservar(doc, libre.inicio, AHORA), sp.marcarSinProyecto(pid, "", ADMIN)]);
      const p = (await c.proyectos.findOne({ _id: pid }))!;
      const a = await c.asientos.findOne({ proyectoId: pid });
      expect(!!p.sinProyecto && !!a).toBe(false);
      // Lo que responde cada uno coincide con lo guardado.
      expect(r.ok).toBe(!!a);
      expect(m.ok).toBe(!!p.sinProyecto);
      if (m.ok) expect(r).toMatchObject({ ok: false, error: "no_inscrito" });
    }
  });

  it("carrera marcar ↔ el admin asigna hora: nunca queda un proyecto marcado con hora", async () => {
    const c = await db.collections();
    for (let i = 0; i < 12; i++) {
      const doc = String(7310000000 + i);
      const pid = await proyecto(`P-${doc}`, "Cali", [doc]);
      const libre = (await c.asientos.findOne({ proyectoId: null }))!;
      const [r, m] = await Promise.all([cambiarHora(pid, libre.inicio, { otraCiudad: true, motivo: "" }, ADMIN), sp.marcarSinProyecto(pid, "", { rol: "admin", usuario: "otro.admin" })]);
      const p = (await c.proyectos.findOne({ _id: pid }))!;
      const a = await c.asientos.findOne({ proyectoId: pid });
      expect(!!p.sinProyecto && !!a).toBe(false);
      expect(r.ok).toBe(!!a);
      expect(m.ok).toBe(!!p.sinProyecto);
      if (m.ok) expect(r).toMatchObject({ ok: false });
    }
  });

  it("carrera agregar a «Sin proyecto» ↔ crear proyecto con el mismo documento: nunca en los dos", async () => {
    const c = await db.collections();
    for (let i = 0; i < 12; i++) {
      const doc = String(7400000000 + i);
      await Promise.all([
        sp.agregarParticipante({ nombre: "Carrera Uno", documento: doc, ciudad: "Cali" }, ADMIN),
        g.crearProyecto({ ciudad: "Cali", nombre: "App carrera", integrantes: [{ nombre: "Carrera Uno", documento: doc }] }, ADMIN),
      ]);
      const enP = await c.proyectos.countDocuments({ "integrantes.documento": doc });
      const enS = await c.sinProyecto.countDocuments({ documento: doc, convertidoEn: { $exists: false } });
      expect(enP + enS).toBeLessThanOrEqual(1);
    }
  });
});

describe("convertir y errores (casos del revisor)", () => {
  it("dos admins convierten al mismo participante a la vez: un solo proyecto", async () => {
    await sp.agregarParticipante({ nombre: "Doble Conversión", documento: "7600000001", ciudad: "Cali" }, ADMIN);
    const c = await db.collections();
    const reg = (await c.sinProyecto.findOne({ documento: "7600000001" }))!;
    const rs = await Promise.all([g.convertirEnProyecto(reg._id, { nombre: "Uno" }, ADMIN), g.convertirEnProyecto(reg._id, { nombre: "Dos" }, ADMIN)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(await c.proyectos.countDocuments({ "integrantes.documento": "7600000001" })).toBe(1);
    expect(await c.sinProyecto.findOne({ _id: reg._id })).toMatchObject({ proyectoId: expect.any(ObjectId) });
  });

  it("convertir con un segundo integrante pendiente, o sin el participante, se rechaza", async () => {
    await sp.agregarParticipante({ nombre: "Primera Pend", documento: "7600000002", ciudad: "Cali" }, ADMIN);
    await sp.agregarParticipante({ nombre: "Segunda Pend", documento: "7600000003", ciudad: "Cali" }, ADMIN);
    const c = await db.collections();
    const reg = (await c.sinProyecto.findOne({ documento: "7600000002" }))!;
    const pareja = { ciudad: "Cali", nombre: "App", integrantes: [{ nombre: "Primera Pend", documento: "7600000002" }, { nombre: "Segunda Pend", documento: "7600000003" }] };
    expect(await g.crearProyecto(pareja, ADMIN, { desdeSinProyecto: reg._id })).toMatchObject({ ok: false, error: "sin_proyecto" });
    expect(await g.crearProyecto({ ciudad: "Cali", nombre: "App", integrantes: [{ nombre: "Otra Persona", documento: "7600000099" }] }, ADMIN, { desdeSinProyecto: reg._id })).toMatchObject({ ok: false, error: "datos" });
    expect((await c.sinProyecto.findOne({ _id: reg._id }))!.convertidoEn).toBeUndefined();
  });

  it("convertir respeta «por asignar» y cambia un monitor inactivo por el de la ciudad", async () => {
    const c = await db.collections();
    await sp.agregarParticipante({ nombre: "Sin Monitor", documento: "7600000004", ciudad: "Cali", monitor: null }, ADMIN);
    const r1 = await g.convertirEnProyecto((await c.sinProyecto.findOne({ documento: "7600000004" }))!._id, { nombre: "App sin monitor" }, ADMIN);
    expect(r1.ok && (await c.proyectos.findOne({ codigo: r1.codigo }))!.monitor).toBeNull();
    await c.users.insertOne({ _id: new ObjectId(), usuario: "moni.viejo", nombre: "Moni Viejo", passwordHash: "x", rol: "monitor", ciudades: ["Cali"], activo: false, creadoEn: new Date() });
    const id = new ObjectId();
    await c.sinProyecto.insertOne({ _id: id, nombre: "Con Viejo", documento: "7600000005", ciudad: "Cali", monitor: "moni.viejo", creadoEn: new Date(), creadoPor: "admin.p" });
    const r2 = await g.convertirEnProyecto(id, { nombre: "App" }, ADMIN);
    expect(r2.ok && (await c.proyectos.findOne({ codigo: r2.codigo }))!.monitor).toBe("moni.cali");
  });

  it("errores: proyecto inexistente, monitor inexistente, correo inválido; omitidos al aplicar", async () => {
    const otro = new ObjectId();
    expect(await sp.marcarSinProyecto(otro, "", ADMIN)).toMatchObject({ ok: false, error: "no_existe" });
    expect(await sp.quitarMarca(otro, ADMIN)).toMatchObject({ ok: false, error: "no_existe" });
    expect(await sp.agregarParticipante({ nombre: "Ana Uno", documento: "7600000006", ciudad: "Cali", monitor: "no.existe" }, ADMIN)).toMatchObject({ ok: false, campo: "monitor" });
    expect(await sp.agregarParticipante({ nombre: "Ana Uno", documento: "7600000006", ciudad: "Cali", correo: "maría@x.com" }, ADMIN)).toMatchObject({ ok: false, campo: "correo" });
    const l = await sp.leerSinProyecto(libro({ Hoja1: [["Nombre", "Documento", "Ciudad"], ["Entre Medio", "7600000007", "Cali"]] }));
    const previa = await sp.previaSinProyecto(l);
    await proyecto("P-7600000007", "Cali", ["7600000007"]); // alguien lo cargó en un proyecto entre la vista previa y aplicar
    const r = await sp.aplicarSinProyecto(previa.validos, ADMIN);
    expect(r.agregados).toBe(0);
    expect(r.omitidos).toHaveLength(1);
  });

  it("con proyectos marcados, «con hora» y el filtro con_hora no cambian", async () => {
    const r = await resumen();
    const conHora = await listarProyectos({ estado: "con_hora" });
    expect(conHora.some((p) => p.sinProyecto)).toBe(false);
    expect(r.conHora).toBe(await (await db.collections()).asientos.countDocuments({ proyectoId: { $type: "objectId" } }));
    expect(conHora.length).toBe(r.conHora);
  });
});

describe("eligieron hora y no se presentaron (por ciudad)", () => {
  it("cuenta «No se presentó» guardado y la asistencia «No» del monitor sin evaluación", async () => {
    const c = await db.collections();
    const pid = await proyecto("P-7500000001", "Cartagena", ["7500000001", "7500000002"]);
    expect(await reservar("7500000001", H(10), AHORA)).toMatchObject({ ok: true });
    const id1 = `${pid.toHexString()}|7500000001`, id2 = `${pid.toHexString()}|7500000002`;
    await c.evalMonitor.insertOne({ _id: id2, proyectoId: pid, documento: "7500000002", asistencia: "no", motivo: null, observacion: "", actualizadoEn: new Date(), actualizadoPor: "moni" });
    let ev = await seguimientoEval({ ciudad: "Cartagena" });
    expect(ev.noSePresentaronCiudad).toEqual([{ ciudad: "Cartagena", estudiantes: 1 }]);
    await c.evalResultados.insertOne({ _id: id1, proyectoId: pid, documento: "7500000001", noPresento: true, a: {}, b: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "", actualizadoEn: new Date() } as never);
    ev = await seguimientoEval({ ciudad: "Cartagena" });
    expect(ev.noSePresentaronCiudad).toEqual([{ ciudad: "Cartagena", estudiantes: 2 }]);
  });
});

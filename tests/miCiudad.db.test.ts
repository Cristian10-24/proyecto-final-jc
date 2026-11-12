import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Fase 6 · «Mi ciudad» (solo lectura): el monitor ve los proyectos CON HORA de sus ciudades y SOLO el estado
// (Evaluado, No se presentó, Pendiente). Nunca notas, resultado, retroalimentación, porcentajes, observaciones,
// documento ni correo. Coordinación, admin y mentor: 403. Base LOCAL, datos INVENTADOS.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const { inicioUTC } = await import("@/lib/edicion");
const { estadoIntegrante, estadoProyecto } = await import("@/lib/vistas/miCiudad");
const ruta = await import("@/app/api/monitor/mi-ciudad/route");

const D1 = "2026-11-12", D2 = "2026-11-13";
const ids: Record<string, ObjectId> = {};
const P = { pareja: new ObjectId(), ausente: new ObjectId(), pend: new ObjectId(), incompleto: new ObjectId(), sinHora: new ObjectId(), sinProy: new ObjectId(), bogota: new ObjectId(), medellin: new ObjectId() };
// Lo que NUNCA puede salir en la respuesta.
const PROHIBIDO = ["1000000001", "1000000002", "1000000003", "@x.test", "FORTALEZA-SECRETA", "MEJORA-SECRETA", "PERCEPCION-SECRETA", "OBS-SECRETA", "Salud", "Excelente", "Aprobado", "Incompleto", "Medellín", "Proyecto Medellín", "Sin Hora", "Marcado Sin Proyecto"];

type Vista = { ciudades: string[]; ciudad: string | null; filas: { id: string; proyecto: string; dia: string; hora: string; sala: number | null; mentor: string; estado: string; integrantes: { nombre: string; celular: string | null; estado: string }[] }[]; error?: string };
async function pedir(quien: string | null, q = ""): Promise<{ status: number; body: Vista; texto: string }> {
  estado.token = quien ? createToken(ids[quien]!.toHexString(), 0) : "";
  const res = await ruta.GET(new Request(`http://localhost/api/monitor/mi-ciudad${q ? `?${q}` : ""}`));
  const texto = await res.text();
  return { status: res.status, body: JSON.parse(texto), texto };
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["admin", "coord", "monA", "monSin", "monCoord", "mentor"]) ids[k] = new ObjectId();
  const u = (k: string, usuario: string, rol: string, ciudades: string[], extra: Record<string, unknown> = {}) =>
    ({ _id: ids[k]!, usuario, nombre: `Nombre ${k}`, rol, ciudades, activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0, ...extra });
  await c.users.insertMany([
    u("admin", "admin.p", "admin", []), u("coord", "coord.p", "coordinador", []),
    u("monA", "mon.a", "monitor", ["Cali", "Bogotá"]), u("monSin", "mon.sin", "monitor", []),
    // Monitor que además es coordinación: en Mi ciudad igual ve solo SUS ciudades.
    u("monCoord", "mon.coord", "monitor", ["Cali"], { rolesExtra: ["coordinador"] }),
    u("mentor", "mentor.uno", "mentor", ["Cali"], { mentorId: "m1" }),
  ] as never);
  await c.mentores.insertMany([{ _id: "m1", nombre: "Mentor Uno", celular: "+573110000001", correo: "m1@x.test" }, { _id: "m2", nombre: "Mentor Dos" }]);
  await c.planSalas.insertMany([{ _id: `${D1}|8|3`, dia: D1, hora: 8, sala: 3, mentorId: "m1", monitor: "mon.a", origen: null }]);
  const p = (_id: ObjectId, codigo: string, ciudad: string, nombre: string, integrantes: { documento: string; nombre: string; celular?: string; correo?: string }[], extra: Record<string, unknown> = {}) =>
    ({ _id, codigo, ciudad, nombre, monitor: null, creadoEn: now, actualizadoEn: now, integrantes, ...extra });
  await c.proyectos.insertMany([
    p(P.pareja, "PA", "Cali", "Recicla y gana", [
      { documento: "1000000001", nombre: "Ana Uno", celular: "+573000000001", correo: "ana@x.test" },
      { documento: "1000000002", nombre: "Beto Dos", correo: "beto@x.test" },
    ]),
    p(P.ausente, "AU", "Cali", "Bici segura", [{ documento: "1000000003", nombre: "Caro Tres", celular: "3000000003" }]),
    p(P.pend, "PE", "Cali", "Aula sin papel", [{ documento: "1000000004", nombre: "Dani Cuatro" }]),
    p(P.incompleto, "IN", "Cali", "Huerta en casa", [{ documento: "1000000005", nombre: "Eva Cinco" }]),
    p(P.sinHora, "SH", "Cali", "Sin Hora", [{ documento: "1000000006", nombre: "Fede Seis" }]),
    p(P.sinProy, "SP", "Cali", "Marcado Sin Proyecto", [{ documento: "1000000007", nombre: "Gabi Siete" }], { sinProyecto: { desde: now, por: "admin.p" } }),
    p(P.bogota, "BO", "Bogotá", "Mascotas felices", [{ documento: "1000000008", nombre: "Hugo Ocho" }]),
    p(P.medellin, "ME", "Medellín", "Proyecto Medellín", [{ documento: "1000000009", nombre: "Iván Nueve" }]),
  ]);
  const a = (dia: string, h: number, m: number, mentorId: string, ciudad: string, proyectoId: ObjectId | null) =>
    ({ _id: new ObjectId(), dia, inicio: inicioUTC(dia, h, m), mentorId, ciudades: [ciudad], proyectoId });
  await c.asientos.insertMany([
    a(D1, 8, 0, "m1", "Cali", P.pareja), a(D1, 8, 15, "m1", "Cali", P.ausente), a(D2, 9, 0, "m2", "Cali", P.pend),
    a(D1, 8, 30, "m1", "Cali", P.incompleto), a(D1, 8, 45, "m1", "Cali", null),
    // Por si acaso: aunque un asiento apuntara al marcado «Sin proyecto», no sale.
    a(D2, 9, 15, "m2", "Cali", P.sinProy),
    a(D1, 10, 0, "m2", "Bogotá", P.bogota), a(D1, 10, 15, "m2", "Medellín", P.medellin),
  ]);
  const ev = (pid: ObjectId, documento: string, x: Record<string, unknown>) => ({
    _id: `${pid.toHexString()}|${documento}`, proyectoId: pid, documento, mentorId: "m1", a: {}, b: {}, destacado: false,
    fortaleza: "", mejora: "", percepcion: "", noPresento: false, actualizadoEn: now, actualizadoPor: "mentor.uno", ...x,
  });
  const todasSi = { a1: "si", a2: "si", a3: "si", a4: "si", a5: "si", a6: "si", a7: "si" };
  await c.evalResultados.insertMany([
    ev(P.pareja, "1000000001", { a: todasSi, b: { b1: 4, b2: 4 }, destacado: true, fortaleza: "FORTALEZA-SECRETA", mejora: "MEJORA-SECRETA", percepcion: "PERCEPCION-SECRETA", evaluadoEn: now }),
    ev(P.pareja, "1000000002", { noPresento: true, noPresentoEn: now }),
    ev(P.incompleto, "1000000005", { a: { a1: "si" } }), // Incompleto: cuenta como Pendiente
  ] as never);
  await c.evalMonitor.insertMany([
    { _id: `${P.ausente.toHexString()}|1000000003`, proyectoId: P.ausente, documento: "1000000003", asistencia: "no", motivo: "Salud", observacion: "OBS-SECRETA", actualizadoEn: now, actualizadoPor: "mon.a" },
  ] as never);
});
afterAll(() => db.closeDb());

describe("estado (funciones puras)", () => {
  it("por integrante y por proyecto", () => {
    expect(estadoIntegrante("Aprobado", null)).toBe("evaluado");
    expect(estadoIntegrante("Excelente", "no")).toBe("evaluado"); // una evaluación guardada manda
    expect(estadoIntegrante("No se presentó", null)).toBe("ausente");
    expect(estadoIntegrante("Pendiente", "no")).toBe("ausente");
    expect(estadoIntegrante("Incompleto", "si")).toBe("pendiente");
    expect(estadoProyecto(["evaluado", "ausente"])).toBe("evaluado");
    expect(estadoProyecto(["ausente", "ausente"])).toBe("ausente");
    expect(estadoProyecto(["ausente", "pendiente"])).toBe("pendiente");
  });
});

describe("quién ve qué", () => {
  it("el monitor ve sus ciudades; por defecto la primera en orden alfabético", async () => {
    const r = await pedir("monA");
    expect(r.status).toBe(200);
    expect(r.body.ciudades).toEqual(["Bogotá", "Cali"]);
    expect(r.body.ciudad).toBe("Bogotá");
    expect(r.body.filas.map((f) => f.proyecto)).toEqual(["Mascotas felices"]);
  });

  it("Cali: solo proyectos con hora, sin «Sin proyecto», por día y hora, con el estado correcto", async () => {
    const r = await pedir("monA", "ciudad=Cali");
    expect(r.status).toBe(200);
    expect(r.body.filas.map((f) => [f.proyecto, f.estado])).toEqual([
      ["Recicla y gana", "evaluado"], ["Bici segura", "ausente"], ["Huerta en casa", "pendiente"], ["Aula sin papel", "pendiente"],
    ]);
    const pareja = r.body.filas[0]!;
    expect(pareja).toMatchObject({ dia: D1, hora: "8:00 a. m.", sala: 3, mentor: "Mentor Uno" });
    expect(pareja.integrantes).toEqual([
      { nombre: "Ana Uno", celular: "+573000000001", estado: "evaluado" },
      { nombre: "Beto Dos", celular: null, estado: "ausente" },
    ]);
    expect(r.body.filas[3]).toMatchObject({ dia: D2, sala: null, mentor: "Mentor Dos" }); // sin plan de salas ese día
  });

  it("una ciudad que no es suya: 403", async () => {
    expect((await pedir("monA", "ciudad=Medellín")).status).toBe(403);
    expect((await pedir("monCoord", "ciudad=Bogotá")).status).toBe(403);
  });

  it("monitor que también es coordinación: solo sus ciudades", async () => {
    const r = await pedir("monCoord");
    expect(r.body.ciudades).toEqual(["Cali"]);
    expect(r.body.filas).toHaveLength(4);
  });

  it("monitor sin ciudades: vacío", async () => {
    const r = await pedir("monSin");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ciudades: [], ciudad: null, filas: [] });
  });

  it("coordinación, admin y mentor: 403; sin sesión: 401", async () => {
    for (const q of ["coord", "admin", "mentor"]) expect((await pedir(q)).status).toBe(403);
    expect((await pedir(null)).status).toBe(401);
  });

  for (const q of ["x=1", "ciudad=", "ciudad=Cali&dia=2026-11-12", `ciudad=${"a".repeat(61)}`])
    it(`filtro inválido (${q.slice(0, 24)}): 400`, async () => {
      const r = await pedir("monA", q);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("datos_invalidos");
    });
});

describe("opción B: conteo por estudiante", () => {
  it("con la ruta: la pareja Evaluado + No se presentó suma 1 y 1, sale en los dos filtros y Total = suma", async () => {
    const { contarEstudiantes, filtrarPorEstado } = await import("@/lib/vistas/conteoCiudad");
    const { body } = await pedir("monA", "ciudad=Cali");
    const filas = body.filas as unknown as import("@/lib/vistas/miCiudad").FilaMiCiudad[];
    const n = contarEstudiantes(filas);
    expect(n).toEqual({ total: 5, evaluado: 1, pendiente: 2, ausente: 2, proyectos: 4 });
    expect(n.evaluado + n.pendiente + n.ausente).toBe(n.total);
    expect(filtrarPorEstado(filas, "evaluado").map((f) => f.proyecto)).toEqual(["Recicla y gana"]);
    expect(filtrarPorEstado(filas, "ausente").map((f) => f.proyecto)).toEqual(["Recicla y gana", "Bici segura"]);
  });

  it("coincide con el resumen de «Mis salas» (mismas reglas) para los mismos proyectos", async () => {
    const { listaSalas } = await import("@/lib/evaluacion/monitor");
    const { estadoPersona } = await import("@/lib/evaluacion/criterios");
    const { contarEstudiantes } = await import("@/lib/vistas/conteoCiudad");
    const yo = { id: ids.monA!.toHexString(), usuario: "mon.a", nombre: "Nombre monA", rol: "monitor" as const, ciudades: ["Cali", "Bogotá"] };
    const salas = (await listaSalas(yo)).filas.filter((f) => f.ciudad === "Cali");
    expect(salas.length).toBeGreaterThan(0);
    // Resumen de «Mis salas» (MonitorPanel): una persona por integrante con estadoPersona.
    const ms = { presente: 0, ausente: 0, pendiente: 0 };
    for (const f of salas) for (const x of f.integrantes) ms[estadoPersona({ res: x.res, presente: x.asistencia === "si", ausente: x.asistencia === "no" })]++;
    const mismos = new Set(salas.map((f) => f.id));
    const mc = contarEstudiantes((await pedir("monA", "ciudad=Cali")).body.filas.filter((f) => mismos.has(f.id)) as never);
    expect({ evaluado: mc.evaluado, ausente: mc.ausente, pendiente: mc.pendiente }).toEqual({ evaluado: ms.presente, ausente: ms.ausente, pendiente: ms.pendiente });
  });
});

describe("privacidad", () => {
  it("solo los campos permitidos: nada de notas, resultado, retroalimentación, porcentajes, observaciones, documento ni correo", async () => {
    for (const q of ["", "ciudad=Cali", "ciudad=Bogotá"]) {
      const r = await pedir("monA", q);
      expect(Object.keys(r.body).sort()).toEqual(["ciudad", "ciudades", "filas"]);
      for (const f of r.body.filas) {
        expect(Object.keys(f).sort()).toEqual(["dia", "estado", "hora", "id", "inicio", "integrantes", "mentor", "proyecto", "sala"]);
        for (const i of f.integrantes) expect(Object.keys(i).sort()).toEqual(["celular", "estado", "nombre"]);
        expect(["evaluado", "pendiente", "ausente"]).toContain(f.estado);
      }
      for (const x of PROHIBIDO) expect(r.texto).not.toContain(x);
      expect(r.texto).not.toMatch(/"(res|a|b|nb|motivo|observacion|documento|correo|fortaleza|mejora|percepcion|destacado|asistencia)"/);
    }
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
    for (const quien of ["admin", "coord", "monA", "monSin", "monCoord", "mentor", null])
      for (const q of ["", "ciudad=Cali", "ciudad=Medellín", "x=1"]) await pedir(quien, q);
    expect(await foto()).toBe(antes);
  });
});

import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Cronograma en Excel: día, sala y enlace del plan de salas para quien lo descarga; documento y correo de cada
// integrante solo en la descarga de administración. Coordinación (y monitor con coordinación adicional) no los recibe.
// Filas sin sala o sin enlace: celda vacía y hoja final «Avisos». Base LOCAL, datos INVENTADOS.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const { inicioUTC } = await import("@/lib/edicion");
const { cronogramaExcel } = await import("@/lib/seguimiento");
const ruta = await import("@/app/api/coordinacion/cronograma/route");

const D = "2026-11-12";
const ids: Record<string, ObjectId> = {};
const como = (quien: string) => { estado.token = createToken(ids[quien]!.toHexString(), 0); };

const ENC_BASE = ["Día", "Hora COL", "Hora UY", "Mentor (sala)", "Sala", "Enlace de sala", "Monitor", "Ciudad", "Proyecto", "Código"];
const DIA = "Jueves 12 de noviembre";
const ENLACE = "https://meet.example.test/sala-uno";
const ENC_HOY = [...ENC_BASE, "Integrante 1", "Celular 1", "Integrante 2", "Celular 2"];
const ENC_ADMIN = [...ENC_BASE, "Integrante 1", "Documento 1", "Celular 1", "Correo 1", "Integrante 2", "Documento 2", "Celular 2", "Correo 2"];

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  for (const k of ["admin", "coord", "monitor", "monitorCoord", "mentor", "coordFalsoAdmin"]) ids[k] = new ObjectId();
  const u = (k: string, rol: string, extra: Record<string, unknown> = {}) =>
    ({ _id: ids[k]!, usuario: `${k}.p`, nombre: k, rol, ciudades: ["Cali"], activo: true, passwordHash: "x", creadoEn: now, tokenVersion: 0, ...extra });
  await c.users.insertMany([
    u("admin", "admin"), u("coord", "coordinador"), u("monitor", "monitor"),
    u("monitorCoord", "monitor", { rolesExtra: ["coordinador"] }),
    u("coordFalsoAdmin", "coordinador", { rolesExtra: ["admin"] }), // administración nunca vale como rol adicional
    u("mentor", "mentor", { mentorId: "m1" }),
  ] as never);
  await c.mentores.insertMany([{ _id: "m1", nombre: "Mentor Uno" }, { _id: "m2", nombre: "Mentor Dos" }, { _id: "m3", nombre: "Mentor Tres" }]);
  // Plan de salas: m1 a las 8 en la sala 1 (enlace https), m3 a las 8 en la sala 2 (enlace no https = sin enlace); m2 sin sala.
  await c.planSalas.insertMany([
    { _id: `${D}|8|1`, dia: D, hora: 8, sala: 1, mentorId: "m1", monitor: null, origen: null },
    { _id: `${D}|8|2`, dia: D, hora: 8, sala: 2, mentorId: "m3", monitor: null, origen: null },
  ]);
  await c.salasConfig.insertOne({ _id: "actual", salas: [{ sala: 1, enlace: ENLACE }, { sala: 2, enlace: "http://inseguro.test/x" }], importados: [], disponibilidad: [], actualizadoEn: now });
  const pareja = new ObjectId(), individual = new ObjectId(), sinSala = new ObjectId(), sinEnlace = new ObjectId();
  await c.proyectos.insertMany([
    {
      _id: pareja, codigo: "PAR", ciudad: "Cali", nombre: "Pareja", monitor: null, creadoEn: now, actualizadoEn: now,
      integrantes: [
        { documento: "0012345678", nombre: "Ana Uno", celular: "+573000000001", correo: "  Ana.Perez @Correo.COM " },
        { documento: "1234567890123456789", nombre: "Beto Dos", celular: "+573000000002" }, // sin correo
      ],
    },
    {
      _id: individual, codigo: "IND", ciudad: "Cali", nombre: "Individual", monitor: null, creadoEn: now, actualizadoEn: now,
      integrantes: [{ documento: "-900", nombre: "@Raro", celular: "+573000000003", correo: "=HYPERLINK(\"x\")@a.co" }],
    },
    { _id: sinSala, codigo: "SSA", ciudad: "Cali", nombre: "Sin sala", monitor: null, creadoEn: now, actualizadoEn: now, integrantes: [{ documento: "9100000001", nombre: "Caro" }] },
    { _id: sinEnlace, codigo: "SEN", ciudad: "Cali", nombre: "Sin enlace", monitor: null, creadoEn: now, actualizadoEn: now, integrantes: [{ documento: "9100000002", nombre: "Dani" }] },
  ]);
  await c.asientos.insertMany([
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 0), mentorId: "m1", ciudades: ["Cali"], proyectoId: pareja },
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 15), mentorId: "m1", ciudades: ["Cali"], proyectoId: individual },
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 9, 0), mentorId: "m2", ciudades: ["Cali"], proyectoId: sinSala },
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 30), mentorId: "m3", ciudades: ["Cali"], proyectoId: sinEnlace },
  ]);
});
afterAll(async () => { await db.closeDb(); });

async function libroCompleto(buf: Buffer | ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb;
}
const libro = async (buf: Buffer | ArrayBuffer) => (await libroCompleto(buf)).worksheets[0]!;
const fila = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1);
/** Fila del proyecto con ese código (columna «Código»). */
const filaDe = (ws: ExcelJS.Worksheet, codigo: string) => {
  for (let n = 2; n <= ws.rowCount; n++) if (fila(ws, n)[ENC_BASE.length - 1] === codigo) return fila(ws, n);
  throw new Error(`sin fila ${codigo}`);
};
const todas = (ws: ExcelJS.Worksheet) => ws.getSheetValues().flat().map(String);

describe("cronograma con datos personales (admin)", () => {
  it("pareja: cada integrante junto a su documento, celular y correo; correo en minúscula y sin espacios; sin correo queda vacío", async () => {
    const ws = await libro(await cronogramaExcel({ datosPersonales: true }));
    expect(fila(ws, 1)).toEqual(ENC_ADMIN);
    expect(filaDe(ws, "PAR")).toEqual([
      DIA, "8:00 a. m.", "", "Mentor Uno", 1, ENLACE, "Por asignar", "Cali", "Pareja", "PAR",
      "Ana Uno", "0012345678", "+573000000001", "ana.perez@correo.com",
      "Beto Dos", "1234567890123456789", "+573000000002", "",
    ]);
  });

  it("documento como texto: conserva ceros a la izquierda y no pasa a notación científica", async () => {
    const ws = await libro(await cronogramaExcel({ datosPersonales: true }));
    for (const col of [12, 16]) {
      const celda = ws.getRow(2).getCell(col);
      expect(celda.type).toBe(ExcelJS.ValueType.String);
      expect(celda.numFmt).toBe("@");
    }
  });

  it("individual: lo del integrante 2 queda vacío; textos que parecen fórmula se escriben como texto", async () => {
    const ws = await libro(await cronogramaExcel({ datosPersonales: true }));
    expect(filaDe(ws, "IND").slice(ENC_BASE.length)).toEqual(["'@Raro", "'-900", "+573000000003", "'=hyperlink(\"x\")@a.co", "", "", "", ""]);
  });
});

describe("cronograma sin datos personales (como siempre)", () => {
  it("mismas columnas de hoy, sin documento ni correo", async () => {
    const ws = await libro(await cronogramaExcel());
    expect(fila(ws, 1)).toEqual(ENC_HOY);
    expect(filaDe(ws, "PAR")).toEqual([DIA, "8:00 a. m.", "", "Mentor Uno", 1, ENLACE, "Por asignar", "Cali", "Pareja", "PAR", "Ana Uno", "+573000000001", "Beto Dos", "+573000000002"]);
    expect(filaDe(ws, "IND")).toEqual([DIA, "8:15 a. m.", "", "Mentor Uno", 1, ENLACE, "Por asignar", "Cali", "Individual", "IND", "'@Raro", "+573000000003", "", ""]);
    const t = todas(ws).join(" ");
    expect(t).not.toMatch(/0012345678|1234567890123456789|correo|Documento|Correo/i);
  });
});

describe("día, sala y enlace del plan de salas", () => {
  for (const datosPersonales of [false, true])
    it(`salen igual con y sin datos personales (${datosPersonales ? "admin" : "coordinación"}); sala como número`, async () => {
      const ws = await libro(await cronogramaExcel({ datosPersonales }));
      expect(filaDe(ws, "PAR").slice(0, 6)).toEqual([DIA, "8:00 a. m.", "", "Mentor Uno", 1, ENLACE]);
      expect(ws.getRow(2).getCell(5).type).toBe(ExcelJS.ValueType.Number);
    });

  it("sin sala en el plan o sin enlace https: celda vacía, nada inventado", async () => {
    const ws = await libro(await cronogramaExcel());
    expect(filaDe(ws, "SSA").slice(0, 6)).toEqual([DIA, "9:00 a. m.", "", "Mentor Dos", "", ""]);
    expect(filaDe(ws, "SEN").slice(0, 6)).toEqual([DIA, "8:30 a. m.", "", "Mentor Tres", 2, ""]);
    expect(todas(ws).join(" ")).not.toContain("inseguro");
  });

  it("hoja final «Avisos» con los proyectos sin sala o sin enlace (y solo esos)", async () => {
    const wb = await libroCompleto(await cronogramaExcel());
    expect(wb.worksheets.map((w) => w.name)).toEqual([DIA, "Avisos"]);
    const av = wb.worksheets[1]!;
    expect(fila(av, 1)).toEqual(["Día", "Hora COL", "Mentor (sala)", "Sala", "Proyecto", "Código", "Ciudad", "Aviso"]);
    expect([fila(av, 2), fila(av, 3)]).toEqual([
      [DIA, "8:30 a. m.", "Mentor Tres", 2, "Sin enlace", "SEN", "Cali", "Sin enlace de sala"],
      [DIA, "9:00 a. m.", "Mentor Dos", "", "Sin sala", "SSA", "Cali", "Sin sala en el plan de salas"],
    ]);
    expect(av.rowCount).toBe(3);
    expect(todas(av).join(" ")).not.toMatch(/9100000001|9100000002|Caro|Dani/); // sin datos de estudiantes
  });

  it("sin avisos no hay hoja «Avisos»", async () => {
    const c = await db.collections();
    const quitados = await c.asientos.find({ mentorId: { $in: ["m2", "m3"] } }).toArray();
    await c.asientos.deleteMany({ mentorId: { $in: ["m2", "m3"] } });
    try {
      const wb = await libroCompleto(await cronogramaExcel());
      expect(wb.worksheets.map((w) => w.name)).toEqual([DIA]);
    } finally {
      await c.asientos.insertMany(quitados);
    }
  });

  it("un mentor que parece fórmula se escribe como texto en la hoja del día y en «Avisos»", async () => {
    const c = await db.collections();
    await c.mentores.updateOne({ _id: "m2" }, { $set: { nombre: "=HYPERLINK(\"x\")" } });
    try {
      const wb = await libroCompleto(await cronogramaExcel());
      expect(filaDe(wb.worksheets[0]!, "SSA")[3]).toBe("'=HYPERLINK(\"x\")");
      expect(fila(wb.worksheets[1]!, 3)[2]).toBe("'=HYPERLINK(\"x\")");
    } finally {
      await c.mentores.updateOne({ _id: "m2" }, { $set: { nombre: "Mentor Dos" } });
    }
  });

  it("un enlace que parece fórmula se escribe como texto", async () => {
    const c = await db.collections();
    await c.salasConfig.updateOne({ _id: "actual" }, { $set: { "salas.0.enlace": "https://x.test/=1" } });
    try {
      const ws = await libro(await cronogramaExcel());
      expect(filaDe(ws, "PAR")[5]).toBe("https://x.test/=1");
      expect(ws.getRow(2).getCell(6).type).toBe(ExcelJS.ValueType.String);
    } finally {
      await c.salasConfig.updateOne({ _id: "actual" }, { $set: { "salas.0.enlace": ENLACE } });
    }
  });
});

describe("permisos por rol en la ruta /api/coordinacion/cronograma", () => {
  it("admin recibe documento y correo", async () => {
    como("admin");
    const res = await ruta.GET();
    expect(res.status).toBe(200);
    const ws = await libro(await res.arrayBuffer());
    expect(fila(ws, 1)).toEqual(ENC_ADMIN);
    expect(todas(ws)).toContain("0012345678");
  });

  for (const quien of ["coord", "monitorCoord", "coordFalsoAdmin"])
    it(`${quien} recibe el cronograma de siempre, sin documento ni correo`, async () => {
      como(quien);
      const res = await ruta.GET();
      expect(res.status).toBe(200);
      const ws = await libro(await res.arrayBuffer());
      expect(fila(ws, 1)).toEqual(ENC_HOY);
      expect(todas(ws).join(" ")).not.toMatch(/0012345678|ana\.perez|Documento|Correo/i);
    });

  for (const quien of ["monitor", "mentor"])
    it(`${quien} no puede descargarlo`, async () => {
      como(quien);
      expect((await ruta.GET()).status).toBe(403);
    });

  it("sin sesión: 401", async () => {
    estado.token = "";
    expect((await ruta.GET()).status).toBe(401);
  });
});

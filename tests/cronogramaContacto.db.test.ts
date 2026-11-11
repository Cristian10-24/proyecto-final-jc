import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Cronograma en Excel con documento y correo de cada integrante: solo en la descarga de administración.
// Coordinación (y monitor con coordinación adicional) recibe las columnas de siempre. Base LOCAL, datos INVENTADOS.

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

const ENC_BASE = ["Hora COL", "Hora UY", "Mentor (sala)", "Monitor", "Ciudad", "Proyecto", "Código"];
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
  await c.mentores.insertOne({ _id: "m1", nombre: "Mentor Uno" });
  const pareja = new ObjectId(), individual = new ObjectId();
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
  ]);
  await c.asientos.insertMany([
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 0), mentorId: "m1", ciudades: ["Cali"], proyectoId: pareja },
    { _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 15), mentorId: "m1", ciudades: ["Cali"], proyectoId: individual },
  ]);
});
afterAll(async () => { await db.closeDb(); });

async function libro(buf: Buffer | ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as ArrayBuffer);
  return wb.worksheets[0]!;
}
const fila = (ws: ExcelJS.Worksheet, n: number) => (ws.getRow(n).values as unknown[]).slice(1);
const todas = (ws: ExcelJS.Worksheet) => ws.getSheetValues().flat().map(String);

describe("cronograma con datos personales (admin)", () => {
  it("pareja: cada integrante junto a su documento, celular y correo; correo en minúscula y sin espacios; sin correo queda vacío", async () => {
    const ws = await libro(await cronogramaExcel({ datosPersonales: true }));
    expect(fila(ws, 1)).toEqual(ENC_ADMIN);
    expect(fila(ws, 2)).toEqual([
      "8:00 a. m.", "", "Mentor Uno", "Por asignar", "Cali", "Pareja", "PAR",
      "Ana Uno", "0012345678", "+573000000001", "ana.perez@correo.com",
      "Beto Dos", "1234567890123456789", "+573000000002", "",
    ]);
  });

  it("documento como texto: conserva ceros a la izquierda y no pasa a notación científica", async () => {
    const ws = await libro(await cronogramaExcel({ datosPersonales: true }));
    for (const col of [9, 13]) {
      const celda = ws.getRow(2).getCell(col);
      expect(celda.type).toBe(ExcelJS.ValueType.String);
      expect(celda.numFmt).toBe("@");
    }
  });

  it("individual: lo del integrante 2 queda vacío; textos que parecen fórmula se escriben como texto", async () => {
    const ws = await libro(await cronogramaExcel({ datosPersonales: true }));
    expect(fila(ws, 3).slice(7)).toEqual(["'@Raro", "'-900", "+573000000003", "'=hyperlink(\"x\")@a.co", "", "", "", ""]);
  });
});

describe("cronograma sin datos personales (como siempre)", () => {
  it("mismas columnas de hoy, sin documento ni correo", async () => {
    const ws = await libro(await cronogramaExcel());
    expect(fila(ws, 1)).toEqual(ENC_HOY);
    expect(fila(ws, 2)).toEqual(["8:00 a. m.", "", "Mentor Uno", "Por asignar", "Cali", "Pareja", "PAR", "Ana Uno", "+573000000001", "Beto Dos", "+573000000002"]);
    expect(fila(ws, 3)).toEqual(["8:15 a. m.", "", "Mentor Uno", "Por asignar", "Cali", "Individual", "IND", "'@Raro", "+573000000003", "", ""]);
    const t = todas(ws).join(" ");
    expect(t).not.toMatch(/0012345678|1234567890123456789|correo|Documento|Correo/i);
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

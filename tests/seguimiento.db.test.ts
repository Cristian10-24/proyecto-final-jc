import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Seguimiento del monitor, resumen y cronograma contra la base LOCAL.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { cronogramaExcel, resumen, seguimiento } = await import("@/lib/seguimiento");
const { textoPendientes } = await import("@/lib/whatsapp");
const { reservar } = await import("@/lib/reservas");
const { inicioUTC } = await import("@/lib/edicion");

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.dias.insertMany([
    { _id: "2026-11-12", ciudades: [{ ciudad: "Cali", cupos: 2, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 1, sobrante: false, abre: null }] },
    { _id: "2026-11-17", ciudades: [{ ciudad: "Todas", cupos: null, sobrante: true, abre: null }] },
  ]);
  const a = (dia: string, h: number, m: number, mentorId: string, ciudades: string[]) => ({ _id: new ObjectId(), dia, inicio: inicioUTC(dia, h, m), mentorId, ciudades, proyectoId: null });
  await c.asientos.insertMany([
    a("2026-11-12", 8, 0, "m1", ["Cali"]), a("2026-11-12", 8, 15, "m1", ["Cali"]), a("2026-11-12", 8, 30, "m1", ["Cartagena"]),
    a("2026-11-17", 8, 0, "m1", ["Paysandú", "Medellín"]),
  ]);
  await c.mentores.insertOne({ _id: "m1", nombre: "Mentor Uno" });
  await c.users.insertOne({ _id: new ObjectId(), usuario: "mon.cali", nombre: "Monitor Cali", passwordHash: "x", rol: "monitor", ciudades: ["Cali"], activo: true, creadoEn: new Date() });
  const now = new Date();
  const p = (codigo: string, ciudad: string, docs: string[], monitor: string | null = null) => ({
    _id: new ObjectId(), codigo, ciudad, nombre: `Proyecto ${codigo}`, monitor, creadoEn: now, actualizadoEn: now,
    integrantes: docs.map((d, i) => ({ documento: d, nombre: `Estudiante ${codigo}${i + 1}`, celular: `+57300000${d.slice(-4)}` })),
  });
  await c.proyectos.insertMany([
    p("C1", "Cali", ["9000000001"], "mon.cali"), p("C2", "Cali", ["9000000002", "9000000003"]), p("T1", "Cartagena", ["9000000004"]), p("U1", "Paysandú", ["9000000005"]),
  ]);
  expect((await reservar("9000000001", inicioUTC("2026-11-12", 8, 0))).ok).toBe(true);
  expect((await reservar("9000000005", inicioUTC("2026-11-17", 8, 0))).ok).toBe(true);
});
afterAll(() => db.closeDb());

describe("seguimiento", () => {
  it("el monitor solo ve sus ciudades, con documento enmascarado", async () => {
    const f = await seguimiento({ rol: "monitor", ciudades: ["Cali"] });
    expect(f.map((x) => [x.codigo, x.hora !== null])).toEqual([["C1", true], ["C2", false]]);
    expect(f[1]!.integrantes[0]!.documento).toBe("•••• 0002");
    expect(JSON.stringify(f)).not.toContain("9000000002");
  });

  it("coordinación ve todas las ciudades", async () => {
    expect((await seguimiento({ rol: "coordinador", ciudades: [] })).map((x) => x.codigo).sort()).toEqual(["C1", "C2", "T1", "U1"]);
  });

  it("texto de pendientes para WhatsApp: por ciudad, con nombres y el enlace", () => {
    const t = textoPendientes([
      { nombre: "Uno", ciudad: "Cali", integrantes: [{ nombre: "Ana" }], hora: null },
      { nombre: "Dos", ciudad: "Cali", integrantes: [{ nombre: "Luis" }, { nombre: "Sara" }], hora: null },
      { nombre: "Tres", ciudad: "Cali", integrantes: [{ nombre: "Eva" }], hora: "2026-11-12T13:00:00.000Z" },
    ], "https://ejemplo.org/");
    expect(t).toContain("*Cali* · faltan 2");
    expect(t).toContain("• Luis y Sara — Dos");
    expect(t).not.toContain("Eva");
    expect(t).toContain("https://ejemplo.org/");
    expect(textoPendientes([], "x")).toBe("");
  });
});

describe("resumen", () => {
  it("avance por ciudad de menor a mayor y ocupación por día", async () => {
    const r = await resumen();
    expect(r).toMatchObject({ total: 4, conHora: 2 });
    expect(r.ciudades.map((c) => [c.ciudad, c.conHora, c.proyectos])).toEqual([["Cartagena", 0, 1], ["Cali", 1, 2], ["Paysandú", 1, 1]]);
    expect(r.ciudades.find((c) => c.ciudad === "Cali")).toMatchObject({ asientosLibres: 1, dias: ["2026-11-12"] });
    expect(r.dias).toEqual([{ dia: "2026-11-12", capacidad: 3, ocupados: 1 }, { dia: "2026-11-17", capacidad: 1, ocupados: 1 }]);
  });
});

describe("cronograma en Excel", () => {
  it("una hoja por día, con hora COL (y UY para Uruguay), mentor, monitor e integrantes", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await cronogramaExcel()) as unknown as ArrayBuffer);
    // Sin plan de salas: Sala y Enlace vacíos y hoja final «Avisos».
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Jueves 12 de noviembre", "Martes 17 de noviembre", "Avisos"]);
    const fila = (n: number, w = 0) => (wb.worksheets[w]!.getRow(n).values as unknown[]).slice(1);
    expect(fila(1)).toEqual(["Día", "Hora COL", "Hora UY", "Mentor (sala)", "Sala", "Enlace de sala", "Monitor", "Ciudad", "Proyecto", "Código", "Integrante 1", "Celular 1", "Integrante 2", "Celular 2"]);
    expect(fila(2)).toEqual(["Jueves 12 de noviembre", "8:00 a. m.", "", "Mentor Uno", "", "", "Monitor Cali", "Cali", "Proyecto C1", "C1", "Estudiante C11", "+573000000001", "", ""]);
    expect(fila(2, 1).slice(0, 8)).toEqual(["Martes 17 de noviembre", "8:00 a. m.", "10:00 a. m.", "Mentor Uno", "", "", "Por asignar", "Paysandú"]);
  });
});

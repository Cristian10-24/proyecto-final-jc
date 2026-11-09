import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Fase 4 · Paso 24 · Carga de los mentores (solo lectura) y propuestas para juntar proyectos. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const k = await import("@/lib/cargaMentores");
const { inicioUTC } = await import("@/lib/edicion");

const D = "2026-11-12";
const H = (h: number, m = 0) => inicioUTC(D, h, m);
type A = { _id: ObjectId; inicio: Date; mentorId: string; ciudades: string[]; proyectoId: ObjectId | null };
const asiento = (inicio: Date, mentorId: string, proyectoId: ObjectId | null = null, ciudades = ["Cali"]): A => ({ _id: new ObjectId(), inicio, mentorId, ciudades, proyectoId });
const nombre = (id: string) => `Mentor ${id}`;

describe("funciones puras", () => {
  it("horas sueltas: sin proyectos en la hora anterior ni en la siguiente", () => {
    expect([...k.sueltas([8, 10, 11, 14])].sort()).toEqual([14, 8]);
    expect([...k.sueltas([9])]).toEqual([]);
    expect([...k.sueltas([9, 10])]).toEqual([]);
  });

  it("junta en el mismo bloque primero; si no hay cupo, otro bloque de la misma hora", () => {
    // Hora 9: mentor a con 3 (9:00, 9:15, 9:30 ocupados), b con 1 en 9:45, c con 1 en 9:00. Total 5; a tiene 4 asientos.
    const p = Array.from({ length: 5 }, () => new ObjectId());
    const proys = new Map(p.map((x, i) => [String(x), { _id: x, codigo: `P-${i}`, nombre: `App ${i}`, ciudad: "Cali" }]));
    const lista = [
      asiento(H(9), "a", p[0]), asiento(H(9, 15), "a", p[1]), asiento(H(9, 30), "a", p[2]), asiento(H(9, 45), "a"),
      asiento(H(9), "b"), asiento(H(9, 15), "b"), asiento(H(9, 30), "b"), asiento(H(9, 45), "b", p[3]),
      asiento(H(9), "c", p[4]), asiento(H(9, 15), "c"), asiento(H(9, 30), "c"), asiento(H(9, 45), "c"),
    ];
    const r = k.proponerHora(lista, proys, new Set(), false, nombre);
    expect(r.mentoresAntes).toBe(3);
    // Se quedan a (3) y b o c; el que cede manda su proyecto a un libre de los que se quedan.
    expect(r.mentoresDespues).toBe(2);
    expect(r.propuestas).toHaveLength(1);
    const pr = r.propuestas[0]!;
    // Mismo bloque disponible: no cambia la hora.
    expect(pr.cambiaHora).toBe(false);
    expect(pr.de.inicio).toBe(pr.a.inicio);
  });

  it("no mueve proyectos evaluados y su mentor se queda; nada que juntar con un solo mentor", () => {
    const p = [new ObjectId(), new ObjectId()];
    const proys = new Map(p.map((x, i) => [String(x), { _id: x, codigo: `P-${i}`, nombre: `App ${i}`, ciudad: "Cali" }]));
    const lista = [asiento(H(10), "a", p[0]), asiento(H(10, 15), "a"), asiento(H(10), "b", p[1]), asiento(H(10, 15), "b")];
    // b tiene un evaluado: se queda b; a cede su proyecto a b (otro bloque: 10:15).
    const r = k.proponerHora(lista, proys, new Set([String(p[1])]), false, nombre);
    expect(r.propuestas).toMatchObject([{ proyecto: { codigo: "P-0" }, de: { mentor: "Mentor a" }, a: { mentor: "Mentor b" }, cambiaHora: true }]);
    // Los dos evaluados: nadie se mueve.
    expect(k.proponerHora(lista, proys, new Set(p.map(String)), false, nombre).propuestas).toEqual([]);
    expect(k.proponerHora(lista.slice(0, 2), proys, new Set(), false, nombre).propuestas).toEqual([]);
  });

  it("asiento de otra ciudad: se marca con el modo apagado y no con el modo encendido", () => {
    const p = [new ObjectId(), new ObjectId()];
    const proys = new Map(p.map((x, i) => [String(x), { _id: x, codigo: `P-${i}`, nombre: `App ${i}`, ciudad: "Cali" }]));
    const lista = [asiento(H(11), "a", p[0]), asiento(H(11), "b", p[1]), asiento(H(11, 15), "b", null, ["Cartagena"])];
    expect(k.proponerHora(lista, proys, new Set(), false, nombre).propuestas[0]).toMatchObject({ otraCiudad: true });
    expect(k.proponerHora(lista, proys, new Set(), true, nombre).propuestas[0]).toMatchObject({ otraCiudad: false });
  });
});

describe("casos del revisor de pruebas", () => {
  const mapa = (p: ObjectId[]) => new Map(p.map((x, i) => [String(x), { _id: x, codigo: `P-${i}`, nombre: `App ${i}`, ciudad: "Cali" }]));

  it("varios compiten por pocos libres: ningún destino se repite ni estaba ocupado; mismo día y hora", () => {
    const p = Array.from({ length: 6 }, () => new ObjectId());
    const lista = [
      asiento(H(9), "a", p[0]), asiento(H(9, 15), "a", p[1]), asiento(H(9, 30), "a", p[2]), asiento(H(9, 45), "a"),
      asiento(H(9), "b", p[3]), asiento(H(9, 15), "b"), asiento(H(9, 30), "b"), asiento(H(9, 45), "b"),
      asiento(H(9), "c", p[4]), asiento(H(9, 15), "c", p[5]),
    ];
    const r = k.proponerHora(lista, mapa(p), new Set(), false, nombre);
    const destinos = r.propuestas.map((x) => `${x.a.mentor}|${x.a.inicio}`);
    expect(new Set(destinos).size).toBe(destinos.length);
    const ocupados = new Set(lista.filter((x) => x.proyectoId).map((x) => `${nombre(x.mentorId)}|${x.inicio.toISOString()}`));
    expect(destinos.filter((d) => ocupados.has(d))).toEqual([]);
    for (const x of r.propuestas) expect(x.a.inicio.slice(0, 13)).toBe(x.de.inicio.slice(0, 13));
  });

  it("un mentor con un evaluado se queda; su evaluado nunca se propone y un «no se presentó» sí puede moverse", () => {
    const p = Array.from({ length: 4 }, () => new ObjectId());
    const lista = [
      asiento(H(10), "a", p[0]), asiento(H(10, 15), "a", p[1]), asiento(H(10, 30), "a"), asiento(H(10, 45), "a"),
      asiento(H(10), "b", p[2]), asiento(H(10, 15), "b", p[3]), asiento(H(10, 30), "b", null), asiento(H(10, 45), "b"),
    ];
    // p[0] evaluado: a se queda; b (2 proyectos sin evaluar) cede los suyos a los libres de a.
    const r = k.proponerHora(lista, mapa(p), new Set([String(p[0])]), false, nombre);
    expect(r.propuestas.some((x) => x.proyecto.id === String(p[0]))).toBe(false);
    expect(r.propuestas.every((x) => x.a.mentor === "Mentor a")).toBe(true);
    expect(r.propuestas).toHaveLength(2);
  });

  it("cupo insuficiente: propone lo que cabe y cuenta bien los mentores de después", () => {
    const p = Array.from({ length: 3 }, () => new ObjectId());
    // a tiene 2 asientos (1 libre); b y c tienen 1 proyecto cada uno y ningún libre. Total 3, cupo de a = 2.
    const lista = [asiento(H(11), "a", p[0]), asiento(H(11, 15), "a"), asiento(H(11), "b", p[1]), asiento(H(11), "c", p[2])];
    const r = k.proponerHora(lista, mapa(p), new Set(), false, nombre);
    expect(r.propuestas).toHaveLength(1);
    expect(r.mentoresDespues).toBe(2);
  });

  it("prefiere el asiento de la ciudad del proyecto con el modo apagado", () => {
    const p = [new ObjectId(), new ObjectId()];
    const lista = [asiento(H(12), "a", p[0]), asiento(H(12, 15), "a", null, ["Cartagena"]), asiento(H(12, 30), "a", null, ["Cali"]), asiento(H(12), "b", p[1])];
    const r = k.proponerHora(lista, mapa(p), new Set(), false, nombre);
    expect(r.propuestas[0]).toMatchObject({ otraCiudad: false, a: { inicio: H(12, 30).toISOString() } });
  });
});

describe("con la base (solo lectura)", () => {
  beforeAll(async () => {
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
    const c = await db.collections();
    const now = new Date();
    const ids = Array.from({ length: 4 }, () => new ObjectId());
    await c.proyectos.insertMany(ids.map((_id, i) => ({ _id, codigo: `P-${i}`, ciudad: "Cali", nombre: `=App ${i}`, integrantes: [{ documento: String(9300000000 + i), nombre: "Persona" }], creadoEn: now, actualizadoEn: now })));
    await c.mentores.insertMany([{ _id: "a", nombre: "Ana Mentora" }, { _id: "b", nombre: "Beto Mentor" }]);
    await c.asientos.insertMany([
      ...[0, 15, 30, 45].map((m, i) => ({ ...asiento(H(8, m), "a", i < 2 ? ids[i]! : null), dia: D })),
      ...[0, 15, 30, 45].map((m, i) => ({ ...asiento(H(8, m), "b", i === 0 ? ids[2]! : null), dia: D })),
      ...[0, 15, 30, 45].map((m, i) => ({ ...asiento(H(11, m), "a", i === 0 ? ids[3]! : null), dia: D })),
    ]);
  });
  afterAll(() => db.closeDb());

  it("carga por mentor y hora con marcas, propuestas, y no escribe nada", async () => {
    const c = await db.collections();
    const antes = JSON.stringify(await c.asientos.find({}).sort({ _id: 1 }).toArray()) + JSON.stringify(await c.changeLog.find({}).toArray());
    const r = await k.cargaMentores();
    expect(r.dias).toEqual([D]);
    const ana = r.dia!.mentores.find((m) => m.nombre === "Ana Mentora")!;
    expect(ana.total).toBe(3);
    expect(ana.horas).toEqual([
      { hora: 8, proyectos: 2, asientos: 4, poca: true, suelta: true },
      { hora: 11, proyectos: 1, asientos: 4, poca: true, suelta: true },
    ]);
    const h8 = r.dia!.resumen.find((x) => x.hora === 8)!;
    expect(h8).toMatchObject({ proyectos: 3, mentoresAntes: 2, mentoresDespues: 1 });
    expect(h8.propuestas).toMatchObject([{ de: { mentor: "Beto Mentor" }, a: { mentor: "Ana Mentora" }, cambiaHora: true }]); // las 8:00 de Ana están ocupadas
    expect(JSON.stringify(await c.asientos.find({}).sort({ _id: 1 }).toArray()) + JSON.stringify(await c.changeLog.find({}).toArray())).toBe(antes);
    expect(await k.cargaMentores("2030-01-01")).toMatchObject({ dia: { dia: D } });
  });

  it("Excel: hojas Carga y Propuestas, nombres que parecen fórmula como texto", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await k.cargaMentoresExcel()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Carga", "Propuestas"]);
    expect(wb.getWorksheet("Carga")!.rowCount).toBe(4);
    const valores = wb.getWorksheet("Propuestas")!.getSheetValues().flat().map(String);
    expect(valores).toContain("'=App 2");
  });
});

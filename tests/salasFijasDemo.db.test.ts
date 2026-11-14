import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { cargarDemo, EXISTENTES, foto } from "./helpers/foto-base";

// Hoja «Plan de salas» con la semilla DEMO (base LOCAL): «como producción» (sin acciones del admin no cambia nada)
// y el libro de prueba de la demo (scripts/plan-salas-demo.ts) se importa sin errores y solo cambia del 17 al 21.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { leerLibroSalas } = await import("@/lib/importar/salas");
const { leerLibro } = await import("@/lib/importar/excel");
const plan = await import("@/lib/planSalas");
const fijo = await import("@/lib/planSalasFijo");
const { libroPlanSalasDemo } = await import("../scripts/plan-salas-demo");

const ADMIN = { rol: "admin" as const, usuario: "admin.demo" };
const DIAS_FIJOS = ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
let libroDemo: ExcelJS.Workbook;

beforeAll(async () => {
  await db.closeDb();
  cargarDemo("2026-11-14");
  // Ida y vuelta por un .xlsx, como lo sube el admin.
  libroDemo = await leerLibro(Buffer.from(await (await libroPlanSalasDemo()).xlsx.writeBuffer()));
}, 180_000);
afterAll(() => db.closeDb());

describe("como producción", () => {
  it("vista previa, plan, Excel y lecturas no cambian ningún dato", async () => {
    const c = await db.collections();
    const antes = await foto(c, EXISTENTES);
    const p = await fijo.previaPlanFijo(leerLibroSalas(libroDemo));
    expect(p.errores).toEqual([]);
    await plan.verPlan();
    await plan.planSalasExcel();
    expect(await foto(c, EXISTENTES)).toEqual(antes);
  });
});

describe("libro de prueba de la demo", () => {
  it("solo cambia del 17 al 21; los demás días y los datos quedan idénticos", async () => {
    const c = await db.collections();
    const libro = leerLibroSalas(libroDemo);
    expect(libro.errores).toEqual([]);
    const p = await fijo.previaPlanFijo(libro);
    expect(p.errores).toEqual([]);
    expect(p.planFijo!.dias).toEqual(DIAS_FIJOS);
    expect(p.planFijo!.diasSinCambios).toEqual(["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-16"]);
    expect(p.planFijo!.confirmarEnlaces).toBe(false);
    expect(p.planFijo!.enlacesCambian.map((e) => e.sala)).toEqual([8]);
    // Cada monitor con una sola sala.
    for (const m of p.planFijo!.salasPorMonitor) expect(m.salas).toHaveLength(1);

    const fueraFiltro = { dia: { $nin: DIAS_FIJOS } };
    const otros = await c.planSalas.find(fueraFiltro).sort({ _id: 1 }).toArray();
    const datos = await foto(c, ["proyectos", "asientos", "evalResultados", "evalMonitor", "evalBorradores", "cambiosSugeridos", "users", "mentores", "dias"]);
    await fijo.aplicarPlanFijo(libro, ADMIN);
    expect(await c.planSalas.find(fueraFiltro).sort({ _id: 1 }).toArray()).toEqual(otros);
    expect(await foto(c, ["proyectos", "asientos", "evalResultados", "evalMonitor", "evalBorradores", "cambiosSugeridos", "users", "mentores", "dias"])).toEqual(datos);
    expect(await c.planSalas.countDocuments({ dia: { $in: DIAS_FIJOS }, fijo: { $ne: true } })).toBe(0);
  });
});

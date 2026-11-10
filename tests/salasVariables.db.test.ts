import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { ENC_CUPOS, horarios, libro } from "./helpers/libros";

// Número de salas variable: sale de la hoja Salas importada (Sala 1 a N, máximo 12). El jueves 12 hay una hora con
// 8 mentores a la vez. Contra la base LOCAL. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { aplicarMentores } = await import("@/lib/importar/aplicar");
const { leerLibroMentores } = await import("@/lib/importar/mentores");
const { leerLibroSalas } = await import("@/lib/importar/salas");
const plan = await import("@/lib/planSalas");

const actor = { rol: "admin" as const, usuario: "admin.prueba" };
const libroSalas = (n: number) => leerLibroSalas(libro({
  Salas: [["Sala", "Enlace"], ...Array.from({ length: n }, (_, i) => [`Sala ${i + 1}`, `https://meet.ejemplo.org/${i + 1}`])],
  Monitores: [["Día", "Hora", "Mentor", "Monitor"]],
  "Disponibilidad monitores": [["Monitor", "Día", "Hora"]],
}));
/** Lo que no debe cambiar nunca al importar salas: asientos (reservas) y evaluaciones. */
const huella = async () => {
  const c = await db.collections();
  return JSON.stringify([await c.asientos.find({}).sort({ _id: 1 }).toArray(), await c.evalResultados.find({}).toArray()]);
};

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  // Jueves 12: a las 8 hay 8 mentores a la vez; a las 9, 7.
  await aplicarMentores(leerLibroMentores(libro({
    Horarios: horarios([{ dia: "Jueves 12 nov", horas: [8], mentores: 8 }, { dia: "Jueves 12 nov", horas: [9], mentores: 7 }]),
    Cupos: [ENC_CUPOS, ["Jueves 12 nov", "Cali", null, "x", null]],
  })), actor);
});
afterAll(() => db.closeDb());

describe("número de salas desde la hoja Salas", () => {
  it("con 7 salas, la hora de 8 mentores se rechaza como hoy y no se guarda nada", async () => {
    const p = await plan.previaSalas(libroSalas(7));
    expect(p.errores.map((e) => e.mensaje).join(" ")).toMatch(/8 mentores y solo 7 salas/);
    await expect(plan.aplicarSalas(libroSalas(7), actor)).rejects.toThrow();
    expect((await plan.verPlan()).hayConfig).toBe(false);
  });

  it("con 8 salas, la hora de 8 mentores queda con las 8 salas asignadas; reservas y evaluaciones intactas", async () => {
    const antes = await huella();
    expect((await plan.previaSalas(libroSalas(8))).errores).toEqual([]);
    await plan.aplicarSalas(libroSalas(8), actor);
    const v = await plan.verPlan();
    const a8 = v.filas.filter((f) => f.hora === 8);
    expect(a8.map((f) => f.sala).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(new Set(a8.map((f) => f.mentor)).size).toBe(8);
    expect(a8.find((f) => f.sala === 8)?.enlace).toBe("https://meet.ejemplo.org/8");
    expect(v.filas.filter((f) => f.hora === 9)).toHaveLength(7);
    expect(await huella()).toBe(antes);
  });

  it("al reimportar con más salas (12), el plan se recalcula sin tocar reservas ni evaluaciones", async () => {
    const antes = await huella();
    await plan.aplicarSalas(libroSalas(12), actor);
    const v = await plan.verPlan();
    expect(v.filas.filter((f) => f.hora === 8)).toHaveLength(8); // una sala por mentor: sobran 4
    expect(await huella()).toBe(antes);
    const cfg = await (await db.collections()).salasConfig.findOne({ _id: "actual" });
    expect(cfg?.salas).toHaveLength(12);
  });

  it("sala 13, «0» o «Sala 0» se rechazan al leer la hoja", () => {
    for (const mala of [13, "0", "Sala 0", "Sala 13", -1, "8.5"]) {
      const l = leerLibroSalas(libro({ Salas: [["Sala", "Enlace"], [mala, "https://meet.ejemplo.org/x"]] }));
      expect(l.errores.map((e) => e.mensaje).join(" "), String(mala)).toMatch(/del 1 al 12/);
    }
  });
});

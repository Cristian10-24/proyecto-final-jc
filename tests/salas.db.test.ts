import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { ENC_CUPOS, horarios, libro } from "./helpers/libros";

// Plan de salas contra la base LOCAL: importar, cambiar el monitor (índice único), recalcular y changeLog.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { aplicarMentores } = await import("@/lib/importar/aplicar");
const { leerLibroMentores } = await import("@/lib/importar/mentores");
const { leerLibroSalas } = await import("@/lib/importar/salas");
const plan = await import("@/lib/planSalas");

const actor = { rol: "admin" as const, usuario: "admin.prueba" };
const D = "2026-11-12";
const ENC_DISP = ["Monitor", "Día", "Hora"];

const mentores = (horas: number[]) => leerLibroMentores(libro({
  Horarios: horarios([{ dia: "Jueves 12 nov", horas, mentores: 2 }]),
  Cupos: [ENC_CUPOS, ["Jueves 12 nov", "Cali", null, "x", null]],
}));
const libroSalas = (extra: Record<string, (string | number | null)[][]> = {}) => leerLibroSalas(libro({
  Salas: [["Sala", "Enlace"], [1, "https://meet.ejemplo.org/1"], [2, "https://meet.ejemplo.org/2"]],
  Monitores: [["Día", "Hora", "Mentor", "Monitor"], ["Jueves 12 nov", "08 am", "Mentor Prueba 1", "Monitora Uno"]],
  "Disponibilidad monitores": [ENC_DISP, ...[8, 9, 10].flatMap((h) => [["Monitora Uno", "Jueves 12 nov", `${h}:00`], ["mon.dos", "Jueves 12 nov", `${h}:00`]]), ["Nadie Conocido", "Jueves 12 nov", "08 am"]],
  ...extra,
}));

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  await c.users.insertMany([
    { _id: new ObjectId(), usuario: "mon.uno", nombre: "Monitora Uno", passwordHash: "x", rol: "monitor", ciudades: ["Panamá"], activo: true, creadoEn: now },
    { _id: new ObjectId(), usuario: "mon.dos", nombre: "Monitor Dos", passwordHash: "x", rol: "monitor", ciudades: ["Cali"], activo: true, creadoEn: now },
    { _id: new ObjectId(), usuario: "mon.tres", nombre: "Monitor Tres", passwordHash: "x", rol: "monitor", ciudades: ["Cartagena"], activo: true, creadoEn: now },
  ]);
  await aplicarMentores(mentores([8, 9, 10]), actor);
});
afterAll(() => db.closeDb());

describe("importar salas y monitores", () => {
  it("sin plan todavía, la vista está vacía", async () => {
    expect(await plan.verPlan()).toMatchObject({ hayConfig: false, desactualizado: false, filas: [] });
  });

  it("vista previa: salas, monitores de cualquier ciudad y aviso por nombre desconocido", async () => {
    const p = await plan.previaSalas(libroSalas());
    expect(p.errores).toEqual([]);
    expect(p).toMatchObject({ salas: 2, horasSala: 6, sinMonitor: 0, porOrigen: { importado: 1, automatico: 5, admin: 0 } });
    expect(p.avisos.map((a) => a.mensaje).join(" ")).toContain('"Nadie Conocido"');
    expect(await (await db.collections()).planSalas.countDocuments()).toBe(0); // la vista previa no escribe
  });

  it("aplicar guarda el plan; un monitor nunca está en dos salas a la vez", async () => {
    await plan.aplicarSalas(libroSalas(), actor);
    const v = await plan.verPlan();
    expect(v.hayConfig).toBe(true);
    expect(v.filas).toHaveLength(6);
    expect(v.filas.find((f) => f.hora === 8 && f.mentor === "Mentor Prueba 1")).toMatchObject({ sala: 1, monitor: { usuario: "mon.uno" }, origen: "importado", enlace: "https://meet.ejemplo.org/1" });
    for (const h of [8, 9, 10]) {
      const m = v.filas.filter((f) => f.hora === h).map((f) => f.monitor?.usuario);
      expect(new Set(m).size).toBe(2);
    }
    expect(await (await db.collections()).changeLog.findOne({ accion: "importar", nuevo: /^salas y monitores/ })).not.toBeNull();
  });

  it("errores bloquean: mentor desconocido en la hoja Monitores", async () => {
    const l = libroSalas({ Monitores: [["Día", "Hora", "Mentor", "Monitor"], ["Jueves 12 nov", "08 am", "Mentor Inventado", "Monitora Uno"]] });
    expect((await plan.previaSalas(l)).errores[0]!.mensaje).toContain("Mentor Inventado");
    await expect(plan.aplicarSalas(l, actor)).rejects.toThrow("errores");
  });
});

describe("cambiar el monitor de una sala", () => {
  const id = `${D}|9|2`;

  it("rechaza un monitor que ya está en otra sala a esa hora (índice único)", async () => {
    const otra = (await plan.verPlan()).filas.find((f) => f.hora === 9 && f.sala === 1)!;
    expect(await plan.cambiarMonitorSala(id, otra.monitor!.usuario, actor)).toEqual({ ok: false, error: "ocupado", sala: 1 });
  });

  it("asigna un monitor libre, lo marca como cambio manual y deja changeLog", async () => {
    expect(await plan.cambiarMonitorSala(id, "mon.tres", actor)).toEqual({ ok: true });
    expect((await plan.verPlan()).filas.find((f) => f.id === id)).toMatchObject({ monitor: { usuario: "mon.tres" }, origen: "admin" });
    const log = await (await db.collections()).changeLog.findOne({ accion: "monitor_sala" });
    expect(log?.nuevo).toContain("Sala 2 · Monitor Tres");
    expect(log?.actor).toEqual(actor);
  });

  it("monitor inexistente o sala inexistente", async () => {
    expect(await plan.cambiarMonitorSala(id, "no.existe", actor)).toEqual({ ok: false, error: "monitor_invalido" });
    expect(await plan.cambiarMonitorSala(`${D}|15|1`, null, actor)).toEqual({ ok: false, error: "no_existe" });
  });
});

describe("recalcular después de reimportar mentores", () => {
  it("marca el plan desactualizado y al recalcular conserva el cambio manual", async () => {
    await aplicarMentores(mentores([9, 10, 11]), actor);
    expect((await plan.verPlan()).desactualizado).toBe(true);
    const r = await plan.recalcularPlan(actor);
    expect(r.ok).toBe(true);
    expect(r.ok && r.avisos[0]!.mensaje).toContain("ya no existe"); // la fila de las 8 am de la hoja Monitores
    const v = await plan.verPlan();
    expect(v.desactualizado).toBe(false);
    expect(v.filas.map((f) => f.hora).sort((a, b) => a - b)).toEqual([9, 9, 10, 10, 11, 11]);
    expect(v.filas.find((f) => f.id === `${D}|9|2`)).toMatchObject({ monitor: { usuario: "mon.tres" }, origen: "admin" });
    expect(v.filas.filter((f) => f.hora === 11).every((f) => !f.monitor)).toBe(true); // nadie dio disponibilidad a las 11
  });

  it("descarga el plan en Excel", async () => {
    const { leerLibro } = await import("@/lib/importar/excel");
    const wb = await leerLibro(await plan.planSalasExcel());
    const ws = wb.getWorksheet("Plan de salas")!;
    expect(ws.getRow(1).values).toEqual([undefined, "Día", "Hora COL", "Sala", "Enlace", "Mentor", "Monitor"]);
    expect(ws.rowCount).toBe(7);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { ENC_CUPOS, ENC_PROYECTOS, horarios, libro } from "./helpers/libros";

// Aplicar importaciones contra la base LOCAL: escribe, respeta reservas y deja registro en changeLog.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { aplicarMentores, aplicarProyectos, previaMentores, previaProyectos } = await import("@/lib/importar/aplicar");
const { leerLibroMentores } = await import("@/lib/importar/mentores");
const { leerLibroProyectos } = await import("@/lib/importar/proyectos");

const actor = { rol: "admin" as const, usuario: "prueba" };

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
});
afterAll(() => db.closeDb());

const libroMentores = () => leerLibroMentores(libro({
  Horarios: horarios([{ dia: "Jueves 12 nov", horas: [8, 9], mentores: 3 }, { dia: "Viernes 13 nov", horas: [16], mentores: 2 }]),
  Cupos: [ENC_CUPOS, ["Jueves 12 nov", "Cali", 10, "x", null], ["Jueves 12 nov", "Cartagena", 8, null, null], ["Viernes 13 nov", "Barranquilla", null, "x", "2026-11-13 14:00"]],
}));

describe("importar mentores", () => {
  it("crea mentores, días y asientos libres", async () => {
    const l = libroMentores();
    expect((await previaMentores(l)).errores).toEqual([]);
    await aplicarMentores(l, actor);
    const c = await db.collections();
    expect(await c.asientos.countDocuments()).toBe(24 + 8);
    expect(await c.asientos.countDocuments({ dia: "2026-11-12", ciudades: "Cali" })).toBe(16);
    expect(await c.asientos.countDocuments({ proyectoId: null })).toBe(32);
    expect(await c.mentores.countDocuments()).toBe(3);
    expect((await c.dias.findOne({ _id: "2026-11-13" }))?.ciudades[0]?.abre?.toISOString()).toBe("2026-11-13T19:00:00.000Z");
    expect(await c.changeLog.countDocuments({ accion: "importar" })).toBe(1);
  });

  it("volver a importar reemplaza todo mientras nadie haya reservado", async () => {
    await aplicarMentores(libroMentores(), actor);
    expect(await (await db.collections()).asientos.countDocuments()).toBe(32);
  });
});

describe("importar proyectos", () => {
  const leer = (filas: (string | number | null)[][]) => leerLibroProyectos(libro({ Proyectos: [ENC_PROYECTOS, ...filas] }));

  it("inserta y luego actualiza por código", async () => {
    const a = leer([["P-1", "Cali", "Uno", "G1", "2000000001", "Ana Uno", null, null], ["P-2", "Cartagena", "Dos", null, "2000000002", "Luis Dos", "2000000003", "Sara Tres"]]);
    const p1 = await previaProyectos(a.proyectos, a.errores);
    expect(p1).toMatchObject({ total: 2, nuevos: 2, actualizados: 0, errores: [] });
    await aplicarProyectos(a.proyectos, actor);

    const b = leer([["P-1", "Cali", "Uno corregido", null, "2000000001", "Ana Uno", null, null]]);
    expect(await previaProyectos(b.proyectos, b.errores)).toMatchObject({ nuevos: 0, actualizados: 1, fueraDelArchivo: 1 });
    await aplicarProyectos(b.proyectos, actor);
    const { proyectos } = await db.collections();
    const p = await proyectos.findOne({ codigo: "P-1" });
    expect(p).toMatchObject({ nombre: "Uno corregido" });
    expect(p?.grupo).toBeUndefined();
    expect(await proyectos.countDocuments()).toBe(2);
  });

  it("detecta un documento que ya es de otro proyecto en la base", async () => {
    const c = leer([["P-9", "Cali", "Nueve", null, "2000000003", "Sara Tres", null, null]]);
    const previa = await previaProyectos(c.proyectos, c.errores);
    expect(previa.errores[0]?.mensaje).toMatch(/ya es del proyecto P-2/);
  });

  it("con reservas: reimportar conserva la reserva; quitar su hora-mentor es un conflicto", async () => {
    const c = await db.collections();
    const p2 = await c.proyectos.findOne({ codigo: "P-2" });
    // Reserva a las 9:00 del jueves con el mentor 3.
    const reservado = await c.asientos.findOneAndUpdate({ dia: "2026-11-12", mentorId: "mentor-prueba-3", inicio: new Date("2026-11-12T14:00:00Z") }, { $set: { proyectoId: p2!._id } }, { returnDocument: "after" });

    const mismo = await previaMentores(libroMentores());
    expect(mismo.errores).toEqual([]);
    expect(mismo.reservadosQueSeConservan).toBe(1);
    expect(mismo.horasPorMentor).toEqual([{ nombre: "Mentor Prueba 1", horas: 3 }, { nombre: "Mentor Prueba 2", horas: 3 }, { nombre: "Mentor Prueba 3", horas: 2 }]);
    await aplicarMentores(libroMentores(), actor);
    expect(await c.asientos.findOne({ _id: reservado!._id })).toMatchObject({ proyectoId: p2!._id });
    expect(await c.asientos.countDocuments()).toBe(32);

    // Mentor 3 deja de estar el jueves: su asiento reservado no se borra, se reporta.
    const sinM3 = leerLibroMentores(libro({
      Horarios: horarios([{ dia: "Jueves 12 nov", horas: [8, 9], mentores: 2 }, { dia: "Viernes 13 nov", horas: [16], mentores: 2 }]),
      Cupos: [ENC_CUPOS, ["Jueves 12 nov", "Cali", 8, "x", null], ["Jueves 12 nov", "Cartagena", 8, null, null], ["Viernes 13 nov", "Barranquilla", null, "x", null]],
    }));
    const previa = await previaMentores(sinM3);
    expect(previa.errores).toHaveLength(1);
    expect(previa.errores[0]!.mensaje).toMatch(/Conflicto: P-2 \(Cartagena\) tiene hora el 2026-11-12 a las 9:00 a\. m\. con Mentor Prueba 3/);
    await expect(aplicarMentores(sinM3, actor)).rejects.toThrow("conflictos");
    expect(await c.asientos.countDocuments()).toBe(32);

    const d = leer([["P-2", "Cali", "Dos", null, "2000000002", "Luis Dos", "2000000003", "Sara Tres"]]);
    expect((await previaProyectos(d.proyectos, d.errores)).errores[0]?.mensaje).toMatch(/ya tiene hora en Cartagena/);
  });

  it("el índice único impide dos asientos para un proyecto", async () => {
    const c = await db.collections();
    const p2 = await c.proyectos.findOne({ codigo: "P-2" });
    await expect(c.asientos.updateOne({ proyectoId: null }, { $set: { proyectoId: p2!._id } })).rejects.toThrow(/duplicate key/);
  });
});

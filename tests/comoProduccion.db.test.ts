import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { cargarDemo, EXISTENTES, foto } from "./helpers/foto-base";

// Fase 4 · "Como producción": con la demo y cambios hechos a mano (pareja separada, hora en un asiento de otra
// ciudad), lo nuevo no cambia NINGÚN dato existente sin una acción de usuario, y el portal responde igual.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { agenda, consultar } = await import("@/lib/estudiante");
const { cambiarModo, estadoModo } = await import("@/lib/modoCupos");
const { moverProyecto } = await import("@/lib/mover");
const { separarPareja } = await import("@/lib/gestionProyectos");

const ADMIN = { rol: "admin" as const, usuario: "admin.demo" };
const AHORA = new Date("2026-11-11T15:00:00Z");
let documentos: string[] = [];

async function portal() {
  const out: Record<string, unknown> = {};
  for (const d of documentos) out[d] = { consultar: await consultar(d), agenda: await agenda(d, undefined, AHORA) };
  return out;
}

beforeAll(async () => {
  cargarDemo("2026-11-12");
  await db.closeDb();
  const c = await db.collections();
  // Cambios a mano como los de producción.
  const evaluados = new Set((await c.evalResultados.distinct("proyectoId")).map(String));
  const pareja = (await c.proyectos.find({ "integrantes.1": { $exists: true } }).toArray()).find((p) => !evaluados.has(String(p._id)));
  expect(await separarPareja(pareja!._id, { queda: 0 }, ADMIN)).toMatchObject({ ok: true });
  const conHora = new Set((await c.asientos.distinct("proyectoId", { proyectoId: { $ne: null } })).map(String));
  const sinHora = (await c.proyectos.find({}).toArray()).find((p) => !conHora.has(String(p._id)) && !evaluados.has(String(p._id)));
  const ajeno = await c.asientos.findOne({ proyectoId: null, ciudades: { $ne: sinHora!.ciudad }, inicio: { $gt: new Date() } });
  await db.transaccion(async (s) => { await moverProyecto(s, sinHora!._id, null, [{ _id: ajeno!._id }], "admin.demo", new Date()); });
  documentos = (await c.proyectos.find({}).toArray()).flatMap((p) => p.integrantes.map((i) => i.documento));
  expect(documentos.length).toBeGreaterThan(50);
}, 180_000);
afterAll(() => db.closeDb());

describe("sin acciones de usuario no cambia nada", () => {
  it("arranque (índices), resumen del modo y portal para todos los documentos: datos idénticos", async () => {
    let c = await db.collections();
    const antes = await foto(c);
    const portalAntes = await portal();
    await db.closeDb();
    c = await db.collections(); // vuelve a correr ensureIndexes, como un despliegue nuevo
    expect(await estadoModo()).toMatchObject({ ordenLlegada: false });
    const portalDespues = await portal();
    expect(portalDespues).toEqual(portalAntes);
    expect(await foto(c)).toEqual(antes);
    expect(await c.ajustes.countDocuments()).toBe(0);
    expect(await c.candadosCupo.countDocuments()).toBe(0);
  });

  it("encender y apagar el modo solo escribe el ajuste, los candados y dos entradas del historial", async () => {
    const c = await db.collections();
    const sinHistorial = EXISTENTES.filter((n) => n !== "changeLog");
    const antes = await foto(c, sinHistorial);
    const historial = await c.changeLog.countDocuments();
    const portalAntes = await portal();
    await cambiarModo(true, ADMIN);
    await cambiarModo(false, ADMIN);
    expect(await foto(c, sinHistorial)).toEqual(antes);
    expect(await c.changeLog.countDocuments()).toBe(historial + 2);
    expect(await portal()).toEqual(portalAntes);
  });
});

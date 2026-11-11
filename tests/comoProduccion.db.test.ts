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
const { bloquesLibres } = await import("@/lib/admin");
const { datosTablero } = await import("@/lib/tableroHorarios");
const { resumen, seguimiento: seguimientoInscripcion } = await import("@/lib/seguimiento");
const { listarSinProyecto, noInscrito } = await import("@/lib/sinProyecto");
const { seguimiento: seguimientoEval } = await import("@/lib/evaluacion/resultados");
const { listarProyectos } = await import("@/lib/admin");
const { cargaMentores } = await import("@/lib/cargaMentores");
const { vistaUsuario } = await import("@/lib/usuarios");
const { revisionNombres } = await import("@/lib/usuariosExcel");
const citaciones = await import("@/lib/citaciones/registro");

const ADMIN = { rol: "admin" as const, usuario: "admin.demo" };
const AHORA = new Date("2026-11-11T15:00:00Z");
let documentos: string[] = [];

async function portal() {
  const out: Record<string, unknown> = {};
  for (const d of documentos) out[d] = { consultar: await consultar(d), agenda: await agenda(d, undefined, AHORA), noInscrito: await noInscrito(d) };
  // Lecturas del admin y de coordinación (Paso 20): bloques para mover, tablero de cada día y resumen.
  const c = await db.collections();
  const dias = (await c.dias.find({}).toArray()).map((d) => d._id).sort();
  const algunos = (await c.proyectos.find({}).sort({ _id: 1 }).limit(15).toArray()).map((p) => p._id);
  for (const dia of dias) {
    out[`tablero ${dia}`] = await datosTablero(dia);
    out[`carga ${dia}`] = await cargaMentores(dia); // Paso 24: solo lectura
    for (const p of algunos) out[`bloques ${dia} ${p}`] = await bloquesLibres(p, dia);
    // Fase 5 · Paso 28: la pantalla de citaciones (filas y vistas previas, en modo real y prueba) solo lee.
    for (const tipo of ["participante", "mentor", "monitor"] as const) {
      const fs = await citaciones.filasDelDia(dia, tipo, null, AHORA);
      out[`citaciones ${dia} ${tipo}`] = fs;
      out[`citaciones prueba ${dia} ${tipo}`] = await citaciones.filasDelDia(dia, tipo, "yo@prueba.test", AHORA);
      for (const f of fs.slice(0, 3)) out[`vista ${dia} ${tipo} ${f.clave}`] = await citaciones.vistaPrevia(dia, tipo, f.clave, null);
    }
  }
  out.resumen = await resumen();
  // Fase 5 · Paso 27: la lista de Usuarios (con el celular opcional) y la revisión de nombres solo leen.
  out.usuarios = (await c.users.find({}).sort({ usuario: 1 }).toArray()).map(vistaUsuario);
  out.revisionNombres = await revisionNombres();
  // Paso 21: listas y estadísticas con «Sin proyecto» (sin marcas ni participantes: todo como antes).
  out.sinProyecto = await listarSinProyecto();
  out.inscripcion = await seguimientoInscripcion({ rol: "coordinador", ciudades: [] });
  out.evaluaciones = await seguimientoEval();
  out.horarios = { todos: await listarProyectos({}), sinHora: await listarProyectos({ estado: "sin_hora" }), marcados: await listarProyectos({ estado: "sin_proyecto" }) };
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
    expect(await c.sinProyecto.countDocuments()).toBe(0);
    expect(await c.comentarios.countDocuments()).toBe(0);
    expect(await c.citaciones.countDocuments()).toBe(0); // Fase 5: ver la pantalla no crea citaciones
    expect(await c.citacionesConfig.countDocuments()).toBe(0);
    expect(await c.proyectos.countDocuments({ sinProyecto: { $exists: true } })).toBe(0);
    // Ningún documento real queda como «no inscrito» y las listas nuevas están vacías.
    expect(documentos.filter((d) => (portalDespues[d] as { noInscrito: boolean }).noInscrito)).toEqual([]);
    expect(portalDespues.sinProyecto).toEqual({ participantes: [], marcados: [] });
    expect((portalDespues.evaluaciones as { sinProyecto: unknown[] }).sinProyecto).toEqual([]);
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

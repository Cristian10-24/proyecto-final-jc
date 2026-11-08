import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import type { SessionUser } from "@/lib/auth";

// Fase 4 · Paso 22 · Comentarios de seguimiento contra la base LOCAL: permisos por rol y ciudad, solo los propios se
// editan o borran, borrar oculta, indicador en las listas y unir proyectos los conserva. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const k = await import("@/lib/comentarios");
const { listarProyectos } = await import("@/lib/admin");
const { seguimiento } = await import("@/lib/seguimiento");
const { datosTablero } = await import("@/lib/tableroHorarios");
const g = await import("@/lib/gestionProyectos");

const u = (usuario: string, rol: SessionUser["rol"], ciudades: string[] = []): SessionUser => ({ id: usuario, usuario, nombre: `Nombre ${usuario}`, rol, ciudades });
const MON_CALI = u("moni.cali", "monitor", ["Cali"]), MON_CALI2 = u("moni.cali2", "monitor", ["Cali"]), MON_CTG = u("moni.ctg", "monitor", ["Cartagena"]);
const COORD = u("coord", "coordinador"), ADMIN = u("admin", "admin"), MENTOR = u("mentor", "mentor");
let CALI: ObjectId, CTG: ObjectId;

async function proyecto(codigo: string, ciudad: string, doc: string) {
  const c = await db.collections(), now = new Date(), _id = new ObjectId();
  await c.proyectos.insertOne({ _id, codigo, ciudad, nombre: `App ${codigo}`, monitor: null, creadoEn: now, actualizadoEn: now, integrantes: [{ documento: doc, nombre: `Persona ${codigo}` }] });
  return _id;
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  CALI = await proyecto("P-8100000001", "Cali", "8100000001");
  CTG = await proyecto("P-8100000002", "Cartagena", "8100000002");
});
afterAll(() => db.closeDb());

describe("texto", () => {
  it("limpia controles, espacios al final y líneas en blanco de más; conserva tildes y saltos", () => {
    expect(k.limpiarComentario("  Llamé a la mamá\u0000 \r\n\r\n\r\n\r\nConfirmó   ‮\n")).toBe("Llamé a la mamá\n\nConfirmó");
    expect(k.limpiarComentario("é")).toBe("é"); // NFC
  });
});

describe("permisos y propiedad", () => {
  it("el monitor comenta en sus ciudades y no en otras; coordinación, admin y mentor no escriben", async () => {
    expect(await k.crearComentario(MON_CALI, CALI, "Llamé a la familia.")).toMatchObject({ ok: true });
    expect(await k.crearComentario(MON_CALI, CTG, "No es mío")).toMatchObject({ ok: false, error: "no_existe" });
    for (const x of [COORD, ADMIN, MENTOR]) expect(await k.crearComentario(x, CALI, "Hola")).toMatchObject({ ok: false, error: "sin_permiso" });
    expect(await k.crearComentario(MON_CALI, CALI, "   \n ")).toMatchObject({ ok: false, error: "datos" });
    expect(await k.crearComentario(MON_CALI, CALI, "x".repeat(1001))).toMatchObject({ ok: false, error: "datos" });
    expect(await k.crearComentario(MON_CALI, new ObjectId(), "Hola")).toMatchObject({ ok: false, error: "no_existe" });
  });

  it("leen: el monitor de la ciudad (otro también), coordinación y admin; el de otra ciudad no", async () => {
    const r = await k.listarComentarios(MON_CALI2, CALI);
    expect(r).toMatchObject({ ok: true, puedeEscribir: true, comentarios: [{ autorNombre: "Nombre moni.cali", rol: "monitor", texto: "Llamé a la familia.", tuyo: false }] });
    expect(await k.listarComentarios(COORD, CALI)).toMatchObject({ ok: true, puedeEscribir: false, comentarios: [{ tuyo: false }] });
    expect(await k.listarComentarios(ADMIN, CALI)).toMatchObject({ ok: true, puedeEscribir: false });
    expect(await k.listarComentarios(MON_CTG, CALI)).toMatchObject({ ok: false, error: "no_existe" });
    expect(JSON.stringify(r)).not.toContain('"autor"'); // no expone el usuario del autor
  });

  it("solo el autor edita o borra; borrar lo oculta para todos; no se edita un borrado", async () => {
    const c = await db.collections();
    const com = (await c.comentarios.findOne({ proyectoId: CALI }))!;
    expect(await k.editarComentario(MON_CALI2, CALI, com._id, "Cambio ajeno")).toMatchObject({ ok: false, error: "ajeno" });
    expect(await k.borrarComentario(MON_CALI2, CALI, com._id)).toMatchObject({ ok: false, error: "ajeno" });
    expect(await k.editarComentario(MON_CALI, CTG, com._id, "Otro proyecto")).toMatchObject({ ok: false, error: "no_existe" });
    expect(await k.editarComentario(MON_CALI, CALI, com._id, "Llamé a la familia: presenta el jueves.")).toMatchObject({ ok: true });
    expect((await k.listarComentarios(MON_CALI, CALI)) as { comentarios: unknown[] }).toMatchObject({ comentarios: [{ texto: "Llamé a la familia: presenta el jueves.", tuyo: true, editadoEn: expect.any(String) }] });
    expect(await k.borrarComentario(MON_CALI, CALI, com._id)).toMatchObject({ ok: true });
    expect(await k.listarComentarios(ADMIN, CALI)).toMatchObject({ comentarios: [] });
    expect(await k.editarComentario(MON_CALI, CALI, com._id, "Revivir")).toMatchObject({ ok: false, error: "no_existe" });
    expect(await k.borrarComentario(MON_CALI, CALI, com._id)).toMatchObject({ ok: false, error: "no_existe" });
    expect((await c.comentarios.findOne({ _id: com._id }))!.borradoEn).toBeInstanceOf(Date); // queda guardado, oculto
    // Al editar, el texto anterior se guarda (no se pierde lo que ya se leyó); no sale en la lista.
    expect((await c.comentarios.findOne({ _id: com._id }))!.anteriores).toMatchObject([{ texto: "Llamé a la familia.", hasta: expect.any(Date) }]);
  });
});

describe("casos del revisor", () => {
  it("texto con $ se guarda tal cual; dos ediciones quedan en orden y no salen en la lista", async () => {
    const p = await proyecto("P-8100000010", "Cali", "8100000010");
    const r = await k.crearComentario(MON_CALI, p, "Primero") as { id: string };
    const id = new ObjectId(r.id);
    expect(await k.editarComentario(MON_CALI, p, id, "$texto y $$ROOT")).toMatchObject({ ok: true });
    expect(await k.editarComentario(MON_CALI, p, id, "Tercero")).toMatchObject({ ok: true });
    const c = await db.collections();
    expect((await c.comentarios.findOne({ _id: id }))!.anteriores!.map((x) => x.texto)).toEqual(["Primero", "$texto y $$ROOT"]);
    const lista = await k.listarComentarios(ADMIN, p);
    expect(JSON.stringify(lista)).not.toContain("anteriores");
    expect(lista).toMatchObject({ comentarios: [{ texto: "Tercero" }] });
    // Límite exacto y texto vacío al editar.
    expect(await k.editarComentario(MON_CALI, p, id, "x".repeat(1000))).toMatchObject({ ok: true });
    expect(await k.editarComentario(MON_CALI, p, id, "x".repeat(1001))).toMatchObject({ ok: false, error: "datos" });
    expect(await k.editarComentario(MON_CALI, p, id, "  ")).toMatchObject({ ok: false, error: "datos" });
  });

  it("un comentario de otro proyecto (ambos visibles) no se toca; otros roles no editan ni borran", async () => {
    const a = await proyecto("P-8100000011", "Cali", "8100000011");
    const b = await proyecto("P-8100000012", "Cali", "8100000012");
    const r = await k.crearComentario(MON_CALI, a, "En A") as { id: string };
    const id = new ObjectId(r.id);
    expect(await k.editarComentario(MON_CALI, b, id, "Cambiado")).toMatchObject({ ok: false, error: "no_existe" });
    expect(await k.borrarComentario(MON_CALI, b, id)).toMatchObject({ ok: false, error: "no_existe" });
    for (const x of [COORD, ADMIN, MENTOR]) {
      expect(await k.editarComentario(x, a, id, "Cambiado")).toMatchObject({ ok: false, error: "sin_permiso" });
      expect(await k.borrarComentario(x, a, id)).toMatchObject({ ok: false, error: "sin_permiso" });
    }
    expect(await k.listarComentarios(ADMIN, a)).toMatchObject({ comentarios: [{ texto: "En A" }] });
  });
});

describe("topes de volumen", () => {
  it(`un autor tiene a lo sumo ${50} comentarios visibles por proyecto; borrar libera`, async () => {
    const p = await proyecto("P-8100000009", "Cali", "8100000009");
    const c = await db.collections();
    await c.comentarios.insertMany(Array.from({ length: k.MAX_POR_AUTOR }, (_, i) => ({ _id: new ObjectId(), proyectoId: p, autor: "moni.cali", autorNombre: "M", rol: "monitor" as const, texto: `n${i}`, creadoEn: new Date(Date.now() + i) })));
    expect(await k.crearComentario(MON_CALI, p, "Uno más")).toMatchObject({ ok: false, error: "datos" });
    expect(await k.crearComentario(MON_CALI2, p, "Otro autor sí")).toMatchObject({ ok: true });
    const primero = (await c.comentarios.findOne({ proyectoId: p, autor: "moni.cali" }, { sort: { creadoEn: 1 } }))!;
    await k.borrarComentario(MON_CALI, p, primero._id);
    expect(await k.crearComentario(MON_CALI, p, "Ahora sí")).toMatchObject({ ok: true });
  });
});

describe("indicador «Con comentarios»", () => {
  it("Horarios, seguimiento del monitor y Tablero cuentan los visibles", async () => {
    await k.crearComentario(MON_CTG, CTG, "Uno");
    await k.crearComentario(MON_CTG, CTG, "Dos");
    const r = await k.crearComentario(MON_CTG, CTG, "Tres") as { id: string };
    await k.borrarComentario(MON_CTG, CTG, new ObjectId(r.id));
    const fila = (await listarProyectos({ q: "P-8100000002" }))[0]!;
    expect(fila.comentarios).toBe(2);
    expect((await listarProyectos({ q: "P-8100000001" }))[0]!.comentarios).toBe(0);
    expect((await seguimiento(MON_CTG)).find((f) => f.codigo === "P-8100000002")).toMatchObject({ id: String(CTG), comentarios: 2 });
    expect((await datosTablero()).sinHora.find((t) => t.codigo === "P-8100000002")!.comentarios).toBe(2);
  });

  it("al unir proyectos, los comentarios del proyecto eliminado pasan al unido", async () => {
    const otro = await proyecto("P-8100000003", "Cartagena", "8100000003");
    await k.crearComentario(MON_CTG, otro, "Comentario del otro");
    expect(await g.agregarIntegrante(CTG, { documento: "8100000003" }, { unir: true }, { rol: "admin", usuario: "admin" })).toMatchObject({ ok: true });
    const r = await k.listarComentarios(ADMIN, CTG) as { comentarios: { texto: string }[] };
    expect(r.comentarios.map((x) => x.texto)).toEqual(["Uno", "Dos", "Comentario del otro"]);
  });
});

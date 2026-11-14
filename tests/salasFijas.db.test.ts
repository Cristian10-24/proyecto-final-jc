import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { ENC_CUPOS, horarios, libro } from "./helpers/libros";

// Hoja «Plan de salas» contra la base LOCAL: solo cambian los días del archivo; jueves 12 y viernes 13 quedan
// idénticos; reservas, evaluaciones, asistencia y proyectos no se tocan; recalcular, Franjas y «Volver a automático».

usarBaseLocal(5);
const db = await import("@/lib/db");
const { aplicarMentores } = await import("@/lib/importar/aplicar");
const { leerLibroMentores } = await import("@/lib/importar/mentores");
const { leerLibroSalas } = await import("@/lib/importar/salas");
const { inicioUTC } = await import("@/lib/edicion");
const plan = await import("@/lib/planSalas");
const fijo = await import("@/lib/planSalasFijo");
const fr = await import("@/lib/franjas");
const { datosDelDia } = await import("@/lib/citaciones/registro");
const { citacionesParticipantes, citacionesMentores } = await import("@/lib/citaciones/contenido");

const actor = { rol: "admin" as const, usuario: "admin.prueba" };
const D12 = "2026-11-12", D13 = "2026-11-13", D17 = "2026-11-17", D18 = "2026-11-18";
const M = (n: number) => `mentor-prueba-${n}`;
const NOMBRE = (n: number) => `Mentor Prueba ${n}`;
const TXT: Record<string, string> = { [D17]: "Martes 17 nov", [D18]: "Miércoles 18 nov" };
const hhTxt = (h: number) => `${String(h % 12 || 12).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
const ENLACE = (s: number) => `https://meet.ejemplo.org/sala-${s}`;
const SALAS3 = [["Sala", "Enlace"], ...[1, 2, 3].map((s) => [s, ENLACE(s)])];
const SALAS4 = [...SALAS3, [4, ENLACE(4)]];
const P12 = new ObjectId(), P17 = new ObjectId();

type Fila = (string | number | null)[];
const libroPlan = (filas: Fila[], extra: Record<string, Fila[]> = {}) => leerLibroSalas(libro({ Salas: SALAS4, "Plan de salas": [["Día", "Hora", "Mentor", "Sala", "Monitor"], ...filas], ...extra }));

/** Filas que rotan la sala de cada mentor (así todas cambian) y fijan monitores sin repetir en la hora. */
let FILAS: Fila[] = [];
async function armarFilas() {
  const { planSalas } = await db.collections();
  const actual = await planSalas.find({ dia: D17 }).toArray();
  const mon = ["kamelia", "juan", ""];
  FILAS = [];
  for (const h of [8, 9, 10]) for (const n of [1, 2, 3]) {
    const s = actual.find((p) => p.hora === h && p.mentorId === M(n))!.sala;
    FILAS.push([TXT[D17]!, hhTxt(h), NOMBRE(n), (s % 3) + 1, mon[n - 1]!]);
  }
  FILAS.push([TXT[D18]!, hhTxt(17), NOMBRE(1), 4, "ana.m"], [TXT[D18]!, hhTxt(17), NOMBRE(2), 1, "juan"]);
}

async function huella(dias?: string[]) {
  const c = await db.collections();
  const f = dias ? { dia: { $in: dias } } : {};
  const orden = { _id: 1 } as const;
  const cfg = await c.salasConfig.findOne({ _id: "actual" });
  const enDias = <T extends { dia: string }>(xs: T[] | undefined) => (xs ?? []).filter((x) => !dias || dias.includes(x.dia));
  return JSON.stringify({
    plan: await c.planSalas.find(f).sort(orden).toArray(),
    importados: enDias(cfg?.importados), disponibilidad: enDias(cfg?.disponibilidad), fijos: enDias(cfg?.fijos),
  });
}
async function huellaDatos() {
  const c = await db.collections();
  const o = { _id: 1 } as const;
  return JSON.stringify(await Promise.all([c.proyectos, c.asientos, c.evalResultados, c.evalMonitor, c.mentores].map((x) => (x as typeof c.proyectos).find({}).sort(o).toArray())));
}

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  const now = new Date();
  await c.users.insertMany(["kamelia", "juan", "ana.m"].map((u) => ({ _id: new ObjectId(), usuario: u, nombre: `Monitor ${u}`, passwordHash: "x", rol: "monitor" as const, ciudades: [], activo: true, creadoEn: now })));
  await aplicarMentores(leerLibroMentores(libro({
    Horarios: horarios([
      { dia: "Jueves 12 nov", horas: [8, 9], mentores: 3 }, { dia: "Viernes 13 nov", horas: [16], mentores: 2 },
      { dia: TXT[D17]!, horas: [8, 9, 10], mentores: 3 }, { dia: TXT[D18]!, horas: [17], mentores: 2 },
    ]),
    Cupos: [ENC_CUPOS, ["Jueves 12 nov", "Cali", null, "x", null], ["Viernes 13 nov", "Cartagena", null, "x", null], [TXT[D17]!, "Barranquilla", null, "x", null], [TXT[D18]!, "Barranquilla", null, "x", null]],
  })), actor);
  // Plan clásico de todos los días, con un monitor importado el 12 y disponibilidad para los demás.
  await plan.aplicarSalas(leerLibroSalas(libro({
    Salas: SALAS3,
    Monitores: [["Día", "Hora", "Mentor", "Monitor"], ["Jueves 12 nov", "08 am", NOMBRE(1), "kamelia"]],
    "Disponibilidad monitores": [["Monitor", "Día", "Hora"], ...["juan", "ana.m"].flatMap((m) => [
      ["Jueves 12 nov", 8], ["Jueves 12 nov", 9], ["Viernes 13 nov", 16], [TXT[D17]!, 8], [TXT[D17]!, 9], [TXT[D17]!, 10], [TXT[D18]!, 17],
    ].map(([d, h]) => [m, d as string, hhTxt(h as number)]))],
  })), actor);
  // Proyecto evaluado el 12 y proyecto con hora el 17 (sin evaluación).
  for (const [id, dia, hora, n] of [[P12, D12, 8, 1], [P17, D17, 8, 2]] as const) {
    await c.proyectos.insertOne({ _id: id, codigo: `C-${dia}`, ciudad: "Cali", nombre: `App ${dia}`, creadoEn: now, actualizadoEn: now, integrantes: [{ nombre: `Persona ${dia}`, documento: `9${dia.replace(/-/g, "")}`, correo: `p${dia}@ejemplo.org` }] });
    await c.asientos.updateOne({ inicio: inicioUTC(dia, hora, 0), mentorId: M(n) }, { $set: { proyectoId: id } });
  }
  await c.evalResultados.insertOne({ _id: `${P12}|9${D12.replace(/-/g, "")}`, proyectoId: P12, documento: `9${D12.replace(/-/g, "")}`, mentorId: M(1) } as never);
  await armarFilas();
});
afterAll(async () => { delete process.env.PFJC_HOY_PRUEBAS; await db.closeDb(); });

describe("vista previa", () => {
  it("no escribe; dice qué días cambian y cuáles no; lista cambios de sala, salas por monitor y enlaces", async () => {
    const antes = await huella();
    const p = await fijo.previaPlanFijo(libroPlan(FILAS));
    expect(p.errores).toEqual([]);
    expect(p.planFijo).toMatchObject({ dias: [D17, D18], diasSinCambios: [D12, D13], filasFijadas: 11, confirmarEnlaces: false, sinFila: [] });
    expect(p.planFijo!.cambiosSala.filter((x) => x.dia === D17)).toHaveLength(9);
    expect(p.planFijo!.enlacesCambian).toEqual([{ sala: 4, antes: null, despues: ENLACE(4) }]);
    expect(p.planFijo!.salasPorMonitor.find((m) => m.usuario === "kamelia")).toMatchObject({ bloques: 3 });
    expect(await huella()).toBe(antes);
  });

  it("lista el mentor activo sin fila (sala automática) y cada cambio manual que se descarta", async () => {
    const c = await db.collections();
    const una = await c.planSalas.findOne({ dia: D17, hora: 10, mentorId: M(3) });
    expect(await plan.cambiarMonitorSala(una!._id, "kamelia", actor)).toEqual({ ok: true }); // cambio manual
    const p = await fijo.previaPlanFijo(libroPlan(FILAS.filter((f) => !(f[1] === hhTxt(10) && f[2] === NOMBRE(3)))));
    expect(p.errores).toEqual([]);
    expect(p.planFijo!.sinFila).toEqual([expect.objectContaining({ dia: D17, hora: 10, mentor: NOMBRE(3) })]);
    expect(p.planFijo!.descartados).toEqual([expect.objectContaining({ dia: D17, hora: 10, mentor: NOMBRE(3), monitor: "Monitor kamelia" })]);
  });

  it("Monitores y Disponibilidad de otros días no se usan (aviso)", async () => {
    const p = await fijo.previaPlanFijo(libroPlan(FILAS, { Monitores: [["Día", "Hora", "Mentor", "Monitor"], ["Jueves 12 nov", "09 am", NOMBRE(2), "ana.m"]] }));
    expect(p.errores).toEqual([]);
    expect(p.planFijo!.ignoradas).toBe(1);
  });
});

describe("conflictos con errores claros por fila", () => {
  const conCambio = (i: number, cambio: Partial<Record<1 | 2 | 3 | 4, string | number>>): Fila[] => FILAS.map((f, j) => (j === i ? f.map((x, k) => (k in cambio ? cambio[k as 1]! : x)) : f));
  const errores = async (filas: Fila[], salas: Fila[] = SALAS4) => (await fijo.previaPlanFijo(leerLibroSalas(libro({ Salas: salas, "Plan de salas": [["Día", "Hora", "Mentor", "Sala", "Monitor"], ...filas] })))).errores;

  it("misma sala y hora", async () => {
    const e = await errores(conCambio(1, { 3: FILAS[0]![3]! }));
    expect(e[0]).toMatchObject({ hoja: "Plan de salas", fila: 3 });
    expect(e[0]!.mensaje).toContain("ya tiene otro mentor");
  });
  it("mentor inactivo esa hora", async () => {
    expect((await errores([...FILAS, [TXT[D17]!, "11 am", NOMBRE(1), 4, ""]]))[0]!.mensaje).toContain("no está activo");
  });
  it("sala sin enlace (no está en la hoja Salas)", async () => {
    expect((await errores(conCambio(9, { 3: 5 })))[0]!.mensaje).toContain("sala 5 no está en la hoja Salas");
  });
  it("monitor que no es usuario monitor activo, y monitor en dos salas a la vez", async () => {
    expect((await errores(conCambio(0, { 4: "nadie" })))[0]!.mensaje).toContain("usuario monitor activo");
    expect((await errores(conCambio(1, { 4: "kamelia" })))[0]!.mensaje).toContain("ya está en otra sala");
  });
  it("falta en la hoja Salas una sala que se usa el 12 o el 13", async () => {
    const e = await errores(FILAS.filter((f) => f[3] !== 2 && f[3] !== 3), [["Sala", "Enlace"], [1, ENLACE(1)], [4, ENLACE(4)]]);
    expect(e.some((x) => x.hoja === "Salas" && /Falta la sala [23]: se usa el 2026-11-12/.test(x.mensaje))).toBe(true);
  });
  it("bloque con evaluación guardada o asistencia marcada: no cambia de sala", async () => {
    const c = await db.collections();
    const doc = `${P17}|x`;
    await c.evalMonitor.insertOne({ _id: doc, proyectoId: P17, documento: "x", asistencia: "si", motivo: null, observacion: "", actualizadoEn: new Date(), actualizadoPor: "kamelia" });
    const e = await errores(FILAS);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ hoja: "Plan de salas", fila: 3 });
    expect(e[0]!.mensaje).toContain("evaluación guardada o asistencia marcada");
    await c.evalMonitor.deleteOne({ _id: doc });
    await c.evalResultados.insertOne({ _id: `${P17}|y`, proyectoId: P17, documento: "y", mentorId: M(2) } as never);
    expect((await errores(FILAS))[0]!.mensaje).toContain("evaluación guardada");
    await c.evalResultados.deleteOne({ _id: `${P17}|y` });
    await expect(fijo.aplicarPlanFijo(libroPlan(conCambio(1, { 3: FILAS[0]![3]! })), actor)).rejects.toThrow("errores");
  });
});

describe("aplicar", () => {
  let antes12y13 = "", datos = "", huellaCit = "";

  it("solo cambian el 17 y el 18; el 12 y el 13 (con sus monitores) y los datos quedan idénticos", async () => {
    antes12y13 = await huella([D12, D13]);
    datos = await huellaDatos();
    const d17 = await datosDelDia(D17);
    huellaCit = [...citacionesParticipantes(d17, ""), ...citacionesMentores(d17)].map((x) => x.huella).join();
    await fijo.aplicarPlanFijo(libroPlan(FILAS), actor);
    expect(await huella([D12, D13])).toBe(antes12y13);
    expect(await huellaDatos()).toBe(datos);
    const c = await db.collections();
    const p17 = await c.planSalas.find({ dia: D17 }).toArray();
    expect(p17).toHaveLength(9);
    expect(p17.every((p) => p.fijo)).toBe(true);
    for (const f of FILAS.filter((x) => x[0] === TXT[D17])) {
      const p = p17.find((x) => x.hora === +String(f[1]).slice(0, 2) % 12 + (String(f[1]).endsWith("pm") ? 12 : 0) && x.mentorId === `mentor-prueba-${String(f[2]).slice(-1)}`)!;
      expect(p.sala).toBe(f[3]);
      expect(p.monitor).toBe(f[4] || null);
    }
    expect(await c.planSalas.findOne({ dia: D18, mentorId: M(1) })).toMatchObject({ sala: 4, monitor: "ana.m", fijo: true });
    const cfg = await c.salasConfig.findOne({ _id: "actual" });
    expect(cfg!.salas.map((s) => s.sala)).toEqual([1, 2, 3, 4]);
    expect(cfg!.fijos).toHaveLength(11);
    const log = await c.changeLog.findOne({ accion: "importar_plan_salas" });
    expect(log!.anterior).toContain(D17);
    expect(log!.nuevo).toContain("sala 4 nueva");
    expect((await plan.verPlan()).diasFijos).toEqual([D17, D18]);
  });

  it("las citaciones de esos bloques quedan desactualizadas (la huella cambia)", async () => {
    const d17 = await datosDelDia(D17);
    const ahora = [...citacionesParticipantes(d17, ""), ...citacionesMentores(d17)].map((x) => x.huella).join();
    expect(ahora).not.toBe(huellaCit);
    expect(citacionesParticipantes(d17, "").find((x) => x.clave === String(P17))!.resumen.franjas[0]!.bloques[0]!.sala).toBe(FILAS[1]![3]);
  });

  it("cambiar el enlace de una sala que ya existía pide confirmación aparte", async () => {
    const otro = leerLibroSalas(libro({ Salas: [...SALAS3.slice(0, 1), [1, "https://meet.ejemplo.org/nueva-1"], ...SALAS4.slice(2)], "Plan de salas": [["Día", "Hora", "Mentor", "Sala", "Monitor"], ...FILAS] }));
    const p = await fijo.previaPlanFijo(otro);
    expect(p.planFijo).toMatchObject({ confirmarEnlaces: true, enlacesCambian: [{ sala: 1, antes: ENLACE(1), despues: "https://meet.ejemplo.org/nueva-1" }] });
    const h = await huella();
    await expect(fijo.aplicarPlanFijo(otro, actor)).rejects.toThrow("confirmar_enlaces");
    expect(await huella()).toBe(h);
    await fijo.aplicarPlanFijo(otro, actor, true);
    expect((await (await db.collections()).salasConfig.findOne({ _id: "actual" }))!.salas[0]!.enlace).toBe("https://meet.ejemplo.org/nueva-1");
    await fijo.aplicarPlanFijo(libroPlan(FILAS), actor, true); // deja el enlace como antes
  });
});

describe("recalcular y Franjas respetan lo fijado", () => {
  it("con hoy = 14: no toca el 12 ni el 13 y conserva las salas fijas", async () => {
    process.env.PFJC_HOY_PRUEBAS = "2026-11-14";
    const c = await db.collections();
    // Estado que un recálculo completo cambiaría: una sala del 13 sin monitor.
    const s13 = await c.planSalas.findOne({ dia: D13, monitor: { $type: "string" } });
    await c.planSalas.updateOne({ _id: s13!._id }, { $set: { monitor: null } });
    const h = await huella([D12, D13]), fijos17 = JSON.stringify(await c.planSalas.find({ dia: { $in: [D17, D18] } }).sort({ _id: 1 }).toArray());
    const datos = await huellaDatos();
    expect(await plan.recalcularPlan(actor)).toMatchObject({ ok: true });
    expect(await huella([D12, D13])).toBe(h);
    expect(JSON.stringify(await c.planSalas.find({ dia: { $in: [D17, D18] } }).sort({ _id: 1 }).toArray())).toBe(fijos17);
    expect(await huellaDatos()).toBe(datos);
  });

  it("Franjas: agregar un mentor el 17 le da una sala libre y no mueve las fijas", async () => {
    const c = await db.collections();
    await c.mentores.insertOne({ _id: "extra", nombre: "Mentora Extra" });
    expect(await fr.agregarMentor(D17, 9, "extra", actor)).toMatchObject({ ok: true });
    expect(await c.planSalas.findOne({ dia: D17, hora: 9, mentorId: "extra" })).toMatchObject({ sala: 4 });
    expect(await c.planSalas.countDocuments({ dia: D17, fijo: true })).toBe(9);
    expect(await fr.quitarMentor(D17, 9, "extra", actor)).toMatchObject({ ok: true });
  });

  it("sin fecha (todos los días): lo fijado y el bloque evaluado del 12 conservan sala y monitor", async () => {
    delete process.env.PFJC_HOY_PRUEBAS;
    const c = await db.collections();
    const evaluado = await c.planSalas.findOne({ dia: D12, hora: 8, mentorId: M(1) });
    await c.planSalas.updateOne({ _id: evaluado!._id }, { $set: { monitor: null, origen: null } });
    expect(await plan.recalcularPlan(actor)).toMatchObject({ ok: true });
    expect(await c.planSalas.findOne({ dia: D12, hora: 8, mentorId: M(1) })).toMatchObject({ sala: evaluado!.sala, monitor: null });
    expect(await c.planSalas.findOne({ dia: D13, monitor: null })).toBeNull(); // el 13 sí se recalculó
    expect(await c.planSalas.countDocuments({ dia: { $in: [D17, D18] }, fijo: true })).toBe(11);
  });

  it("importar el libro de siempre (sin Plan de salas) conserva lo fijado", async () => {
    await plan.aplicarSalas(leerLibroSalas(libro({ Salas: SALAS4 })), actor);
    expect((await plan.verPlan()).diasFijos).toEqual([D17, D18]);
    expect(await (await db.collections()).planSalas.countDocuments({ fijo: true })).toBe(11);
  });
});

describe("volver a automático", () => {
  it("quita lo fijo solo de ese día; conserva los monitores del archivo por mentor y hora", async () => {
    const c = await db.collections();
    const h = await huella([D12, D13, D18]), datos = await huellaDatos();
    const antes = await c.planSalas.find({ dia: D17 }).toArray();
    expect(await fijo.volverAutomatico(D17, actor)).toEqual({ ok: true });
    const despues = await c.planSalas.find({ dia: D17 }).toArray();
    expect(despues.some((p) => p.fijo)).toBe(false);
    for (const p of antes.filter((x) => x.monitor)) expect(despues.find((x) => x.hora === p.hora && x.mentorId === p.mentorId)!.monitor).toBe(p.monitor);
    expect(await huella([D12, D13, D18])).toBe(h);
    expect(await huellaDatos()).toBe(datos);
    expect((await plan.verPlan()).diasFijos).toEqual([D18]);
    expect(await c.changeLog.findOne({ accion: "plan_salas_automatico" })).not.toBeNull();
  });

  it("con hoy = 19: el 18 ya pasó (ni archivo ni volver a automático) y no cambia nada", async () => {
    process.env.PFJC_HOY_PRUEBAS = "2026-11-19";
    const h = await huella();
    expect(await fijo.volverAutomatico(D18, actor)).toEqual({ ok: false, error: "pasado" });
    const p = await fijo.previaPlanFijo(libroPlan(FILAS.filter((f) => f[0] === TXT[D18])));
    expect(p.errores.map((e) => e.mensaje)).toEqual([expect.stringContaining("ya pasó"), expect.stringContaining("ya pasó")]);
    expect(await huella()).toBe(h);
    delete process.env.PFJC_HOY_PRUEBAS;
  });

  it("un día sin salas fijas responde sin_fijos y no cambia nada", async () => {
    const h = await huella();
    expect(await fijo.volverAutomatico(D12, actor)).toEqual({ ok: false, error: "sin_fijos" });
    expect(await huella()).toBe(h);
  });
});

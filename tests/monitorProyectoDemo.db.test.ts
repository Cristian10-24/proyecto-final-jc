import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { cargarDemo, foto } from "./helpers/foto-base";
import type { SessionUser } from "@/lib/auth";

// Monitor por proyecto · «COMO PRODUCCIÓN» con la demo en la base LOCAL de pruebas:
// - Sin excepciones: recorrer todas las vistas y exportes del monitor (como cada monitor, coordinación y admin) no
//   cambia nada en la base y nada trae campos nuevos («manual» ni monitor por proyecto).
// - Asignar a mano el monitor de un proyecto y quitarlo deja todas las vistas idénticas a como estaban y no toca más
//   datos que la colección nueva (vacía al final), el changeLog y el contador `rev` del asiento.

usarBaseLocal(5);
const db = await import("@/lib/db");
const mon = await import("@/lib/evaluacion/monitor");
const { monitoresDe } = await import("@/lib/evaluacion/datos");
const { filasEstudiantes } = await import("@/lib/evaluacion/resultados");
const { misProyectos, proyectosVisibles } = await import("@/lib/misProyectos");
const { miCiudad } = await import("@/lib/vistas/miCiudad");
const { asignacionesMonitores } = await import("@/lib/vistas/monitores");
const { cronogramaExcel } = await import("@/lib/seguimiento");
const { asignarMonitorProyecto, quitarMonitorProyecto } = await import("@/lib/monitorProyecto");
const { diaCOL, horaCOL } = await import("@/lib/edicion");

const TODAS = [
  "proyectos", "asientos", "dias", "inscripciones", "mentores", "salasConfig", "planSalas", "evalResultados", "evalBorradores",
  "evalConfig", "evalMonitor", "evalAnuladas", "cambiosSugeridos", "changeLog", "users", "ajustes", "comentarios", "citaciones", "monitorExcepciones",
] as const;
let monitores: SessionUser[] = [];
let admin: SessionUser, coord: SessionUser;

const sesion = (u: { _id: unknown; usuario: string; nombre: string; rol: SessionUser["rol"]; ciudades?: string[]; rolesExtra?: SessionUser["rolesExtra"] }): SessionUser =>
  ({ id: String(u._id), usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.ciudades ?? [], ...(u.rolesExtra ? { rolesExtra: u.rolesExtra } : {}) });

async function vistas() {
  const c = await db.collections();
  const dias: string[] = (await c.planSalas.distinct("dia")).sort();
  const asis = await c.asientos.find({ proyectoId: { $type: "objectId" } }).sort({ inicio: 1, mentorId: 1 }).toArray();
  const fn = await monitoresDe(asis);
  const out: Record<string, unknown> = {
    misAdmin: await misProyectos(admin, { dia: "todos" }), misCoord: await misProyectos(coord, { dia: "todos" }),
    filas: await filasEstudiantes(), mentor: asis.map((a) => fn(a)), cronogramaTam: (await cronogramaExcel()).length > 0,
  };
  for (const d of dias) out[`panel ${d}`] = await asignacionesMonitores(d, d);
  for (const m of monitores) {
    out[`salas ${m.usuario}`] = await mon.listaSalas(m);
    out[`vis ${m.usuario}`] = await proyectosVisibles(m);
    out[`ciudad ${m.usuario}`] = await miCiudad(m);
  }
  return out;
}

beforeAll(async () => {
  cargarDemo("2026-11-16");
  const c = await db.collections();
  const us = await c.users.find({}).toArray();
  monitores = us.filter((u) => u.rol === "monitor" || u.rolesExtra?.includes("monitor")).map(sesion);
  admin = sesion(us.find((u) => u.usuario === "admin.demo")!);
  coord = sesion(us.find((u) => u.usuario === "coordinacion.demo")!);
}, 180_000);
afterAll(() => db.closeDb());

let antes: Record<string, unknown>;
let huella: Record<string, unknown[]>;

describe("como producción (demo)", () => {
  it("sin excepciones: las vistas solo leen y no traen nada nuevo", async () => {
    const c = await db.collections();
    expect(monitores.length).toBeGreaterThan(1);
    huella = await foto(c, TODAS);
    antes = await vistas();
    expect(await vistas()).toEqual(antes); // refresco
    expect(await foto(c, TODAS)).toEqual(huella);
    expect(huella.monitorExcepciones).toEqual([]);
    expect(JSON.stringify(antes)).not.toContain("\"manual\"");
  });

  it("asignar a mano y quitar deja las vistas idénticas y solo agrega changeLog y `rev` del asiento", async () => {
    const c = await db.collections();
    // Un proyecto con hora y un monitor activo que no sea el del bloque y no tenga choque en esa franja.
    const asis = await c.asientos.find({ proyectoId: { $type: "objectId" } }).sort({ inicio: 1 }).toArray();
    let elegido: { proyectoId: string; monitor: string; asientoId: unknown } | null = null;
    for (const a of asis) {
      const bloque = await c.planSalas.findOne({ dia: diaCOL(a.inicio), hora: horaCOL(a.inicio), mentorId: a.mentorId });
      if (!bloque?.monitor) continue;
      for (const m of monitores.filter((x) => x.usuario !== bloque.monitor)) {
        const r = await asignarMonitorProyecto(admin, String(a.proyectoId), m.usuario, "Prueba como producción", true);
        if ("ok" in r) { elegido = { proyectoId: String(a.proyectoId), monitor: m.usuario, asientoId: a._id }; break; }
      }
      if (elegido) break;
    }
    expect(elegido).not.toBeNull();
    const nuevo = monitores.find((m) => m.usuario === elegido!.monitor)!;
    const suyas = await mon.listaSalas(nuevo);
    expect(suyas.filas.find((f) => f.id === elegido!.proyectoId)?.manual).toBe(true);
    expect(await quitarMonitorProyecto(admin, elegido!.proyectoId)).toEqual({ ok: true });

    expect(await vistas()).toEqual(antes);
    const despues = await foto(c, TODAS);
    const sinRev = (xs: unknown[]) => xs.map((x) => { const { rev: _r, ...resto } = x as Record<string, unknown>; return resto; });
    for (const k of TODAS) {
      if (k === "changeLog") continue;
      if (k === "asientos") expect(sinRev(despues[k]!)).toEqual(sinRev(huella[k]!));
      else expect(despues[k]).toEqual(huella[k]);
    }
    const nuevos = (despues.changeLog as { accion: string }[]).slice((huella.changeLog as unknown[]).length);
    expect(nuevos.map((x) => x.accion)).toEqual(["monitor_proyecto", "monitor_proyecto"]);
  });
});

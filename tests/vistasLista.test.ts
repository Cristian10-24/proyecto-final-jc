import { describe, expect, it } from "vitest";
import type { FilaSala, SalaMonitor } from "@/lib/evaluacion/monitor";
import type { MiProyecto } from "@/lib/misProyectos";
import {
  agruparBloques, diaAplicado, escribirFiltros, estadoAsistencia, filtrarBase, filtrarEstado, FILTROS_VACIOS, leerFiltros, modoLista, resumen, unirLecturas,
} from "@/lib/vistas/listaProyectos";

// Fase 6 · Entrega B · Paso 2: lista «Mis proyectos» fusionada (unir lecturas, estados, resumen, filtros y bloques).

const D = "2026-11-12", iso = (h: number, m: number) => new Date(Date.UTC(2026, 10, 12, h + 5, m)).toISOString(); // COL = UTC-5
const int = (nombre: string, res: FilaSala["integrantes"][number]["res"], asistencia: "si" | "no" | null, motivo?: string) =>
  ({ i: 0, nombre, res, a: null, b: null, nb: 0, asistencia, ...(motivo ? { motivo } : {}) }) as FilaSala["integrantes"][number];
const fs = (id: string, h: number, m: number, mentorId: string, ints: FilaSala["integrantes"], extra: Partial<FilaSala> = {}): FilaSala =>
  ({ id, codigo: `C-${id}`, proyecto: `Proyecto ${id}`, ciudad: "Cali", dia: D, inicio: iso(h, m), mentorId, pareja: ints.length > 1, integrantes: ints, destacado: false, sugerencia: false, ...extra });
const FILAS: FilaSala[] = [
  fs("a", 8, 0, "m1", [int("Ana Uno", "Aprobado", null)]),
  fs("b", 8, 45, "m1", [int("Beto Dos", "Pendiente", "si"), int("Caro Tres", "No se presentó", null, "Salud")]),
  fs("c", 9, 15, "m1", [int("Dani Cuatro", "Pendiente", "no")], { ciudad: "Paysandú" }),
  fs("d", 11, 0, "m1", [int("Eva Cinco", "Pendiente", null)]),
  fs("e", 8, 30, "m2", [int("Fede Seis", "Incompleto", null)], { destacado: true }),
];
const SALAS: SalaMonitor[] = [8, 9, 11].map((h): SalaMonitor => ({ dia: D, hora: h, inicio: iso(h, 0), sala: 2, mentorId: "m1", mentor: "Mentor Uno", enlace: "https://meet.example.test/2" }))
  .concat([{ dia: D, hora: 8, inicio: iso(8, 0), sala: 5, mentorId: "m2", mentor: "Mentor Dos" }]);
const MIS: MiProyecto[] = [
  { id: "a", codigo: "C-a", dia: D, inicio: iso(8, 0), horaCOL: "8:00 a. m.", horaUY: null, sala: 2, enlace: "https://meet.example.test/2", ciudad: "Cali", proyecto: "Proyecto a", integrantes: [{ nombre: "Ana Uno", celular: "+573000000001" }], mentor: { nombre: "Mentor Uno", celular: "+573110000001" }, monitor: null },
  { id: "c", codigo: "C-c", dia: D, inicio: iso(9, 15), horaCOL: "9:15 a. m.", horaUY: "11:15 a. m.", sala: 2, enlace: null, ciudad: "Paysandú", proyecto: "Proyecto c", integrantes: [{ nombre: "Dani Cuatro", celular: null }], mentor: { nombre: "Mentor Uno", celular: "+573110000001" }, monitor: null },
];
const L = unirLecturas(FILAS, SALAS, MIS);

describe("unir lecturas", () => {
  it("la fila sale de «Mis salas» y se completa con celulares, hora UY y mentor de «Mis proyectos»", () => {
    const a = L.find((x) => x.id === "a")!;
    expect(a).toMatchObject({ sala: 2, enlace: "https://meet.example.test/2", horaTxt: "8:00 a. m.", mentor: { nombre: "Mentor Uno", celular: "+573110000001" } });
    expect(a.integrantes[0]).toMatchObject({ nombre: "Ana Uno", celular: "+573000000001", res: "Aprobado" });
    expect(L.find((x) => x.id === "c")!.horaUY).toBe("11:15 a. m.");
  });
  it("si «Mis proyectos» no trae el proyecto, celulares null y hora calculada", () => {
    const b = L.find((x) => x.id === "b")!;
    expect(b.horaTxt).toBe("8:45 a. m.");
    expect(b.integrantes.map((i) => i.celular)).toEqual([null, null]);
    expect(b.mentor).toEqual({ nombre: "Mentor Uno", celular: null });
  });
});

describe("estados y resumen (reglas de «Mis salas»)", () => {
  it("chip por integrante", () => {
    const b = L.find((x) => x.id === "b")!;
    expect(L.find((x) => x.id === "a")!.integrantes.map(estadoAsistencia)).toEqual(["evaluado"]);
    expect(b.integrantes.map(estadoAsistencia)).toEqual(["presente", "ausente"]);
    expect(L.find((x) => x.id === "c")!.integrantes.map(estadoAsistencia)).toEqual(["ausente"]);
    expect(L.find((x) => x.id === "e")!.integrantes.map(estadoAsistencia)).toEqual(["pendiente"]);
  });
  it("resumen: proyectos, estudiantes, presentes (incluye evaluados), ausentes, pendientes y % con asistencia", () => {
    expect(resumen(L)).toEqual({ proyectos: 5, estudiantes: 6, presentes: 2, ausentes: 2, pendientes: 2, pct: 67 });
  });
});

describe("filtros", () => {
  it("en la URL: ida y vuelta, y valores raros se ignoran", () => {
    const f = { ...FILTROS_VACIOS, dia: D, sala: "2", estado: "ausentes" as const, q: "café" };
    expect(leerFiltros(escribirFiltros(f))).toEqual(f);
    expect(escribirFiltros(FILTROS_VACIOS)).toBe("");
    expect(leerFiltros("?dia=hoy&estado=borrar&sala=x&ciudad=Cali")).toEqual({ ...FILTROS_VACIOS, ciudad: "Cali" });
  });
  it("día por defecto: hoy si hay presentaciones hoy; si no, el primero", () => {
    expect(diaAplicado(FILTROS_VACIOS, [D, "2026-11-13"], D)).toBe(D);
    expect(diaAplicado(FILTROS_VACIOS, ["2026-11-13"], D)).toBe("2026-11-13");
    expect(diaAplicado({ ...FILTROS_VACIOS, dia: "todos" }, [D], D)).toBe("todos");
  });
  it("buscador por nombre, código, proyecto y ciudad", () => {
    const q = (x: string) => filtrarBase(L, { ...FILTROS_VACIOS, q: x }, D).map((f) => f.id);
    expect(q("caro")).toEqual(["b"]);
    expect(q("C-d")).toEqual(["d"]);
    expect(q("paysandu")).toEqual(["c"]);
    expect(q("proyecto e")).toEqual(["e"]);
  });
  it("estado: algún integrante cumple; «sin motivo» solo ausentes sin motivo", () => {
    const e = (x: Parameters<typeof filtrarEstado>[1]) => filtrarEstado(L, x).map((f) => f.id);
    expect(e("ausentes")).toEqual(["b", "c"]);
    expect(e("sinMotivo")).toEqual(["c"]);
    expect(e("presentes")).toEqual(["a", "b"]);
    expect(e("pendientes")).toEqual(["e", "d"]);
  });
});

describe("bloques de sala", () => {
  it("horas seguidas de la misma sala y mentor = un bloque; un hueco abre otro", () => {
    expect(agruparBloques(L).map((b) => [b.sala, b.desde, b.hasta, b.filas.map((f) => f.id).join("")])).toEqual([
      [2, 8, 10, "abc"], [5, 8, 9, "e"], [2, 11, 12, "d"],
    ]);
  });
});

describe("vista de quien es monitor y además coordinación (selector)", () => {
  type U = Parameters<typeof modoLista>[0];
  const solo: U = { rol: "monitor" } as U, kamelia: U = { rol: "monitor", rolesExtra: ["coordinador"] } as U;
  const coord: U = { rol: "coordinador" } as U, admin: U = { rol: "admin" } as U;
  it("monitor + coordinación: selector; «Mis salas» por defecto (con Gestionar) y «Todos los proyectos» con ?vista=todos", () => {
    expect(modoLista(kamelia, "")).toEqual({ selector: true, todos: false });
    expect(modoLista(kamelia, "todos")).toEqual({ selector: true, todos: true });
  });
  it("solo monitor: sin selector y siempre sus salas (aunque la URL diga vista=todos)", () => {
    expect(modoLista(solo, "")).toEqual({ selector: false, todos: false });
    expect(modoLista(solo, "todos")).toEqual({ selector: false, todos: false });
  });
  it("coordinación y admin: sin selector, todos los proyectos (sin Gestionar)", () => {
    expect(modoLista(coord, "")).toEqual({ selector: false, todos: true });
    expect(modoLista(admin, "todos")).toEqual({ selector: false, todos: true });
  });
  it("la vista vive en la URL con los demás filtros", () => {
    expect(escribirFiltros({ ...FILTROS_VACIOS, vista: "todos", sala: "3" })).toBe("?vista=todos&sala=3");
    expect(leerFiltros("?vista=todos&sala=3")).toEqual({ ...FILTROS_VACIOS, vista: "todos", sala: "3" });
    expect(leerFiltros("?vista=otra").vista).toBe("");
  });
});

describe("volver desde el detalle", () => {
  it("solo acepta la lista con sus filtros", async () => {
    const { urlVolver } = await import("@/lib/vistas/fichaLlamadas");
    expect(urlVolver("/monitor/proyectos?estado=ausentes&dia=2026-11-12")).toBe("/monitor/proyectos?estado=ausentes&dia=2026-11-12");
    for (const malo of [null, "", "https://otro.example", "//otro.example/x", "javascript:alert(1)", "/admin", "/monitor/proyectos/../admin"])
      expect(urlVolver(malo)).toBe("/monitor/proyectos");
  });
});

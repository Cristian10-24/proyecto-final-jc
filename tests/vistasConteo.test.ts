import { describe, expect, it } from "vitest";
import { chipsExtra, contarEstudiantes, filtrarPorEstado, ordenar, type EstadoInt, type FilaConteo } from "@/lib/vistas/conteoCiudad";
import { estadoProyecto } from "@/lib/vistas/miCiudad";

// Fase 6 · «Mi ciudad», opción B: tarjetas por estudiante, filtro por «algún integrante», orden y chips extra.

const fila = (id: string, inicio: string, ...e: EstadoInt[]): FilaConteo & { id: string } =>
  ({ id, inicio, estado: estadoProyecto(e), integrantes: e.map((estado) => ({ estado })) });
const MIXTA = fila("mixta", "2026-11-12T13:00:00Z", "evaluado", "ausente"); // Café de barrio: Sebastián evaluado, Tomás no se presentó
const FILAS = [
  MIXTA,
  fila("eval", "2026-11-12T14:00:00Z", "evaluado"),
  fila("pend", "2026-11-13T13:00:00Z", "pendiente"),
  fila("aus2", "2026-11-12T15:00:00Z", "ausente", "ausente"),
  fila("pendAus", "2026-11-12T16:00:00Z", "pendiente", "ausente"),
  fila("evalPend", "2026-11-12T12:00:00Z", "evaluado", "pendiente"),
];
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("contar estudiantes", () => {
  it("una pareja Evaluado + No se presentó suma 1 y 1", () => {
    expect(contarEstudiantes([MIXTA])).toEqual({ total: 2, evaluado: 1, pendiente: 0, ausente: 1, proyectos: 1 });
  });
  it("Total = Evaluados + Pendientes + No se presentó, con parejas e individuales", () => {
    const n = contarEstudiantes(FILAS);
    expect(n).toEqual({ total: 10, evaluado: 3, pendiente: 3, ausente: 4, proyectos: 6 });
    expect(n.evaluado + n.pendiente + n.ausente).toBe(n.total);
  });
});

describe("filtro por tarjeta", () => {
  it("la pareja mixta sale en Evaluados y en No se presentó; Total lista todos", () => {
    expect(ids(filtrarPorEstado(FILAS, "evaluado"))).toEqual(["mixta", "eval", "evalPend"]);
    expect(ids(filtrarPorEstado(FILAS, "ausente"))).toEqual(["mixta", "aus2", "pendAus"]);
    expect(ids(filtrarPorEstado(FILAS, "pendiente"))).toEqual(["pend", "pendAus", "evalPend"]);
    expect(filtrarPorEstado(FILAS, "todos")).toHaveLength(6);
  });
});

describe("orden", () => {
  it("«Pendientes primero»: algún integrante pendiente primero; en cada grupo por día y hora", () => {
    expect(ids(ordenar(FILAS, "pendientes"))).toEqual(["evalPend", "pendAus", "pend", "mixta", "eval", "aus2"]);
  });
  it("«Por fecha y hora» no cambia", () => {
    expect(ids(ordenar(FILAS, "hora"))).toEqual(["evalPend", "mixta", "eval", "aus2", "pendAus", "pend"]);
  });
});

describe("chips extra", () => {
  it("solo en parejas con estados distintos y sin repetir el chip principal", () => {
    expect(chipsExtra(MIXTA)).toEqual(["1 ausente"]);
    expect(chipsExtra(fila("x", "", "pendiente", "ausente"))).toEqual(["1 ausente"]); // el principal ya dice Pendiente
    expect(chipsExtra(fila("x", "", "evaluado", "pendiente"))).toEqual(["1 pendiente"]);
    expect(chipsExtra(fila("x", "", "ausente", "ausente"))).toEqual([]);
    expect(chipsExtra(fila("x", "", "evaluado"))).toEqual([]);
  });
});

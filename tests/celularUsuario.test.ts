import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { leerUsuarios } from "../src/lib/usuariosExcel";
import { celularUsuario, EdicionUsuario, NuevoUsuario } from "../src/lib/usuarios";

// Fase 5 · Paso 27 · Celular opcional de los usuarios (sale en las citaciones del calendario).

describe("celularUsuario", () => {
  it("normaliza como el importador (+57 para Colombia)", () => {
    expect(celularUsuario("300 123 4567")).toEqual({ celular: "+573001234567" });
    expect(celularUsuario("+57 300-123-4567")).toEqual({ celular: "+573001234567" });
  });
  it("vacío lo borra; sin el campo conserva el guardado; igual al guardado se conserva tal cual", () => {
    expect(celularUsuario("", "+573001234567")).toEqual({});
    expect(celularUsuario(undefined, "+573001234567")).toEqual({ celular: "+573001234567" });
    expect(celularUsuario(undefined)).toEqual({});
    expect(celularUsuario("123 viejo", "123 viejo")).toEqual({ celular: "123 viejo" });
  });
  it("un celular que no parece celular es error", () => {
    expect(celularUsuario("12")).toEqual({ error: 'El celular "12" no parece un celular.' });
  });
  it("los esquemas aceptan el campo (y siguen siendo estrictos)", () => {
    expect(EdicionUsuario.safeParse({ celular: "3001234567" }).success).toBe(true);
    expect(NuevoUsuario.safeParse({ usuario: "mon.x", nombre: "Monitor Equis", rol: "monitor", celular: "3001234567" }).success).toBe(true);
    expect(EdicionUsuario.safeParse({ telefono: "3001234567" }).success).toBe(false);
  });
});

describe("carga por Excel con Celular", () => {
  const libro = (filas: (string | null)[][]) => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Usuarios");
    ws.addRow(["Nombre", "Correo", "Rol", "Teléfono"]);
    filas.forEach((f) => ws.addRow(f));
    return wb;
  };
  it("la columna es opcional, acepta sinónimos y marca errores por fila", () => {
    const l = leerUsuarios(libro([
      ["Monitor Uno", "m1@ejemplo.org", "Monitor", "300 111 2222"],
      ["Monitor Dos", "m2@ejemplo.org", "Monitor", null],
      ["Monitor Tres", "m3@ejemplo.org", "Monitor", "12"],
    ]));
    expect(l.filas.map((f) => [f.nombre, f.celular ?? null])).toEqual([["Monitor Uno", "+573001112222"], ["Monitor Dos", null]]);
    expect(l.errores).toEqual([{ fila: 4, mensaje: 'Monitor Tres: el celular "12" no parece un celular.' }]);
  });
});

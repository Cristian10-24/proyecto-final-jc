import { describe, expect, it } from "vitest";
import { contenidoPanel, unirBloques } from "@/lib/vistas/bloques";
import { desdeMisProyectos, unirLecturas } from "@/lib/vistas/listaProyectos";
import type { FilaSala, SalaMonitor } from "@/lib/evaluacion/monitor";
import type { MiProyecto } from "@/lib/misProyectos";

// Monitor por proyecto · funciones puras de pantalla: el chip «Asignado a mano» y el monitor por proyecto del panel
// solo aparecen con una excepción; sin ella, todo sale con las mismas claves de siempre.

const fila = (id: string, manual?: true): FilaSala => ({
  id, codigo: id, proyecto: `P ${id}`, ciudad: "Cali", dia: "2026-11-19", inicio: "2026-11-19T23:15:00.000Z", mentorId: "m-s", pareja: false,
  integrantes: [{ nombre: "Ana", res: "Pendiente", asistencia: null } as FilaSala["integrantes"][number]], destacado: false, sugerencia: false, ...(manual ? { manual } : {}),
});
const sala: SalaMonitor = { dia: "2026-11-19", hora: 18, inicio: "2026-11-19T23:00:00.000Z", sala: 1, mentorId: "m-s", mentor: "Mentor S", enlace: "https://meet.example.test/1" };
const mi = (id: string, manual?: true): MiProyecto => ({
  id, codigo: id, dia: "2026-11-19", inicio: "2026-11-19T23:15:00.000Z", horaCOL: "6:15 p. m.", horaUY: null, sala: 1, enlace: null, ciudad: "Cali", proyecto: `P ${id}`,
  integrantes: [{ nombre: "Ana", celular: null }], mentor: { nombre: "Mentor S", celular: null }, monitor: { usuario: "b", nombre: "B" }, ...(manual ? { manual } : {}),
});

describe("lista de Mis proyectos", () => {
  it("sin excepción no aparece `manual`; con ella sí, en la sala real", () => {
    const [a, b] = unirLecturas([fila("1"), fila("2", true)], [sala], []);
    expect("manual" in a!).toBe(false);
    expect(b).toMatchObject({ manual: true, sala: 1, enlace: "https://meet.example.test/1" });
    expect("manual" in desdeMisProyectos([mi("1")])[0]!).toBe(false);
    expect(desdeMisProyectos([mi("1", true)])[0]!.manual).toBe(true);
  });
});

describe("panel del bloque", () => {
  it("el monitor por proyecto solo sale en el proyecto con excepción, con su nombre", () => {
    const [b] = unirBloques([{ hora: 18, sala: 1, mentorId: "m-s", monitor: "kam", proyectos: [{ minuto: 0, nombre: "G" }, { minuto: 15, nombre: "V", monitor: "bry" }] }]);
    const c = contenidoPanel(b!, { sinMargen: false, nombreMonitor: (u) => (u === "bry" ? "Bryan" : u) });
    expect(c.proyectos).toEqual([{ hora: "6:00 p. m.", nombre: "G" }, { hora: "6:15 p. m.", nombre: "V", monitor: "Bryan" }]);
  });
});

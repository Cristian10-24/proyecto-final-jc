import { describe, expect, it } from "vitest";
import { leerLibro } from "@/lib/importar/excel";
import { plantilla } from "@/lib/importar/plantillas";
import { leerLibroSalas, type FilaPlanLeida } from "@/lib/importar/salas";
import { asignarSalas, planificar, type EntradaPlan, type PlanSala, type SalaFija } from "@/lib/salas";
import { bloquesQueCambian, combinarMonitores, enlacesQueCambian, resumirPlanFijo, validarFilasPlan, type ContextoPlan } from "@/lib/salasFijas";
import { libro } from "./helpers/libros";

// Hoja «Plan de salas» (funciones puras): salas fijas, validación por fila y vista previa. Datos INVENTADOS.

const D = "2026-11-17";
const SALAS = [1, 2, 3, 4].map((sala) => ({ sala, enlace: `https://meet.ejemplo.org/${sala}` }));
const entrada = (e: Partial<EntradaPlan>): EntradaPlan => ({ horas: [], salas: SALAS, importados: [], disponibilidad: [], cambiosAdmin: [], ...e });
const de = (plan: PlanSala[], hora: number, mentor: string) => plan.find((p) => p.hora === hora && p.mentorId === mentor)!;
const fija = (hora: number, mentorId: string, sala: number, monitor: string | null = null): SalaFija => ({ dia: D, hora, mentorId, sala, monitor });
const HORAS = [
  { dia: D, hora: 8, mentores: ["ana", "beto", "caro"] },
  { dia: D, hora: 9, mentores: ["ana", "beto", "caro"] },
  { dia: D, hora: 10, mentores: ["ana", "caro"] },
];

describe("asignarSalas con salas fijas", () => {
  it("sin fijas el resultado es idéntico al de siempre", () => {
    const sin = asignarSalas(HORAS, [1, 2, 3, 4]);
    const vacio = asignarSalas(HORAS, [1, 2, 3, 4], new Map());
    expect([...vacio.salaDe]).toEqual([...sin.salaDe]);
    expect(vacio.avisos).toEqual([]);
  });

  it("respeta la sala fija y la continuidad no se la quita", () => {
    const fijas = new Map([[`${D}|9|caro`, 1], [`${D}|8|caro`, 4]]);
    const { salaDe, errores, avisos } = asignarSalas(HORAS, [1, 2, 3, 4], fijas);
    expect(errores).toEqual([]);
    expect(avisos).toEqual([]);
    expect(salaDe.get(`${D}|8|caro`)).toBe(4);
    expect(salaDe.get(`${D}|9|caro`)).toBe(1);
    // ana tenía la sala 1 a las 8 (sigue de la hora anterior), pero a las 9 la sala 1 es fija de caro.
    expect(salaDe.get(`${D}|8|ana`)).toBe(1);
    expect(salaDe.get(`${D}|9|ana`)).not.toBe(1);
    expect(new Set([8, 9].map((h) => salaDe.get(`${D}|${h}|ana`)))).not.toContain(undefined);
  });

  it("una sala fija que ya no existe se avisa y se asigna otra", () => {
    const { salaDe, avisos } = asignarSalas(HORAS, [1, 2, 3], new Map([[`${D}|8|ana`, 9]]));
    expect(salaDe.get(`${D}|8|ana`)).toBeDefined();
    expect(avisos[0]!.mensaje).toContain("sala fija 9");
  });
});

describe("planificar con salas fijas", () => {
  const disp = ["m1", "m2", "m3"].flatMap((m) => [8, 9, 10].map((hora) => ({ monitor: m, dia: D, hora })));

  it("la fila con monitor fija sala y monitor; la fila sin monitor no se llena sola", () => {
    const r = planificar(entrada({ horas: HORAS, disponibilidad: disp, fijas: [fija(8, "ana", 3, "m2"), fija(8, "beto", 4, null)] }));
    expect(r.errores).toEqual([]);
    expect(de(r.plan, 8, "ana")).toMatchObject({ sala: 3, monitor: "m2", origen: "importado", fijo: true });
    expect(de(r.plan, 8, "beto")).toMatchObject({ sala: 4, monitor: null, origen: null, fijo: true });
    expect(de(r.plan, 8, "caro").fijo).toBeUndefined();
    expect(de(r.plan, 8, "caro").monitor).not.toBeNull(); // la no fija sigue automática
  });

  it("un cambio manual del admin sí aplica en una sala fija sin monitor; en una con monitor se descarta con aviso", () => {
    const r = planificar(entrada({
      horas: HORAS, fijas: [fija(8, "ana", 3, "m2"), fija(8, "beto", 4, null)],
      cambiosAdmin: [{ dia: D, hora: 8, mentorId: "beto", monitor: "m3" }, { dia: D, hora: 8, mentorId: "ana", monitor: "m1" }],
    }));
    expect(de(r.plan, 8, "beto")).toMatchObject({ monitor: "m3", origen: "admin" });
    expect(de(r.plan, 8, "ana")).toMatchObject({ monitor: "m2", origen: "importado" });
    expect(r.avisos.map((a) => a.mensaje).join(" ")).toContain("fijada con otro monitor");
  });

  it("una fila de Monitores sobre una sala fija con otro monitor no se usa (aviso)", () => {
    const r = planificar(entrada({ horas: HORAS, fijas: [fija(8, "ana", 3, "m2")], importados: [{ fila: 5, dia: D, hora: 8, mentorId: "ana", monitor: "m1" }] }));
    expect(r.errores).toEqual([]);
    expect(de(r.plan, 8, "ana").monitor).toBe("m2");
    expect(r.avisos[0]).toMatchObject({ fila: 5 });
  });

  it("un bloque protegido conserva sala y monitor, sin marcarse como fijo", () => {
    const r = planificar(entrada({ horas: HORAS, disponibilidad: disp, fijas: [{ ...fija(9, "beto", 4, "m3"), origen: "automatico", protegido: true }] }));
    expect(de(r.plan, 9, "beto")).toMatchObject({ sala: 4, monitor: "m3", origen: "automatico" });
    expect(de(r.plan, 9, "beto").fijo).toBeUndefined();
  });
});

const ctx = (extra: Partial<ContextoPlan> = {}): ContextoPlan => ({
  salas: new Set([1, 2, 3, 4]),
  activo: (dia, hora, m) => HORAS.some((h) => h.dia === dia && h.hora === hora && h.mentores.includes(m)),
  monitor: (t) => (["kamelia", "juan", "ana.m"].includes(t) ? t : { aviso: `No hay un usuario monitor activo "${t}".` }),
  ...extra,
});
const fila = (n: number, hora: number, mentor: string, sala: number, monitor = ""): FilaPlanLeida => ({ fila: n, dia: D, hora, mentor, sala, monitor });

describe("validarFilasPlan", () => {
  it("filas correctas: un monitor puede usar la misma sala en horas distintas", () => {
    const r = validarFilasPlan([fila(2, 8, "Ana", 1, "kamelia"), fila(3, 9, "Ana", 1, "kamelia"), fila(4, 8, "Beto", 2, ""), fila(5, 10, "Caro", 1, "juan")], ctx());
    expect(r.errores).toEqual([]);
    expect(r.fijas).toHaveLength(4);
    expect(r.fijas[2]).toMatchObject({ mentorId: "beto", sala: 2, monitor: null });
  });

  it("errores claros por fila", () => {
    const r = validarFilasPlan([
      fila(2, 8, "Ana", 9, "kamelia"), // sala sin enlace (no está en Salas)
      fila(3, 11, "Ana", 1, "kamelia"), // mentor inactivo esa hora
      fila(4, 8, "Ana", 1, "kamelia"),
      fila(5, 8, "Ana", 2, "juan"), // mentor repetido en la hora
      fila(6, 8, "Beto", 1, "juan"), // misma sala y hora que la fila 4
      fila(7, 8, "Caro", 3, "kamelia"), // monitor en dos salas a la vez
      fila(8, 9, "Beto", 2, "Nadie"), // monitor que no es usuario monitor activo
    ], ctx());
    const por = new Map(r.errores.map((e) => [e.fila, e.mensaje]));
    expect(por.get(2)).toContain("sala 9 no está en la hoja Salas");
    expect(por.get(3)).toContain("no está activo");
    expect(por.get(5)).toContain("ya tiene sala");
    expect(por.get(6)).toContain("ya tiene otro mentor");
    expect(por.get(7)).toContain("ya está en otra sala");
    expect(por.get(8)).toContain('"Nadie"');
    expect(r.fijas.map((f) => f.fila)).toEqual([4]);
  });
});

describe("combinarMonitores", () => {
  it("la hoja Plan de salas manda sobre la hoja Monitores", () => {
    const fijas = [fija(8, "ana", 1, "kamelia"), fija(8, "beto", 2, null)];
    const r = combinarMonitores(fijas, [
      { fila: 2, dia: D, hora: 8, mentorId: "ana", monitor: "kamelia" }, // repite: no se usa
      { fila: 3, dia: D, hora: 8, mentorId: "beto", monitor: "juan" }, // el plan la deja sin monitor: error
      { fila: 4, dia: D, hora: 8, sala: 1, monitor: "juan" }, // otra persona en la sala 1: error
      { fila: 5, dia: D, hora: 8, mentorId: "caro", monitor: "juan" }, // sin fila en el plan: se usa
    ]);
    expect(r.importados.map((x) => x.fila)).toEqual([5]);
    expect(r.errores.map((e) => e.fila)).toEqual([3, 4]);
    expect(r.errores[0]!.mensaje).toContain("No coincide con la hoja Plan de salas");
  });
});

describe("vista previa del plan fijo", () => {
  const p = (hora: number, mentorId: string, sala: number, extra: Partial<PlanSala> = {}): PlanSala => ({ _id: `${D}|${hora}|${sala}`, dia: D, hora, sala, mentorId, monitor: null, origen: null, ...extra });
  const actual = [p(8, "ana", 1, { monitor: "juan", origen: "admin" }), p(9, "ana", 1), p(8, "beto", 2)];
  const nuevo = [p(8, "ana", 3, { fijo: true, monitor: "kamelia" }), p(9, "ana", 1, { fijo: true, monitor: "kamelia" }), p(8, "beto", 2), p(10, "caro", 4, { fijo: true })];

  it("bloques que cambian de sala (de Sala X a Sala Y) y nuevos", () => {
    expect(bloquesQueCambian(actual, nuevo)).toEqual([
      { dia: D, hora: 8, mentorId: "ana", de: 1, a: 3 },
      { dia: D, hora: 10, mentorId: "caro", de: null, a: 4 },
    ]);
  });

  it("enlaces: sala nueva y enlace cambiado", () => {
    expect(enlacesQueCambian(SALAS.slice(0, 2), [SALAS[0]!, { sala: 2, enlace: "https://otra" }, SALAS[2]!])).toEqual([
      { sala: 2, antes: "https://meet.ejemplo.org/2", despues: "https://otra" },
      { sala: 3, antes: null, despues: "https://meet.ejemplo.org/3" },
    ]);
  });

  it("resumen: días sin cambios, entre horas, salas por monitor, sin fila, descartados y confirmación de enlaces", () => {
    const r = resumirPlanFijo({
      dias: [D], diasSinCambios: ["2026-11-12", "2026-11-13"], fijas: [fija(8, "ana", 3), fija(9, "ana", 1), fija(10, "caro", 4)],
      actual, nuevo, salasActuales: SALAS.slice(0, 3), salasNuevas: SALAS,
      nombreMentor: (id) => id.toUpperCase(), nombreMonitor: (u) => `Mon ${u}`, ignoradas: 2,
    });
    expect(r.diasSinCambios).toEqual(["2026-11-12", "2026-11-13"]);
    expect(r.filasFijadas).toBe(3);
    expect(r.cambiosSala[0]).toMatchObject({ mentor: "ANA", de: 1, a: 3 });
    expect(r.cambiosEntreHoras).toEqual([{ dia: D, mentor: "ANA", hora: 9, de: 3, a: 1 }]);
    expect(r.salasPorMonitor).toEqual([{ usuario: "kamelia", nombre: "Mon kamelia", salas: [1, 3], bloques: 2 }]);
    expect(r.sinFila).toEqual([{ dia: D, hora: 8, mentor: "BETO", sala: 2 }]);
    expect(r.descartados).toEqual([{ dia: D, hora: 8, sala: 1, mentor: "ANA", monitor: "Mon juan" }]);
    expect(r.enlacesCambian).toEqual([{ sala: 4, antes: null, despues: "https://meet.ejemplo.org/4" }]);
    expect(r.confirmarEnlaces).toBe(false); // solo se agrega una sala
    expect(r.ignoradas).toBe(2);
  });
});

describe("lector de la hoja Plan de salas", () => {
  const ENC = ["Día", "Hora", "Mentor", "Sala", "Monitor"];
  const base = { Salas: [["Sala", "Enlace"], [1, "https://meet.ejemplo.org/1"], [9, "https://meet.ejemplo.org/9"]] };

  it("lee Día y Hora como la hoja Monitores; Monitor puede venir vacío", () => {
    const r = leerLibroSalas(libro({ ...base, "Plan de salas": [ENC, ["Martes 17 nov", "05 pm", "Mentora Uno", 9, "kamelia"], ["Sábado 21 nov", "08 am", "Mentor Dos", "Sala 1", null]] }));
    expect(r.errores).toEqual([]);
    expect(r.plan).toEqual([
      { fila: 2, dia: "2026-11-17", hora: 17, mentor: "Mentora Uno", sala: 9, monitor: "kamelia" },
      { fila: 3, dia: "2026-11-21", hora: 8, mentor: "Mentor Dos", sala: 1, monitor: "" },
    ]);
    expect(r.avisos).toEqual([]);
  });

  it("errores de formato por fila y columnas faltantes", () => {
    const r = leerLibroSalas(libro({ ...base, "Plan de salas": [ENC, ["Martes 45 nov", "05 pm", "A", 1, ""], ["Martes 17 nov", "5:30 pm", "A", 1, ""], ["Martes 17 nov", "05 pm", null, 1, ""], ["Martes 17 nov", "05 pm", "A", 13, ""]] }));
    expect(r.errores.map((e) => e.fila)).toEqual([2, 3, 4, 5]);
    const sinCol = leerLibroSalas(libro({ ...base, "Plan de salas": [["Día", "Hora", "Mentor", "Monitor"], ["Martes 17 nov", "05 pm", "A", ""]] }));
    expect(sinCol.errores[0]!.mensaje).toContain("Día, Hora, Mentor, Sala y Monitor");
  });

  it("sin la hoja, el libro se lee como siempre (plan undefined)", () => {
    expect(leerLibroSalas(libro(base)).plan).toBeUndefined();
  });

  it("la plantilla trae la hoja nueva con una fila de ejemplo", async () => {
    const r = leerLibroSalas(await leerLibro(await plantilla("salas")));
    expect(r.errores).toEqual([]);
    expect(r.plan).toEqual([{ fila: 2, dia: "2026-11-17", hora: 17, mentor: "Mentora Ejemplo Uno", sala: 1, monitor: "monitora.uno" }]);
  });
});

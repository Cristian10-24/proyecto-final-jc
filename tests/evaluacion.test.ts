import { describe, expect, it } from "vitest";
import { mentorIdDe } from "@/lib/usuarios";
import { BorradorSchema, calc, faltantes, FormularioSchema, ITEMS_A, TEMAS_B, type PartesA } from "@/lib/evaluacion/criterios";

// calc() es copia de la del prototipo (docs/EVALUACION.md): estos casos fijan su comportamiento.

const todasA = (v: "si" | "parcial" | "no"): PartesA => Object.fromEntries(ITEMS_A.map(([k]) => [k, v]));
const formulario = { a: {}, b: [{}], destacado: false, fortaleza: "", mejora: "", percepcion: "" };

describe("calc()", () => {
  it("sin evaluación o vacía → Pendiente; no se presentó gana a todo", () => {
    expect(calc(null)).toEqual({ res: "Pendiente", a: null, b: null, nb: 0 });
    expect(calc({ a: {}, b: {} }).res).toBe("Pendiente");
    expect(calc({ noPresento: true, a: todasA("si"), b: { b1: 4, b2: 4 } })).toEqual({ res: "No se presentó", a: null, b: null, nb: 0 });
  });

  it("faltan ítems de A o menos de 2 temas de B → Incompleto (con sus números)", () => {
    expect(calc({ a: { a1: "si" }, b: { b1: 4, b2: 4 } })).toEqual({ res: "Incompleto", a: 1 / 7, b: 4, nb: 2 });
    expect(calc({ a: todasA("si"), b: { b1: 3 } })).toMatchObject({ res: "Incompleto", a: 1, b: 3, nb: 1 });
    expect(calc({ b: { b1: 0 } })).toMatchObject({ res: "Incompleto", a: 0, b: 0 }); // un 0 cuenta como calificado
  });

  it("Excelente: A ≥ 90 % y B ≥ 3 (límites incluidos); si no, Aprobado", () => {
    const casiTodo = { ...todasA("si"), a7: "parcial" as const }; // 6,5 / 7 = 92,9 %
    expect(calc({ a: casiTodo, b: { b1: 3, b2: 3 } }).res).toBe("Excelente");
    expect(calc({ a: { ...todasA("si"), a7: "no" }, b: { b1: 4, b2: 4 } }).res).toBe("Aprobado"); // 6/7 = 85,7 %
    expect(calc({ a: todasA("si"), b: { b1: 3, b2: 2 } }).res).toBe("Aprobado"); // B = 2,5
    expect(calc({ a: todasA("no"), b: { b1: 0, b2: 0 } }).res).toBe("Aprobado"); // presentar es el requisito
  });

  it("parcial vale 0,5 y A siempre es sobre 7", () => {
    expect(calc({ a: todasA("parcial"), b: { b1: 2, b2: 4, b3: 3 } })).toEqual({ res: "Aprobado", a: 0.5, b: 3, nb: 3 });
  });

  it("los criterios editables cambian el corte", () => {
    const ev = { a: todasA("parcial"), b: { b1: 2, b2: 2 } };
    expect(calc(ev, { exA: 0.5, exB: 2 }).res).toBe("Excelente");
    expect(calc(ev, { exA: 0.6, exB: 2 }).res).toBe("Aprobado");
  });
});

describe("faltantes para guardar", () => {
  it("cuenta los puntos de A sin marcar y los temas de B por integrante (textos del prototipo)", () => {
    expect(faltantes({ a1: "si" }, [{ nombre: "Ana Prueba", b: { b1: 3 }, omitir: false }])).toEqual([
      "• Parte A: 6 puntos sin marcar.", "• Parte B: solo 1 tema calificado (mínimo 2).",
    ]);
    expect(faltantes({ ...todasA("si"), a7: undefined }, [
      { nombre: "Ana Prueba", b: {}, omitir: false }, { nombre: "Luis Prueba", b: {}, omitir: true },
    ])).toEqual(["• Parte A: 1 punto sin marcar.", "• Parte B de Ana: ningún tema calificado (mínimo 2)."]);
    expect(faltantes(todasA("si"), [{ nombre: "Ana", b: { b1: 0, b5: 4 }, omitir: false }])).toEqual([]);
  });
});

describe("validación del formulario", () => {
  it("acepta lo válido y recorta los textos", () => {
    const r = FormularioSchema.parse({ ...formulario, a: { a1: "parcial" }, b: [{ b3: 4 }], fortaleza: "  Bien  " });
    expect(r.fortaleza).toBe("Bien");
  });

  it("rechaza valores fuera de escala, claves desconocidas y más de 2 integrantes", () => {
    for (const malo of [
      { ...formulario, a: { a1: "tal vez" } },
      { ...formulario, a: { a8: "si" } },
      { ...formulario, b: [{ b1: 5 }] },
      { ...formulario, b: [{ b1: 2.5 }] },
      { ...formulario, b: [{ b6: 2 }] },
      { ...formulario, b: [{}, {}, {}] },
      { ...formulario, fortaleza: "x".repeat(2001) },
      { ...formulario, extra: 1 },
    ]) expect(FormularioSchema.safeParse(malo).success).toBe(false);
  });

  it("el borrador acepta formularios a medias", () => {
    expect(BorradorSchema.safeParse({ a: { a1: "si" } }).success).toBe(true);
    expect(BorradorSchema.safeParse({ b: [{ b1: 9 }] }).success).toBe(false);
    expect(TEMAS_B).toHaveLength(5);
  });
});

describe("usuario mentor", () => {
  it("se reconoce por su nombre, escrito igual que en Horarios", () => {
    expect(mentorIdDe("mentor", "  Mentor  Prueba Ñúñez ")).toBe("mentor-prueba-nunez");
    expect(mentorIdDe("monitor", "Mentor Prueba")).toBeUndefined();
  });
});

describe("nombres parecidos de mentor", () => {
  const horarios = ["Yehiron Bermúdez Ruiz", "Ana María Pérez", "Johan Ramírez", "Ana Gómez"];
  it("sugiere por palabra en común o por escritura casi igual (sin tildes)", async () => {
    const { parecidos } = await import("@/lib/usuarios");
    expect(parecidos("Yehiron Bermudez", horarios)).toEqual(["Yehiron Bermúdez Ruiz"]);
    expect(parecidos("Yeiron Bermudes Ruiz", horarios)[0]).toBe("Yehiron Bermúdez Ruiz");
    expect(parecidos("Jhoan Ramires", horarios)).toEqual(["Johan Ramírez"]);
    expect(parecidos("Ana", horarios)).toEqual(["Ana Gómez", "Ana María Pérez"]); // los dos que comparten "Ana"
    expect(parecidos("Pedro Castillo", horarios)).toEqual([]);
  });
});

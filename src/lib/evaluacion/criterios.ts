import { z } from "zod";

// Criterios de evaluación: exactamente los del prototipo (docs/EVALUACION.md). No se definen aquí.
// Funciones puras: calc() es copia de la del prototipo, con pruebas en tests/evaluacion.test.ts.

export const ITEMS_A = [
  ["a1", "App publicada", "Abre desde una URL de internet, no desde su computador."],
  ["a2", "Marca, inicio y catálogo", "Identidad visual, navegación clara y productos o servicios completos."],
  ["a3", "Contacto real", "Envía una solicitud en vivo y queda guardada o enviada."],
  ["a4", "Login y panel", "Inicia sesión y entra al panel privado."],
  ["a5", "Asistente de clientes", "Preguntas frecuentes interactivas con respuestas útiles."],
  ["a6", "Responsive", "Al achicar la ventana o en el celular se sigue viendo bien."],
  ["a7", "GitHub", "Muestra el repositorio con mínimo 10 commits."],
] as const;

export const TEMAS_B = [
  ["b1", "Componentes y props", "“Muéstrame un componente que reutilices y cómo le llegan los datos.”"],
  ["b2", "Estado y datos (hooks)", "“¿Cómo llega el catálogo a la pantalla? Muéstrame dónde usas useState o useEffect.”"],
  ["b3", "Backend con Express", "“Cuando envías el formulario, ¿qué ruta lo recibe? Muéstramela.”"],
  ["b4", "Base de datos con Mongoose", "“¿Dónde quedó guardada la solicitud? Muéstrame el esquema o el registro.”"],
  ["b5", "Visión general", "“Explícame el recorrido de un dato: del formulario a la base de datos y de vuelta a la pantalla.”"],
] as const;

export const MIN_B = 2;
export const MOTIVOS_INASISTENCIA = ["Salud", "Conexión o equipo", "Trabajo o estudio", "Calamidad familiar", "Se retiró del programa", "No avisó", "Otro"] as const;

export type ItemA = (typeof ITEMS_A)[number][0];
export type TemaB = (typeof TEMAS_B)[number][0];
export type ValorA = "si" | "parcial" | "no";
export type PartesA = Partial<Record<ItemA, ValorA>>;
export type PartesB = Partial<Record<TemaB, number>>;

export type Criterios = { exA: number; exB: number };
export const CRITERIOS_DEFECTO: Criterios = { exA: 0.9, exB: 3 };

export const RESULTADOS = ["Excelente", "Aprobado", "Incompleto", "No se presentó", "Pendiente"] as const;
export type Resultado = (typeof RESULTADOS)[number];

/** Lo que calc() necesita de una evaluación guardada (por integrante). */
export type EvalCalc = { noPresento?: boolean; a?: PartesA; b?: PartesB } | null | undefined;

/** Copia de calc() del prototipo: resultado, % de A (0–1), promedio de B y cuántos temas de B. */
export function calc(ev: EvalCalc, crit: Criterios = CRITERIOS_DEFECTO): { res: Resultado; a: number | null; b: number | null; nb: number } {
  if (!ev) return { res: "Pendiente", a: null, b: null, nb: 0 };
  if (ev.noPresento) return { res: "No se presentó", a: null, b: null, nb: 0 };
  const a = ev.a ?? {}, b = ev.b ?? {};
  const aVals = ITEMS_A.map(([k]) => a[k]).filter(Boolean);
  const bVals = TEMAS_B.map(([k]) => b[k]).filter((v): v is number => typeof v === "number");
  if (!aVals.length && !bVals.length) return { res: "Pendiente", a: null, b: null, nb: 0 };
  const aS = ITEMS_A.reduce((s, [k]) => s + (a[k] === "si" ? 1 : a[k] === "parcial" ? 0.5 : 0), 0) / ITEMS_A.length;
  const bS = bVals.length ? bVals.reduce((s, v) => s + v, 0) / bVals.length : null;
  let res: Resultado;
  if (aVals.length < ITEMS_A.length || bVals.length < MIN_B) res = "Incompleto";
  else if (aS >= crit.exA && bS! >= crit.exB) res = "Excelente";
  else res = "Aprobado"; // presentar el proyecto es el requisito para aprobar
  return { res, a: aS, b: bS, nb: bVals.length };
}

/**
 * Lo que falta para guardar (textos del prototipo). `integrantes`: nombre, temas de B y si se omite
 * (marcado "No se presentó" y sin temas de B: sigue así y no se exige nada).
 */
export function faltantes(a: PartesA, integrantes: { nombre: string; b: PartesB; omitir: boolean }[]): string[] {
  const out: string[] = [];
  const aMiss = ITEMS_A.filter(([k]) => !a[k]).length;
  if (aMiss) out.push(`• Parte A: ${aMiss}${aMiss === 1 ? " punto sin marcar." : " puntos sin marcar."}`);
  for (const x of integrantes) {
    if (x.omitir) continue;
    const n = TEMAS_B.filter(([k]) => typeof x.b[k] === "number").length;
    if (n < MIN_B)
      out.push(`• Parte B${integrantes.length > 1 ? ` de ${primerNombre(x.nombre)}` : ""}: ${n ? `solo ${n} tema calificado` : "ningún tema calificado"} (mínimo ${MIN_B}).`);
  }
  return out;
}

export const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? "";

// ---- Validación de lo que manda el navegador ----

const valorA = z.enum(["si", "parcial", "no"]);
const nivelB = z.number().int().min(0).max(4);
export const PartesASchema = z.object(Object.fromEntries(ITEMS_A.map(([k]) => [k, valorA.optional()])) as Record<ItemA, z.ZodOptional<typeof valorA>>).strict();
export const PartesBSchema = z.object(Object.fromEntries(TEMAS_B.map(([k]) => [k, nivelB.optional()])) as Record<TemaB, z.ZodOptional<typeof nivelB>>).strict();
const textoCierre = z.string().max(2000).transform((s) => s.trim());

/** Formulario completo de un proyecto: A y cierre comunes; B por integrante (en el orden del proyecto). */
export const FormularioSchema = z.object({
  a: PartesASchema,
  b: z.array(PartesBSchema).min(1).max(2),
  destacado: z.boolean(),
  fortaleza: textoCierre,
  mejora: textoCierre,
  percepcion: textoCierre,
}).strict();
export type Formulario = z.infer<typeof FormularioSchema>;

/** Borrador: lo mismo, sin exigir nada. */
export const BorradorSchema = FormularioSchema.partial().strict();
export type Borrador = z.infer<typeof BorradorSchema>;

export const CriteriosSchema = z.object({ exA: z.number().min(0).max(1), exB: z.number().min(0).max(4) }).strict();

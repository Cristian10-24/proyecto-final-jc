import { execFileSync } from "node:child_process";
import { BASE_PRUEBAS, URI_PRUEBAS } from "./base-local";

// Fase 4 · Prueba "como producción": carga la semilla demo en la base LOCAL de pruebas y toma una foto de los datos
// existentes, para comprobar que lo nuevo no cambia nada sin acciones de usuario.

/** Corre `semilla:demo -- --reset --hoy=<hoy>` contra la base local de pruebas (proceso aparte, como el usuario). */
export function cargarDemo(hoy: string) {
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/semilla-demo.ts", "--reset", `--hoy=${hoy}`], {
    env: { ...process.env, MONGODB_URI: URI_PRUEBAS, MONGODB_DB: BASE_PRUEBAS, PFJC_MODO: "" },
    stdio: "pipe",
    timeout: 120_000,
  });
}

/** Colecciones de antes de la Fase 4 (las que nunca deben cambiar sin una acción de usuario). */
export const EXISTENTES = [
  "proyectos", "asientos", "dias", "inscripciones", "franjasEditadas", "mentores", "salasConfig", "planSalas",
  "evalResultados", "evalBorradores", "evalConfig", "evalMonitor", "evalAnuladas", "cambiosSugeridos", "changeLog", "users",
] as const;

type Coleccion = { find: (f: object) => { sort: (s: object) => { toArray: () => Promise<unknown[]> } } };

/** Todos los documentos de cada colección, en orden de _id. */
export async function foto(c: Record<string, unknown>, nombres: readonly string[] = EXISTENTES): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const n of nombres) out[n] = await (c[n] as Coleccion).find({}).sort({ _id: 1 }).toArray();
  return out;
}

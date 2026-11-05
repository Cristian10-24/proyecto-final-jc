// Corre un script permitido contra la base REAL (proyecto_final_jc en Atlas), con las variables de
// .env.produccion.local (usuario de Atlas pfjc_produccion). Es el único archivo que lee ese .env, sin mostrarlo nunca.
// Uso: npm run admin:produccion -- --usuario=<usuario> "--nombre=Nombre Apellido"   (scripts/primer-admin.ts)
//      npm run admin:produccion -- --verificar
//      npm run respaldo:produccion                                                  (scripts/respaldo.ts, solo lectura)
// - Las variables (y NODE_ENV=production) van SOLO al proceso hijo: la terminal queda como estaba.
// - Se niega si falta el archivo, si no define MONGODB_URI o si MONGODB_DB no es exactamente proyecto_final_jc.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { hostEnmascarado } from "./atlas.mjs";

const ARCHIVO = ".env.produccion.local";
const BASE = "proyecto_final_jc";

function negarse(motivo) {
  console.error(`admin:produccion: ${motivo} No se arranca.`);
  process.exit(1);
}

if (!existsSync(ARCHIVO)) negarse(`falta ${ARCHIVO} (ver docs/DESPLIEGUE.md §3c).`);
let vars;
try {
  vars = parseEnv(readFileSync(ARCHIVO, "utf8"));
} catch {
  negarse(`no se pudo leer ${ARCHIVO}.`);
}
if (!vars.MONGODB_URI) negarse(`${ARCHIVO} no define MONGODB_URI.`);
if (vars.MONGODB_DB !== BASE) negarse(`en ${ARCHIVO}, MONGODB_DB debe ser exactamente "${BASE}".`);

// Solo lo de este archivo: nada heredado de la terminal ni de otro .env (y nunca el modo Atlas de pruebas).
const env = { ...process.env };
for (const k of ["MONGODB_URI", "MONGODB_DB", "PFJC_MODO", "SESSION_SECRET"]) delete env[k];
Object.assign(env, { MONGODB_URI: vars.MONGODB_URI, MONGODB_DB: BASE, NODE_ENV: "production", PFJC_PRODUCCION: "1" });

const PERMITIDOS = ["scripts/primer-admin.ts", "scripts/respaldo.ts"];
const [script, ...args] = process.argv.slice(2);
if (!PERMITIDOS.includes(script)) negarse(`solo corre ${PERMITIDOS.join(" o ")}.`);

console.log(`Base REAL · ${BASE} · host: ${hostEnmascarado(vars.MONGODB_URI)}`);
const hijo = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", script, ...args], { stdio: "inherit", env });
hijo.on("exit", (code) => process.exit(code ?? 0));

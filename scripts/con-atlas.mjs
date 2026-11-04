// Corre un script de tsx en modo Atlas de pruebas (solo proyecto_final_jc_pruebas).
// Uso: node scripts/con-atlas.mjs scripts/semilla-local.ts [argumentos]   (npm run semilla:atlas)
//      node scripts/con-atlas.mjs scripts/semilla-demo.ts --reset --si-atlas-pruebas   (npm run semilla:demo:atlas)
//      node scripts/con-atlas.mjs scripts/vaciar-atlas-pruebas.ts --usuario=… --si-atlas-pruebas   (npm run vaciar:atlas-pruebas)
import { spawn } from "node:child_process";
import { cargarAtlas } from "./atlas.mjs";

const [script, ...args] = process.argv.slice(2);
const PERMITIDOS = ["scripts/semilla-local.ts", "scripts/semilla-demo.ts", "scripts/vaciar-atlas-pruebas.ts"];
if (!PERMITIDOS.includes(script)) {
  console.error(`con-atlas solo corre ${PERMITIDOS.join(", ")}.`);
  process.exit(1);
}
const { base, host } = cargarAtlas();
console.log(`Modo Atlas de pruebas · base: ${base} · host: ${host}`);
const hijo = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", script, ...args], { stdio: "inherit", env: process.env });
hijo.on("exit", (code) => process.exit(code ?? 0));

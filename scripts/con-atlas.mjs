// Corre un script de tsx en modo Atlas de pruebas (solo proyecto_final_jc_pruebas).
// Uso: node scripts/con-atlas.mjs scripts/semilla-local.ts [argumentos]   (npm run semilla:atlas)
import { spawn } from "node:child_process";
import { cargarAtlas } from "./atlas.mjs";

const [script, ...args] = process.argv.slice(2);
if (script !== "scripts/semilla-local.ts") {
  console.error("con-atlas solo corre scripts/semilla-local.ts.");
  process.exit(1);
}
const { base, host } = cargarAtlas();
console.log(`Modo Atlas de pruebas · base: ${base} · host: ${host}`);
const hijo = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", script, ...args], { stdio: "inherit", env: process.env });
hijo.on("exit", (code) => process.exit(code ?? 0));

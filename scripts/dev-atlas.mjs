// Servidor de desarrollo contra Atlas, SOLO sobre proyecto_final_jc_pruebas.
// Uso: npm run dev:atlas   (solo en este computador: escucha en 127.0.0.1)
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cargarAtlas } from "./atlas.mjs";

const { base, host } = cargarAtlas();
const env = { ...process.env };
env.SESSION_SECRET ||= randomBytes(24).toString("hex");
const puerto = process.env.PORT || "3000";
console.log(`Modo Atlas de pruebas · base: ${base} · host: ${host}`);
console.log(`Abre http://localhost:${puerto}`);

const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", puerto], { stdio: "inherit", env });
next.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => next.kill("SIGINT"));

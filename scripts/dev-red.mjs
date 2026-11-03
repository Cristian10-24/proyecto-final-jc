// Servidor de desarrollo accesible desde el celular por el wifi de la casa.
// Uso: npm run dev:red   (deja `npm run db:local` abierta en otra terminal)
// - Escucha en todas las interfaces (0.0.0.0): cualquiera en la misma red puede abrirlo. Úsalo solo en redes de confianza.
// - Solo arranca contra una base local (127.0.0.1/localhost), venga de .env.local o no; si no hay MONGODB_URI usa
//   127.0.0.1:27018, y si no hay SESSION_SECRET usa una aleatoria por arranque (las sesiones se cierran al reiniciar).
// - El límite por IP confía en x-forwarded-for: en la red local se puede falsificar. Es solo para probar.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";

// Next carga .env.local por su cuenta; aquí se lee igual (sin mostrarlo) solo para revisar a qué base apunta.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const env = { ...process.env };
env.MONGODB_URI ||= "mongodb://127.0.0.1:27018/?replicaSet=rs0";
env.SESSION_SECRET ||= randomBytes(24).toString("hex");
const host = env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?]/)[0] ?? "";
if (/mongodb\.net|\+srv/i.test(env.MONGODB_URI) || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
  console.error(`dev:red solo usa una base local; MONGODB_URI apunta a "${host}". No se arranca.`);
  process.exit(1);
}
console.log(`Base: ${host} (local).`);
const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log(["En este computador: http://localhost:3000", ...ips.map((ip) => `En el celular (mismo wifi): http://${ip}:3000`)].join("\n"));

const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "0.0.0.0", "-p", "3000"], { stdio: "inherit", env });
next.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => next.kill("SIGINT"));

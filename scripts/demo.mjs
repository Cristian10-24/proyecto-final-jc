// Demo para presentaciones: compila y arranca la app en modo PRODUCCIÓN contra la base LOCAL.
// Uso: npm run demo              (deja `npm run db:local` abierta en otra terminal y carga antes la demo:
//                                  npm run semilla:demo -- --reset [--hoy=AAAA-MM-DD])
//      npm run demo -- --sin-build   (arranca con la última compilación)
//      PORT=3005 npm run demo        (otro puerto; por defecto 3000)
// - Solo base local (127.0.0.1/localhost:27018): se niega con Atlas o con cualquier MONGODB_URI que no sea local, y
//   no usa .env.local (la base y la clave de sesión las pone este script, para que nada venga de otro lado).
// - SESSION_SECRET ficticio, al azar en cada arranque y solo en esta terminal: al reiniciar se cierran las sesiones.
// - Escucha en todas las interfaces (0.0.0.0) para abrirla desde el celular por el wifi: úsalo en redes de confianza.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";

const URI_LOCAL = "mongodb://127.0.0.1:27018/?replicaSet=rs0";
const BASES_LOCALES = new Set(["proyecto_final_jc", "proyecto_final_jc_pruebas"]);

function negarse(motivo) {
  console.error(`demo: ${motivo} No se arranca.`);
  process.exit(1);
}

// ---- solo base local ----
if (process.env.PFJC_MODO === "atlas") negarse("nunca corre en modo Atlas.");
const uri = process.env.MONGODB_URI || URI_LOCAL;
const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?,]/)[0] ?? "";
if (/mongodb\.net|\+srv/i.test(uri) || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) negarse(`solo usa la base local; MONGODB_URI apunta a "${host}".`);
const base = process.env.MONGODB_DB || "proyecto_final_jc"; // la misma que `npm run semilla:demo` sin variables
if (!BASES_LOCALES.has(base)) negarse(`base no permitida: "${base}".`);

const puerto = process.env.PORT || "3000";
const env = {
  ...process.env,
  NODE_ENV: "production",
  MONGODB_URI: uri,
  MONGODB_DB: base,
  SESSION_SECRET: randomBytes(32).toString("hex"), // ficticio, solo para esta demo local
};
delete env.PFJC_MODO;

// ---- usuarios y documentos de la demo: los lee scripts/demo-usuarios.ts por src/lib/db.ts (solo lectura) ----
const tsx = [process.execPath, "node_modules/tsx/dist/cli.mjs", "scripts/demo-usuarios.ts"];
function mostrarDemo() {
  const r = spawnSync(tsx[0], tsx.slice(1), { stdio: "inherit", env });
  if (r.status === 2) process.exit(1); // sin demo cargada (ya lo dijo)
  if (r.status !== 0) negarse(`no hay conexión con la base local (${host}). Abre otra terminal con \`npm run db:local\`.`);
}
mostrarDemo();

// ---- compilar y arrancar ----
const next = ["node_modules/next/dist/bin/next"];
if (!process.argv.includes("--sin-build")) {
  console.log("Compilando en modo producción…");
  const b = spawnSync(process.execPath, [...next, "build"], { stdio: "inherit", env });
  if (b.status !== 0) negarse("la compilación falló.");
}

const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
console.log(`\nDemo en modo producción · base local ${host} / ${base}`);
console.log([`  En este computador: http://localhost:${puerto}`, ...ips.map((ip) => `  En el celular (mismo wifi): http://${ip}:${puerto}`)].join("\n"));
console.log(`  Panel: http://localhost:${puerto}/login · usuarios demo arriba (clave demo-2026)`);

const servidor = spawn(process.execPath, [...next, "start", "-H", "0.0.0.0", "-p", puerto], { stdio: "inherit", env });
servidor.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => servidor.kill("SIGINT"));

// Arranca una base MongoDB SOLO para desarrollo y pruebas de este proyecto:
//   - puerto 27018 (el servicio de MongoDB que ya corre en 27017 no se toca),
//   - datos en ./.mongo-data (ignorado por git),
//   - replica set "rs0", que es lo que exigen las transacciones (igual que Atlas).
// Uso: npm run db:local   (Ctrl+C para detenerla)
// Si mongod está en otra ruta: MONGOD_PATH="C:\...\mongod.exe" npm run db:local
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";

const MONGOD = process.env.MONGOD_PATH || "C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe";
const PUERTO = 27018;
const datos = resolve(".mongo-data");
mkdirSync(datos, { recursive: true });

const mongod = spawn(MONGOD, ["--port", String(PUERTO), "--bind_ip", "127.0.0.1", "--replSet", "rs0", "--dbpath", datos, "--quiet"], { stdio: ["ignore", "ignore", "inherit"] });
mongod.on("error", (e) => { console.error(`No se pudo arrancar mongod (${MONGOD}): ${e.message}`); process.exit(1); });
mongod.on("exit", (code) => { console.log(`mongod terminó (código ${code}).`); process.exit(code ?? 0); });
process.on("SIGINT", () => mongod.kill());

// Espera a que responda y crea el replica set la primera vez.
const client = new MongoClient(`mongodb://127.0.0.1:${PUERTO}/?directConnection=true`, { serverSelectionTimeoutMS: 1000 });
for (let intento = 0; intento < 30; intento++) {
  try {
    await client.connect();
    const admin = client.db("admin");
    try {
      await admin.command({ replSetGetStatus: 1 });
    } catch {
      await admin.command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${PUERTO}` }] } });
    }
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
await client.close();
console.log(`MongoDB local listo: mongodb://127.0.0.1:${PUERTO}/?replicaSet=rs0  (Ctrl+C para detener)`);

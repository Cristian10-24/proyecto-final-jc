import { MongoClient, type Db } from "mongodb";
import type { ChangeLog, RateLimit, User } from "./types";

declare global {
  // Se reutiliza entre recargas en desarrollo y entre invocaciones en Vercel.
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _indexesReady: Promise<void> | undefined;
}

/**
 * Conexiones por instancia. Bajo a propósito: en Vercel cada instancia caliente abre su propio pool
 * y el plan M0 de Atlas tiene un tope de conexiones para todo el cluster.
 */
export function maxPoolSize(): number {
  return Math.min(Math.max(Number(process.env.MONGODB_MAX_POOL) || 5, 1), 20);
}

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Falta la variable de entorno MONGODB_URI");
  globalThis._mongoClientPromise ??= new MongoClient(uri, { maxPoolSize: maxPoolSize() }).connect();
  return globalThis._mongoClientPromise;
}

/** Única base que usa la app. El cluster puede tener otras bases: nunca se tocan. */
export function dbName(): string {
  return process.env.MONGODB_DB || "proyecto_final_jc";
}

/** Host sin credenciales, para mostrar en los scripts. */
export function dbHost(): string {
  return (process.env.MONGODB_URI ?? "").replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?]/)[0];
}

export async function getClient(): Promise<MongoClient> {
  return clientPromise();
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  const db = client.db(dbName());
  globalThis._indexesReady ??= ensureIndexes(db);
  await globalThis._indexesReady;
  return db;
}

export async function collections() {
  const db = await getDb();
  return {
    users: db.collection<User>("users"),
    changeLog: db.collection<ChangeLog>("changeLog"),
    rateLimits: db.collection<RateLimit>("rateLimits"),
  };
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ usuario: 1 }, { unique: true }),
    db.collection("changeLog").createIndex({ proyectoId: 1, fecha: -1 }),
    // TTL: Mongo borra cada contador cuando termina su ventana.
    db.collection("rateLimits").createIndex({ expiraEn: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

/** Para scripts y pruebas: cierra la conexión al terminar. */
export async function closeDb() {
  if (globalThis._mongoClientPromise) await (await globalThis._mongoClientPromise).close();
  globalThis._mongoClientPromise = undefined;
  globalThis._indexesReady = undefined;
}

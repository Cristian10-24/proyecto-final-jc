import { MongoClient, type ClientSession, type Db } from "mongodb";
import type { EvalAnulada, EvalBorrador, EvalConfig, EvalResultado } from "./evaluacion/datos";
import type { CambioSugerido, EvalMonitor } from "./evaluacion/monitor";
import type { FranjaEditada } from "./franjas";
import type { PlanSala } from "./salas";
import type { Comentario } from "./comentarios";
import type { ConfigCitaciones, RegistroCitacion } from "./citaciones/registro";
import type { AjusteModoCupos, Asiento, CandadoCupo, ChangeLog, DiaConfig, InscripcionesConfig, Mentor, ParticipanteSinProyecto, Proyecto, RateLimit, SalasConfig, User } from "./types";

declare global {
  // Se reutiliza entre recargas en desarrollo y entre invocaciones en Vercel.
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _indexesReady: Promise<void> | undefined;
}

// Acceso a la base: SOLO por getDb()/collections()/transaccion(). Nadie más llama client.db().
//
// Modo Atlas de pruebas (npm run dev:atlas / semilla:atlas, o cualquier URI no local fuera de producción):
// el usuario de Atlas puede tener acceso a OTRAS bases del cluster (apps en producción), así que el código
// garantiza que solo se toca BASE_ATLAS_PRUEBAS: el nombre es fijo y, en toda conexión no local,
// client.db() con otro nombre, dropDatabase, admin() y command() lanzan error.

export const BASE_ATLAS_PRUEBAS = "proyecto_final_jc_pruebas";
const BASES_PERMITIDAS = new Set(["proyecto_final_jc", BASE_ATLAS_PRUEBAS]);

/**
 * Conexiones por instancia. Bajo a propósito: en Vercel cada instancia caliente abre su propio pool
 * y el plan M0 de Atlas tiene un tope de conexiones para todo el cluster.
 */
export function maxPoolSize(): number {
  return Math.min(Math.max(Number(process.env.MONGODB_MAX_POOL) || 5, 1), 20);
}

/** Host sin credenciales, para mostrar en los scripts. */
export function dbHost(uri = process.env.MONGODB_URI ?? ""): string {
  return uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?,]/)[0] ?? "";
}

export function esUriLocal(uri: string): boolean {
  return !/\+srv|mongodb\.net/i.test(uri) && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(dbHost(uri));
}

/** Modo Atlas de pruebas: pedido explícitamente, o cualquier URI no local fuera de producción. */
export function modoAtlas(): boolean {
  const uri = process.env.MONGODB_URI;
  return process.env.PFJC_MODO === "atlas" || (!!uri && !esUriLocal(uri) && process.env.NODE_ENV !== "production");
}

/** Única base que usa la app. En modo Atlas es siempre BASE_ATLAS_PRUEBAS. */
export function dbName(): string {
  if (modoAtlas()) {
    if (process.env.MONGODB_DB !== BASE_ATLAS_PRUEBAS)
      throw new Error(`Modo Atlas: MONGODB_DB debe ser exactamente "${BASE_ATLAS_PRUEBAS}". No se conecta.`);
    return BASE_ATLAS_PRUEBAS;
  }
  const nombre = process.env.MONGODB_DB || "proyecto_final_jc";
  if (!BASES_PERMITIDAS.has(nombre)) throw new Error(`Base no permitida: "${nombre}". Solo ${[...BASES_PERMITIDAS].join(" o ")}.`);
  return nombre;
}

const prohibido = (que: string) => () => { throw new Error(`Operación prohibida en una base no local: ${que}.`); };

/** En una conexión no local: solo la base permitida y sin operaciones de administración ni borrado de bases. */
export function blindar(client: MongoClient, permitida: string): MongoClient {
  const abrir = client.db.bind(client);
  client.db = ((nombre?: string) => {
    if (nombre !== permitida) throw new Error(`Solo se permite la base "${permitida}".`);
    const db = abrir(nombre);
    Object.assign(db, { dropDatabase: prohibido("dropDatabase"), admin: prohibido("admin()"), command: prohibido("command()") });
    return db;
  }) as MongoClient["db"];
  return client;
}

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Falta la variable de entorno MONGODB_URI");
  const nombre = dbName(); // valida el nombre antes de conectar
  globalThis._mongoClientPromise ??= new MongoClient(uri, { maxPoolSize: maxPoolSize() }).connect()
    .then((c) => (esUriLocal(uri) ? c : blindar(c, nombre)));
  return globalThis._mongoClientPromise;
}

/** Solo para las pruebas de la conexión (pool, caché). El código de la app usa getDb() o transaccion(). */
export async function getClient(): Promise<MongoClient> {
  return clientPromise();
}

/** La única base de la app (un solo client.db, siempre con dbName()). */
async function baseUnica(): Promise<Db> {
  const client = await clientPromise();
  return client.db(dbName());
}

export async function getDb(): Promise<Db> {
  const db = await baseUnica();
  globalThis._indexesReady ??= ensureIndexes(db);
  await globalThis._indexesReady;
  return db;
}

/** Solo lectura (respaldo): la misma base, sin ensureIndexes, para no mandar ni un createIndex. */
export async function getDbLectura(): Promise<Db> {
  return baseUnica();
}

/** Ejecuta `fn` en una transacción (sesión propia). Es la única forma de usar transacciones en la app. */
export async function transaccion(fn: (s: ClientSession) => Promise<void>): Promise<void> {
  await getDb();
  const client = await clientPromise();
  await client.withSession((s) => s.withTransaction(() => fn(s)));
}

export async function collections() {
  const db = await getDb();
  return {
    users: db.collection<User>("users"),
    changeLog: db.collection<ChangeLog>("changeLog"),
    rateLimits: db.collection<RateLimit>("rateLimits"),
    proyectos: db.collection<Proyecto>("proyectos"),
    mentores: db.collection<Mentor>("mentores"),
    asientos: db.collection<Asiento>("asientos"),
    dias: db.collection<DiaConfig>("dias"),
    inscripciones: db.collection<InscripcionesConfig>("inscripciones"),
    franjasEditadas: db.collection<FranjaEditada>("franjas_editadas"),
    salasConfig: db.collection<SalasConfig>("salasConfig"),
    planSalas: db.collection<PlanSala>("planSalas"),
    evalResultados: db.collection<EvalResultado>("evaluacion_resultados"),
    evalBorradores: db.collection<EvalBorrador>("evaluacion_borradores"),
    evalConfig: db.collection<EvalConfig>("evaluacion_config"),
    evalMonitor: db.collection<EvalMonitor>("evaluacion_monitor"),
    evalAnuladas: db.collection<EvalAnulada>("evaluacion_anuladas"),
    cambiosSugeridos: db.collection<CambioSugerido>("cambios_sugeridos"),
    // Fase 4 (colecciones nuevas; solo usan el índice de _id).
    ajustes: db.collection<AjusteModoCupos>("ajustes"),
    candadosCupo: db.collection<CandadoCupo>("candados_cupo"),
    // Fase 4 · Paso 21 (colección nueva, con su propio índice único de documento).
    sinProyecto: db.collection<ParticipanteSinProyecto>("sin_proyecto"),
    // Fase 4 · Paso 22 (colección nueva, con su propio índice).
    comentarios: db.collection<Comentario>("comentarios"),
    // Fase 5 (colecciones nuevas): citaciones del calendario (índice único propio) y su configuración.
    citaciones: db.collection<RegistroCitacion>("citaciones"),
    citacionesConfig: db.collection<ConfigCitaciones>("citaciones_config"),
  };
}

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ usuario: 1 }, { unique: true }),
    // Dos usuarios mentor nunca comparten mentor (nombres equivalentes darían el mismo mentorId).
    db.collection("users").createIndex({ mentorId: 1 }, { unique: true, partialFilterExpression: { mentorId: { $type: "string" } } }),
    db.collection("proyectos").createIndex({ codigo: 1 }, { unique: true }),
    db.collection("proyectos").createIndex({ "integrantes.documento": 1 }, { unique: true }),
    db.collection("asientos").createIndex({ inicio: 1, mentorId: 1 }, { unique: true }),
    db.collection("asientos").createIndex({ dia: 1, ciudades: 1, proyectoId: 1 }),
    // Un proyecto nunca tiene dos asientos: es la garantía contra la doble reserva.
    db.collection("asientos").createIndex({ proyectoId: 1 }, { unique: true, partialFilterExpression: { proyectoId: { $type: "objectId" } } }),
    db.collection("changeLog").createIndex({ proyectoId: 1, fecha: -1 }),
    // Un mentor tiene una sola sala por hora, y un monitor nunca está en dos salas a la misma hora.
    db.collection("planSalas").createIndex({ dia: 1, hora: 1, mentorId: 1 }, { unique: true }),
    db.collection("planSalas").createIndex({ dia: 1, hora: 1, monitor: 1 }, { unique: true, partialFilterExpression: { monitor: { $type: "string" } } }),
    db.collection("evaluacion_resultados").createIndex({ proyectoId: 1 }),
    db.collection("evaluacion_monitor").createIndex({ proyectoId: 1 }),
    db.collection("evaluacion_anuladas").createIndex({ proyectoId: 1, anuladoEn: -1 }),
    // Una sola sugerencia pendiente por proyecto (el admin la aprueba o rechaza en el Paso 14).
    db.collection("cambios_sugeridos").createIndex({ proyectoId: 1 }, { unique: true, partialFilterExpression: { estado: "pendiente" } }),
    // Fase 4 · Paso 21: un documento una sola vez en «Sin proyecto» (colección nueva).
    db.collection("sin_proyecto").createIndex({ documento: 1 }, { unique: true }),
    // Fase 4 · Paso 22: comentarios de un proyecto en orden (colección nueva).
    db.collection("comentarios").createIndex({ proyectoId: 1, creadoEn: 1 }),
    // Fase 5: una sola citación por tipo, persona o proyecto y día (colección nueva): nunca se cita dos veces.
    db.collection("citaciones").createIndex({ tipo: 1, clave: 1, dia: 1 }, { unique: true }),
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

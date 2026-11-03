import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { MongoClient } from "mongodb";
import { afterEach, describe, expect, it } from "vitest";
import { BASE_ATLAS_PRUEBAS, blindar, dbName, esUriLocal, modoAtlas } from "@/lib/db";

// El usuario de Atlas de pruebas puede tener acceso a OTRAS bases del cluster (apps en producción).
// Estas pruebas fallan si el código abre la puerta a tocar otra base o a operaciones de administración.

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx|mjs|js)$/.test(n) ? [p.replace(/\\/g, "/")] : [];
  });
}
const codigo = [...archivos("src"), ...archivos("scripts")];
const leer = (p: string) => readFileSync(p, "utf-8");
/** Sin comentarios de línea ni de bloque: solo el código que se ejecuta. */
const sinComentarios = (p: string) => leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// mongo-local.mjs arranca el mongod LOCAL (127.0.0.1:27018) y necesita replSetInitiate en "admin".
const ARRANQUE_LOCAL = "scripts/mongo-local.mjs";

describe("operaciones prohibidas en el código (src y scripts)", () => {
  it("no usa dropDatabase, listDatabases, admin(), runCommand, command() ni createUser", () => {
    const prohibidas = /\bdropDatabase\s*\(|\blistDatabases\b|\.admin\s*\(|\brunCommand\b|\.command\s*\(|\bcreateUser\b/;
    const malos = codigo.filter((p) => p !== ARRANQUE_LOCAL && p !== "src/lib/db.ts" && prohibidas.test(sinComentarios(p)));
    expect(malos).toEqual([]);
  });

  it("client.db() solo en src/lib/db.ts, y siempre con dbName()", () => {
    const conDb = codigo.filter((p) => p !== ARRANQUE_LOCAL && /\.db\s*\(/.test(sinComentarios(p)));
    expect(conDb).toEqual(["src/lib/db.ts"]);
    const llamadas = sinComentarios("src/lib/db.ts").match(/\w+\.db\s*\((?:[^()]|\([^()]*\))*\)/g);
    expect(llamadas).toEqual(["client.db(dbName())"]);
  });

  it("el arranque local solo habla con 127.0.0.1", () => {
    const s = leer(ARRANQUE_LOCAL);
    expect(s).toMatch(/mongodb:\/\/127\.0\.0\.1:\$\{PUERTO\}/);
    expect(s).not.toMatch(/MONGODB_URI|mongodb\+srv|mongodb\.net/);
  });

  it("el cliente crudo (getClient) no se usa fuera de db.ts", () => {
    expect(codigo.filter((p) => p !== "src/lib/db.ts" && /\bgetClient\b/.test(leer(p)))).toEqual([]);
  });

  it(".env.atlas.local solo lo lee scripts/atlas.mjs", () => {
    expect(codigo.filter((p) => leer(p).includes(".env.atlas.local") && p !== "scripts/atlas.mjs")).toEqual([]);
  });

  it("las pruebas que borran la base usan antes la barrera de base local", () => {
    const pruebas = archivos("tests").filter((p) => /dropDatabase/.test(leer(p)) && p !== "tests/seguridad-base.test.ts");
    for (const p of pruebas) expect(leer(p), p).toMatch(/usarBaseLocal\(/);
  });
});

describe("blindaje en ejecución", () => {
  const falso = () => ({ db: (nombre?: string) => ({ nombre, dropDatabase: () => "borrada", admin: () => "admin", command: () => "ok", collection: () => "col" }) }) as unknown as MongoClient;

  it("en una conexión blindada solo se abre la base permitida, sin dropDatabase, admin() ni command()", () => {
    const c = blindar(falso(), BASE_ATLAS_PRUEBAS);
    expect(() => c.db("otra_app_produccion")).toThrow(/Solo se permite/);
    expect(() => c.db()).toThrow(/Solo se permite/);
    const db = c.db(BASE_ATLAS_PRUEBAS);
    expect(() => db.dropDatabase()).toThrow(/prohibida/);
    expect(() => db.admin()).toThrow(/prohibida/);
    expect(() => db.command({ ping: 1 })).toThrow(/prohibida/);
    expect(db.collection("proyectos")).toBe("col");
  });
});

describe("nombre de la base", () => {
  const antes = { ...process.env };
  afterEach(() => { process.env = { ...antes }; });
  const env = (e: Record<string, string | undefined>) => { for (const [k, v] of Object.entries(e)) v === undefined ? delete process.env[k] : (process.env[k] = v); };

  it("modo Atlas exige exactamente la base de pruebas", () => {
    env({ PFJC_MODO: "atlas", MONGODB_URI: "mongodb+srv://x@c0.ejemplo.mongodb.net/", MONGODB_DB: "otra_app" });
    expect(modoAtlas()).toBe(true);
    expect(() => dbName()).toThrow(/debe ser exactamente/);
    env({ MONGODB_DB: BASE_ATLAS_PRUEBAS });
    expect(dbName()).toBe(BASE_ATLAS_PRUEBAS);
  });

  it("fuera de producción, una URI no local fuerza el modo Atlas (aunque no se pida)", () => {
    env({ PFJC_MODO: undefined, NODE_ENV: "development", MONGODB_URI: "mongodb+srv://x@c0.ejemplo.mongodb.net/", MONGODB_DB: "proyecto_final_jc" });
    expect(modoAtlas()).toBe(true);
    expect(() => dbName()).toThrow(/debe ser exactamente/);
  });

  it("en producción solo se aceptan las dos bases del proyecto", () => {
    env({ PFJC_MODO: undefined, NODE_ENV: "production", MONGODB_URI: "mongodb+srv://x@c0.ejemplo.mongodb.net/", MONGODB_DB: "proyecto_final_jc" });
    expect(dbName()).toBe("proyecto_final_jc");
    env({ MONGODB_DB: "admin" });
    expect(() => dbName()).toThrow(/no permitida/);
  });

  it("detecta URIs locales", () => {
    expect(esUriLocal("mongodb://127.0.0.1:27018/?replicaSet=rs0")).toBe(true);
    expect(esUriLocal("mongodb+srv://u:p@c0.ejemplo.mongodb.net/")).toBe(false);
    expect(esUriLocal("mongodb://10.0.0.5:27017/")).toBe(false);
  });
});

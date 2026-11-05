// Respaldo de la base REAL (proyecto_final_jc), SOLO LECTURA. Solo corre por scripts/con-produccion.mjs
// (npm run respaldo:produccion). Exporta cada colección de la app a respaldos/<base>-<fecha COL>/<colección>.json en
// Extended JSON (conserva ObjectId y fechas). La carpeta respaldos/ está en .gitignore: son datos reales.
// - Usa getDbLectura(): ni siquiera manda createIndex. Solo hace find() y countDocuments().
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "proyecto_final_jc";

async function main() {
  if (process.env.PFJC_PRODUCCION !== "1" || process.env.NODE_ENV !== "production" || process.env.PFJC_MODO)
    throw new Error("Usa `npm run respaldo:produccion` (carga las variables de producción solo para este proceso).");
  const { BSON } = await import("mongodb");
  const { closeDb, dbHost, dbName, getDbLectura } = await import("@/lib/db");
  if (dbName() !== BASE) throw new Error(`La base debe ser exactamente ${BASE}; es "${dbName()}".`);
  const db = await getDbLectura();
  // Los nombres reales de todas las colecciones de la app, tal como los define src/lib/db.ts (sin abrir collections(),
  // que pasaría por getDb y sus índices).
  const nombres = await nombresColecciones();

  const fecha = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date()).replace(" ", "_").replace(":", "");
  const carpeta = join("respaldos", `${BASE}-${fecha}`);
  await mkdir(carpeta, { recursive: true });
  console.log(`Respaldando ${dbName()} en ${dbHost()} → ${carpeta}`);
  const resumen: { coleccion: string; documentos: number }[] = [];
  for (const n of nombres) {
    const docs = await db.collection(n).find({}).toArray();
    await writeFile(join(carpeta, `${n}.json`), BSON.EJSON.stringify(docs, undefined, 0, { relaxed: false }), "utf8");
    resumen.push({ coleccion: n, documentos: docs.length });
  }
  await writeFile(join(carpeta, "_resumen.json"), JSON.stringify({ base: BASE, fecha: new Date().toISOString(), colecciones: resumen }, null, 2), "utf8");
  console.table(resumen);
  console.log(`Listo: ${resumen.reduce((a, x) => a + x.documentos, 0)} documentos en ${carpeta}. Guárdala en un lugar seguro: tiene datos personales y los hashes de las claves (users).`);
  await closeDb();
}

/** Nombres de colección de collections() sin conectarse: se lee del código fuente de src/lib/db.ts. */
async function nombresColecciones(): Promise<string[]> {
  const { readFile } = await import("node:fs/promises");
  const fuente = await readFile(join("src", "lib", "db.ts"), "utf8");
  const bloque = fuente.slice(fuente.indexOf("export async function collections()"));
  const nombres = [...bloque.slice(0, bloque.indexOf("\n}\n")).matchAll(/db\.collection<[^>]+>\("([^"]+)"\)/g)].map((m) => m[1]!);
  if (nombres.length < 10) throw new Error("No se pudo leer la lista de colecciones de src/lib/db.ts.");
  return nombres;
}

main().catch((e) => {
  console.error("\nNo se respaldó:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {}; // módulo propio: su main() no choca con el de otros scripts

// Vacía la base de PRUEBAS en Atlas (proyecto_final_jc_pruebas) para cargar datos reales desde cero, y deja un único
// admin con clave al azar (se muestra una sola vez).
//   npm run vaciar:atlas-pruebas -- --usuario=<usuario> --si-atlas-pruebas ["--nombre=Nombre del admin"]
// - Solo corre por scripts/con-atlas.mjs (modo Atlas: carga las variables de pruebas sin mostrarlas y exige
//   MONGODB_DB=proyecto_final_jc_pruebas); src/lib/db.ts además bloquea cualquier otra base y dropDatabase.
// - Se niega sin --si-atlas-pruebas. Borra los documentos de TODAS las colecciones de la app (no borra la base ni
//   los índices). Nunca toca proyecto_final_jc.

const BASE = "proyecto_final_jc_pruebas";

async function main() {
  const args = process.argv.slice(2);
  // Desde PowerShell, npm a veces se queda con los --algo: también se leen de npm_config_*.
  const npm = (k: string) => process.env[`npm_config_${k.replace(/-/g, "_")}`];
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? npm(k);
  const bandera = (k: string) => args.includes(`--${k}`) || npm(k) === "true";

  if (process.env.PFJC_MODO !== "atlas") throw new Error("Solo corre en modo Atlas de pruebas: usa `npm run vaciar:atlas-pruebas`.");
  const { BASE_ATLAS_PRUEBAS, closeDb, collections, dbHost, dbName } = await import("@/lib/db");
  if (BASE_ATLAS_PRUEBAS !== BASE || dbName() !== BASE) throw new Error(`Solo se vacía ${BASE}; la base configurada es "${dbName()}".`);
  if (!bandera("si-atlas-pruebas")) throw new Error(`Esto BORRA todos los datos de ${BASE}. Confirma agregando --si-atlas-pruebas.`);

  const usuario = (opt("usuario") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error("Indica el admin con --usuario=<usuario> (3 a 40 caracteres: letras, números, punto, guion o guion bajo).");
  const nombre = (opt("nombre") ?? "").trim().replace(/\s+/g, " ") || usuario;

  const { generarClave, hashClave } = await import("@/lib/usuarios");
  const { ObjectId } = await import("mongodb");
  const c = await collections();
  console.log(`Vaciando ${dbName()} en ${dbHost()}…`);

  // Todas las colecciones de la app (src/lib/db.ts → collections()).
  const nombres: Record<keyof typeof c, string> = {
    proyectos: "Proyectos", asientos: "Asientos (horas y reservas)", dias: "Reglas de cupos por día",
    inscripciones: "Cierre de inscripciones", franjasEditadas: "Franjas editadas", mentores: "Mentores",
    salasConfig: "Salas y monitores (libro importado)", planSalas: "Plan de salas", evalResultados: "Evaluaciones",
    evalAnuladas: "Evaluaciones anuladas", evalBorradores: "Borradores de evaluación", evalMonitor: "Notas del monitor",
    evalConfig: "Criterios de evaluación", cambiosSugeridos: "Cambios sugeridos", changeLog: "Historial (changeLog)",
    rateLimits: "Límites de intentos", users: "Usuarios",
  };
  const resumen: { coleccion: string; borrados: number }[] = [];
  for (const k of Object.keys(nombres) as (keyof typeof c)[]) {
    const r = await (c[k] as unknown as { deleteMany: (f: object) => Promise<{ deletedCount: number }> }).deleteMany({});
    resumen.push({ coleccion: nombres[k], borrados: r.deletedCount });
  }

  const clave = generarClave(), ahora = new Date();
  await c.users.insertOne({
    _id: new ObjectId(), usuario, nombre, rol: "admin", ciudades: [], activo: true,
    passwordHash: await hashClave(clave), tokenVersion: 0, creadoEn: ahora, actualizadoEn: ahora,
  });
  await c.changeLog.insertOne({ accion: "importar", nuevo: `Base de pruebas vaciada; admin ${usuario} creado`, actor: { rol: "admin", usuario: "vaciar.atlas-pruebas" }, fecha: ahora });

  console.log("\nBorrado:");
  console.table(resumen);
  console.log(`Total: ${resumen.reduce((a, x) => a + x.borrados, 0)} documentos.`);
  console.log(`\nAdmin creado: ${usuario} (${nombre})`);
  console.log(`Clave: ${clave}`);
  console.log("Guárdala ahora: no se vuelve a mostrar. Si la pierdes, vuelve a correr este comando (vacía todo otra vez) o usa «Restablecer clave» con otro admin.");
  await closeDb();
}

main().catch((e) => {
  console.error("\nNo se vació:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {}; // módulo propio: su main() no choca con el de otros scripts

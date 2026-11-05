// Primer admin de la base REAL (DESPLIEGUE §3c). Solo corre por scripts/con-produccion.mjs (npm run admin:produccion).
//   --usuario=<usuario> "--nombre=Nombre"  → crea el admin con clave al azar (se muestra una sola vez)
//   --verificar                            → solo lee: base, usuarios (sin claves) y cuántos datos hay
// Se niega si la base no es proyecto_final_jc, si ya hay usuarios (no reemplaza a nadie) o si no viene del envoltorio.

const BASE = "proyecto_final_jc";

async function main() {
  const args = process.argv.slice(2);
  // Desde PowerShell, npm a veces se queda con los --algo: también se leen de npm_config_*.
  const npm = (k: string) => process.env[`npm_config_${k.replace(/-/g, "_")}`];
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? npm(k);
  const bandera = (k: string) => args.includes(`--${k}`) || npm(k) === "true";

  if (process.env.PFJC_PRODUCCION !== "1" || process.env.NODE_ENV !== "production" || process.env.PFJC_MODO)
    throw new Error("Usa `npm run admin:produccion` (carga las variables de producción solo para este proceso).");
  const { closeDb, collections, dbHost, dbName } = await import("@/lib/db");
  if (dbName() !== BASE) throw new Error(`La base debe ser exactamente ${BASE}; es "${dbName()}".`);
  const c = await collections();

  if (bandera("verificar")) {
    const [usuarios, proyectos, asientos, evaluaciones] = await Promise.all([
      c.users.find({}, { projection: { usuario: 1, nombre: 1, rol: 1, activo: 1, creadoEn: 1 } }).sort({ creadoEn: 1 }).toArray(),
      c.proyectos.countDocuments(), c.asientos.countDocuments(), c.evalResultados.countDocuments(),
    ]);
    console.log(`Base: ${dbName()} en ${dbHost()}`);
    console.table(usuarios.map((u) => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo, creado: u.creadoEn.toISOString() })));
    console.log(`Usuarios: ${usuarios.length} · proyectos: ${proyectos} · horas: ${asientos} · evaluaciones: ${evaluaciones}`);
    await closeDb();
    return;
  }

  const usuario = (opt("usuario") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error("Indica el admin con --usuario=<usuario> (3 a 40 caracteres: letras, números, punto, guion o guion bajo).");
  const nombre = (opt("nombre") ?? "").trim().replace(/\s+/g, " ");
  if (nombre.length < 3) throw new Error('Indica el nombre con "--nombre=Nombre Apellido".');

  const hay = await c.users.countDocuments();
  if (hay) throw new Error(`${BASE} ya tiene ${hay} usuario${hay === 1 ? "" : "s"}: el primer admin solo se crea en una base sin usuarios. Revisa con --verificar.`);

  const { generarClave, hashClave } = await import("@/lib/usuarios");
  const { ObjectId } = await import("mongodb");
  const clave = generarClave(), ahora = new Date();
  await c.users.insertOne({
    _id: new ObjectId(), usuario, nombre, rol: "admin", ciudades: [], activo: true,
    passwordHash: await hashClave(clave), tokenVersion: 0, creadoEn: ahora, actualizadoEn: ahora,
  });
  console.log(`Base: ${dbName()} en ${dbHost()}`);
  console.log(`\nAdmin creado: ${usuario} (${nombre})`);
  console.log(`Clave: ${clave}`);
  console.log("Guárdala ahora: no se vuelve a mostrar. Al entrar, cámbiala si quieres desde Usuarios → Restablecer clave.");
  await closeDb();
}

main().catch((e) => {
  console.error("\nNo se creó:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {}; // módulo propio: su main() no choca con el de otros scripts

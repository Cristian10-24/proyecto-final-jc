// Uso:
//   npm run usuario:add -- usuario "Nombre Apellido" "Ciudad1,Ciudad2" [--rol=monitor] [--clave=CLAVE]
//   npm run usuario:add -- usuario "Nombre Apellido" --rol=coordinador [--clave=CLAVE]
//   npm run usuario:add -- usuario "Nombre Apellido" --rol=admin [--clave=CLAVE]
//   npm run usuario:list
// --rol: monitor (por defecto, exige ciudades) | coordinador | admin (ven todas las ciudades).
// Si el usuario ya existe, actualiza nombre, rol y ciudades, y cambia la clave solo si se da --clave
// o si se pide --nueva-clave (genera una). Al cambiar la clave se cierran sus sesiones abiertas.
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { closeDb, collections, dbHost, dbName } from "@/lib/db";
import { ROLES, type RolUsuario } from "@/lib/permisos";
import { generarClave, hashClave } from "@/lib/usuarios";
import { ciudadExistente, cleanSpaces, normalizeCity } from "@/lib/validation/name";

/**
 * Solo escribe en la base local (127.0.0.1/localhost). Para crear el primer admin en Atlas hay que
 * pedirlo a propósito con --atlas (ver docs/DESPLIEGUE.md): así un .env.local apuntando a Atlas no se usa por error.
 */
function baseLocalOAtlasExplicito(args: string[]) {
  process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27018/?replicaSet=rs0";
  const host = dbHost();
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) && !/\+srv|mongodb\.net/i.test(process.env.MONGODB_URI);
  if (!local && !args.includes("--atlas"))
    throw new Error(`MONGODB_URI apunta a "${host}", que no es local. Si de verdad quieres escribir ahí (primer admin en Atlas), agrega --atlas.`);
  if (!local) console.log(`ATENCIÓN: escribiendo en una base que no es local (${host}).`);
}

const USO = 'Uso: npm run usuario:add -- usuario "Nombre" ["Ciudad1,Ciudad2"] [--rol=monitor|coordinador|admin] [--clave=CLAVE] [--nueva-clave]';

async function add(args: string[]) {
  const opt = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const rol = (opt("rol") ?? "monitor") as RolUsuario;
  if (!ROLES.includes(rol)) throw new Error(`Rol inválido "${rol}". ${USO}`);
  const claveArg = opt("clave");
  if (claveArg !== undefined && claveArg.length < 8) throw new Error("La clave debe tener al menos 8 caracteres");

  const [usuarioRaw, nombreRaw, ciudadesRaw = ""] = args.filter((a) => !a.startsWith("--"));
  const nombre = cleanSpaces(nombreRaw ?? "");
  const ciudades = rol === "monitor"
    ? [...new Set(ciudadesRaw.split(",").map(normalizeCity).filter(Boolean).map((c) => ciudadExistente(c, NOMBRES_CIUDADES)))]
    : [];
  if (!usuarioRaw || !nombre || (rol === "monitor" && ciudades.length === 0)) {
    console.error(USO + (rol === "monitor" ? "\n(Un monitor necesita al menos una ciudad.)" : ""));
    process.exit(1);
  }
  const desconocidas = ciudades.filter((c) => !NOMBRES_CIUDADES.includes(c));
  if (desconocidas.length) throw new Error(`Ciudad desconocida: ${desconocidas.join(", ")}. Válidas: ${NOMBRES_CIUDADES.join(", ")}`);

  const usuario = usuarioRaw.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario)) throw new Error("Usuario: 3 a 40 caracteres, solo letras, números, punto, guion o guion bajo.");
  baseLocalOAtlasExplicito(args);
  const { users } = await collections();
  console.log(`Base: ${dbName()} en ${dbHost()}`);

  const existe = await users.findOne({ usuario });
  const cambiarClave = !existe || claveArg !== undefined || args.includes("--nueva-clave");
  const clave = cambiarClave ? claveArg ?? generarClave() : null;
  const now = new Date();
  await users.updateOne(
    { usuario },
    {
      $set: { nombre, ciudades, rol, activo: true, actualizadoEn: now, ...(clave ? { passwordHash: await hashClave(clave) } : {}) },
      $setOnInsert: { creadoEn: now },
      ...(clave ? { $inc: { tokenVersion: existe ? 1 : 0 } } : {}),
    },
    { upsert: true },
  );
  console.log(`\n${existe ? "Actualizado" : "Creado"}:\n  Usuario: ${usuario}\n  Rol:     ${rol}`);
  console.log(`  Ciudades: ${rol === "monitor" ? ciudades.join(", ") : "todas"}`);
  console.log(clave ? `  Clave:   ${clave}   (guárdala: no se vuelve a mostrar)` : "  Clave:   sin cambios");
}

async function list() {
  baseLocalOAtlasExplicito(process.argv);
  const { users } = await collections();
  const all = await users.find({}, { projection: { passwordHash: 0 } }).sort({ rol: 1, usuario: 1 }).toArray();
  console.table(all.map((u) => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.rol === "monitor" ? u.ciudades.join(", ") : "todas", activo: u.activo })));
}

const [cmd, ...rest] = process.argv.slice(2);
(cmd === "add" ? add(rest) : list())
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);

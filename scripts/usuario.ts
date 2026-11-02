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
  const { users } = await collections();
  const all = await users.find({}, { projection: { passwordHash: 0 } }).sort({ rol: 1, usuario: 1 }).toArray();
  console.table(all.map((u) => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.rol === "monitor" ? u.ciudades.join(", ") : "todas", activo: u.activo })));
}

const [cmd, ...rest] = process.argv.slice(2);
(cmd === "add" ? add(rest) : list())
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);

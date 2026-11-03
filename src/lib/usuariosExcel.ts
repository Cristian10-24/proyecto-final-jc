import type ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { NOMBRES_CIUDADES } from "./ciudades";
import { collections, transaccion } from "./db";
import { clave, texto } from "./importar/excel";
import type { RolUsuario } from "./permisos";
import type { User } from "./types";
import { generarClave, hashClave, mentorIdDe, parecidos } from "./usuarios";
import { cleanSpaces, normalizeCity } from "./validation/name";

// Carga de usuarios por Excel (Paso 13, como el prototipo: Nombre · Correo · Rol) y revisión de nombres.
// Columnas opcionales: Usuario (si no viene, sale del correo o del nombre) y Ciudades (monitores).
// Se envía dos veces el mismo archivo: "previa" no escribe; "confirmar" aplica solo si no hay errores.
// Si alguien ya existe (por usuario, correo, su mentor en Horarios o el mismo nombre), se actualiza; la clave no
// cambia. A los nuevos se les genera una clave temporal que se muestra una sola vez. Administración no se carga
// por Excel (se crea uno por uno) y nadie cambia su propio rol desde aquí.

export const COLUMNAS_USUARIOS = ["Nombre", "Correo", "Rol", "Usuario", "Ciudades"] as const;
export const ROLES_EXCEL: Record<string, RolUsuario> = { mentor: "mentor", mentora: "mentor", monitor: "monitor", monitora: "monitor", coordinacion: "coordinador", coordinador: "coordinador", coordinadora: "coordinador" };
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Tope por archivo: cada usuario nuevo lleva un hash bcrypt (lento) y todo va en una transacción. */
export const MAX_FILAS_USUARIOS = 300;

export type FilaUsuario = { fila: number; nombre: string; correo?: string; rol: RolUsuario; usuario?: string; ciudades: string[] };
export type LecturaUsuarios = { filas: FilaUsuario[]; errores: { fila: number; mensaje: string }[] };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Texto → usuario válido (a-z, 0-9, punto, guion), 3 a 40 caracteres. */
export function usuarioDe(base: string): string {
  const u = sinTildes(base).replace(/[^a-z0-9._-]+/g, ".").replace(/\.{2,}/g, ".").replace(/^[._-]+|[._-]+$/g, "").slice(0, 40);
  return u.padEnd(3, "0");
}
/** Usuario sugerido: la parte del correo antes de la @; si no hay correo, "nombre.apellido". */
export function usuarioSugerido(nombre: string, correo?: string): string {
  if (correo) return usuarioDe(correo.split("@")[0]!);
  const p = sinTildes(nombre).split(/\s+/).filter(Boolean);
  return usuarioDe([p[0], p.length > 2 ? p[p.length - 2] : p[1]].filter(Boolean).join("."));
}

/** Lee la primera hoja (o la llamada "Usuarios"): encabezados por sinónimos, una persona por fila. */
export function leerUsuarios(wb: ExcelJS.Workbook): LecturaUsuarios {
  const out: LecturaUsuarios = { filas: [], errores: [] };
  const ws = wb.worksheets.find((w) => clave(w.name) === "usuarios") ?? wb.worksheets[0];
  if (!ws) return { filas: [], errores: [{ fila: 0, mensaje: "El archivo no tiene hojas." }] };
  const col: Partial<Record<"nombre" | "correo" | "rol" | "usuario" | "ciudades", number>> = {};
  ws.getRow(1).eachCell((c, i) => {
    const k = clave(texto(c.value));
    if (/^nombre/.test(k)) col.nombre ??= i;
    else if (/^(correo|email|e mail)/.test(k)) col.correo ??= i;
    else if (/^(rol|cargo)/.test(k)) col.rol ??= i;
    else if (/^usuario/.test(k)) col.usuario ??= i;
    else if (/^ciudad/.test(k)) col.ciudades ??= i;
  });
  if (ws.actualRowCount > MAX_FILAS_USUARIOS + 1) return { filas: [], errores: [{ fila: 0, mensaje: `El archivo tiene más de ${MAX_FILAS_USUARIOS} personas. Divídelo en varios archivos.` }] };
  if (!col.nombre || !col.rol) return { filas: [], errores: [{ fila: 1, mensaje: "La primera fila debe tener los encabezados Nombre, Correo y Rol (Usuario y Ciudades son opcionales)." }] };
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const v = (c?: number) => (c ? cleanSpaces(texto(row.getCell(c).value)) : "");
    const nombre = v(col.nombre), correo = v(col.correo).toLowerCase(), rolTxt = v(col.rol), usuario = v(col.usuario), ciudadesTxt = v(col.ciudades);
    if (!nombre && !correo && !rolTxt && !usuario) return;
    const err = (mensaje: string) => out.errores.push({ fila: r, mensaje });
    if (nombre.length < 3) return err("Falta el nombre completo.");
    if (nombre.length > 80) return err("El nombre es muy largo (máximo 80 caracteres).");
    if (correo.length > 120) return err(`${nombre}: el correo es muy largo (máximo 120 caracteres).`);
    const rk = clave(rolTxt);
    if (/^(admin|administracion|administrador)/.test(rk)) return err(`${nombre}: administración no se carga por Excel; créala con «+ Nuevo usuario».`);
    const rol = ROLES_EXCEL[rk];
    if (!rol) return err(`${nombre}: rol "${rolTxt}" no reconocido. Escribe Mentor, Monitor o Coordinación.`);
    if (correo && !CORREO.test(correo)) return err(`${nombre}: el correo "${correo}" no es válido.`);
    if (usuario && !/^[a-z0-9._-]{3,40}$/.test(usuario.toLowerCase())) return err(`${nombre}: usuario "${usuario}" no válido (3 a 40 caracteres: letras, números, punto o guion).`);
    const ciudades = rol === "monitor" ? [...new Set(ciudadesTxt.split(/[,;/]| y /).map((c) => c.trim()).filter(Boolean).map(normalizeCity))] : [];
    const otra = ciudades.find((c) => !NOMBRES_CIUDADES.includes(c));
    if (otra) return err(`${nombre}: ciudad "${otra}" no reconocida.`);
    out.filas.push({ fila: r, nombre, ...(correo ? { correo } : {}), rol, ...(usuario ? { usuario: usuario.toLowerCase() } : {}), ciudades });
  });
  if (!out.filas.length && !out.errores.length) out.errores.push({ fila: 0, mensaje: "El archivo no tiene personas." });
  return out;
}

export type AccionUsuario = {
  fila: number; nombre: string; rol: RolUsuario; usuario: string; correo?: string; ciudades: string[];
  accion: "crear" | "actualizar" | "igual";
  /** Qué cambia al actualizar ("rol: Monitor → Mentor"). */
  cambios: string[];
};
export type PreviaUsuarios = { acciones: AccionUsuario[]; errores: { fila: number; mensaje: string }[]; totales: { crear: number; actualizar: number; igual: number } };

const ROL_TXT: Record<RolUsuario, string> = { mentor: "Mentor", monitor: "Monitor", coordinador: "Coordinación", admin: "Administración" };

/** Qué haría la carga, sin escribir. `yo`: el admin que carga (no puede cambiarse el rol). */
export async function previaUsuarios(l: LecturaUsuarios, yo: string): Promise<PreviaUsuarios & { existentes: Map<number, User> }> {
  const { users, mentores } = await collections();
  const [todos, horarios] = await Promise.all([users.find({}).toArray(), mentores.find({}, { projection: { nombre: 1 } }).toArray()]);
  const idsHorarios = new Set(horarios.map((m) => m._id));
  const errores = [...l.errores], acciones: AccionUsuario[] = [], existentes = new Map<number, User>();
  const tomados = new Set(todos.map((u) => u.usuario)), vistos = new Map<string, number>(), mismaPersona = new Map<string, number>();
  for (const f of l.filas) {
    const err = (mensaje: string) => errores.push({ fila: f.fila, mensaje });
    const mentorId = mentorIdDe(f.rol, f.nombre);
    if (mentorId && horarios.length && !idsHorarios.has(mentorId)) {
      const cerca = parecidos(f.nombre, horarios.map((m) => m.nombre));
      err(`${f.nombre}: no está en la hoja Horarios.${cerca.length ? ` ¿Quisiste decir ${cerca.map((n) => `"${n}"`).join(", ").replace(/, ([^,]*)$/, " o $1")}?` : ""} Escríbelo igual que allí.`);
      continue;
    }
    // La misma persona dos veces en el archivo (mismo correo, mismo mentor o mismo nombre).
    const personaKeys = [f.correo && `c:${f.correo}`, mentorId && `m:${mentorId}`, `n:${clave(f.nombre)}`];
    const repetida = personaKeys.map((k) => (k ? mismaPersona.get(k) : undefined)).find(Boolean);
    if (repetida) { err(`${f.nombre}: es la misma persona de la fila ${repetida}.`); continue; }
    const actual = (f.usuario ? todos.find((u) => u.usuario === f.usuario) : undefined)
      ?? (f.correo ? todos.find((u) => u.correo === f.correo) : undefined)
      ?? (mentorId ? todos.find((u) => u.mentorId === mentorId) : undefined)
      // Por último, el mismo nombre (sin tildes ni mayúsculas): las salas buscan a los monitores por nombre y dos
      // usuarios con el mismo nombre las dejarían sin monitor.
      ?? todos.find((u) => clave(u.nombre) === clave(f.nombre));
    if (actual?.rol === "admin") { err(`${f.nombre}: es un usuario de administración; edítalo uno por uno.`); continue; }
    // Una fila nunca se queda con la cuenta de otra persona: si el usuario o el correo coinciden, el nombre también.
    if (actual && clave(actual.nombre) !== clave(f.nombre)) { err(`${f.nombre}: el ${f.usuario && actual.usuario === f.usuario ? `usuario "${f.usuario}"` : `correo ${f.correo}`} ya es de ${actual.nombre}. Si es la misma persona, cambia el nombre con «Editar».`); continue; }
    // Quien se desactivó no vuelve por una carga (entraría con su clave anterior): se activa a mano en la lista.
    if (actual && !actual.activo) { err(`${f.nombre}: la cuenta ${actual.usuario} está desactivada. Actívala en la lista si debe volver.`); continue; }
    let usuario = actual?.usuario ?? f.usuario ?? usuarioSugerido(f.nombre, f.correo);
    if (vistos.has(usuario) && (actual || f.usuario)) { err(`${f.nombre}: el usuario "${usuario}" ya está en la fila ${vistos.get(usuario)}.`); continue; }
    if (!actual) {
      if (f.usuario && tomados.has(f.usuario)) { err(`${f.nombre}: el usuario "${f.usuario}" ya existe.`); continue; }
      // Usuario sugerido ocupado por otra persona: se le agrega un número.
      if (!f.usuario) for (let n = 2; tomados.has(usuario) || vistos.has(usuario); n++) usuario = `${usuarioSugerido(f.nombre, f.correo).slice(0, 37)}${n}`;
    }
    vistos.set(usuario, f.fila);
    for (const k of personaKeys) if (k) mismaPersona.set(k, f.fila);
    if (mentorId && todos.some((u) => u.mentorId === mentorId && u.usuario !== usuario)) { err(`${f.nombre}: ya hay otro usuario para ese mentor.`); continue; }
    if (actual && String(actual._id) === yo) { err(`${f.nombre}: eres tú; no puedes cambiar tu propio rol desde aquí.`); continue; }
    const cambios: string[] = [];
    if (actual) {
      if (actual.nombre !== f.nombre) cambios.push(`nombre: ${actual.nombre} → ${f.nombre}`);
      if (actual.rol !== f.rol) cambios.push(`rol: ${ROL_TXT[actual.rol]} → ${ROL_TXT[f.rol]}`);
      if (f.correo && actual.correo !== f.correo) cambios.push(`correo: ${f.correo}`);
      const ciudades = f.ciudades.length || f.rol !== "monitor" ? f.ciudades : actual.ciudades;
      if (ciudades.join(",") !== (f.rol === "monitor" ? actual.ciudades : []).join(",")) cambios.push(`ciudades: ${ciudades.join(", ") || "ninguna"}`);
      existentes.set(f.fila, actual);
    } else tomados.add(usuario);
    acciones.push({
      fila: f.fila, nombre: f.nombre, rol: f.rol, usuario, ...(f.correo ? { correo: f.correo } : {}),
      ciudades: f.ciudades.length || f.rol !== "monitor" || !actual ? f.ciudades : actual.ciudades,
      accion: actual ? (cambios.length ? "actualizar" : "igual") : "crear", cambios,
    });
  }
  const n = (a: AccionUsuario["accion"]) => acciones.filter((x) => x.accion === a).length;
  return { acciones, errores: errores.sort((a, b) => a.fila - b.fila), totales: { crear: n("crear"), actualizar: n("actualizar"), igual: n("igual") }, existentes };
}

export type ClaveNueva = { usuario: string; nombre: string; rol: RolUsuario; clave: string };

export class CambioUsuarios extends Error {}

/**
 * Aplica la carga (sin errores) en una transacción: o quedan todos, o ninguno (así nunca hay usuarios creados con una
 * clave que no se mostró). Devuelve las claves temporales de los nuevos (se muestran una sola vez).
 */
export async function aplicarUsuarios(previa: Awaited<ReturnType<typeof previaUsuarios>>, actor: string): Promise<ClaveNueva[]> {
  const { users, changeLog } = await collections();
  const ahora = new Date();
  const claves: ClaveNueva[] = previa.acciones.filter((a) => a.accion === "crear").map((a) => ({ usuario: a.usuario, nombre: a.nombre, rol: a.rol, clave: generarClave() }));
  // Los hash van antes de la transacción (son lentos), de a 8 en paralelo.
  const hashes: string[] = [];
  for (let i = 0; i < claves.length; i += 8) hashes.push(...(await Promise.all(claves.slice(i, i + 8).map((k) => hashClave(k.clave)))));
  const hashDe = new Map(claves.map((k, i) => [k.usuario, hashes[i]!]));
  await transaccion(async (s) => {
    for (const a of previa.acciones) {
      const mentorId = mentorIdDe(a.rol, a.nombre);
      if (a.accion === "crear") {
        await users.insertOne({
          _id: new ObjectId(), usuario: a.usuario, nombre: a.nombre, rol: a.rol, ciudades: a.ciudades, ...(a.correo ? { correo: a.correo } : {}),
          ...(mentorId ? { mentorId } : {}), activo: true, passwordHash: hashDe.get(a.usuario)!, tokenVersion: 0, creadoEn: ahora, actualizadoEn: ahora,
        }, { session: s });
      } else if (a.accion === "actualizar") {
        const u = previa.existentes.get(a.fila)!;
        // Solo si sigue como en la vista previa (activo y con el mismo rol: nunca administración). Cambiar el rol cierra sus sesiones.
        const r = await users.updateOne({ _id: u._id, rol: u.rol, activo: true }, {
          $set: { nombre: a.nombre, rol: a.rol, ciudades: a.ciudades, actualizadoEn: ahora, ...(a.correo ? { correo: a.correo } : {}), ...(mentorId ? { mentorId } : {}) },
          ...(mentorId ? {} : { $unset: { mentorId: "" } }), ...(u.rol !== a.rol ? { $inc: { tokenVersion: 1 } } : {}),
        }, { session: s });
        if (!r.matchedCount) throw new CambioUsuarios();
      }
    }
    const t = previa.totales;
    await changeLog.insertOne({ accion: "importar", nuevo: `Usuarios: ${t.crear} nuevos, ${t.actualizar} actualizados`, actor: { rol: "admin", usuario: actor }, fecha: ahora }, { session: s });
  });
  return claves;
}

export type RevisionNombres = {
  horariosImportados: boolean;
  mentoresSinUsuario: string[];
  usuariosSinMentor: { usuario: string; nombre: string; sugerencias: string[] }[];
  planSalas: boolean;
  monitoresSinSalas: string[];
  salasSinMonitor: number;
};

/** Revisión de nombres (como el prototipo): mentores de Horarios sin usuario, usuarios mentor que no coinciden y monitores. */
export async function revisionNombres(): Promise<RevisionNombres> {
  const { users, mentores, planSalas } = await collections();
  const [activos, horarios, plan] = await Promise.all([
    users.find({ activo: true, rol: { $in: ["mentor", "monitor"] } }, { projection: { usuario: 1, nombre: 1, rol: 1, mentorId: 1 } }).toArray(),
    mentores.find({}, { projection: { nombre: 1 } }).toArray(),
    planSalas.find({}, { projection: { monitor: 1 } }).toArray(),
  ]);
  const conUsuario = new Set(activos.map((u) => u.mentorId).filter(Boolean));
  const idsHorarios = new Set(horarios.map((m) => m._id));
  const conSala = new Set(plan.map((p) => p.monitor).filter(Boolean));
  const porNombre = (a: string, b: string) => a.localeCompare(b, "es");
  return {
    horariosImportados: horarios.length > 0,
    mentoresSinUsuario: horarios.filter((m) => !conUsuario.has(m._id)).map((m) => m.nombre).sort(porNombre),
    usuariosSinMentor: horarios.length
      ? activos.filter((u) => u.rol === "mentor" && !idsHorarios.has(u.mentorId ?? "")).map((u) => ({ usuario: u.usuario, nombre: u.nombre, sugerencias: parecidos(u.nombre, horarios.map((m) => m.nombre)) }))
      : [],
    planSalas: plan.length > 0,
    monitoresSinSalas: plan.length ? activos.filter((u) => u.rol === "monitor" && !conSala.has(u.usuario)).map((u) => u.nombre).sort(porNombre) : [],
    salasSinMonitor: plan.filter((p) => !p.monitor).length,
  };
}

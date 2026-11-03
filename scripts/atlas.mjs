// Carga del modo Atlas de PRUEBAS. Es el único archivo que lee .env.atlas.local (sin mostrarlo nunca).
// El usuario de ese archivo puede tener acceso a otras bases del cluster (apps en producción): por eso
// solo se arranca si MONGODB_DB es exactamente proyecto_final_jc_pruebas, y src/lib/db.ts bloquea en
// ejecución cualquier otra base y toda operación de administración.
import { existsSync } from "node:fs";

export const BASE_ATLAS_PRUEBAS = "proyecto_final_jc_pruebas";
const ARCHIVO = ".env.atlas.local";

function negarse(motivo) {
  console.error(`Modo Atlas: ${motivo} No se arranca.`);
  process.exit(1);
}

/** "cluster0.ab1cd.mongodb.net" → "clu•••.mongodb.net". Nunca la URI ni el usuario. */
export function hostEnmascarado(uri) {
  const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?,]/)[0] ?? "";
  const partes = host.split(".");
  return partes.length > 2 ? `${partes[0].slice(0, 3)}•••.${partes.slice(-2).join(".")}` : "•••";
}

/** Carga .env.atlas.local en process.env y deja el proceso en modo Atlas, o termina sin mostrar la URI. */
export function cargarAtlas() {
  if (!existsSync(ARCHIVO)) negarse(`falta ${ARCHIVO}.`);
  // Que nada venga de otro lado (variables del sistema u otro .env): solo de este archivo.
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DB;
  try {
    process.loadEnvFile(ARCHIVO);
  } catch {
    negarse(`no se pudo leer ${ARCHIVO}.`);
  }
  if (!process.env.MONGODB_URI) negarse(`${ARCHIVO} no define MONGODB_URI.`);
  if (process.env.MONGODB_DB !== BASE_ATLAS_PRUEBAS) negarse(`MONGODB_DB debe ser exactamente "${BASE_ATLAS_PRUEBAS}".`);
  process.env.PFJC_MODO = "atlas";
  return { base: BASE_ATLAS_PRUEBAS, host: hostEnmascarado(process.env.MONGODB_URI) };
}

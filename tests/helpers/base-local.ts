// Barrera de las pruebas con base: solo una MongoDB local y solo la base de pruebas.
// Se ejecuta ANTES de importar @/lib/db, para que la app nunca llegue a conectarse a Atlas desde una prueba.

export const URI_PRUEBAS = process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27018/?replicaSet=rs0";
export const BASE_PRUEBAS = "proyecto_final_jc_pruebas";

export function usarBaseLocal(poolMax = 5) {
  const host = URI_PRUEBAS.replace(/^mongodb:\/\//, "").split(/[/?]/)[0] ?? "";
  if (/mongodb\.net|mongodb\+srv/i.test(URI_PRUEBAS) || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
    throw new Error(`Las pruebas solo usan una base local; se recibió el host "${host}".`);
  process.env.MONGODB_URI = URI_PRUEBAS;
  process.env.MONGODB_DB = BASE_PRUEBAS;
  process.env.MONGODB_MAX_POOL = String(poolMax);
}

import { NextResponse } from "next/server";
import { revalidateTag, unstable_cache } from "next/cache";

// Modo post-evento (EVENTO_CERRADO=1): las presentaciones terminaron y la app sigue en línea para consultar.
// - Las lecturas pesadas se guardan en la caché de datos de Next (compartida entre instancias en Vercel) por 15 min.
// - Cualquier escritura exitosa (y el botón «Actualizar») invalida esa caché: el siguiente que lea, recalcula.
// Sin la variable, leer() calcula como siempre e invalidarLecturas() no hace nada: todo igual que antes.
// Nada de esto escribe en la base.

export const TAG_LECTURAS = "pfjc-lecturas";
export const CACHE_SEGUNDOS = 15 * 60;
export const CABECERA_DATOS_AL = "x-datos-al";

export const eventoCerrado = () => process.env.EVENTO_CERRADO === "1";

/** Lectura con caché en modo post-evento. `args` debe incluir TODO lo que cambia el resultado (filtros, usuario). */
export async function leer<T>(nombre: string, args: unknown[], fn: () => Promise<T>): Promise<{ datos: T; al: string }> {
  if (!eventoCerrado()) return { datos: await fn(), al: new Date().toISOString() };
  const enCache = unstable_cache(
    // Se guarda como JSON: es lo mismo que el navegador recibe de NextResponse.json.
    async () => ({ datos: JSON.parse(JSON.stringify(await fn())) as T, al: new Date().toISOString() }),
    ["pfjc", nombre, JSON.stringify(args)],
    { tags: [TAG_LECTURAS], revalidate: CACHE_SEGUNDOS },
  );
  return enCache();
}

/** Respuesta JSON de una lectura, con la hora en que se calcularon los datos (para «Datos al …»). */
export function jsonLectura<T>(r: { datos: T; al: string }, headers: Record<string, string> = {}) {
  return NextResponse.json(r.datos, { headers: { ...headers, [CABECERA_DATOS_AL]: r.al } });
}

/** Tras guardar algo: la próxima lectura recalcula (solo en modo post-evento). */
export function invalidarLecturas() {
  if (eventoCerrado()) revalidateTag(TAG_LECTURAS, { expire: 0 });
}

/** Envuelve un handler de escritura: si respondió bien, invalida la caché de lecturas. No cambia la respuesta. */
export function invalidaAlGuardar<A extends unknown[]>(h: (...a: A) => Promise<Response>) {
  return async (...a: A): Promise<Response> => {
    const res = await h(...a);
    if (res.ok) invalidarLecturas();
    return res;
  };
}

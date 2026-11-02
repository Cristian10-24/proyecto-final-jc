import { collections } from "./db";

// Límites guardados en MongoDB (colección rateLimits, con TTL), en ventanas fijas de 15 minutos.
//
//  - Por DOCUMENTO: cada documento admite pocas búsquedas por ventana (cuentan todas, aciertos y fallos).
//    Es el límite principal: muchos estudiantes entran desde el mismo wifi del colegio y no se frenan entre sí.
//  - Por IP: solo cuentan los FALLOS (documento inexistente, clave incorrecta) y el tope es alto.
//    Frena a quien prueba documentos al azar sin bloquear a un salón entero.
//  - Login: fallos por IP, como en validation-jc.

const VENTANA_MS = 15 * 60 * 1000;

export const LIMITES = {
  documento: Number(process.env.RATE_LIMIT_DOC_MAX) || 15,
  ip: Number(process.env.RATE_LIMIT_IP_MAX) || 300,
  login: 20,
} as const;

export type TipoLimite = keyof typeof LIMITES;

/** IP del cliente. En Vercel llega en x-real-ip / x-forwarded-for (la primera es la del cliente). */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]!.trim() : "local";
}

/** Clave del contador: tipo, sujeto (IP o documento) y número de ventana. */
export function claveLimite(tipo: TipoLimite, sujeto: string, now = Date.now()) {
  const ventana = Math.floor(now / VENTANA_MS);
  return { _id: `${tipo}:${sujeto}:${ventana}`, expiraEn: new Date((ventana + 1) * VENTANA_MS) };
}

/** true si el sujeto ya llegó a su límite en la ventana actual. */
export async function bloqueado(tipo: TipoLimite, sujeto: string): Promise<boolean> {
  const { rateLimits } = await collections();
  const doc = await rateLimits.findOne({ _id: claveLimite(tipo, sujeto)._id });
  return (doc?.count ?? 0) >= LIMITES[tipo];
}

/** Suma un intento al sujeto. */
export async function contar(tipo: TipoLimite, sujeto: string): Promise<void> {
  const { rateLimits } = await collections();
  const { _id, expiraEn } = claveLimite(tipo, sujeto);
  await rateLimits.updateOne({ _id }, { $inc: { count: 1 }, $setOnInsert: { expiraEn } }, { upsert: true });
}

export const MENSAJE_BLOQUEO = "Demasiados intentos. Espera unos minutos e intenta otra vez.";

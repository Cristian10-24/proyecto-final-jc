import { randomBytes } from "node:crypto";
import { ZONA, type Evento } from "./contenido";

// Fase 5 · Paso 28 · Cliente de Google Calendar (API REST con fetch; sin librerías nuevas).
// Una sola cuenta organizadora (OAuth con refresh token, alcance `calendar.events`) sobre su calendario principal.
// Los secretos solo se leen de variables de entorno (Vercel) y nunca se escriben en logs, errores ni respuestas.
// Toda la app usa la interfaz `ClienteCalendario`: las pruebas le pasan un cliente simulado y nunca llaman a Google.

export type ConfigGoogle = { clientId: string; clientSecret: string; refreshToken: string; calendario: string };

/** Lo que la pantalla puede saber de la conexión (nunca los secretos). */
export type EstadoGoogle = { conectado: boolean; correoPrueba: string | null; error?: string };

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lee la configuración de las variables de entorno. Sin las tres variables: no conectado (no se envía nada). */
export function leerConfig(env: Record<string, string | undefined> = process.env): { config: ConfigGoogle | null; estado: EstadoGoogle } {
  const clientId = env.GOOGLE_CAL_CLIENT_ID?.trim(), clientSecret = env.GOOGLE_CAL_CLIENT_SECRET?.trim(), refreshToken = env.GOOGLE_CAL_REFRESH_TOKEN?.trim();
  const prueba = env.CITACIONES_CORREO_PRUEBA?.trim().toLowerCase() || null;
  if (prueba && !CORREO.test(prueba)) return { config: null, estado: { conectado: false, correoPrueba: null, error: "CITACIONES_CORREO_PRUEBA no es un correo válido: no se envía nada." } };
  if (!clientId || !clientSecret || !refreshToken) return { config: null, estado: { conectado: false, correoPrueba: prueba } };
  return { config: { clientId, clientSecret, refreshToken, calendario: "primary" }, estado: { conectado: true, correoPrueba: prueba } };
}

/** Error de Google ya resumido: estado HTTP, motivo y un mensaje corto (sin tokens ni cuerpos completos). */
export class ErrorGoogle extends Error {
  constructor(readonly status: number, readonly motivo: string, mensaje: string) { super(mensaje); this.name = "ErrorGoogle"; }
}

export interface ClienteCalendario {
  /** Crea o reemplaza el evento `id`. `existe`: la app ya lo creó antes (se reemplaza; si no está, se crea). */
  guardar(id: string, evento: Evento, existe: boolean): Promise<void>;
  /** Cancela el evento (avisa a los invitados). Si ya no existe, no es error. */
  cancelar(id: string): Promise<void>;
}

/** Id propio del evento: base32hex (a-v, 0-9), como exige Google. Prefijo «jc» para reconocerlos. */
export function nuevoIdEvento(): string {
  const alfabeto = "0123456789abcdefghijklmnopqrstuv";
  return "jc" + [...randomBytes(20)].map((b) => alfabeto[b % 32]).join("");
}

/** Cuerpo del evento para la API: invitados ocultos entre sí, sin invitar a otros ni modificar. */
export function cuerpoEvento(id: string, e: Evento) {
  return {
    id,
    summary: e.titulo,
    description: e.descripcion,
    ...(e.ubicacion ? { location: e.ubicacion } : {}),
    start: { dateTime: e.inicio.toISOString(), timeZone: ZONA },
    end: { dateTime: e.fin.toISOString(), timeZone: ZONA },
    attendees: e.invitados.map((i) => ({ email: i.correo, displayName: i.nombre })),
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    status: "confirmed",
  };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Opciones = {
  fetch?: Fetch; esperar?: (ms: number) => Promise<void>; reintentos?: number; baseMs?: number;
  /** Tope de cada llamada a Google (sin respuesta → se reintenta). */
  timeoutMs?: number;
  /** Tiempo total por operación (guardar o cancelar un evento), reintentos incluidos. */
  presupuestoMs?: number;
};

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN = "https://oauth2.googleapis.com/token";

/** ¿Vale la pena reintentar? Sin respuesta (0), 429, 403 por límite de uso y errores 5xx (con espera creciente). */
export function reintentable(status: number, motivo: string): boolean {
  return status === 0 || status === 429 || status >= 500 || (status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(motivo));
}

/** Espera máxima que se acepta de un Retry-After (Google puede pedir mucho más). */
export const MAX_ESPERA_MS = 10_000;
/** Los mensajes de Google pueden traer un correo de un invitado: nunca se guardan. */
const sinCorreos = (s: string) => s.replace(/[^\s@:;,<>()"']+@[^\s@:;,<>()"']+/g, "[correo]");

async function leerError(r: Response): Promise<ErrorGoogle> {
  let motivo = "", mensaje = "";
  try {
    const j = (await r.json()) as { error?: { message?: string; errors?: { reason?: string }[] } | string; error_description?: string };
    if (typeof j.error === "string") { motivo = j.error; mensaje = j.error_description ?? j.error; }
    else { motivo = j.error?.errors?.[0]?.reason ?? ""; mensaje = j.error?.message ?? ""; }
  } catch { /* cuerpo no JSON */ }
  const txt = sinCorreos(`Google respondió ${r.status}${motivo ? ` (${motivo})` : ""}${mensaje ? `: ${mensaje}` : ""}`).slice(0, 240);
  return new ErrorGoogle(r.status, motivo, txt);
}

export function clienteGoogle(config: ConfigGoogle, op: Opciones = {}): ClienteCalendario {
  const timeoutMs = op.timeoutMs ?? 15_000, presupuestoMs = op.presupuestoMs ?? 45_000;
  const fBase: Fetch = op.fetch ?? ((u, i) => fetch(u, i));
  // Cada llamada con tope de tiempo; sin respuesta (red o tiempo) = ErrorGoogle 0, que se reintenta.
  const f: Fetch = async (u, i) => {
    try { return await fBase(u, { ...i, signal: AbortSignal.timeout(timeoutMs) }); } catch {
      throw new ErrorGoogle(0, "sin_respuesta", "Google no respondió a tiempo (red o tiempo de espera).");
    }
  };
  const esperar = op.esperar ?? ((ms) => new Promise((ok) => setTimeout(ok, ms)));
  const reintentos = op.reintentos ?? 4, baseMs = op.baseMs ?? 1000;
  let token: { valor: string; vence: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.vence > Date.now() + 60_000) return token.valor;
    const r = await f(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: "refresh_token" }).toString(),
    });
    if (!r.ok) {
      const e = await leerError(r);
      throw new ErrorGoogle(r.status, e.motivo, `No se pudo conectar con Google Calendar (${e.motivo || r.status}). Revisa las credenciales en Vercel.`);
    }
    const j = (await r.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: number };
    if (typeof j.access_token !== "string" || !j.access_token) throw new ErrorGoogle(502, "sin_token", "Google no entregó el permiso de acceso. Revisa las credenciales en Vercel.");
    token = { valor: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.valor;
  }

  /** Una llamada con reintentos (espera creciente, o la que pida Google con Retry-After). */
  async function llamar(metodo: string, ruta: string, cuerpo?: unknown): Promise<Response> {
    const limite = Date.now() + presupuestoMs;
    for (let intento = 0; ; intento++) {
      let e: ErrorGoogle, pide = NaN;
      try {
        const r = await f(`${API}${ruta}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${await accessToken()}`, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
          ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
        });
        if (r.ok) return r;
        if (r.status === 401 && intento === 0) { token = null; continue; } // token vencido: se renueva una vez
        e = await leerError(r);
        pide = Number(r.headers.get("retry-after"));
      } catch (x) {
        if (!(x instanceof ErrorGoogle)) throw x;
        e = x;
      }
      if (!reintentable(e.status, e.motivo) || intento >= reintentos) throw e;
      const espera = Math.min(Number.isFinite(pide) && pide > 0 ? pide * 1000 : baseMs * 2 ** intento + Math.floor(Math.random() * 250), MAX_ESPERA_MS);
      if (Date.now() + espera > limite) throw e; // sin tiempo para otro intento: se marca Error y se reintenta después
      await esperar(espera);
    }
  }

  const cal = `/calendars/${encodeURIComponent(config.calendario)}/events`;
  return {
    async guardar(id, evento, existe) {
      const cuerpo = cuerpoEvento(id, evento);
      const reemplazar = () => llamar("PUT", `${cal}/${id}?sendUpdates=all`, cuerpo);
      const crear = () => llamar("POST", `${cal}?sendUpdates=all`, cuerpo);
      try {
        await (existe ? reemplazar() : crear());
      } catch (e) {
        // Ya existe (un intento anterior lo creó): se reemplaza. No existe (lo borraron en Google): se crea.
        if (e instanceof ErrorGoogle && !existe && e.status === 409) await reemplazar();
        else if (e instanceof ErrorGoogle && existe && (e.status === 404 || e.status === 410)) await crear();
        else throw e;
      }
    },
    async cancelar(id) {
      try { await llamar("DELETE", `${cal}/${id}?sendUpdates=all`); } catch (e) {
        if (e instanceof ErrorGoogle && (e.status === 404 || e.status === 410)) return;
        throw e;
      }
    },
  };
}

/**
 * Defensa del modo prueba: rechaza cualquier evento cuyos invitados no sean exactamente el correo de prueba
 * (aunque quien llama olvide aplicar el modo prueba, nunca sale una invitación a invitados reales).
 */
export function soloCorreoPrueba(cliente: ClienteCalendario, correoPrueba: string): ClienteCalendario {
  return {
    async guardar(id, evento, existe) {
      if (evento.invitados.length !== 1 || evento.invitados[0]!.correo.toLowerCase() !== correoPrueba)
        throw new ErrorGoogle(400, "modo_prueba", "Modo prueba: se bloqueó un envío a invitados reales.");
      await cliente.guardar(id, evento, existe);
    },
    cancelar: (id) => cliente.cancelar(id),
  };
}

/**
 * Cliente y modo prueba leídos JUNTOS de las variables de entorno (las rutas usan solo esto). Sin conexión: cliente
 * null. Con CITACIONES_CORREO_PRUEBA: el cliente solo deja salir eventos al correo de prueba.
 */
export function entornoCitaciones(env: Record<string, string | undefined> = process.env): { estado: EstadoGoogle; cliente: ClienteCalendario | null; correoPrueba: string | null } {
  const { config, estado } = leerConfig(env);
  if (!config) return { estado, cliente: null, correoPrueba: estado.correoPrueba };
  const base = clienteGoogle(config);
  return { estado, cliente: estado.correoPrueba ? soloCorreoPrueba(base, estado.correoPrueba) : base, correoPrueba: estado.correoPrueba };
}

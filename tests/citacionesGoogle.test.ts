import { describe, expect, it } from "vitest";
import type { Evento } from "../src/lib/citaciones/contenido";
import { clienteGoogle, cuerpoEvento, entornoCitaciones, ErrorGoogle, leerConfig, nuevoIdEvento, reintentable, soloCorreoPrueba } from "../src/lib/citaciones/google";

// Fase 5 · Paso 28 · Cliente de Google Calendar con un fetch simulado (nunca llama a Google de verdad).

const CONFIG = { clientId: "id-cliente", clientSecret: "SECRETO-CLIENTE", refreshToken: "REFRESH-SECRETO", calendario: "primary" };
const EVENTO: Evento = {
  titulo: "Proyecto Final JC 2026 · Presentación de X", inicio: new Date("2026-11-12T19:00:00Z"), fin: new Date("2026-11-12T19:15:00Z"),
  ubicacion: "https://meet.google.com/abc", descripcion: "Hola", invitados: [{ correo: "a@x.org", nombre: "Ana" }, { correo: "b@x.org", nombre: "Beto" }],
};

type Llamada = { url: string; metodo: string; cuerpo?: string; auth?: string };
function simulado(respuestas: (((l: Llamada) => Response | undefined) | undefined)[]) {
  const llamadas: Llamada[] = [], esperas: number[] = [];
  let i = 0;
  const fetch = async (url: string, init?: RequestInit) => {
    const l: Llamada = { url, metodo: init?.method ?? "GET", cuerpo: init?.body as string | undefined, auth: (init?.headers as Record<string, string> | undefined)?.Authorization };
    llamadas.push(l);
    if (url.includes("oauth2")) return Response.json({ access_token: `tok-${llamadas.filter((x) => x.url.includes("oauth2")).length}`, expires_in: 3600 });
    const r = respuestas[i++]?.(l);
    return r ?? Response.json({ id: "ok" });
  };
  return { llamadas, esperas, cliente: clienteGoogle(CONFIG, { fetch, esperar: async (ms) => { esperas.push(ms); }, baseMs: 10 }) };
}
const err = (status: number, reason: string, message = "x") => () => Response.json({ error: { code: status, message, errors: [{ reason }] } }, { status });
const eventos = (ls: Llamada[]) => ls.filter((l) => !l.url.includes("oauth2"));

describe("configuración", () => {
  it("sin las tres variables no está conectado; el correo de prueba se valida", () => {
    expect(leerConfig({}).estado).toEqual({ conectado: false, correoPrueba: null });
    expect(leerConfig({ GOOGLE_CAL_CLIENT_ID: "a", GOOGLE_CAL_CLIENT_SECRET: "b" }).config).toBeNull();
    const ok = leerConfig({ GOOGLE_CAL_CLIENT_ID: "a", GOOGLE_CAL_CLIENT_SECRET: "b", GOOGLE_CAL_REFRESH_TOKEN: "c", CITACIONES_CORREO_PRUEBA: " Yo@Toca.org " });
    expect(ok.estado).toEqual({ conectado: true, correoPrueba: "yo@toca.org" });
    const malo = leerConfig({ GOOGLE_CAL_CLIENT_ID: "a", GOOGLE_CAL_CLIENT_SECRET: "b", GOOGLE_CAL_REFRESH_TOKEN: "c", CITACIONES_CORREO_PRUEBA: "no-es-correo" });
    expect(malo.config).toBeNull();
    expect(malo.estado.error).toMatch(/no se envía nada/);
    expect(JSON.stringify(ok.estado)).not.toContain("c\"");
  });
});

describe("evento", () => {
  it("invitados ocultos entre sí, sin invitar ni modificar, hora de Colombia", () => {
    const c = cuerpoEvento("jcabc12", EVENTO);
    expect(c).toMatchObject({
      id: "jcabc12", summary: EVENTO.titulo, location: "https://meet.google.com/abc", status: "confirmed",
      guestsCanSeeOtherGuests: false, guestsCanInviteOthers: false, guestsCanModify: false,
      start: { dateTime: "2026-11-12T19:00:00.000Z", timeZone: "America/Bogota" },
      attendees: [{ email: "a@x.org", displayName: "Ana" }, { email: "b@x.org", displayName: "Beto" }],
    });
  });
  it("ids propios en base32hex", () => {
    const ids = Array.from({ length: 50 }, nuevoIdEvento);
    for (const id of ids) expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(new Set(ids).size).toBe(50);
  });
});

describe("cliente", () => {
  it("crea con sendUpdates=all y reutiliza el token", async () => {
    const s = simulado([]);
    await s.cliente.guardar("jc1aaaa", EVENTO, false);
    await s.cliente.guardar("jc2aaaa", EVENTO, false);
    expect(s.llamadas.filter((l) => l.url.includes("oauth2"))).toHaveLength(1);
    const [a] = eventos(s.llamadas);
    expect(a!.metodo).toBe("POST");
    expect(a!.url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all");
    expect(a!.auth).toBe("Bearer tok-1");
    expect(JSON.parse(a!.cuerpo!).guestsCanSeeOtherGuests).toBe(false);
  });

  it("ya existe (409) → reemplaza el mismo evento; existe pero no está (404) → lo crea", async () => {
    let s = simulado([err(409, "duplicate")]);
    await s.cliente.guardar("jc1aaaa", EVENTO, false);
    expect(eventos(s.llamadas).map((l) => `${l.metodo} ${l.url.split("/events")[1]}`)).toEqual(["POST ?sendUpdates=all", "PUT /jc1aaaa?sendUpdates=all"]);
    s = simulado([err(404, "notFound")]);
    await s.cliente.guardar("jc1aaaa", EVENTO, true);
    expect(eventos(s.llamadas).map((l) => l.metodo)).toEqual(["PUT", "POST"]);
  });

  it("reintenta con espera ante 429, 403 por límite y 5xx", async () => {
    const s = simulado([err(429, "rateLimitExceeded"), err(403, "userRateLimitExceeded"), err(503, "backendError")]);
    await s.cliente.guardar("jc1aaaa", EVENTO, false);
    expect(eventos(s.llamadas)).toHaveLength(4);
    expect(s.esperas).toHaveLength(3);
    expect(s.esperas[1]!).toBeGreaterThanOrEqual(20);
    expect(reintentable(403, "forbidden")).toBe(false);
  });

  it("se rinde después de los reintentos y no reintenta errores de datos", async () => {
    const s = simulado(Array.from({ length: 10 }, () => err(429, "rateLimitExceeded")));
    await expect(s.cliente.guardar("jc1aaaa", EVENTO, false)).rejects.toBeInstanceOf(ErrorGoogle);
    expect(eventos(s.llamadas)).toHaveLength(5);
    const d = simulado([err(400, "invalid", "Invalid attendee email.")]);
    await expect(d.cliente.guardar("jc1aaaa", EVENTO, false)).rejects.toThrow("Google respondió 400 (invalid): Invalid attendee email.");
    expect(eventos(d.llamadas)).toHaveLength(1);
  });

  it("token vencido (401): lo renueva una vez y repite", async () => {
    const s = simulado([() => new Response("{}", { status: 401 })]);
    await s.cliente.guardar("jc1aaaa", EVENTO, false);
    expect(eventos(s.llamadas).map((l) => l.auth)).toEqual(["Bearer tok-1", "Bearer tok-2"]);
  });

  it("cancelar avisa a los invitados; si ya no existe, no es error", async () => {
    const s = simulado([undefined, err(410, "deleted")]);
    await s.cliente.cancelar("jc1aaaa");
    await s.cliente.cancelar("jc2aaaa");
    expect(eventos(s.llamadas)[0]).toMatchObject({ metodo: "DELETE", url: "https://www.googleapis.com/calendar/v3/calendars/primary/events/jc1aaaa?sendUpdates=all" });
  });

  it("Retry-After con tope de 10 s; sin presupuesto para otro intento, se rinde", async () => {
    const lento = () => new Response(JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } }), { status: 429, headers: { "retry-after": "3600" } });
    const s = simulado([lento]);
    await s.cliente.guardar("jc1aaaa", EVENTO, false);
    expect(s.esperas).toEqual([10_000]);
    const fetch = async (url: string) => (url.includes("oauth2") ? Response.json({ access_token: "t", expires_in: 3600 }) : lento());
    const c = clienteGoogle(CONFIG, { fetch, esperar: async () => {}, presupuestoMs: 5_000 });
    await expect(c.guardar("jc1aaaa", EVENTO, false)).rejects.toMatchObject({ status: 429 });
  });

  it("sin respuesta (red o tiempo de espera) se reintenta; sin access_token no se envía nada", async () => {
    let n = 0;
    const fetch = async (url: string) => {
      if (url.includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
      if (n++ === 0) throw new Error("timeout");
      return Response.json({});
    };
    await clienteGoogle(CONFIG, { fetch, esperar: async () => {} }).guardar("jc1aaaa", EVENTO, false);
    expect(n).toBe(2);
    const sinToken = clienteGoogle(CONFIG, { fetch: async () => Response.json({}), esperar: async () => {} });
    await expect(sinToken.guardar("jc1aaaa", EVENTO, false)).rejects.toMatchObject({ motivo: "sin_token" });
  });

  it("los mensajes de Google no guardan correos", async () => {
    const s = simulado([err(400, "invalid", "Invalid attendee email: ana.perez@correo.test")]);
    await expect(s.cliente.guardar("jc1aaaa", EVENTO, false)).rejects.toThrow("Google respondió 400 (invalid): Invalid attendee email: [correo]");
  });

  it("modo prueba desde el entorno: el cliente bloquea cualquier invitado real", async () => {
    const env = { GOOGLE_CAL_CLIENT_ID: "a", GOOGLE_CAL_CLIENT_SECRET: "b", GOOGLE_CAL_REFRESH_TOKEN: "c", CITACIONES_CORREO_PRUEBA: "yo@prueba.test" };
    const e = entornoCitaciones(env);
    expect(e.correoPrueba).toBe("yo@prueba.test");
    await expect(e.cliente!.guardar("jc1aaaa", EVENTO, false)).rejects.toMatchObject({ motivo: "modo_prueba" });
    const llamadas: string[] = [];
    const base = { guardar: async (id: string) => { llamadas.push(id); }, cancelar: async () => {} };
    await soloCorreoPrueba(base, "yo@prueba.test").guardar("jc1", { ...EVENTO, invitados: [{ correo: "Yo@Prueba.test", nombre: "Prueba" }] }, false);
    expect(llamadas).toEqual(["jc1"]);
    expect(entornoCitaciones({}).cliente).toBeNull();
  });

  it("los errores nunca llevan secretos ni tokens", async () => {
    const fetch = async (url: string) => url.includes("oauth2")
      ? Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 })
      : Response.json({});
    const c = clienteGoogle(CONFIG, { fetch, esperar: async () => {} });
    const e = await c.guardar("jc1aaaa", EVENTO, false).catch((x: Error) => x);
    expect(e).toBeInstanceOf(ErrorGoogle);
    expect((e as Error).message).toMatch(/No se pudo conectar con Google Calendar \(invalid_grant\)/);
    for (const secreto of ["SECRETO-CLIENTE", "REFRESH-SECRETO", "tok-"]) expect((e as Error).message).not.toContain(secreto);
  });
});

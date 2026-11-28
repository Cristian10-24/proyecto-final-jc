import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// Modo post-evento sin base: el interruptor, la envoltura de las escrituras, el proxy fuera de los estáticos y robots.txt.

const llamadas = vi.hoisted(() => ({ cache: 0, invalidar: 0 }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => { llamadas.cache++; return fn; },
  revalidateTag: () => { llamadas.invalidar++; },
}));
const pe = await import("@/lib/postEvento");
const { config } = await import("@/proxy");

const env = process.env.EVENTO_CERRADO;
afterEach(() => { if (env === undefined) delete process.env.EVENTO_CERRADO; else process.env.EVENTO_CERRADO = env; llamadas.cache = 0; llamadas.invalidar = 0; });

describe("interruptor EVENTO_CERRADO", () => {
  it("solo «1» lo activa", () => {
    for (const [v, r] of [[undefined, false], ["", false], ["0", false], ["true", false], ["1", true]] as const) {
      if (v === undefined) delete process.env.EVENTO_CERRADO; else process.env.EVENTO_CERRADO = v;
      expect(pe.eventoCerrado()).toBe(r);
    }
  });

  it("sin la variable: leer() calcula directo y nada se invalida", async () => {
    delete process.env.EVENTO_CERRADO;
    const r = await pe.leer("x", [1], async () => ({ a: 1 }));
    expect(r.datos).toEqual({ a: 1 });
    pe.invalidarLecturas();
    expect(llamadas).toEqual({ cache: 0, invalidar: 0 });
  });

  it("con la variable: leer() pasa por la caché y guarda JSON (igual que lo que recibe el navegador)", async () => {
    process.env.EVENTO_CERRADO = "1";
    const r = await pe.leer("x", [1], async () => ({ f: new Date("2026-11-21T12:00:00Z"), u: undefined }));
    expect(r.datos).toEqual({ f: "2026-11-21T12:00:00.000Z" });
    expect(llamadas.cache).toBe(1);
  });

  it("invalidaAlGuardar: misma respuesta; invalida solo si salió bien y solo en modo post-evento", async () => {
    process.env.EVENTO_CERRADO = "1";
    const ok = pe.invalidaAlGuardar(async (n: number) => Response.json({ n }));
    const mal = pe.invalidaAlGuardar(async () => Response.json({ error: "x" }, { status: 400 }));
    expect(await (await ok(7)).json()).toEqual({ n: 7 });
    expect((await mal()).status).toBe(400);
    expect(llamadas.invalidar).toBe(1);
    delete process.env.EVENTO_CERRADO;
    await ok(1);
    expect(llamadas.invalidar).toBe(1);
  });
});

describe("siempre: proxy, robots y noindex", () => {
  // La parte entre paréntesis del matcher, como la aplica Next sobre la ruta.
  const fuente = (config.matcher[0] as { source: string }).source;
  const re = new RegExp(`^${fuente.replace(/^\//, "\\/")}$`);
  it("el proxy corre en las páginas y no en _next, imágenes, robots.txt ni archivos de public/", () => {
    for (const p of ["/", "/login", "/evaluacion/seguimiento", "/monitor/proyectos/abc123", "/admin/tablero", "/cerrado"]) expect(re.test(p), p).toBe(true);
    for (const p of ["/api/evaluacion/seguimiento", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/robots.txt", "/logo-jc.png", "/logo-sofka.webp", "/logo-jc-redondo.webp", "/x.svg", "/manifest.webmanifest"]) expect(re.test(p), p).toBe(false);
  });

  it("robots.txt pide no recorrer nada y la cabecera X-Robots-Tag sigue en noindex", () => {
    expect(readFileSync("public/robots.txt", "utf8")).toMatch(/User-agent: \*\r?\nDisallow: \/\r?\n?$/);
    expect(readFileSync("next.config.ts", "utf8")).toMatch(/X-Robots-Tag", value: "noindex, nofollow"/);
  });
});

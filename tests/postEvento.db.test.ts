import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { cargarDemo, foto } from "./helpers/foto-base";

// Modo post-evento (EVENTO_CERRADO=1) con la DEMO en la base LOCAL de pruebas y la sesión real (cookie firmada).
// La caché de datos de Next se simula en memoria con la misma API (unstable_cache con tags y revalidateTag): así se
// comprueba qué se calcula, cuándo se reutiliza y cuándo se invalida. Sin la variable: todo como antes (sin caché).

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", calculos: 0, invalidaciones: 0, cache: new Map<string, { v: unknown; tags: string[] }>() };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, partes: string[], op: { tags: string[]; revalidate: number }) => async () => {
    expect(op.revalidate).toBeGreaterThanOrEqual(15 * 60);
    const k = JSON.stringify(partes);
    const hit = estado.cache.get(k);
    if (hit) return hit.v;
    estado.calculos++;
    const v = await fn();
    estado.cache.set(k, { v, tags: op.tags });
    return v;
  },
  revalidateTag: (tag: string, perfil: unknown) => {
    expect(perfil).toEqual({ expire: 0 }); // vencimiento inmediato: la siguiente lectura recalcula
    estado.invalidaciones++;
    for (const [k, e] of estado.cache) if (e.tags.includes(tag)) estado.cache.delete(k);
  },
}));

usarBaseLocal(5);
const db = await import("@/lib/db");
const { createToken } = await import("@/lib/auth");
const rSeg = await import("@/app/api/evaluacion/seguimiento/route");
const rRep = await import("@/app/api/evaluacion/seguimiento/reporte/route");
const rMon = await import("@/app/api/evaluacion/monitores/route");
const rMis = await import("@/app/api/monitor/mis-proyectos/route");
const rCiu = await import("@/app/api/monitor/mi-ciudad/route");
const rEval = await import("@/app/api/evaluacion/proyectos/route");
const rTab = await import("@/app/api/admin/tablero/route");
const rRes = await import("@/app/api/coordinacion/resumen/route");
const rCrit = await import("@/app/api/evaluacion/criterios/route");
const rAct = await import("@/app/api/actualizar/route");

const TODAS = [
  "proyectos", "asientos", "dias", "inscripciones", "franjasEditadas", "mentores", "salasConfig", "planSalas", "evalResultados", "evalBorradores",
  "evalConfig", "evalMonitor", "evalAnuladas", "cambiosSugeridos", "changeLog", "users", "ajustes", "comentarios", "citaciones", "monitorExcepciones", "sinProyecto",
] as const;
const ids: Record<string, string> = {};
const como = (q: "coord" | "admin" | "monitor" | "mentor") => { estado.token = createToken(ids[q]!, 0); };
const get = (q = "") => new Request(`http://localhost/x${q ? `?${q}` : ""}`);
const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", Host: "localhost", Origin: "http://localhost" } });
const leerSeg = async (q = "") => { const r = await rSeg.GET(get(q)); return { r, j: await r.json(), al: r.headers.get("x-datos-al") }; };
const env = process.env.EVENTO_CERRADO;

beforeAll(async () => {
  cargarDemo("2026-11-21");
  await db.closeDb();
  const c = await db.collections();
  for (const [k, rol] of [["coord", "coordinador"], ["admin", "admin"], ["monitor", "monitor"], ["mentor", "mentor"]] as const) {
    const u = await c.users.findOne({ rol, activo: { $ne: false } });
    ids[k] = u!._id.toHexString();
  }
}, 180_000);
afterAll(async () => { if (env === undefined) delete process.env.EVENTO_CERRADO; else process.env.EVENTO_CERRADO = env; await db.closeDb(); });
beforeEach(() => { estado.calculos = 0; estado.invalidaciones = 0; estado.cache.clear(); });

describe("sin EVENTO_CERRADO: todo igual que hoy", () => {
  beforeEach(() => { delete process.env.EVENTO_CERRADO; });

  it("cada lectura calcula, sin caché ni invalidaciones; guardar sigue igual", async () => {
    como("coord");
    const a = await leerSeg(), b = await leerSeg();
    expect(a.r.status).toBe(200);
    expect(b.j).toEqual(a.j);
    expect(estado.calculos).toBe(0); // nunca pasó por unstable_cache
    const r = await rCrit.POST(post(a.j.criterios));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, criterios: a.j.criterios });
    expect(await (await rAct.POST(post({}))).json()).toEqual({ ok: true });
    expect(estado.invalidaciones).toBe(0);
  });
});

describe("con EVENTO_CERRADO=1", () => {
  beforeEach(() => { process.env.EVENTO_CERRADO = "1"; });

  it("las lecturas pesadas se reutilizan (misma hora de datos) y responden igual que sin caché", async () => {
    como("coord");
    const a = await leerSeg(), b = await leerSeg();
    expect(estado.calculos).toBe(1);
    expect(b.al).toBe(a.al);
    expect(Number.isNaN(Date.parse(a.al!))).toBe(false);
    delete process.env.EVENTO_CERRADO;
    expect((await leerSeg()).j).toEqual(a.j); // mismo contenido que el cálculo directo
    process.env.EVENTO_CERRADO = "1";
    // Cada filtro y modo es su propia entrada.
    await leerSeg("modo=proy"); await leerSeg("modo=proy"); await leerSeg("ruta=B%C3%A1sica");
    expect(estado.calculos).toBe(3);
  });

  it("guardar (criterios) invalida: la siguiente lectura trae los datos nuevos", async () => {
    como("coord");
    const antes = await leerSeg();
    const nuevos = { exA: 0.5, exB: 2 };
    expect((await rCrit.POST(post(nuevos))).status).toBe(200);
    expect(estado.invalidaciones).toBe(1);
    const despues = await leerSeg();
    expect(estado.calculos).toBe(2);
    expect(despues.j.criterios).toEqual(nuevos);
    // Una escritura rechazada (400) no invalida.
    expect((await rCrit.POST(post({ exA: "x" }))).status).toBe(400);
    expect(estado.invalidaciones).toBe(1);
    await rCrit.POST(post(antes.j.criterios));
    expect((await leerSeg()).j.criterios).toEqual(antes.j.criterios);
  });

  it("«Actualizar» invalida y la siguiente lectura recalcula; pide sesión y mismo origen", async () => {
    como("coord");
    await leerSeg();
    estado.token = "";
    expect((await rAct.POST(post({}))).status).toBe(401);
    como("coord");
    expect((await rAct.POST(new Request("http://localhost/x", { method: "POST", body: "{}", headers: { Host: "localhost", Origin: "https://otro.example" } }))).status).toBe(403);
    expect((await rAct.POST(post({ x: 1 }))).status).toBe(400);
    expect(estado.invalidaciones).toBe(0);
    expect((await rAct.POST(post({}))).status).toBe(200);
    expect(estado.invalidaciones).toBe(1);
    await leerSeg();
    expect(estado.calculos).toBe(2);
  });

  it("los permisos se revisan antes de la caché: un monitor no recibe el seguimiento aunque esté guardado", async () => {
    como("coord");
    await leerSeg();
    como("monitor");
    expect((await rSeg.GET(get())).status).toBe(403);
    expect((await rRep.GET(get())).status).toBe(403);
  });

  it("monitores, mis proyectos, mi ciudad, evaluaciones, tablero y resumen: con caché y «Datos al», por usuario", async () => {
    const casos: [Parameters<typeof como>[0], () => Promise<Response>][] = [
      ["coord", () => rMon.GET(get())], ["coord", () => rRep.GET(get())], ["coord", () => rMis.GET(get())],
      ["monitor", () => rMis.GET(get("dia=todos"))], ["monitor", () => rCiu.GET(get())], ["mentor", () => rEval.GET(get())],
      ["coord", () => rEval.GET(get())], ["admin", () => rTab.GET(get())], ["coord", () => rRes.GET()],
    ];
    for (const [q, f] of casos) {
      como(q);
      const antes = estado.calculos;
      const a = await f(), b = await f();
      expect(a.status, q).toBe(200);
      expect(a.headers.get("x-datos-al")).toBe(b.headers.get("x-datos-al"));
      expect(await b.json()).toEqual(await a.json());
      expect(estado.calculos - antes).toBe(1);
    }
    // El mismo pedido de otro usuario no comparte entrada (el mentor ve solo los suyos).
    como("admin");
    const n = estado.calculos;
    await rEval.GET(get());
    expect(estado.calculos).toBe(n + 1);
  });

  it("como producción: recorrer todo con caché, refrescos y «Actualizar» deja la base idéntica", async () => {
    const c = await db.collections();
    const antes = await foto(c, TODAS);
    for (let i = 0; i < 2; i++) {
      como("coord");
      for (const q of ["", "modo=proy", "dia=2026-11-20", "ruta=Avanzada"]) await leerSeg(q);
      await rRep.GET(get()); await rMon.GET(get()); await rMis.GET(get()); await rEval.GET(get()); await rRes.GET();
      como("admin"); await rTab.GET(get());
      como("monitor"); await rMis.GET(get("dia=todos")); await rCiu.GET(get());
      como("mentor"); await rEval.GET(get());
      await rAct.POST(post({}));
    }
    expect(await foto(await db.collections(), TODAS)).toEqual(antes);
  }, 120_000);
});

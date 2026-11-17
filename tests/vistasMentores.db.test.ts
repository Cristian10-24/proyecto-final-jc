import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { cargarDemo, foto } from "./helpers/foto-base";

// Vistas del mentor · Paso 5 (cierre) con la demo en la base LOCAL de pruebas:
// - PARIDAD: cada evaluación guardada (pareja e individual, con retroalimentación y destacado) se ve completa en la
//   pantalla nueva y los valores mostrados coinciden con lo guardado (los datos del inventario, que son los mismos
//   que leía la pantalla anterior: GET /api/evaluacion/proyectos/[id]).
// - «COMO PRODUCCIÓN»: recorrer las listas y abrir todas las evaluaciones como mentor, coordinación y admin, sin
//   guardar, deja la base idéntica (huella antes y después).

usarBaseLocal(5);
const db = await import("@/lib/db");
const ev = await import("@/lib/evaluacion/datos");
const { calc, ITEMS_A, TEMAS_B } = await import("@/lib/evaluacion/criterios");
const { pct, uno } = await import("@/components/evaluacion/comun");
const EvaluarHoja = (await import("@/components/evaluacion/EvaluarHoja")).default;
const { GrupoWeb } = await import("@/components/evaluacion/MentorPanel");
const { agruparEval } = await import("@/lib/vistas/listaEvaluaciones");

type Usuario = Parameters<typeof ev.listaEvaluaciones>[0];
const usuarios: Record<string, Usuario> = {};
const TODAS = [
  "proyectos", "asientos", "dias", "inscripciones", "mentores", "salasConfig", "planSalas", "evalResultados", "evalBorradores",
  "evalConfig", "evalMonitor", "evalAnuladas", "cambiosSugeridos", "changeLog", "users", "ajustes", "comentarios", "citaciones",
] as const;

beforeAll(async () => {
  cargarDemo("2026-11-16");
  const c = await db.collections();
  for (const u of await c.users.find({ usuario: { $in: ["mentor.demo", "coordinacion.demo", "admin.demo"] } }).toArray())
    usuarios[u.usuario] = { id: String(u._id), usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.ciudades ?? [], ...(u.mentorId ? { mentorId: u.mentorId } : {}), ...(u.rolesExtra ? { rolesExtra: u.rolesExtra } : {}) };
}, 180_000);
afterAll(() => db.closeDb());

const ETIQUETA_A = { si: "Sí", parcial: "Parcial", no: "No" } as const;
const pulsado = (h: string, grupo: string) => {
  const i = h.indexOf(`aria-label="${grupo}"`);
  if (i < 0) return null;
  const tramo = h.slice(i, h.indexOf("</div>", i));
  return [...tramo.matchAll(/aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => m[1]).join("");
};

describe("paridad: lo guardado se ve completo y con los mismos valores", () => {
  it("cada proyecto con evaluación guardada (pareja e individual): A, B por integrante, cierre, destacado, asistencia, resultado y notas del monitor", async () => {
    const c = await db.collections();
    const evals = await c.evalResultados.find({}).toArray();
    const ids = [...new Set(evals.map((e) => String(e.proyectoId)))];
    expect(ids.length).toBeGreaterThanOrEqual(2);
    let pareja = 0, individual = 0, conCierre = 0, conDestacado = 0;
    for (const id of ids) {
      for (const quien of ["mentor.demo", "coordinacion.demo"]) {
        const d = await ev.detalleEvaluacion(usuarios[quien]!, id);
        if ("error" in d) { expect(quien).toBe("mentor.demo"); continue; } // otro mentor: el mentor demo no lo abre (como hoy)
        const p = (await c.proyectos.findOne({ _id: evals.find((e) => String(e.proyectoId) === id)!.proyectoId }))!;
        const propios = p.integrantes.map((x) => evals.find((e) => e._id === ev.idEval(p._id, x.documento)));
        const h = renderToStaticMarkup(createElement(EvaluarHoja, { id, usuario: quien, onCerrar: () => {}, inicial: d }));
        if (p.integrantes.length > 1) pareja++; else individual++;
        const conA = propios.find((e) => e && Object.keys(e.a).length);
        for (const [k, t] of ITEMS_A) expect(pulsado(h, t), `${id} ${k}`).toBe(conA?.a[k] ? ETIQUETA_A[conA.a[k]!] : "");
        p.integrantes.forEach((x, i) => {
          const e = propios[i];
          if (e?.noPresento) {
            expect(pulsado(h, `¿${x.nombre} se presentó?`)).toBe("No");
            expect(h).toContain(`${x.nombre} está marcado como «No se presentó».`);
          } else {
            expect(pulsado(h, `¿${x.nombre} se presentó?`)).toBe("Sí");
            for (const [k, t] of TEMAS_B) expect(pulsado(h, p.integrantes.length > 1 ? `${t} · ${x.nombre}` : t), `${id} ${x.nombre} ${k}`).toBe(typeof e?.b[k] === "number" ? String(e.b[k]) : "");
          }
          const r = calc(e, d.criterios);
          expect(h).toContain(`>${r.res}<`);
          if (r.a !== null) expect(h).toContain(`<b>${pct(r.a)}</b>`);
          if (r.nb) expect(h).toContain(`<b>${uno(r.b)} (${r.nb} temas)</b>`);
        });
        const cierre = propios.find((e) => e && (e.fortaleza || e.mejora || e.percepcion));
        if (cierre) {
          conCierre++;
          const textos = [...h.matchAll(/<textarea[^>]*>([^<]*)<\/textarea>/g)].map((m) => m[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
          expect(textos).toEqual([cierre.fortaleza, cierre.mejora, cierre.percepcion]);
        }
        const destacado = propios.some((e) => e?.destacado);
        if (destacado) conDestacado++;
        expect(/type="checkbox"[^>]*checked=""/.test(h)).toBe(destacado);
        for (const n of await c.evalMonitor.find({ proyectoId: p._id }).toArray()) {
          if (n.motivo) expect(h).toContain(`Motivo de inasistencia: ${n.motivo}`);
          if (n.observacion) expect(h).toContain(n.observacion.replace(/&/g, "&amp;"));
        }
        if (d.guardadoEn) expect(h).toContain("Guardada el ");
      }
    }
    expect(pareja).toBeGreaterThan(0);
    expect(individual).toBeGreaterThan(0);
    expect(conCierre).toBeGreaterThan(0);
    expect(conDestacado).toBeGreaterThan(0);
  });

  it("la lista muestra el mismo resultado por integrante que calc() sobre lo guardado, destacado incluido", async () => {
    const c = await db.collections();
    const evals = new Map((await c.evalResultados.find({}).toArray()).map((e) => [e._id, e]));
    const filas = await ev.listaEvaluaciones(usuarios["coordinacion.demo"]!);
    const crit = await ev.criterios();
    const nombreMentor = new Map((await ev.mentoresConProyectos()).map((m) => [m.id, m.nombre]));
    const html = agruparEval(filas).flatMap((d) => d.bloques).map((b) => renderToStaticMarkup(createElement(GrupoWeb, { b, verTodos: true, nombreMentor, soloLectura: () => true, onAbrir: () => {} }))).join("");
    let revisadas = 0;
    for (const f of filas) {
      const p = (await c.proyectos.findOne({ codigo: f.codigo }))!;
      p.integrantes.forEach((x, i) => {
        const r = calc(evals.get(ev.idEval(p._id, x.documento)), crit).res;
        expect(f.integrantes[i]!.res).toBe(r);
        expect(html).toContain(`${f.pareja ? `${x.nombre.split(" ")[0]}: ` : ""}${r}<`);
        if (r !== "Pendiente") revisadas++;
      });
      if (f.destacado) expect(html).toContain("★ Destacado");
    }
    expect(revisadas).toBeGreaterThan(0);
  });
});

describe("como producción: recorrer todas las vistas sin guardar no cambia la base", () => {
  it("listas y fichas como mentor, coordinación y admin (también el refresco): huella idéntica", async () => {
    const c = await db.collections();
    const antes = await foto(c, TODAS);
    for (const u of Object.values(usuarios)) {
      for (let vuelta = 0; vuelta < 2; vuelta++) { // la segunda vuelta = el refresco de cada minuto
        const filas = await ev.listaEvaluaciones(u);
        for (const f of filas) {
          const d = await ev.detalleEvaluacion(u, f.id);
          if (!("error" in d)) renderToStaticMarkup(createElement(EvaluarHoja, { id: f.id, usuario: u.usuario, onCerrar: () => {}, inicial: d }));
        }
        await ev.criterios();
        await ev.mentoresConProyectos();
      }
    }
    expect(await foto(c, TODAS)).toEqual(antes);
  });
});

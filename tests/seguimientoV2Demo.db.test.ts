import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";
import { cargarDemo, foto } from "./helpers/foto-base";

// Seguimiento v2 · «COMO PRODUCCIÓN» con la demo en la base LOCAL de pruebas:
// - Recorrer todas las sub-secciones (todas las combinaciones de filtros y «Contar por», el reporte de cada día y el
//   acumulado, el Excel) con varios refrescos, SIN guardar criterios, deja la base idéntica (huella antes y después).
// - «Guardar criterios» guarda igual que hoy y la vista previa anuncia exactamente lo que queda después de guardar.

usarBaseLocal(5);
const db = await import("@/lib/db");
const { seguimiento, seguimientoV2, reporteDia, excelResultados, guardarCriterios, filasEstudiantes } = await import("@/lib/evaluacion/resultados");
const { excelentesCon } = await import("@/lib/evaluacion/seguimientoV2");

const TODAS = [
  "proyectos", "asientos", "dias", "inscripciones", "franjasEditadas", "mentores", "salasConfig", "planSalas", "evalResultados", "evalBorradores",
  "evalConfig", "evalMonitor", "evalAnuladas", "cambiosSugeridos", "changeLog", "users", "ajustes", "comentarios", "citaciones", "monitorExcepciones", "sinProyecto",
] as const;
const AHORAS = [new Date("2026-11-20T13:00:00Z"), new Date("2026-11-20T16:40:00Z"), new Date("2026-11-20T21:59:00Z")];

beforeAll(async () => { cargarDemo("2026-11-20"); await db.closeDb(); }, 180_000);
afterAll(() => db.closeDb());

async function recorrer() {
  const c = await db.collections();
  const dias: string[] = (await c.asientos.distinct("dia", { proyectoId: { $type: "objectId" } })).sort();
  const ciudades: string[] = (await c.proyectos.distinct("ciudad")).sort();
  const filas = await filasEstudiantes();
  const q = filas.find((f) => f.dia)?.nombre.split(" ")[0] ?? "a";
  const filtros = [{}, { dia: dias[0] }, { dia: dias.at(-1) }, { ciudad: ciudades[0] }, { ruta: "Básica" }, { ruta: "Avanzada" }, { modalidad: "pareja" as const }, { modalidad: "individual" as const }, { q }, { dia: dias.at(-1), ciudad: ciudades.at(-1), ruta: "Básica", q }];
  const out: unknown[] = [];
  for (const ahora of AHORAS)
    for (const f of filtros) for (const modo of ["est", "proy"] as const) out.push(await seguimientoV2(f, ahora, modo));
  for (const d of [...dias, null]) out.push(await reporteDia(d));
  out.push(await seguimiento(), (await excelResultados()).length > 0, (await excelResultados({ dia: dias[0], ciudad: ciudades[0] })).length > 0);
  return out;
}

describe("como producción", () => {
  it("recorrer todas las sub-secciones con refresco, sin guardar criterios, deja la base idéntica", async () => {
    const c = await db.collections();
    const antes = await foto(c, TODAS);
    const r1 = await recorrer();
    const r2 = await recorrer(); // el refresco de cada minuto: mismas respuestas
    expect(JSON.stringify(r2)).toBe(JSON.stringify(r1));
    expect(await foto(await db.collections(), TODAS)).toEqual(antes);
  }, 120_000);

  it("Guardar criterios guarda igual que hoy y la vista previa acierta", async () => {
    const ahora = AHORAS[1];
    const antes = await seguimientoV2({}, ahora);
    const previa = excelentesCon(antes.paresAB, 0.5, 2);
    await guardarCriterios({ exA: 0.5, exB: 2 }, { rol: "coordinador", usuario: "coordinacion.demo" });
    const despues = await seguimientoV2({}, ahora);
    expect(despues.criterios).toEqual({ exA: 0.5, exB: 2 });
    expect(despues.est.c.exc).toBe(previa);
    const c = await db.collections();
    expect(await c.changeLog.findOne({ accion: "criterios" }, { sort: { fecha: -1 } })).toMatchObject({ nuevo: "A ≥ 50 % · B ≥ 2" });
    await guardarCriterios(antes.criterios, { rol: "coordinador", usuario: "coordinacion.demo" });
    expect((await seguimientoV2({}, ahora)).est.c).toEqual(antes.est.c);
  });
});

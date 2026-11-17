import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EvaluarHoja, { baseDe } from "@/components/evaluacion/EvaluarHoja";
import { pct, uno } from "@/components/evaluacion/comun";
import { calc, CRITERIOS_DEFECTO, type PartesA } from "@/lib/evaluacion/criterios";
import type { DetalleEvaluacion } from "@/lib/evaluacion/datos";

// Vistas del mentor · Paso 3: pantalla de evaluar con el diseño nuevo (render sin navegador). Lo guardado se ve
// completo, calc() da lo mismo que se muestra, pareja e individual, Uruguay y solo lectura. Datos INVENTADOS.

const A: PartesA = { a1: "si", a2: "si", a3: "parcial", a4: "si", a5: "no", a6: "si", a7: "si" };
const PAREJA: DetalleEvaluacion = {
  id: "6a0000000000000000000001", codigo: "P-1", proyecto: "Bici Express", descripcion: "Mensajería en bicicleta para el barrio.",
  ciudad: "Cali", ruta: "Básica", dia: "2026-11-12", inicio: "2026-11-13T00:45:00.000Z", mentorId: "m1", editable: true, sala: 2,
  enlace: "https://meet.google.com/qwe-rtyu-iop", monitorBloque: { nombre: "Valeria Ocampo", celular: "3104456789" },
  integrantes: [
    { i: 0, nombre: "Laura Marcela Ríos", res: "Aprobado", a: null, b: null, nb: 0, documento: "•••• 4471", noPresento: false },
    { i: 1, nombre: "Juan Esteban Cruz", res: "No se presentó", a: null, b: null, nb: 0, documento: "•••• 2290", noPresento: true, motivo: "Salud", monitor: { motivo: "Salud", observacion: "Avisó por WhatsApp." } },
  ],
  guardado: { a: A, b: [{ b1: 4, b3: 3, b5: 4 }, {}], destacado: true, fortaleza: "FORTALEZA-GUARDADA", mejora: "MEJORA-GUARDADA", percepcion: "PERCEPCION-GUARDADA" },
  borrador: null, borradorEn: null, guardadoEn: "2026-11-13T00:58:00.000Z", criterios: CRITERIOS_DEFECTO,
};
const URUGUAY: DetalleEvaluacion = {
  ...PAREJA, id: "6a0000000000000000000002", codigo: "P-2", proyecto: "Etiquetas Eco", ciudad: "Paysandú", ruta: "Avanzada", dia: "2026-11-17",
  inicio: "2026-11-18T00:00:00.000Z", sala: undefined, enlace: undefined, monitorBloque: null,
  integrantes: [{ i: 0, nombre: "Martina Rodríguez Silva", res: "Pendiente", a: null, b: null, nb: 0, documento: "•••• 0415", noPresento: false }],
  guardado: { a: {}, b: [{}], destacado: false, fortaleza: "", mejora: "", percepcion: "" }, guardadoEn: null,
};
const html = (d: DetalleEvaluacion) => renderToStaticMarkup(createElement(EvaluarHoja, { id: d.id, usuario: "mentor.uno", onCerrar: () => {}, inicial: d }));
const pulsados = (h: string) => [...h.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
const grupos = (h: string) => [...h.matchAll(/role="group" aria-label="([^"]*)"[^>]*>(.*?)<\/div>/g)].map((m): [string, string] => [m[1]!, pulsados(m[2]!).join("")]);

describe("evaluación guardada en pareja: se ve todo lo guardado", () => {
  const h = html(PAREJA);
  it("Parte A: las 7 respuestas marcadas", () => {
    const g = new Map(grupos(h));
    expect([g.get("App publicada"), g.get("Contacto real"), g.get("Asistente de clientes"), g.get("GitHub")]).toEqual(["Sí", "Parcial", "No", "Sí"]);
  });
  it("Parte B por integrante; el ausente sin selector («No se presentó»)", () => {
    const g = new Map(grupos(h));
    expect(g.get("Componentes y props · Laura Marcela Ríos")).toBe("4");
    expect(g.get("Backend con Express · Laura Marcela Ríos")).toBe("3");
    expect(g.get("Estado y datos (hooks) · Laura Marcela Ríos")).toBe("");
    expect(g.has("Componentes y props · Juan Esteban Cruz")).toBe(false);
  });
  it("cierre, destacado, asistencia, motivo y observación del monitor, momento en que se guardó", () => {
    for (const t of ["FORTALEZA-GUARDADA", "MEJORA-GUARDADA", "PERCEPCION-GUARDADA", "Motivo de inasistencia: Salud", "Avisó por WhatsApp.", "Guardada el jueves 12 de noviembre a las 7:58 p. m.", "Juan Esteban Cruz está marcado como «No se presentó».", "Deshacer"]) expect(h).toContain(t);
    expect(h).toMatch(/type="checkbox"[^>]*checked=""/);
    const g = new Map(grupos(h));
    expect(g.get("¿Laura Marcela Ríos se presentó?")).toBe("Sí");
    expect(g.get("¿Juan Esteban Cruz se presentó?")).toBe("No");
  });
  it("resultado por integrante = calc() de lo mismo (Funciona en %, Nivel con n temas)", () => {
    const c = calc({ a: A, b: { b1: 4, b3: 3, b5: 4 } }, CRITERIOS_DEFECTO);
    expect(c.res).toBe("Aprobado"); // A = 79 % < 90 %
    expect(h).toContain("Resultado de Laura");
    expect(h).toContain(`>${c.res}<`);
    expect(h).toContain(`<b>${pct(c.a)}</b>`);
    expect(h).toContain(`<b>${uno(c.b)} (${c.nb} temas)</b>`);
    expect(h).toContain("Resultado de Juan");
    expect(h).not.toContain("Faltan ");
  });
  it("proyecto, monitor a cargo con Llamar/WhatsApp, enlace y Abrir sala; documentos enmascarados", () => {
    for (const t of ["Bici Express", "Mensajería en bicicleta para el barrio.", "Sala 2", "Ruta básica", "7:45 p. m. (COL) · 15 minutos", "Laura Marcela Ríos <span", "· Doc. •••• 4471", "Monitor a cargo", "Valeria Ocampo", 'href="tel:+573104456789"', 'href="https://wa.me/573104456789"', "Escríbele si el estudiante no entra a la sala o hay problemas de conexión.", "meet.google.com/qwe-rtyu-iop", "Abrir sala"]) expect(h).toContain(t);
  });
  it("cronómetro del mentor: «Listo para empezar», 15:00 e Iniciar; guardar de la pareja", () => {
    for (const t of ["Listo para empezar", "Inicia cuando el estudiante empiece", "15:00", ">Iniciar<", "Guardar evaluación de la pareja", 'aria-label="Guardar evaluación"']) expect(h).toContain(t);
    expect(h).not.toContain("Cambios sin guardar"); // al abrir no hay cambios
  });
});

describe("individual de Uruguay, otro día, sin monitor", () => {
  const h = html({ ...URUGUAY, dia: "2026-11-17" });
  it("aviso amarillo con hora COL · UY", () => {
    expect(h).toContain("Este estudiante está programado para el martes 17 de noviembre a las 7:00 p. m. COL · 9:00 p. m. UY, no para hoy. Verifica que sea la persona correcta antes de calificar.");
  });
  it("Paysandú · Uruguay, ruta avanzada, sin monitor, sala por asignar", () => {
    for (const t of ["Paysandú · Uruguay", "Ruta avanzada", "Sin monitor", "Por asignar", "9:00 p. m. UY"]) expect(h).toContain(t);
    expect(h).not.toContain("Abrir sala");
  });
  it("pendiente: faltan los 7 de A y mínimo 2 temas de B; barra inferior resumida", () => {
    expect(h).toContain(">Pendiente<");
    expect(h).toContain("Faltan 7 de 7 criterios de la Parte A.");
    expect(h).toContain("Califica mínimo 2 temas de la Parte B.");
    expect(h).toContain("A — · B —");
    expect(h).toContain(" · faltan 7 de A");
  });
});

describe("solo lectura (coordinación y admin)", () => {
  const h = html({ ...PAREJA, editable: false });
  it("aviso, controles deshabilitados, sin cronómetro ni guardar, y con todo lo guardado", () => {
    expect(h).toContain("Solo lectura: la evaluación la hace el mentor del proyecto.");
    expect(h).not.toContain("Listo para empezar");
    expect(h).not.toContain("Guardar evaluación");
    expect(h).not.toContain("Puedes corregirla");
    expect(h).toMatch(/<textarea[^>]*disabled=""/);
    for (const t of ["FORTALEZA-GUARDADA", "Guardada el jueves 12 de noviembre"]) expect(h).toContain(t);
  });
});

describe("baseDe", () => {
  it("una Parte B por integrante, aunque lo guardado traiga menos", () => {
    expect(baseDe({ ...PAREJA, guardado: { ...PAREJA.guardado, b: [{ b1: 2 }] } }).b).toEqual([{ b1: 2 }, {}]);
  });
});

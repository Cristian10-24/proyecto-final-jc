import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import EvaluarHoja from "@/components/evaluacion/EvaluarHoja";
import { abrirAyuda, ayudaAbierta, AyudaCriterio, cerrarAyuda } from "@/components/evaluacion/vistas/Ayuda";
import { AVISO_RUTA, AYUDAS, MAX_AYUDA, NOTA_B_BASICA } from "@/lib/evaluacion/ayudas";
import { CRITERIOS_DEFECTO, ITEMS_A, TEMAS_B } from "@/lib/evaluacion/criterios";
import type { DetalleEvaluacion } from "@/lib/evaluacion/datos";

// Vistas del mentor · Paso 4: ayudas «?» por criterio. Textos en un solo archivo (src/lib/evaluacion/ayudas.ts),
// componente que abre y cierra con la ruta del proyecto, y abrirlo no toca respuestas, cronómetro ni borrador.

afterEach(() => cerrarAyuda());
const ayuda = (props: Parameters<typeof AyudaCriterio>[0]) => renderToStaticMarkup(createElement(AyudaCriterio, props));

describe("textos (ayudas.ts)", () => {
  const claves = [...ITEMS_A.map(([k]) => k), ...TEMAS_B.map(([k]) => k)];
  it("una entrada por cada criterio de la Parte A y cada tema de la Parte B, y nada más", () => {
    expect(Object.keys(AYUDAS).sort()).toEqual([...claves].sort());
  });
  it("ningún texto vacío y cada uno de máximo 220 caracteres", () => {
    for (const k of claves) for (const campo of ["principal", "basica", "avanzada"] as const) {
      const t = AYUDAS[k][campo];
      expect(t.trim().length, `${k}.${campo}`).toBeGreaterThan(0);
      expect(t.length, `${k}.${campo}`).toBeLessThanOrEqual(MAX_AYUDA);
    }
  });
  it("avisos de la ruta y nota de la Parte B", () => {
    expect(AVISO_RUTA.Básica).toBe("En la ruta básica es normal que el proyecto sea más simple y que no use React ni servidor. Evalúa lo que sí hizo.");
    expect(AVISO_RUTA.Avanzada).toBe("En la ruta avanzada es más esperable que use React, un servidor y una base de datos.");
    expect(NOTA_B_BASICA).toBe("Califica mínimo 2 temas; deja sin marcar los que no apliquen.");
  });
});

describe("componente AyudaCriterio", () => {
  it("cerrada: botón «?» con aria-label, aria-expanded=false y sin contenido", () => {
    const h = ayuda({ clave: "a1", titulo: "App publicada", ruta: "Básica" });
    expect(h).toContain('aria-label="Qué se evalúa en «App publicada»"');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('type="button"');
    expect(h).not.toContain("Qué se evalúa principalmente");
  });
  it("abierta en ruta básica: principal y bloque de la ruta; la otra solo con «Ver la otra ruta»", () => {
    abrirAyuda("a3");
    const h = ayuda({ clave: "a3", titulo: "Contacto real", ruta: "Básica" });
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('role="dialog"');
    for (const t of ["Contacto real", "Qué se evalúa principalmente", AYUDAS.a3.principal, "Para este proyecto · Ruta básica", AYUDAS.a3.basica, "Ver la otra ruta", 'aria-label="Cerrar ayuda"']) expect(h).toContain(t);
    expect(h).not.toContain(AYUDAS.a3.avanzada);
  });
  it("abierta en ruta avanzada: el bloque de la avanzada", () => {
    abrirAyuda("b4");
    const h = ayuda({ clave: "b4", titulo: "Base de datos con Mongoose", ruta: "Avanzada" });
    expect(h).toContain("Para este proyecto · Ruta avanzada");
    expect(h).toContain(AYUDAS.b4.avanzada);
    expect(h).not.toContain(AYUDAS.b4.basica);
  });
  it("proyecto sin ruta: muestra las dos", () => {
    abrirAyuda("b1");
    const h = ayuda({ clave: "b1", titulo: "Componentes y props" });
    expect(h).toContain(AYUDAS.b1.basica);
    expect(h).toContain(AYUDAS.b1.avanzada);
    expect(h).not.toContain("Ver la otra ruta");
  });
  it("una sola abierta a la vez; cerrar la cierra", () => {
    abrirAyuda("a1");
    abrirAyuda("a2");
    expect(ayudaAbierta()).toBe("a2");
    expect(ayuda({ clave: "a1", titulo: "App publicada", ruta: "Básica" })).toContain('aria-expanded="false"');
    cerrarAyuda("a1"); // no es la abierta: no hace nada
    expect(ayudaAbierta()).toBe("a2");
    cerrarAyuda();
    expect(ayudaAbierta()).toBeNull();
  });
});

describe("abrir la ayuda no toca nada de la evaluación", () => {
  const D: DetalleEvaluacion = {
    id: "6a0000000000000000000009", codigo: "P-9", proyecto: "Huerta", ciudad: "Cali", ruta: "Básica", dia: "2026-11-12",
    inicio: "2026-11-12T13:00:00.000Z", mentorId: "m1", editable: true, sala: 1, monitorBloque: null,
    integrantes: [{ i: 0, nombre: "Ana Prueba", res: "Incompleto", a: null, b: null, nb: 0, documento: "•••• 1234", noPresento: false }],
    guardado: { a: { a1: "si", a2: "parcial" }, b: [{ b1: 3 }], destacado: false, fortaleza: "F", mejora: "M", percepcion: "" },
    borrador: null, borradorEn: null, guardadoEn: null, criterios: CRITERIOS_DEFECTO,
  };
  /** Lo que la ayuda NO puede cambiar: respuestas marcadas, textos del cierre, cronómetro y columna de resultado. */
  const estado = (h: string) => ({
    pulsados: [...h.matchAll(/aria-label="([^"]*)"[^>]*>(?:(?!<\/div>).)*?aria-pressed="true"[^>]*>([^<]*)</g)].map((m) => `${m[1]}=${m[2]}`),
    textos: [...h.matchAll(/<textarea[^>]*>([^<]*)<\/textarea>/g)].map((m) => m[1]),
    reloj: h.match(/role="timer"[^>]*>(.*?)<\/div><button[^>]*>([^<]*)</)?.slice(1),
    lado: h.match(/<aside.*?<\/aside>/)?.[0],
  });
  const pantalla = () => renderToStaticMarkup(createElement(EvaluarHoja, { id: D.id, usuario: "mentor.uno", onCerrar: () => {}, inicial: D }));

  it("misma pantalla (respuestas, cronómetro, sin «cambios sin guardar») con la ayuda abierta o cerrada; ni fetch ni almacenamiento", () => {
    const almacen = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn(), key: vi.fn(), length: 0, clear: vi.fn() };
    const fetchEspia = vi.fn();
    vi.stubGlobal("localStorage", almacen);
    vi.stubGlobal("fetch", fetchEspia);
    try {
      const cerrada = pantalla();
      almacen.getItem.mockClear();
      abrirAyuda("a1");
      const abierta = pantalla();
      expect(abierta).toContain("Para este proyecto · Ruta básica");
      expect(abierta).toContain(AYUDAS.a1.basica);
      expect(estado(abierta)).toEqual(estado(cerrada));
      expect(estado(cerrada).pulsados.length).toBeGreaterThan(2);
      expect(estado(cerrada).textos).toEqual(["F", "M", ""]);
      for (const h of [cerrada, abierta]) {
        expect(h).not.toContain("Cambios sin guardar");
        expect(h).toContain("Listo para empezar");
        expect(h).toContain("15:00");
      }
      expect(almacen.setItem).not.toHaveBeenCalled();
      expect(almacen.removeItem).not.toHaveBeenCalled();
      expect(fetchEspia).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("en la pantalla: un «?» por cada criterio (7) y tema (5), aviso de la ruta y nota de la Parte B básica", () => {
    const h = pantalla();
    expect(h.match(/aria-label="Qué se evalúa en «/g)).toHaveLength(12);
    expect(h).toContain(AVISO_RUTA.Básica);
    expect(h).toContain(NOTA_B_BASICA);
    const avanzada = renderToStaticMarkup(createElement(EvaluarHoja, { id: D.id, usuario: "mentor.uno", onCerrar: () => {}, inicial: { ...D, ruta: "Avanzada" } }));
    expect(avanzada).toContain(AVISO_RUTA.Avanzada);
    expect(avanzada).not.toContain(NOTA_B_BASICA);
  });
});

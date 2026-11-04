import { describe, expect, it } from "vitest";
import { CLAVE_TEMA, SCRIPT_TEMA } from "@/lib/tema";

// Script del <head> del modo oscuro (Paso 18): elección guardada > sistema; sigue al sistema si no hay elección.

function correr(guardado: string | null, sistemaOscuro: boolean, sinAlmacenamiento = false, sinEscucha = false) {
  const html = { dataset: {} as Record<string, string> };
  let alCambiar: (() => void) | null = null;
  const media: { matches: boolean; addEventListener?: (e: string, f: () => void) => void } = { matches: sistemaOscuro };
  if (!sinEscucha) media.addEventListener = (_: string, f: () => void) => { alCambiar = f; };
  const localStorage = { getItem: (k: string) => { if (sinAlmacenamiento) throw new Error("bloqueado"); return k === CLAVE_TEMA ? guardado : null; } };
  new Function("document", "window", "localStorage", SCRIPT_TEMA)({ documentElement: html }, { matchMedia: () => media }, localStorage);
  return {
    tema: () => html.dataset.theme,
    sistema: (oscuro: boolean) => { media.matches = oscuro; alCambiar?.(); },
    elegir: (t: string) => { guardado = t; html.dataset.theme = t; }, // lo que hace el botón (elegirTema)
  };
}

describe("script de tema", () => {
  it("sin elección sigue al sistema, también cuando este cambia", () => {
    const t = correr(null, true);
    expect(t.tema()).toBe("dark");
    t.sistema(false);
    expect(t.tema()).toBe("light");
  });
  it("la elección guardada manda sobre el sistema", () => {
    const t = correr("light", true);
    expect(t.tema()).toBe("light");
    t.sistema(true);
    expect(t.tema()).toBe("light");
    expect(correr("dark", false).tema()).toBe("dark");
  });
  it("si la persona elige con el botón y luego cambia el sistema, se mantiene lo elegido", () => {
    const t = correr(null, false);
    t.elegir("dark");
    t.sistema(false);
    expect(t.tema()).toBe("dark");
  });
  it("un navegador sin escucha de cambios igual aplica el tema", () => {
    expect(correr(null, true, false, true).tema()).toBe("dark");
  });
  it("un valor raro o el almacenamiento bloqueado no rompen: usa el sistema", () => {
    expect(correr("<script>", true).tema()).toBe("dark");
    expect(correr(null, false, true).tema()).toBe("light");
  });
});

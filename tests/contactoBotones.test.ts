import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BotonesLlamar, Telefono } from "@/components/evaluacion/vistas/Basicos";
import { mensajeRecordatorio } from "@/lib/contacto/mensajes";

// El único componente de Llamar/WhatsApp: enlaces normalizados, pestaña nueva segura y nunca un enlace mal formado.

const html = (props: Parameters<typeof BotonesLlamar>[0]) => renderToStaticMarkup(createElement(BotonesLlamar, props));
const hrefs = (h: string) => [...h.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));

describe("BotonesLlamar", () => {
  it("participante de Guayaquil sin indicativo: +593 y mensaje prellenado", () => {
    const mensaje = mensajeRecordatorio({ nombre: "Begoña Núñez", proyecto: "Huerta", inicio: "2026-11-17T21:00:00Z", ciudad: "Guayaquil" })!;
    const h = html({ celular: "963976623", nombre: "Begoña Núñez", ciudad: "Guayaquil", mensaje });
    const [tel, wa] = hrefs(h);
    expect(tel).toBe("tel:+593963976623");
    expect(wa).toBe(`https://wa.me/593963976623?text=${encodeURIComponent(mensaje)}`);
    expect(h).toContain('target="_blank"');
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).toContain('aria-label="Llamar a Begoña Núñez"');
    expect(h).toContain('aria-label="Escribir por WhatsApp a Begoña Núñez"');
    expect(h).not.toContain("disabled");
  });

  it("mentor o monitor: sin texto prellenado", () => {
    const [tel, wa] = hrefs(html({ celular: "3005550001", nombre: "Mentora" }));
    expect(tel).toBe("tel:+573005550001");
    expect(wa).toBe("https://wa.me/573005550001");
  });

  it("número que no se reconoce: botones deshabilitados y ningún enlace", () => {
    for (const [celular, ciudad] of [["+598167992", "Colonia"], ["963976623", "Cali"], ["963976623", undefined]] as const) {
      const h = html({ celular, nombre: "Ana", ciudad, mensaje: "Hola" });
      expect(h).not.toContain("href");
      expect(h.match(/disabled=""/g)).toHaveLength(2);
      expect(h).toContain("Revisar número");
    }
  });

  it("sin celular: nada", () => {
    expect(html({ celular: "  ", nombre: "Ana" })).toBe("");
    expect(html({ celular: null, nombre: "Ana" })).toBe("");
  });

  it("el nombre no rompe los atributos", () => {
    const h = html({ celular: "3001234567", nombre: `Ana "<b>x</b>"` });
    expect(h).not.toContain("<b>");
    expect(h).toContain("&quot;");
  });
});

describe("Telefono", () => {
  const t = (celular: string | null, ciudad?: string) => renderToStaticMarkup(createElement(Telefono, { celular, ciudad }));
  it("formato internacional por país", () => {
    expect(t("963976623", "Guayaquil")).toContain("+593 96 397 6623");
    expect(t("61234567", "Panamá")).toContain("+507 6123 4567");
    expect(t("099214367", "Paysandú")).toContain("+598 99 214 367");
    expect(t("+573001234567")).toContain("+57 300 123 4567");
  });
  it("no reconocido: tal cual con «Revisar número»; vacío: «Sin registrar»", () => {
    expect(t("+598167992", "Colonia")).toContain("+598167992");
    expect(t("+598167992", "Colonia")).toContain("Revisar número");
    expect(t("", "Colonia")).toContain("Sin registrar");
    expect(t(null)).toContain("Sin registrar");
  });
});

import { describe, expect, it } from "vitest";
import { enlaceWhatsApp, normalizarCelular, paisDeCiudad } from "@/lib/contacto/celular";
import { esNombreMarcador, fechaRecordatorio, mensajeRecordatorio } from "@/lib/contacto/mensajes";

// Mensaje prellenado de WhatsApp para participantes. 2026-11-17 21:00 UTC = martes 17, 4:00 p. m. Colombia, 6:00 p. m. Uruguay.

const INICIO = "2026-11-17T21:00:00.000Z";

describe("mensajeRecordatorio", () => {
  it("individual, Colombia", () => {
    expect(mensajeRecordatorio({ nombre: "Laura Gómez Ruiz", proyecto: "Huerta inteligente", inicio: INICIO, ciudad: "Cali" })).toBe(
      "Hola Laura, te escribimos desde Jóvenes creaTIvos. Te recordamos tu presentación del proyecto final «Huerta inteligente» " +
      "el martes 17 de noviembre a las 4:00 p. m. (hora de Colombia). ¿Nos confirmas que podrás conectarte? ¡Mucho éxito!");
  });

  it("en pareja: cada integrante recibe su propio primer nombre", () => {
    const base = { proyecto: "App de reciclaje", inicio: INICIO, ciudad: "Quito" };
    expect(mensajeRecordatorio({ ...base, nombre: "Ana María Pérez" })).toMatch(/^Hola Ana, /);
    expect(mensajeRecordatorio({ ...base, nombre: "  Iñaki   Muñoz " })).toMatch(/^Hola Iñaki, /);
  });

  it("Uruguay agrega la hora local", () => {
    for (const ciudad of ["Colonia", "Paysandú"])
      expect(mensajeRecordatorio({ nombre: "Sofía Rodríguez", proyecto: "Robot", inicio: INICIO, ciudad }))
        .toContain("el martes 17 de noviembre a las 4:00 p. m. hora de Colombia (6:00 p. m. hora de Uruguay). ¿Nos");
  });

  it("Ecuador y Panamá: solo la hora de Colombia", () => {
    for (const ciudad of ["Guayaquil", "Panamá"]) {
      const t = mensajeRecordatorio({ nombre: "Carlos Vera", proyecto: "Robot", inicio: INICIO, ciudad });
      expect(t).toContain("a las 4:00 p. m. (hora de Colombia).");
      expect(t).not.toContain("Uruguay");
    }
  });

  it("proyecto marcador u omitido: sin «…»", () => {
    for (const proyecto of ["No tengo", "Aún no tengo definido el nombre…", "aun no", "Sin nombre", "N/A", "", null, "Por definir."]) {
      const t = mensajeRecordatorio({ nombre: "Laura", proyecto, inicio: INICIO, ciudad: "Cali" });
      expect(t).toContain("del proyecto final el martes 17 de noviembre");
      expect(t).not.toContain("«");
    }
  });

  it("sin datos personales: ni documento ni correo, aunque vengan en el nombre del proyecto no se agregan", () => {
    const t = mensajeRecordatorio({ nombre: "Laura Gómez", proyecto: "Huerta", inicio: INICIO, ciudad: "Cali" });
    expect(t).not.toMatch(/@|\d{6,}/);
  });

  it("tildes y ñ bien codificadas y enlace válido", () => {
    const texto = mensajeRecordatorio({ nombre: "Begoña Núñez", proyecto: "Diseño & código: ¿qué sigue? #1", inicio: INICIO, ciudad: "Paysandú" })!;
    const cel = normalizarCelular("099214367", paisDeCiudad("Paysandú"));
    expect(cel.ok).toBe(true);
    const enlace = enlaceWhatsApp(cel.e164!, texto);
    const url = new URL(enlace);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/59899214367");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(url.searchParams.get("text")).toBe(texto);
    expect(enlace).toContain("Bego%C3%B1a");
    expect(enlace).toContain("Dise%C3%B1o%20%26%20c%C3%B3digo%3A%20%C2%BFqu%C3%A9%20sigue%3F%20%231");
    expect(enlace).not.toMatch(/[\s«»¿¡ñáéíóú#&]/);
  });
});

describe("robustez", () => {
  it("fecha inválida: null (chat sin texto)", () => {
    expect(mensajeRecordatorio({ nombre: "Ana", proyecto: "X", inicio: "no es fecha", ciudad: "Cali" })).toBeNull();
  });
  it("proyecto muy largo se recorta a 120 caracteres", () => {
    const t = mensajeRecordatorio({ nombre: "Ana", proyecto: "ñ".repeat(500), inicio: INICIO, ciudad: "Cali" })!;
    expect(t).toContain(`«${"ñ".repeat(119)}…»`);
  });
  it("emoji partido (carácter suelto) no rompe el enlace", () => {
    const u = enlaceWhatsApp("+573001234567", "Hola \uD83D fin 😀");
    expect(new URL(u).searchParams.get("text")).toBe("Hola � fin 😀");
  });
});

describe("piezas", () => {
  it("fecha larga en minúscula, día de Colombia", () => {
    expect(fechaRecordatorio(new Date(INICIO))).toBe("martes 17 de noviembre");
    expect(fechaRecordatorio(new Date("2026-11-18T03:30:00.000Z"))).toBe("martes 17 de noviembre"); // 10:30 p. m. COL
  });
  it("marcadores", () => {
    expect(esNombreMarcador("No tengo")).toBe(true);
    expect(esNombreMarcador("Aún no tengo definido…")).toBe(true);
    expect(esNombreMarcador("Notengo App")).toBe(false);
    expect(esNombreMarcador("No más basura")).toBe(false);
    expect(esNombreMarcador("Huerta")).toBe(false);
  });
});

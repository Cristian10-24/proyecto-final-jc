import { describe, expect, it } from "vitest";
import { coincide, coloresMonitores, formatoCelular, iniciales, plural, porcentaje } from "@/lib/vistas/formato";

// Fase 6 · Paso 2: formatos de las vistas nuevas (Mi ciudad y Monitores).

describe("formatoCelular", () => {
  it("Colombia, guardado con o sin +57", () => {
    expect(formatoCelular("+573004118250")).toBe("+57 300 411 8250");
    expect(formatoCelular("3004118250")).toBe("+57 300 411 8250");
    expect(formatoCelular("+57 300 411 8250")).toBe("+57 300 411 8250");
    expect(formatoCelular("0057 3004118250")).toBe("+57 300 411 8250");
  });
  it("Uruguay, con indicativo y local", () => {
    expect(formatoCelular("+59899214367")).toBe("+598 99 214 367");
    expect(formatoCelular("099214367")).toBe("099 214 367");
  });
  it("vacío = null (la vista dice «Sin registrar»); lo desconocido, tal cual", () => {
    expect(formatoCelular("")).toBeNull();
    expect(formatoCelular("   ")).toBeNull();
    expect(formatoCelular(null)).toBeNull();
    expect(formatoCelular(undefined)).toBeNull();
    expect(formatoCelular("+44 7700 900123")).toBe("+44 7700 900123");
  });
});

describe("avatar y colores de monitores", () => {
  it("iniciales", () => {
    expect(iniciales("Valeria Ocampo Ríos")).toBe("VO");
    expect(iniciales("  ángela  pérez ")).toBe("ÁP");
    expect(iniciales("Valeria")).toBe("VA");
    expect(iniciales("")).toBe("?");
  });
  it("color por orden alfabético, del 1 al 7 y se repite; estable sin importar el orden de llegada", () => {
    const n = ["Valeria", "Ana", "Carlos", "Diana", "Elena", "Fabio", "Gloria", "Hugo", "ana"];
    const c = coloresMonitores(n);
    expect(c.get("Ana")).toBe(1);
    expect(c.get("Gloria")).toBe(7);
    expect(c.get("Hugo")).toBe(1);
    expect(coloresMonitores([...n].reverse()).get("Valeria")).toBe(c.get("Valeria"));
  });
});

describe("buscar y textos", () => {
  it("coincide sin tildes ni mayúsculas; vacío = todo", () => {
    expect(coincide(["Recicla y gana", "Barranquilla"], "barranquílla")).toBe(true);
    expect(coincide(["Ángela Pérez", null], "angela")).toBe(true);
    expect(coincide(["EcoRuta"], "huerta")).toBe(false);
    expect(coincide([], "  ")).toBe(true);
  });
  it("plural y porcentaje", () => {
    expect(plural(1, "proyecto", "proyectos")).toBe("1 proyecto");
    expect(plural(4, "proyecto", "proyectos")).toBe("4 proyectos");
    expect(porcentaje(16, 28)).toBe(57);
    expect(porcentaje(0, 0)).toBe(0);
  });
});

describe("primerNombre (menú de las vistas)", async () => {
  const { primerNombre } = await import("@/lib/vistas/formato");
  it("nombre compuesto, uno solo, vacío y espacios de más", () => {
    expect(primerNombre("Danna Belén Buendía Vega")).toBe("Danna");
    expect(primerNombre("Valeria")).toBe("Valeria");
    expect(primerNombre("")).toBe("");
    expect(primerNombre("   ")).toBe("");
    expect(primerNombre(null)).toBe("");
    expect(primerNombre("   María   José  ")).toBe("María");
  });
});

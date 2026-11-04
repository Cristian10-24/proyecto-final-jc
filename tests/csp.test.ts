import { describe, expect, it } from "vitest";
import { politicaCSP } from "@/lib/csp";

// CSP (cierre técnico): solo lo propio, Google Fonts y scripts con nonce.

const directivas = (p: string) => Object.fromEntries(p.split("; ").map((d) => { const [k, ...v] = d.split(" "); return [k, v]; }));

describe("CSP", () => {
  it("scripts solo con el nonce (sin unsafe-inline ni hosts externos); eval solo en desarrollo", () => {
    const d = directivas(politicaCSP("abc"));
    expect(d["script-src"]).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(directivas(politicaCSP("abc", true))["script-src"]).toContain("'unsafe-eval'");
  });
  it("solo Google Fonts de afuera; conexiones propias; sin marcos, objetos ni formularios ajenos", () => {
    const d = directivas(politicaCSP("abc"));
    expect(d["style-src"]).toEqual(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]);
    expect(d["font-src"]).toEqual(["'self'", "https://fonts.gstatic.com"]);
    expect(d["connect-src"]).toEqual(["'self'"]);
    expect([d["frame-ancestors"], d["object-src"], d["form-action"], d["base-uri"], d["default-src"]]).toEqual([["'none'"], ["'none'"], ["'self'"], ["'self'"], ["'self'"]]);
    expect(politicaCSP("abc")).not.toMatch(/\*|http:/);
  });
});

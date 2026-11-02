import { describe, expect, it } from "vitest";
import { claveLimite, clientIp, LIMITES } from "@/lib/rateLimit";

describe("límites de intentos", () => {
  it("el límite por documento es bajo y el de IP es alto (un colegio comparte wifi)", () => {
    expect(LIMITES.documento).toBeLessThanOrEqual(30);
    expect(LIMITES.ip).toBeGreaterThanOrEqual(200);
  });

  it("documento e IP llevan contadores separados", () => {
    const t = Date.UTC(2026, 10, 5, 15, 0);
    expect(claveLimite("documento", "1234", t)._id).not.toBe(claveLimite("ip", "1234", t)._id);
  });

  it("la ventana es de 15 minutos y el contador expira al cerrarla", () => {
    const t = Date.UTC(2026, 10, 5, 15, 7);
    const { _id, expiraEn } = claveLimite("ip", "1.2.3.4", t);
    expect(_id).toBe(claveLimite("ip", "1.2.3.4", Date.UTC(2026, 10, 5, 15, 14))._id);
    expect(_id).not.toBe(claveLimite("ip", "1.2.3.4", Date.UTC(2026, 10, 5, 15, 15))._id);
    expect(expiraEn.toISOString()).toBe("2026-11-05T15:15:00.000Z");
  });

  it("toma la IP del cliente de las cabeceras de Vercel", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": " 9.9.9.9 " } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.1" } }))).toBe("8.8.8.8");
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});

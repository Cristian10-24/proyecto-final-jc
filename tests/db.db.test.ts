import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Conexión como en Vercel: un solo cliente en caché con pool bajo, aguantando muchas peticiones a la vez,
// y transacciones disponibles (la base local es un replica set, igual que Atlas).

usarBaseLocal(5);
const db = await import("@/lib/db");

beforeAll(async () => {
  try {
    await (await db.getDb()).dropDatabase();
  } catch (e) {
    throw new Error(`No hay base local en 27018. Arráncala con "npm run db:local". (${e instanceof Error ? e.message : e})`);
  }
  await db.closeDb();
});
afterAll(() => db.closeDb());

describe("cliente de MongoDB", () => {
  it("se reutiliza el mismo cliente entre llamadas (caché global)", async () => {
    const a = await db.getClient();
    const b = await db.getClient();
    expect(a).toBe(b);
  });

  it("usa el pool bajo configurado", async () => {
    const c = await db.getClient();
    expect(c.options.maxPoolSize).toBe(5);
  });

  it("300 consultas simultáneas con pool de 5 terminan sin errores", async () => {
    const { users } = await db.collections();
    const t0 = Date.now();
    const r = await Promise.allSettled(Array.from({ length: 300 }, (_, i) => users.findOne({ usuario: `nadie-${i}` })));
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(0);
    expect(Date.now() - t0).toBeLessThan(15_000);
  });

  it("las transacciones funcionan (replica set)", async () => {
    const client = await db.getClient();
    const col = (await db.getDb()).collection("pruebaTx");
    await client.withSession((s) => s.withTransaction(async () => {
      await col.insertOne({ a: 1 }, { session: s });
      await col.insertOne({ a: 2 }, { session: s });
    }));
    expect(await col.countDocuments()).toBe(2);
  });

  it("los índices de la app quedan creados", async () => {
    const idx = await (await db.getDb()).collection("users").indexes();
    expect(idx.some((i) => i.unique && i.key.usuario === 1)).toBe(true);
  });
});

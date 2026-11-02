import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pruebas unitarias (sin base). Las que usan la base local están en *.db.test.ts: npm run test:db.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // 30 s: la primera carga de exceljs puede tardar más de 5 s en frío (disco/antivirus).
  test: { include: ["tests/**/*.test.ts"], exclude: ["tests/**/*.db.test.ts"], testTimeout: 30_000 },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pruebas contra la base LOCAL (npm run db:local). Nunca contra Atlas: ver tests/helpers/base-local.ts.
// Un archivo a la vez: comparten la misma base de pruebas.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.db.test.ts"], testTimeout: 60_000, fileParallelism: false },
});

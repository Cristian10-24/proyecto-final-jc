@AGENTS.md

# Proyecto final JC 2026 – guía para Claude

App para que los estudiantes de Jóvenes creaTIvos elijan el día y la hora (bloque de 15 min) de la
presentación de su proyecto final. Base copiada de validation-jc (Next.js 16 + driver `mongodb` + Zod +
exceljs + Vitest, en Vercel con Atlas). El plan y las decisiones están en `docs/PLAN.md`.

## Reglas
- Node 22 (`.node-version`, `engines`, `.npmrc` con engine-strict). Nunca cambiar el Node del sistema,
  nunca `nvm use`, nunca instalar nada global. No tocar `C:\ROFÉ\PAGINAS\MIGRACION`.
- Nunca conectarse a Atlas para desarrollar ni probar. Base local: `npm run db:local` (puerto 27018,
  replica set). Las pruebas con base pasan por `tests/helpers/base-local.ts`.
- Nunca leer ni subir `.env*`, Excel, CSV ni datos reales. No hacer push ni deploy sin autorización.
- Sin bloqueos en memoria: toda reserva es una operación atómica de MongoDB, respaldada por índices únicos.
- Toda ruta: Zod `.strict()`, `exigir(permiso)` si usa sesión, `sameOrigin` si usa la cookie y cambia datos.
- Antes de declarar terminado: `npm test`, `npm run test:db`, `npm run typecheck`, `npm run build`.

## Comandos
- `npm run db:local` (dejarla abierta) · `npm run dev` · `npm test` · `npm run test:db`
- `npm run usuario:add -- admin "Nombre" --rol=admin`

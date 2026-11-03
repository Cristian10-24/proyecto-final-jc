@AGENTS.md

# Proyecto final JC 2026 – guía para Claude

**Al empezar, lee `docs/PLAN.md` y las últimas entradas de `docs/BITACORA.md`; no releas el código completo.**

## Qué es
App para que los estudiantes de Jóvenes creaTIvos elijan el día y el bloque de 15 min de la
presentación de su proyecto final. Admin importa proyectos y mentores desde Excel; el monitor ve
quién eligió y quién falta. Decisiones de diseño: `docs/DECISIONES.md`. Referencias: `docs/referencia/`.

## Stack
Next.js 16 (App Router) + TypeScript, driver `mongodb`, Zod, exceljs, Vitest. Vercel (iad1) + Atlas.

## Comandos
- `npm run db:local` — MongoDB local en el puerto 27018 (replica set). Dejarla abierta.
- `npm run dev` · `npm test` · `npm run test:db` · `npm run typecheck` · `npm run build`
- `npm run usuario:add -- admin "Nombre" --rol=admin`

## Reglas
- Trabajar solo dentro de esta carpeta. No tocar `C:\ROFÉ\PAGINAS\MIGRACION` ni validation-jc.
- Node 22 (`.node-version`, `engines`). Nunca `nvm use`, nunca cambiar el Node del sistema ni instalar global.
- Mongo local en 27018. Nunca conectarse a Atlas en local (ni para desarrollar ni para probar).
  Las pruebas con base pasan por `tests/helpers/base-local.ts`.
- Nunca leer ni subir `.env*`, Excel, CSV ni datos reales. Sin push ni deploy sin autorización.
- Sin bloqueos en memoria: toda reserva es una operación atómica de MongoDB con índices únicos.
- Toda ruta: Zod `.strict()`, `exigir(permiso)` si usa sesión, `sameOrigin` si usa la cookie y cambia datos.
- Antes de cerrar un paso: `npm test`, `npm run test:db`, `npm run typecheck`, `npm run build`.

## Registro
- UN solo paso del PLAN a la vez. Al terminarlo: commit, entrada en la bitácora, mostrar solo esa
  entrada y detenerse. No empezar el siguiente hasta que el usuario escriba "siguiente".
- Al terminar cada paso, usar el subagente `revisor-pruebas`; en pasos de API y portal, también
  `revisor-seguridad`. Los subagentes (`.claude/agents/`) nunca trabajan en paralelo sobre el mismo código.
- Un commit por paso. Al terminar cada paso, entrada en `docs/BITACORA.md` (máx. 4 líneas:
  paso, commit, cómo verificar, pendiente) y marcar la casilla en `docs/PLAN.md`.
- Si una decisión cambia el diseño: una línea en `docs/DECISIONES.md`.
- Preguntar al usuario solo si una decisión cambia lo que ve el estudiante o el admin.

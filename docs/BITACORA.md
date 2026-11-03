# Bitácora

Una entrada por paso, máximo 4 líneas: paso, commit, cómo verificarlo y pendiente.

## Registro
- Paso: CLAUDE.md, PLAN con casillas, BITACORA, DECISIONES y referencias en `docs/referencia/`.
- Commit: `docs: registro del proyecto y referencias rescatadas`.
- Verificar: `git show --stat HEAD`; `git check-ignore "docs/referencia/Horarios Proyecto Final - JC 2026.xlsx"` responde la ruta.
- Pendiente: Paso 1.

## Paso 1 · Plantillas de Excel e importador
- Commit: `feat: plantillas de Excel e importador de proyectos y mentores con vista previa`. Pruebas: 43 unitarias y 11 con base; typecheck y build pasan.
- Verificar: `/admin/importar` (vista previa → confirmar) y `npm run verificar:franjas -- "docs/referencia/Horarios Proyecto Final - JC 2026.xlsx"`.
- Vale Horarios (DECISIONES); verificar:franjas solo informa (+8 el 12, 13 y 19; +24 el 21). Copia corregida: Martes 17 y Stiven Posada en Mentores!B15.
- Pendiente del usuario: en el Excel, quitar 4 horas a Jhan Carlos (queda en 23) y 2 a Yehiron (queda en 30), y reimportar antes de abrir inscripciones. Pendiente mío: probar la pantalla en el navegador.

## Paso 2 · Funciones puras de agenda
- Commit: `feat: funciones puras de agenda`. En `src/lib/agenda.ts`: días por ciudad, apertura, horas disponibles y reparto por hora. revisor-pruebas: 57 unitarias y 11 con base pasan; typecheck y build pasan.
- Verificar: `npx vitest run tests/agenda.test.ts` (80/40 → Cali 88, Cartagena 40, las dos ciudades en todas las horas del jueves; guía 77/51; Barranquilla solo desde su apertura; Cali no después de su clausura).
- Antes (`0eaea28`): reimportar conserva las reservas y muestra conflictos; la vista previa muestra las horas por mentor.
- Pendiente: Paso 3 (reserva atómica + 300 simultáneos).

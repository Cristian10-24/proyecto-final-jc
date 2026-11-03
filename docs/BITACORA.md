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
- Coinciden 17, 18 y 20. No coinciden 12 (136 vs 128), 13 (120 vs 112), 19 (116 vs 108) y 21 (64 vs 40): Horarios marca mentores que la pestaña no cuenta (p. ej. Farly el 12 a las 6 p. m.).
- Pendiente: decidir si vale Horarios o "Proyectos por franja"; en Horarios, poner nombre real a la columna "Mentor 14" (Stiven Posada); probar la pantalla en el navegador.

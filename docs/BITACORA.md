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
- Pendiente: que el usuario confirme las horas-mentor que no están en la pestaña (Farly 12/13/19; Jhan Carlos y Yehiron el 21); probar la pantalla en el navegador.

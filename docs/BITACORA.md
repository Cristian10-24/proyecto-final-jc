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

## Paso 3 · Reserva atómica y concurrencia
- Commit: `feat: reserva atómica del estudiante`. `POST /api/estudiante/reservar` + `src/lib/reservas.ts`. revisor-pruebas: 58 unitarias y 21 con base; revisor-seguridad sin hallazgos altos ni medios (los 2 bajos del límite, corregidos).
- Verificar: `npx vitest run --config vitest.db.config.mts tests/reservas.db.test.ts`: 300 a la vez por 200 asientos → 200 ganan, 100 sin cupo, ninguna doble; pareja ×20 → 1 asiento.
- Antes (`7f5391e`): prueba del jueves 12 con datos reales (136 asientos → Cali 96, Cartagena 40).
- Pendiente: Paso 3b (sistema visual). En el Paso 4, que el portal devuelva lo mínimo (si existe el documento y la hora propia).

## Paso 3b · Sistema visual
- Commit: `feat: sistema visual (tokens.css, DISENO.md y logos)`. Prototipos extraídos del zip a `docs/diseno/` (solo .dc.html). revisor-pruebas: 58 unitarias y 22 con base; typecheck y build pasan; /login revisado en el navegador.
- Verificar: `src/app/tokens.css` (única fuente de variables), `docs/DISENO.md` (52 líneas) y `public/` (logo-jc.png, logo-jc-redondo.webp, logo-sofka.webp).
- DECISIONES: lo que el PLAN corrige de los prototipos (sin "Pocos cupos", sin solicitudes de cambio ni correos, Mentor fuera de Fase 1) y qué devuelve el portal (datos enmascarados).
- Pendiente: Paso 4 (portal). Agregar Descripción, Celular y Correo a la plantilla de proyectos.

## Paso 4 · Portal del estudiante + importador flexible
- Commit: `feat: portal del estudiante e importador flexible`. revisor-pruebas: 63 unitarias y 35 con base; revisor-seguridad: 1 medio (dev:red sin revisar la base) y 1 bajo (hora en 409), corregidos; typecheck y build pasan.
- Verificar: `npm run db:local` + `npm run semilla:local -- --reset` + `npm run dev:red`; http://localhost:3000 o http://192.168.0.3:3000 en el celular. Documentos: 1000000001 (individual), 1000000002/1000000003 (pareja), 1000000004 (con hora). Visto en 375 px.
- Importador: sinónimos + elegir columna si falta, monitor por ciudad, Excel de ejemplo en `docs/plantillas/`.
- Pendiente: asignar monitores "por asignar" (Paso 5); en la red local el límite por IP se puede falsificar (solo dev).

## Corrección · "Todas" solo para ciudades sin días asignados
- Commit: `fix: Todas solo aplica a ciudades sin días asignados en Cupos`. 74 unitarias y 35 con base; typecheck y build pasan.
- Verificar: `npx vitest run tests/agenda.test.ts`: una prueba por ciudad (Cali 12; Cartagena 12 y 13; Barranquilla 13, 17 y 18; las demás, Todas desde el 17).
- La regla aplica al importar (etiquetas de asientos), en el portal (días) y al reservar. Semilla local recargada.
- Confirmado: Cali solo el jueves 12; Barranquilla 13 (sobrante), 17 y 18.

## Paso 5 · Admin: horarios, monitores y reetiquetar
- Commit: `feat: admin de horarios (liberar, cambiar, monitor, reetiquetar)`. revisor-pruebas: 74 unitarias y 44 con base; revisor-seguridad sin altos ni medios (2 bajos corregidos: 11000 en cambiar hora y filtros antes del límite); typecheck y build pasan.
- Verificar: `/admin/horarios` (admin.prueba en local): lista, detalle con historial, cambiar hora (bloques con libres) y reetiquetar; `npx vitest run --config vitest.db.config.mts tests/admin.db.test.ts`.
- Todo deja changeLog; cambiar hora es una transacción (si no cabe, no cambia nada).
- Pendiente: Paso 6 (panel del monitor). Revisado en el navegador sin guardar cambios (tu servidor local estaba en uso).

## Paso 6 · Seguimiento del monitor, resumen y Excel
- Commit: `feat: seguimiento del monitor, resumen y cronograma en Excel`. revisor-pruebas: 74 unitarias y 49 con base; revisor-seguridad sin hallazgos; typecheck y build pasan.
- Verificar: /monitor (filtros, "Copiar pendientes" para WhatsApp, enlace), /admin (resumen y "Descargar cronograma"); `npx vitest run --config vitest.db.config.mts tests/seguimiento.db.test.ts`.
- Antes (`118a059`): el admin puede usar asientos de otra ciudad con advertencia y queda en el changeLog. Barranquilla confirmada: 13, 17 y 18.
- Pendiente: Paso 7 (checklist de despliegue); probar /monitor con un usuario monitor real en local.

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

## Plan de la Fase 2
- Commit: `docs: plan de la Fase 2 (evaluación, salas y monitores)`. PLAN con los pasos 8 a 15; prototipo en `docs/diseno/evaluacion/index.html`.
- Verificar: `docs/PLAN.md` (sección Fase 2) y `docs/DECISIONES.md`.
- Sigue pendiente el Paso 7 de la Fase 1 (checklist de despliegue) antes del Paso 8.

## Cierre de la Fase 1 + Paso 7 · Despliegue
- Commit: `chore: cierre de la Fase 1 y guía de despliegue`. code-review: 9 hallazgos (7 corregidos, 2 a PENDIENTES); revisión de seguridad: 1 medio (usuario:add sin freno a Atlas) y 3 bajos corregidos. 74 unitarias y 51 con base; typecheck y build pasan.
- Verificar: `docs/DESPLIEGUE.md` (GitHub, Atlas, Vercel, variables, datos, prueba y apertura), `docs/PENDIENTES.md`; semilla con `monitor.prueba` (Cali y Cartagena).
- No se publicó nada. La skill security-review necesita remoto: se usó revisor-seguridad; revisor-pruebas no se pudo lanzar (permiso denegado) y las pruebas se corrieron directo.
- Pendiente: `npm run semilla:local -- --reset` para tener el monitor de prueba (borra las reservas locales); Paso 8.

## Ajustes · permisos de revisor-pruebas y modo Atlas de pruebas
- Commit: `chore: permisos de pruebas y modo Atlas solo sobre proyecto_final_jc_pruebas`. 85 unitarias (11 nuevas de seguridad de base) y 51 con base; typecheck y build pasan.
- Verificar: `npx vitest run tests/seguridad-base.test.ts`; `npm run dev:atlas` muestra solo base y host enmascarado y se niega si MONGODB_DB no es la de pruebas.
- revisor-pruebas sigue sin poder lanzarse en esta sesión (modo automático); no corrí nada contra Atlas (lo prueba el usuario).
- Pendiente: usuario de Atlas solo para `proyecto_final_jc_pruebas` (PENDIENTES); Paso 8.

## Paso 8 · Resumen del prototipo de evaluación
- Commit: `docs: resumen del prototipo de evaluación (Paso 8)`. `docs/EVALUACION.md` (91 líneas): criterios, `calc()`, pantallas, seguimiento y 4 incoherencias para preguntar. 85 unitarias y 51 con base; typecheck y build pasan.
- Verificar: `docs/EVALUACION.md`; desde aquí no se vuelve a abrir `index.html` salvo para una pantalla concreta.
- revisor-pruebas volvió a ser negado en sesión nueva (modo automático); queda en PENDIENTES y las pruebas se corrieron directo.
- Pendiente: responder las 4 incoherencias de `docs/EVALUACION.md` antes del Paso 10; Paso 9.

## Paso 9 · Ruta, salas y monitores
- Commit: `feat: plan de salas con monitores (importados y automáticos) y Ruta del proyecto`. revisor-pruebas: 112 unitarias y 60 con base; revisor-seguridad sin altos ni medios (4 bajos corregidos: enlace https al mostrar, largo del enlace, cambio de monitor + changeLog en transacción, apóstrofo contra fórmulas en el Excel); typecheck y build pasan.
- Verificar: Importar › "Salas y monitores" (plantilla con Salas, Monitores y Disponibilidad monitores) y /admin/salas (día, "Sin monitor", cambiar monitor, Recalcular, Descargar plan de salas); `npx vitest run tests/salas.test.ts` y `npx vitest run --config vitest.db.config.mts tests/salas.db.test.ts`.
- En el navegador solo vi el estado vacío y la tarjeta de Importar (tu servidor estaba en uso; no importé nada en tu base local): la tabla con datos está cubierta por pruebas, falta verla. revisor-pruebas ya se lanza: se quitó de PENDIENTES.
- Pendiente: confirmar si se quiere el Excel de resultados de la evaluación (Paso 14); Paso 10.

## Paso 10 · Módulo de evaluación
- Commit: `feat: módulo de evaluación (calc, guardar, borrador, No se presentó) y rol mentor`. revisor-pruebas: 145 unitarias y 73 con base (luego 75 con las correcciones); revisor-seguridad sin altos: 1 medio corregido (índice único `users.mentorId` y 409 si dos mentores comparten nombre) y bajos corregidos (mentor debe existir en Horarios, `exigir` con varios permisos, el asiento se vuelve a revisar dentro de la transacción); typecheck y build pasan.
- Verificar: `npx vitest run tests/evaluacion.test.ts` (calc, faltantes, Zod) y `npx vitest run --config vitest.db.config.mts tests/evaluacion.db.test.ts` (dueño, pareja, No se presentó/Deshacer, borrador, 7 mentores a la vez); `npm run usuario:add -- mentor.x "Nombre como en Horarios" --rol=mentor` entra a /mentor (página mínima: la vista llega en el Paso 11).
- Solo backend y API (`/api/evaluacion/proyectos`); sin pantalla todavía. Pendiente: Paso 11 (vista del mentor). Sin límite de tamaño del cuerpo aparte de Zod (igual que las demás rutas).

## Paso 11 · Vista del mentor
- Commit: `feat: vista del mentor (Mis evaluaciones y pantalla de evaluar) con sala y enlace`. revisor-pruebas: 145 unitarias y 76 con base; revisor-seguridad sin altos: 1 medio corregido (el borrador solo queda en el navegador si la sesión vence o no hay conexión, y se borra al cerrar sesión) y 1 bajo corregido (la copia local lleva usuario y fecha, y se descarta si es más vieja que lo guardado); typecheck y build pasan. Carga de usuarios por Excel adelantada al Paso 13.
- Verificar: entrar con un usuario mentor (nombre igual que en Horarios) → /mentor: lista por día y hora con sala y «Abrir sala», abrir un proyecto, calificar, recargar (vuelve el borrador), «Guardar evaluación» y «No se presentó»; con admin, menú «Evaluaciones» en solo lectura. Probado en el navegador con `next start` en el puerto 3001 contra `proyecto_final_jc_pruebas` (config `start-pruebas` de `.claude/launch.json`, secreto ficticio solo local: nunca apuntarla a Atlas) y a 375 px sin desborde.
- Pendiente: motivos de inasistencia (Paso 12; hoy toda inasistencia sale «Sin motivo»); Paso 12.

## Ajuste · usuario:add desde PowerShell y nombres parecidos
- Commit: `fix: usuario:add funciona desde PowerShell y sugiere el mentor más parecido`. En Windows PowerShell 5.1, `npm` (npm.ps1) se come el `--` y las comillas: ahora el script lee --rol/--clave también de `npm_config_*` y une el nombre en varias palabras. El error de mentor inexistente muestra el nombre recibido y hasta 3 parecidos ("¿Quisiste decir …?"), también en la página Usuarios. 146 unitarias y 76 con base; typecheck y build pasan.
- Verificar: en PowerShell `npm run usuario:add -- mentor.x "Mentr Prueba 1" --rol=mentor` → sugiere "Mentor Prueba 1" (no escribe nada). La base local solo tenía los 3 mentores de la semilla: Yehiron no existía porque el Excel real no se ha importado ahí.

## Semilla de demostración
- Commit: `feat: semilla de demostración completa (npm run semilla:demo)`. Arma en memoria los libros de Mentores/Horarios/Cupos (9 mentores, 9 días reales, 1 a 7 por hora, reglas reales de Cupos), Proyectos (40, 4 ciudades, pareja e individual, Básica/Avanzada) y Salas y monitores (7 salas; monitor.demo de Cali importado en salas con Cali y Cartagena, el resto automático) y los pasa por los importadores reales; reserva la mitad y deja evaluaciones de ejemplo (Excelente+destacado, pareja con No se presentó, borrador). 146 unitarias y 76 con base; typecheck y build pasan.
- Verificar: `npm run semilla:demo -- --reset --hoy=2026-11-03` (probado en `proyecto_final_jc_pruebas`; tu base local NO se tocó) → usuarios *.demo con clave `demo-2026` (solo local). Se niega con Atlas, con URI no local y con --hoy después del 21.
- Pendiente: Paso 12.

## Tema del módulo de evaluación (diseño del prototipo)
- Commit: `feat: tema del prototipo aprobado para el módulo de evaluación`. `src/app/tema-evaluacion.css` (variables `--ev-*` del prototipo, Lexend + Inter) solo dentro de `EvalShell` (barra oscura con logos de Jóvenes creaTIvos y Sofka); la vista del mentor y la pantalla de evaluar usan las reglas del prototipo. `tokens.css`, portal e inscripción sin cambios. 146 unitarias y 76 con base; typecheck y build pasan.
- Verificar: /mentor con `mentor.demo` (semilla demo). Comparado por estilos calculados contra el prototipo (fondo, barra, tipografías, pestañas, chips, márgenes iguales); a 1280 px y a 375 px sin desborde y con los dos logos. Las capturas no se pudieron tomar (panel del navegador oculto). Diferencias deliberadas en DECISIONES (hora 88 px, cabecera de evaluar no fija en el celular, logos más pequeños en el celular).
- Pendiente: modo oscuro (PENDIENTES · Mejoras futuras); los Pasos 12 y 15 se construyen con `EvalShell`; Paso 12.

## Ajuste · cronómetro por proyecto y fondo por estado
- Commit: `feat: cronómetro que sigue corriendo por proyecto y fondo sutil por estado en la lista`. El cronómetro guarda la hora de inicio por proyecto en el navegador (sigue al volver, abrir otro o recargar; solo Pausar lo detiene; «Reiniciar» con confirmación). Filas: verde ~7 % si alguien se presentó (pareja mixta incluida), rojo ~6 % si nadie, normal si está pendiente o con borrador; `estadoFila` lista para el monitor (Paso 12). 147 unitarias y 76 con base; typecheck y build pasan.
- Verificar: con `mentor.demo` (semilla demo) iniciar el cronómetro, volver, abrir otro (sigue en 15:00), volver y recargar (siguió corriendo); Pausar lo congela; Reiniciar pregunta y vuelve a 15:00. Contraste del texto sobre el tinte ~6:1. Sin desborde a 375 px (la fila del cronómetro baja de línea).
- Pendiente: Paso 12 (aplicar `estadoFila` y el tinte en la vista del monitor).

## Paso 12 · Vista del monitor por salas
- Commit: `feat: vista del monitor por salas (asistencia, motivo, reprogramar y sugerir cambio)`. «Mis salas» (/monitor/salas, tema del prototipo): sus salas por día y hora con mentor y «Abrir sala», estudiantes de cualquier ciudad, fondo por estado; ficha con correo y celular (Llamar/WhatsApp), ¿se presentó?, motivo, observación, reprogramar a un cupo de su ciudad y sugerir un cambio especial. El mentor ya ve el motivo. revisor-pruebas: casos de permisos agregados; revisor-seguridad sin altos: 1 medio corregido (carrera entre reprogramar y guardar evaluación) y 2 bajos corregidos (id validado con Zod, sala revalidada al anotar). 174 unitarias y 89 con base; typecheck y build pasan.
- Verificar: `npm run semilla:demo -- --reset --hoy=2026-11-12` y entrar con `monitor.demo` → «Mis salas»: abrir la pareja de Sebastián y Tomás (motivo «Conexión o equipo»), marcar «Sí», enviar una sugerencia, y reprogramar a Salomé y Samuel a las 8:15. Probado en `next start` (puerto 3001, base de pruebas) a 375 px sin desborde; el mentor recibe 403 en las rutas de salas.
- Pendiente: Paso 13 (usuarios por Excel); la bandeja de sugerencias es del Paso 14.

## Paso 13 · Usuarios por Excel y revisión de nombres
- Commit: `feat: carga de usuarios por Excel con vista previa y revisión de nombres`. En Usuarios: «Revisión de nombres» (mentores de Horarios sin usuario, usuarios mentor que no coinciden con el más parecido, salas sin monitor, monitores sin salas) y «Cargar varias personas desde Excel» (Nombre · Correo · Rol; Usuario y Ciudades opcionales; plantilla) con vista previa, confirmar y claves temporales mostradas una sola vez. Correo opcional en el formulario; monitor sin ciudades permitido (solo salas). revisor-pruebas: 1 error corregido (mismo nombre dos veces creaba dos usuarios) y casos agregados; revisor-seguridad sin altos: 4 medios corregidos (tope de 300 filas y tamaño antes de leer, transacción, nunca tomar la cuenta de otra persona, no reactivar por Excel) y 2 bajos (largo máximo, no tocar admin). 179 unitarias y 107 con base; typecheck y build pasan.
- Verificar: con `admin.demo` (semilla demo) → Usuarios: «Descargar plantilla», subirla (marca a la mentora de ejemplo que no está en Horarios) y subir un Excel válido → «Confirmar carga» → aviso con las claves y «Copiar todas». Probado con `next start` (puerto 3001, base de pruebas) y a 375 px sin desborde. Inter quedó permitida en el control de diseño.
- Pendiente: Paso 14 (bandeja de sugerencias, requisitos ya en el PLAN). Riesgo bajo no corregido: sin índice único de correo (el correo no sirve para entrar).

## Paso 14 · Bandeja de cambios sugeridos
- Commit: `feat: bandeja de cambios sugeridos (aprobar con bloque nuevo, rechazar con motivo)` (antes, `9eb7faa`: «Restablecer clave» con changeLog). Arriba de /admin/horarios: proyecto, integrantes, ciudad, hora actual, monitor, texto, motivo y fecha; «Aprobar» elige el bloque (cualquier día u otra ciudad, con advertencia) y mueve el proyecto en la misma transacción; «Rechazar» pide motivo; contador de pendientes junto a «Horarios». El monitor ve el estado en la ficha y en «Tus sugerencias de cambio». revisor-pruebas: casos agregados (cupo exacto, dos admins, limpieza al aprobar, origen); revisor-seguridad sin altos: 1 medio corregido (un monitor veía la sugerencia de otro) y 3 bajos (Zod en el contador, clave y registro en una transacción, contador solo enteros). 196 unitarias y 115 con base; typecheck y build pasan.
- Verificar: semilla demo; con `monitor.demo` sugerir un cambio desde la ficha; con `admin.demo` → Horarios (contador) → «Aprobar», martes 17 (avisa «Esta ciudad no presenta ese día» y asiento de otra ciudad) o «Rechazar» con motivo; con `monitor.demo` ver «Tus sugerencias de cambio». Probado con `next start` (puerto 3001) y a 375 px sin desborde.
- Pendiente: Paso 15 (seguimiento general y Excel de resultados).

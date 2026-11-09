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

## Paso 15 · Seguimiento general y Excel de resultados
- Commit: `feat: seguimiento general con las tablas del prototipo, criterios editables y Excel de resultados`. /evaluacion/seguimiento («Seguimiento general», coordinación y admin, tema del prototipo): KPIs, resultados, Parte A y B, por ruta, ciudad y modalidad, parejas, cupos para reprogramar, inasistencias y monitoreo, destacados, excelentes, avance por día y por mentor; filtros por día y ciudad; criterios editables (permiso `editar_criterios`, con changeLog). Excel (solo exportar, mismo filtro): «Resultados» con una fila por estudiante, «Asunto del correo» y «Mensaje para el estudiante», más 8 hojas de tablas. revisor-pruebas: casos agregados (Incompleto sin mensaje, encabezados contra el prototipo, filtro por día, validación 400, origen); revisor-seguridad sin altos ni medios: 2 bajos corregidos (texto con =,+,-,@ neutralizado en el Excel, criterios anteriores leídos en la transacción). 214 unitarias y 120 con base; typecheck y build pasan.
- Verificar: semilla demo; con `coordinacion.demo` → «Seguimiento general»: filtrar por Cali, «Descargar resultados (Excel)» (resultados-pfjc-2026-Cali.xlsx), subir la Parte B mínima a 4 (excelentes 1 → 0) y volverla a 3. Probado con `next start` (puerto 3001) y a 375 px sin desborde (dos KPI por fila en el celular). Inter: excepción del control de diseño solo en `EvalShell.tsx`.
- Pendiente: el PLAN no tiene más pasos (Fase 2 completa). Mejoras futuras en PENDIENTES (modo oscuro). Bajos no corregidos: la consulta trae todos los proyectos en cada carga (aceptable con este volumen).

## Paso 16 · Tablero de horarios
- Commit: `feat: tablero de horarios con arrastrar y soltar sobre la lógica única de mover`. /admin/tablero (menú «Tablero»): día, filtros por ciudad, ruta y estado; horas con 4 bloques y capacidad usada/total; tarjetas con ciudad en color, mentor, sala, monitor y estado; «Sin hora» filtrable (soltar = liberar con confirmación); clic = ficha con historial, liberar y cambiar mentor; refresco cada 30 s. Mover y liberar usan las acciones de Horarios sobre `src/lib/mover.ts` (ahora la única lógica: también monitor y bandeja); con evaluación guardada ya no se mueve ni se libera. @dnd-kit/core 6.3.1 (mouse, táctil, teclado, anuncios en español); coordinación solo lee; celular = lista por hora. revisor-pruebas: casos agregados (carrera con un estudiante, asiento de otra ciudad, 403 de coordinación); revisor-seguridad sin altos ni medios: 2 bajos corregidos (historial visible para coordinación, proyección en las consultas). 228 unitarias y 129 con base; typecheck y build pasan.
- Verificar: semilla demo; `admin.demo` → Tablero, jueves 12: arrastrar una tarjeta de Barranquilla desde «Sin hora» a las 8:15 (pide confirmar: no presenta ese día y asiento de otra ciudad), soltarla en las 8:00 llena («No cabe»), abrir la ficha y «Liberar hora». Con 134 tarjetas: API 63 ms, filtro 14 ms. Coordinación: «Solo lectura». 375 px: lista sin desborde.
- Pendiente: Paso 17 (editor de reglas de cupos). Probado táctil y teclado solo por configuración (sin tablet real).

## Paso 16b · Anular evaluación (salida de emergencia del admin)
- Commit: `feat: anular evaluación (solo admin) con copia guardada, motivo y changeLog`. En la ficha de Horarios y del Tablero: «Anular evaluación» con motivo obligatorio y confirmación; la evaluación se copia a `evaluacion_anuladas` (no se borra), el proyecto vuelve a Pendiente (se puede mover o volver a evaluar) y queda «Evaluación anulada» en el historial con el resultado anterior. Coordinación no puede (403). revisor-pruebas: casos agregados (carrera con el mentor, motivo obligatorio, intento fallido sin copia); revisor-seguridad sin altos: 2 medios corregidos (documento enmascarado en el historial si falta el nombre; se anula solo la versión que vio el admin) y 2 bajos (borra el borrador viejo, 404 si el proyecto no existe). 233 unitarias y 131 con base; typecheck y build pasan.
- Verificar: semilla demo; `admin.demo` → Horarios, abrir un proyecto evaluado → «Anular evaluación», motivo → historial «Valentina: Excelente → Pendiente»; en el Tablero, la tarjeta «Evaluado» → ficha → anular con confirmación. Ya se puede mover.
- Pendiente: Paso 17 (editor de reglas de cupos).

## Paso 16c · Portal del estudiante en computador
- Commit: `feat: versión web de dos columnas del portal del estudiante (desde 900 px)`. Todas las pantallas (documento, datos y pareja, día, hora, confirmar, éxito, ya tienes hora, no encontrado, sin horas, aún cerradas, cerradas) con «qué hacer» a la izquierda y una tarjeta de acción a la derecha, formas decorativas y encabezado del prototipo; por debajo de 900 px, la móvil sin cambios (también se corrigió la mayúscula de «Viernes 13» en hora). Logo a 64 px en web, 48 px en el celular y 64 px en /login. revisor-pruebas: la lógica del portal no cambió; revisor-seguridad: sin hallazgos (sigue todo enmascarado, solo envía el documento). 233 unitarias y 131 con base; typecheck y build pasan.
- Verificar: semilla demo; portal con 1000200037 a 1280 px (ingreso, datos, día, hora en 3 columnas, confirmar, éxito), a 1024 (ya tienes hora, no encontrado, error de documento; boleto completo), a 768 y 375 (móvil igual que antes, sin desborde). /admin/importar a 1280 sin desborde. Las capturas finales no se pudieron tomar (panel del navegador oculto); se verificó por medidas.
- «1 Issue» de Next.js: no es nuestro. En un navegador sin extensiones no aparece y la consola está limpia; lo produce ColorZilla, que agrega `cz-shortcut-listen` al `<body>` antes de hidratar. Pendiente: Paso 17.

## Paso 17 · Reglas de cupos y cierre de inscripciones
- Commit: `feat: editor de reglas de cupos por día y cierre de inscripciones por ciudad` (antes, `d0c6164`: recuadro de fecha, campo de documento grande y «orden de llegada» en el portal). /admin/reglas: por día, ciudades con mínimo, máximo, sobrante y apertura; vista previa del reparto por hora y validación de capacidad; al aplicar solo se reetiquetan libres (nadie que reservó se mueve), día marcado «editado en pantalla» con aviso al importar. Cierre por ciudad: 24 h antes de su primer bloque (editable) o a mano; el portal muestra «Cerró el…» o «Abrimos el…» por ciudad; quien tiene hora ve su boleto. revisor-pruebas: casos agregados (carrera aplicar/reservar, cierre sin automático, límite exacto, aviso al importar); revisor-seguridad sin altos ni medios: bajos corregidos (agenda sin fechas, `esDia` estricto, `Object.hasOwn`). 247 unitarias y 141 con base; build pasa (typecheck limpio salvo un archivo de `.next/dev` que escribe el `next dev` del usuario).
- Verificar (semilla demo, admin.demo): Reglas → jueves 12, poner a Cali un máximo de 150 → Vista previa (Cartagena 54) → Aplicar. «Cerradas»: en Cierre, poner a Barranquilla una fecha pasada a mano → portal con 1000200037 muestra «Cerró el…»; con 1000200045 sigue el boleto. «Aún cerradas»: quitar ese cierre y poner «Abre» en el futuro en los días de Barranquilla (13, 17 y 18) → portal con 1000200037 muestra «Abrimos el…». Probado así en el navegador.
- Pendiente: Paso 18 (modo oscuro).

## Paso 17b · Franjas y mentores
- Commit: `feat: franjas y mentores por hora (agregar y quitar mentor)`. /admin/franjas, menú «Franjas» (admin edita, coordinación solo mira): por día y hora, mentores como fichas con «×» y «+ Agregar mentor», capacidad (n × 4, o «No se ofrece»), «7 de 20 · 13 libres» y libres por ciudad; totales del día; se refresca cada 30 s; en celular, tarjetas. Agregar crea 4 cupos con las reglas del día y recalcula salas (sin pasar del número de salas, también con dos admins a la vez); quitar solo si sus cupos están libres (si no, lista los proyectos a mover) y si alcanza para las reglas. changeLog; aviso y reemplazo al importar Horarios. revisor-seguridad: sin altos ni medios, bajos corregidos; revisor-pruebas: caso de concurrencia agregado (encontró y se corrigió una carrera). 248 unitarias y 150 con base; typecheck y build pasan.
- Verificar (semilla demo, admin.demo): Franjas → jueves 12 → «×» de Camila a las 8 a. m. lista 2 proyectos a mover; «+ Agregar mentor» a las 4 p. m. sube de 204 a 208 cupos con el aviso de edición; «×» lo quita. Con coordinacion.demo, la tabla sin botones. Probado así en el navegador (también a 375 px).
- Pendiente: Paso 18 (modo oscuro).

## Paso 18 · Modo oscuro
- Commit: `feat: modo oscuro en panel, portal y evaluación`. Sigue al sistema; el botón sol/luna (panel, portal, evaluación y login) alterna y se recuerda en el navegador; un script del `<head>` aplica el tema antes de pintar. Paleta oscura en tokens.css y la del prototipo en evaluación; colores fijos pasados a tokens (`--on-ink`, `--card`, `--overlay`, `--night`); avatar con texto oscuro fijo sobre el amarillo. Contraste medido con un script en todas las pantallas en oscuro: solo queda el botón naranja con texto blanco (3,3:1, igual que en claro, color de marca). revisor-seguridad sin altos ni medios (CSP ausente, de antes, a PENDIENTES); revisor-pruebas: casos de tema agregados. 253 unitarias y 150 con base; typecheck y build pasan.
- Verificar: con el sistema en oscuro, abrir el portal, /login, /admin y /mentor (semilla demo): todo oscuro; el botón de la luna/sol cambia y al recargar se mantiene; borrar `pfjc-tema` en el navegador vuelve a seguir al sistema.
- Pendiente: cierre técnico (code-review de las Fases 2 y 3, ensayo de extremo a extremo, PENDIENTES final, semilla demo en Atlas de pruebas, DESPLIEGUE).

## Cierre técnico · Fases 2 y 3
- Commit: `chore: cierre técnico (CSP, code-review de las Fases 2 y 3, demo en Atlas de pruebas)`. CSP con nonce por petición (src/proxy.ts): scripts solo con nonce, Google Fonts y conexiones propias; probada en todas las pantallas en claro y oscuro sin violaciones. Botones naranjas a 19 px en negrita; gris terciario con 4,5:1. Code-review (3 revisores): corregidos los medios (Deshacer que dejaba el proyecto como evaluado, borradores perdidos o ajenos, guardar en un asiento ya reprogramado, «Todas» cambiada en silencio por Reglas, Reglas que borraba lo editado, respuestas desordenadas) y varios bajos; el resto, en PENDIENTES. `semilla:demo:atlas` solo contra pruebas con `--si-atlas-pruebas` y clave al azar; DESPLIEGUE con dos usuarios de Atlas y variables por ambiente. 255 unitarias y 156 con base; typecheck y build pasan.
- Verificar: ensayo hecho con la demo (`--hoy=2026-11-12`): estudiante reserva (individual y pareja) → admin la ve, mueve y libera (historial con documento enmascarado) → mentor guarda una evaluación (Excelente) → el admin ya no puede liberarla → coordinación ve el seguimiento y baja los dos Excel, y no puede cambiar reglas → monitor abre sus salas y cupos. En DevTools: encabezado Content-Security-Policy y consola sin errores.
- Pendiente: lo del usuario en docs/PENDIENTES.md (Excel corregido, usuarios de Atlas, GitHub, Vercel y Preview con la demo) y luego el despliegue según docs/DESPLIEGUE.md.

## Repositorio en GitHub y security-review
- Commit: `docs: security-review sin hallazgos y repositorio en GitHub`. Remoto `origin` = Fundacion-ROFE/proyecto-final-jc, `main` igual a `origin/main` (58ac6b4) y `origin/HEAD` fijado. En el remoto y en todo el historial: ningún `.env` salvo `.env.example` (URI local), solo las 3 plantillas de `docs/plantillas` (las genera `plantillas-ejemplo.ts` con datos inventados), sin CSV ni `.mongo-data`; las únicas credenciales son las de ejemplo de una prueba. security-review de todo `src/` y `scripts/` (el diff contra el remoto estaba vacío): sin hallazgos altos ni medios, nada que corregir; dos notas bajas a PENDIENTES.
- Verificar: `git ls-tree -r --name-only origin/main | grep -iE "\.env|\.xlsx|\.csv"` muestra solo `.env.example` y las plantillas de ejemplo.
- Pendiente: push de este commit (lo hace el usuario) y lo del usuario en docs/PENDIENTES.md (Excel corregido, usuarios de Atlas, Vercel, Preview con la demo).

## Script del tema sin aviso de React y `npm run demo`
- Commit: `fix: script del tema sin aviso en desarrollo y npm run demo para presentaciones`. El script del tema va por `ScriptEnLinea` (forma de la guía de Next 16: text/javascript en el servidor, text/plain en el cliente, suppressHydrationWarning) con el nonce de la CSP: se aplica antes de pintar y ya no sale "Encountered a script tag". `npm run demo` compila y arranca en producción contra la base local (127.0.0.1:27018; `proyecto_final_jc` o, con `MONGODB_DB`, la de pruebas), con SESSION_SECRET ficticio al azar, en todas las interfaces; se niega con Atlas y muestra la dirección, los usuarios demo y los documentos del portal (los lee `scripts/demo-usuarios.ts` por src/lib/db.ts). Prueba del Excel con más tiempo (fallaba por el límite de 5 s al correr todas). npm test 255 y build pasan.
- Verificar: con `npm run db:local` abierta y la demo cargada, `npm run demo` (o `PORT=3005 npm run demo` si el 3000 está ocupado) → abrir la dirección que imprime; en claro y oscuro, recargar: sin aviso ni errores de CSP en la consola.
- Pendiente: push y Vercel (el usuario). Borrar a mano `bash.exe.stackdump` (lo dejó un fallo de la terminal; no está en el repositorio).

## Publicación: push doble y etapa de pruebas en Production
- Commit: `docs: push doble (organización y fork) y etapa de pruebas en Production`. `origin` hace fetch de Fundacion-ROFE/proyecto-final-jc y push a la organización y al fork Cristian10-24/proyecto-final-jc (Vercel despliega desde el fork, rama `main`); los dos estaban en d7d6217. DESPLIEGUE: §1 Repositorios, §3b Production sobre `proyecto_final_jc_pruebas` (usuario `pfjc_pruebas`, 3 variables, demo con `semilla:demo:atlas` y clave que se ve una vez), §3c checklist del paso a producción real (variables a `pfjc_produccion` / `proyecto_final_jc` / SESSION_SECRET nuevo, Redeploy, base vacía, primer admin con `NODE_ENV=production` porque fuera de producción db.ts solo deja la base de pruebas con Atlas).
- Verificar: `git remote -v` muestra 1 fetch y 2 push; subir `main` a `origin` la envía a los dos repositorios.
- Pendiente: subir este commit (el usuario) y configurar Vercel según DESPLIEGUE §3 y §3b.

## Vaciar la base de pruebas en Atlas
- Commit: `feat: npm run vaciar:atlas-pruebas (base de pruebas vacía con un admin nuevo)`. `scripts/vaciar-atlas-pruebas.ts`, por `con-atlas.mjs` (lee `.env.atlas.local` sin mostrarlo): solo `proyecto_final_jc_pruebas`, exige `--si-atlas-pruebas` y `--usuario`; vacía las 17 colecciones de la app (no borra la base ni los índices), crea un único admin con clave al azar que se muestra una vez e imprime cuántos documentos borró de cada una. Probado contra la base LOCAL de pruebas: se niega sin modo Atlas, con `proyecto_final_jc`, sin confirmación y sin usuario; la corrida completa deja solo el admin. Typecheck limpio.
- Verificar: `npm run vaciar:atlas-pruebas -- --usuario=<usuario> --si-atlas-pruebas` → tabla de borrados y la clave; entrar a la app de Production con ese usuario.
- Pendiente: subir el commit (el usuario) y correr el vaciado contra Atlas.

## Primer admin de la base real
- Commit: `feat: npm run admin:produccion (primer admin en proyecto_final_jc)`. `scripts/con-produccion.mjs` lee `.env.produccion.local` (MONGODB_URI y MONGODB_DB; ignorado por `.env*`) sin mostrarlo y pasa esas variables y NODE_ENV=production solo al proceso hijo; `scripts/primer-admin.ts` exige `proyecto_final_jc` y una base sin usuarios, crea el admin con clave al azar que se muestra una vez, y con `--verificar` solo lee (usuarios y cuántos datos hay). Prueba de seguridad nueva: solo `con-produccion.mjs` nombra ese archivo. Probado contra la base local: se niega sin el envoltorio, con la base de pruebas, con usuarios y sin el archivo. npm test 256 y typecheck pasan. DESPLIEGUE §3c al día.
- Verificar: `npm run admin:produccion -- --verificar` → 1 usuario (el admin) y 0 proyectos; entrar a Production con ese usuario.
- Pendiente: crear `.env.produccion.local`, correr el comando y cargar los datos reales (DESPLIEGUE §4).

## Gestión manual de proyectos (rama feature/gestion-proyectos)
- Commit: `feat: gestión manual de proyectos (crear, editar, separar, agregar) y respaldo de producción`. Solo admin: «Nuevo proyecto» en Horarios y en el Tablero (Sin hora); en la ficha, «Editar», «Separar pareja» y «Agregar integrante» (une con otro proyecto si el documento ya existe, eligiendo la hora). Validaciones del importador, transacciones donde hay horas, changeLog con antes y después (documento, celular y correo enmascarados). Sin campos ni índices nuevos; `reservar` resuelve la carrera con el admin. `npm run respaldo:produccion` (solo lectura, a respaldos/). Pruebas: 13 con base nuevas (casos, carreras, "como producción"), 256 unitarias y 169 con base; revisor de seguridad (medio corregido: correo en el historial; bajos corregidos o en PENDIENTES); typecheck y build.
- Verificar (local, demo): Horarios → «Nuevo proyecto»; ficha de una pareja → «Separar pareja»; individual → «Agregar integrante» con el documento de otro proyecto (pide confirmar y elegir hora); portal con cada documento.
- Pendiente: subir la rama, probarla en Preview contra proyecto_final_jc_pruebas, respaldo de producción y unir a main (DESPLIEGUE §7).

## Ventanas que no se cierran solas y «Agregar integrante» con búsqueda
- Commit: `feat: ventanas del admin sin cierre por clic fuera y agregar integrante buscando el documento`. `useVentana` en todas las ventanas del admin (nuevo, editar, separar, agregar, ficha de Horarios con anular y liberar, ficha del Tablero, usuario y clave): clic fuera no cierra; X, Cancelar o Esc, con "¿Descartar los cambios?" si hay algo escrito. «Agregar integrante»: documento + «Buscar» (o Enter) → registro existente con su hora y evaluación, «Unir a este proyecto» eligiendo la hora, avisos de pareja (enlace a su ficha), evaluación y otra ciudad; si no existe, los campos del nuevo. Búsqueda de solo lectura (`buscarDocumento`); la unión usa la misma transacción con los datos del registro existente. Pruebas: 5 casos nuevos (18 en gestión), 256 unitarias; typecheck y build pasan; probado en el navegador.
- Verificar: Horarios → «Nuevo proyecto», escribir algo y hacer clic fuera (sigue abierta) y Esc (pregunta). Ficha de un individual → «Agregar integrante» con el documento de otro proyecto con hora, de una pareja y uno inexistente.
- Pendiente: subir la rama y probarla en Preview (DESPLIEGUE §7).

## Correo sin validación del navegador y diálogo propio para descartar
- Commit: `feat: correo y celular validados en el servidor (respeta lo guardado) y diálogo propio para descartar cambios`. Formularios del admin (proyecto y usuario) sin type="email": el servidor valida y responde el campo del error, que se muestra junto a él; correo o celular sin cambios no se validan; tildes, ñ o espacios en un correo nuevo, con mensaje propio. La semilla demo ya no pone tildes en los correos. `useVentana` muestra su propio alertdialog (claro y oscuro, foco atrapado, Esc o clic fuera = seguir editando, foco de vuelta al campo) y activa beforeunload solo con cambios. Sin otros `confirm` en el código. Pruebas: 3 nuevas (21 en gestión), 256 unitarias; typecheck y build pasan; probado en el navegador.
- Verificar: Horarios → ficha de un proyecto con correo con tilde → «Editar» → cambiar otro dato → «Guardar cambios» (guarda). Cambiar el correo a «maría@…» → error junto al campo. Escribir algo y pulsar la X → diálogo propio.
- Pendiente: subir la rama y probarla en Preview (DESPLIEGUE §7).

## Paso 19 · Cupos por orden de llegada (rama feature/ajustes-noviembre)
- Commit: `feat: modo orden de llegada con tope por ciudad y día (interruptor en Reglas)`. Interruptor en `ajustes/modoCupos` (sin documento = apagado = como antes); encendido, cualquier ciudad habilitada toma cualquier libre del día sin tocar las etiquetas, hasta su tope (`max ?? cupos`; sin tope: sobrante y «Todas»), en una transacción con candado por ciudad y día (`candados_cupo`), ocupación calculada de los datos reales. Tarjeta en Reglas: tope, lleva y libres que puede tomar por día y ciudad. Pruebas: 120 de Cartagena a la vez → exactamente 30; «como producción» con la demo: cero cambios sin acciones. revisor-seguridad sin altos ni medios (un bajo corregido, dos a PENDIENTES). 260 unitarias y 190 con base; typecheck y build pasan.
- Verificar (demo local, admin.demo): Reglas → «Modo orden de llegada» → revisar la tabla → «Activar»; portal con 1000200037 muestra sus días; «Desactivar» vuelve a como estaba.
- Pendiente: Paso 20 (admin, monitor, bandeja y tablero con el tope; el admin moviendo toca el candado).

## Paso 20 · Orden de llegada en admin, monitor, bandeja y tablero
- Commit: `feat: tope del orden de llegada en admin, monitor, bandeja y tablero`. `moverProyecto` escribe el candado y revisa el tope al cambiar de día: el monitor no lo pasa; el admin ve «Cartagena ya tiene 30 de 30 el jueves 12. ¿Mover igual?» y pasa confirmando («· sobre el tope» en el historial). Con el modo encendido, Horarios, Tablero, bandeja, reprogramar y unir ignoran las etiquetas; Horarios muestra «Cartagena lleva X de Y este día»; resumen de coordinación con lo que cada ciudad aún puede tomar; editar la ciudad y unir escriben el candado. revisor-seguridad sin altos (un medio corregido: unir; bajos a PENDIENTES); revisor-pruebas: casos agregados (editar ciudad, monitor contra estudiantes). 260 unitarias y 201 con base («como producción» ampliada con tablero, bloques y resumen); typecheck y build pasan.
- Verificar (demo local, admin.demo): Reglas → activar el modo → Horarios → proyecto de Cartagena sin hora → «Asignar hora» → viernes 13: «Cartagena lleva 1 de 20» y todos los bloques libres. Con un tope bajo en Reglas, mover a ese día pide «¿Mover igual?».
- Pendiente: Paso 21 («Sin proyecto»).

## Paso 21 · «Sin proyecto»
- Commit: `feat: estado «Sin proyecto» (participantes, proyectos marcados, portal y estadísticas)`. Colección nueva `sin_proyecto` (Excel con vista previa o uno por uno; convertir en proyecto) y campo opcional `sinProyecto` en el proyecto (solo sin hora; marcar/quitar en Horarios). No reciben hora ni cuentan en inscripción, Tablero ni evaluaciones; el portal dice «No tienes un proyecto inscrito. Escríbele a tu monitor.». Apartado nuevo en Seguimiento general. revisor-seguridad sin altos (un medio corregido: marcar ↔ asignar hora; bajos a PENDIENTES); revisor-pruebas: casos agregados. 260 unitarias y 218 con base; typecheck y build pasan.
- Verificar (demo local, admin.demo): «Sin proyecto» → «Agregar participante» → portal con ese documento; Horarios → proyecto sin hora → «Marcar «Sin proyecto»»; Seguimiento general → «Sin proyecto y no se presentaron».
- Pendiente: Paso 22 (comentarios en proyectos).

## Paso 22 · Comentarios de seguimiento en proyectos
- Commit: `feat: comentarios de seguimiento en proyectos (monitor escribe; admin y coordinación leen)`. Colección nueva `comentarios`: el monitor escribe en los proyectos de sus ciudades y edita o borra los suyos (borrar oculta; al editar se guarda el texto anterior); coordinación y admin los leen en la ficha de Horarios y Tablero. Indicador «Con comentarios (n)» en Horarios, Tablero y el seguimiento del monitor; al unir proyectos, los comentarios pasan al unido. revisor-seguridad sin altos (un medio corregido: topes de 50 por autor y proyecto y 200 en la lista; bajos corregidos o a PENDIENTES); revisor-pruebas: casos agregados. 271 unitarias y 227 con base; typecheck y build pasan.
- Verificar (demo local): monitor.demo → Seguimiento → «Comentar» en un proyecto → escribir, editar, borrar; admin.demo → Horarios o Tablero → ficha del proyecto → «Comentarios de seguimiento».
- Pendiente: Paso 23 (el estudiante edita nombre y descripción).

## Paso 22b · Coordinación y admin también comentan
- Commit: `feat: coordinación y admin también escriben comentarios de seguimiento`. Permiso `comentar_proyectos` también para coordinación y admin (en todos los proyectos, para responder al monitor); cada uno edita o borra solo los suyos, mismo tope de 50 por autor y proyecto; cada comentario muestra el rol del autor (Monitor, Coordinación, Admin). Escriben desde la ficha de Horarios y Tablero y desde el seguimiento. revisor-seguridad sin altos ni medios. Además se corrigió una prueba intermitente del Paso 19 (elegía un bloque que podía estar lleno). 271 unitarias y 228 con base; typecheck y build pasan.
- Verificar (demo local): admin.demo → Horarios → ficha de un proyecto con comentario del monitor → «Agregar comentario» → sale «Admin Demo · Admin»; el del monitor no tiene Editar ni Borrar.
- Pendiente: publicar Pasos 21 y 22; después, Paso 23.

## Paso 23 · El estudiante edita nombre y descripción
- Commit: `feat: el estudiante edita el nombre y la descripción de su proyecto (historial y revertir)`. En el portal, «Editar nombre y descripción» en la tarjeta del proyecto (antes de elegir hora y con hora ya elegida), sin evaluación guardada y también tras el cierre; texto plano 3–120 / 0–600, con versión (no pisa al admin), en transacción con su historial (antes/después, documento enmascarado); si se evalúa a la vez, se deshace. En Horarios, «Revertir este cambio» en la última edición del estudiante. El importador avisa si reemplaza un nombre editado por el estudiante; el cronograma neutraliza fórmulas en el nombre. revisor-seguridad sin altos (dos medios corregidos); revisor-pruebas: casos agregados. 275 unitarias y 246 con base; typecheck y build pasan.
- Verificar (demo local): portal con 1000200045 → «Editar nombre y descripción» → guardar; admin.demo → Horarios → ese proyecto → historial → «Revertir este cambio».
- Pendiente: Paso 24 (reporte de carga de los mentores).

## Paso 24 · Carga de los mentores (solo lectura)
- Commit: `feat: reporte de carga de los mentores con propuestas para juntar proyectos (solo lectura)`. /admin/carga-mentores (admin y coordinación) y Excel (hojas Carga y Propuestas): por día, mentor y hora, cuántos proyectos, con 1–2 proyectos y horas sueltas marcadas; propuestas por hora (mismo bloque primero, si no otro bloque de la misma hora «Cambia la hora del estudiante»; nunca otro día ni evaluados), que se aplican a mano en el Tablero (el enlace lo abre en ese día). La preferencia de mentor en la reserva quedó como propuesta en PENDIENTES. revisor-seguridad sin altos ni medios; revisor-pruebas: casos agregados. 281 unitarias y 256 con base; typecheck y build pasan.
- Verificar (demo local, admin.demo o coordinacion.demo): «Carga de mentores» → jueves 12 → tabla y «Propuestas para juntar proyectos» → «Descargar Excel».
- Pendiente: Fase 4 completa; probar en Preview y publicar.

## Paso 24b · Carga de mentores: la hora nunca cambia, tres objetivos y «Aplicar»
- Commit: `feat: carga de mentores solo cambia de mentor en el mismo bloque, con objetivos y Aplicar`. Propuestas solo de cambio de mentor en el mismo bloque, hacia asientos libres (disponible = tiene asiento; probado con Franjas), nunca evaluados; objetivos juntar → huecos → equilibrar; resumen «Hoy → Con las propuestas»; horas en orden de aplicación con «Aplicar» y «Aplicar las de esta hora» (cambiarHora con el asiento de origen esperado; rechaza y recalcula si cambió); «No se puede juntar sin mover la hora»; Excel con Resumen, Carga, Propuestas y No se puede juntar. revisor-seguridad bloqueado por permisos: revisión a mano (solo admin, sameOrigin, .strict(), destino filtrado por el mismo inicio dentro de la transacción, evaluados y marcados rechazados). 286 unitarias y 260 con base (200 días al azar: la hora nunca cambia); typecheck y build pasan.
- Verificar (demo local, admin.demo): «Carga de mentores» → jueves 12 → «Aplicar las de esta hora» en la 1.ª → se recalcula; el proyecto queda a la misma hora con otro mentor (historial en Horarios).
- Pendiente: decidir si «Equilibrar» debe repartir menos (ver PENDIENTES); probar en Preview.

## Paso 24c · Carga de mentores: equilibrar sin repartir de más
- Commit: `fix: equilibrar solo horas completas y movimientos directos en la carga de mentores`. Equilibrar solo pasa horas completas de 3 o más proyectos a otro mentor disponible en esos bloques, y solo con diferencia de 2 o más horas entre mentores; nunca parte una hora ni deja horas de 1–2. El reparto final se calcula de una vez: cada proyecto va directo de hoy a un asiento hoy libre (a lo sumo un movimiento, sin pasos ni devoluciones). Pruebas: pocos proyectos no se reparten, horas completas, diferencia de 2, un movimiento por proyecto y 200 días al azar (la hora nunca cambia). 286 unitarias y 262 con base; typecheck y build pasan.
- Verificar (demo local, admin.demo): «Carga de mentores» → cada día: «Con las propuestas» ya no sube los mentores activos; ninguna propuesta «Equilibrar» deja horas de 1–2.
- Pendiente: revisor-seguridad sobre «Aplicar».

## Paso 24d · Carga de mentores: sin datos de evaluación ni bloques próximos; confirmación «en curso»
- Commit: `fix: carga de mentores sin evaluados ni bloques próximos; confirmar cambios en curso`. Propuestas y «Aplicar» excluyen proyectos con resultado, «No se presentó», asistencia o notas del monitor, o borrador, y bloques a menos de 30 min (también dentro de la transacción). «Cambiar mentor/hora» en Tablero y Horarios a menos de 30 min o en curso pide confirmación y lo anota. Fórmulas con espacios o ＝ de ancho completo; cuerpo de «Aplicar» limitado a 1 KB; huecos solo entre horas del día. Semilla: `--carga-dispersa`. revisor-seguridad bloqueado por permisos: revisión a mano (borrador y notas chocan con el cambio por `rev`). 286 unitarias y 265 con base; typecheck y build pasan.
- Verificar (demo local con `npm run semilla:demo -- --reset --carga-dispersa`, admin.demo): «Carga de mentores» → sábado 21 → «Aplicar las de esta hora»; en el Tablero, «Cambiar mentor» de una presentación que empieza pronto pide confirmación.
- Pendiente: correr revisor-seguridad cuando el sistema lo permita.

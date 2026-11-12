# Plan · Proyecto final JC 2026

Meta: Fase 1 en producción antes de que empiecen las presentaciones, para que los estudiantes elijan a tiempo.

## Reglas confirmadas
- Bloques de 15 min; cada mentor califica 4 proyectos por hora. Capacidad de un bloque = número de mentores de esa hora.
- El estudiante elige día y bloque exacto, sin ver mentores ni conteos. El sistema asigna el mentor (sala).
- Monitor: 1 por sala (mentor-hora). El admin lo asigna después.
- Jueves 12: 80 cupos reservados para Cali y máximo 40 para Cartagena. Viernes 13: lo que falte de Cartagena; Barranquilla se abre en la fecha y hora que configure el admin. Cali no puede el 13.
- Uruguay participa: se muestra la hora COL y la de UY.
- Límite de intentos: por documento (bajo) y por IP (solo fallos, con un tope alto).
- Reimportar mentores: una hora-mentor que se quita y ya tiene proyecto reservado no se borra; la vista previa la muestra como conflicto con el proyecto afectado, para moverlo primero. La vista previa muestra el total de horas por mentor.
- Fase 1 incluye una acción de admin para liberar o cambiar la hora de un proyecto, con registro en changeLog.

## Diseño: cupos por ciudad con asientos etiquetados (diseño b)
Cada asiento (bloque × mentor) se crea al importar con la lista de ciudades que pueden tomarlo, por ejemplo `["Cali"]`, `["Cartagena"]` o `["Cartagena", "Barranquilla"]`.
Reservar es un solo `findOneAndUpdate({inicio, proyectoId: null, ciudades: ciudad}, {$set: {proyectoId}})`. Un índice único parcial sobre `proyectoId` impide que un proyecto tenga dos asientos.
La apertura por fecha (Barranquilla el 13) se revisa antes de reservar, contra la configuración del día.
El reparto entre ciudades se hace **por hora y en proporción**, para que ninguna ciudad se quede sin cupo en una hora con espacio.
Liberar es vaciar el asiento (sin contadores). Si una ciudad no usa sus cupos, el admin reetiqueta los libres.
Solo el cambio de hora hecho por el admin usa una transacción (libera el asiento viejo y toma el nuevo).
Alternativa descartada (diseño a: colección `cuotas` + contadores) y otras decisiones: `docs/DECISIONES.md`.

## Infraestructura
- Repositorio y proyecto de Vercel: `proyecto-final-jc`. Base de Atlas: `proyecto_final_jc`, usuario readWrite solo sobre ella.
- Vercel en `iad1` (`vercel.json`) y Atlas en AWS us-east-1: misma región.
- Un solo cliente de Mongo en caché global con `maxPoolSize` 5 (`MONGODB_MAX_POOL`). Pruebas en `tests/db.db.test.ts`.

## Pasos
- [x] Base copiada de validation-jc: login, usuarios, límites, base local en replica set.
- [x] 1. Plantillas de Excel (proyectos y mentores con disponibilidad) e importador con vista previa y errores por fila; genera los asientos etiquetados por ciudad. Fuente de verdad: hoja Horarios; `verificar:franjas` solo informa diferencias con "Proyectos por franja".
- [x] 2. Funciones puras de agenda: días por ciudad, horas disponibles y reparto proporcional por hora. Pruebas con el caso 80 Cali / 40 Cartagena.
- [x] 3. Ruta de reserva atómica y prueba de concurrencia con 300 simultáneos (pool de 5, sin doble asignación).
- [x] 3b. Sistema visual (una sola vez): leer solo los `.dc.html` de `docs/diseno/`; crear `src/app/tokens.css` (colores, Outfit y JetBrains Mono, radios, sombras, espaciados), `docs/DISENO.md` (máx. 80 líneas: pantallas y estados por rol, textos de botones y mensajes, componentes repetidos) y copiar los logos a `public/`. Desde aquí, portal, admin y monitor usan SOLO `docs/DISENO.md` y `tokens.css`; si un prototipo contradice el PLAN, gana el PLAN (anotar en DECISIONES). Móvil primero: estudiante en 390 px, admin en 1280 px.
- [x] 4. Portal del estudiante, móvil primero: documento → datos y pareja (solo lectura) → día → hora → confirmar → "tu horario", con todos los estados de error.
- [x] 5. Admin: liberar o cambiar la hora de un proyecto, reetiquetar asientos libres de un día y asignar el monitor de los proyectos "por asignar"; todo con registro en changeLog.
- [x] 6. Panel del monitor: quién eligió y quién falta, copiar pendientes para WhatsApp y exportar el cronograma a Excel.
- [x] 7. Preparar el despliegue: checklist en `docs/DESPLIEGUE.md` con lo que el usuario debe crear (GitHub, Atlas, Vercel, variables). Sin publicar nada.

## Fase 2 · Evaluación, salas y monitores
Prototipo: `docs/diseno/evaluacion/index.html` (leerlo una vez en el Paso 8; después usar `docs/EVALUACION.md`).

**Datos.** No hay carga de estudiantes: todo sale de los proyectos importados y de las reservas (día, hora y mentor asignados al reservar). La evaluación solo lee las reservas.

**Criterios (exactamente los del prototipo; no los definimos nosotros).**
- Parte A: 7 ítems sí / parcial / no; parcial vale 0,5. Parte B: 5 temas, escala 0–4, mínimo 2 calificados.
- Tiempos 0–6 / 6–12 / 12–15 con cronómetro visual de 15 min; al terminar no bloquea nada.
- Resultado igual a `calc()` (copiar su lógica tal cual, con pruebas): Pendiente, No se presentó, Incompleto (faltan ítems de A o menos de 2 temas de B), Excelente (A ≥ 90 % y B ≥ 3 por defecto, editables) y si no, Aprobado.
- Motivos de inasistencia, destacados y todas las tablas del seguimiento del prototipo.
- En pareja: Parte A y cierre comunes; Parte B y "no se presentó" por integrante.
- Única corrección de texto: al terminar el tiempo, "Guarda la evaluación" (en lugar de "Guarda y envía el correo") mientras no haya correos.
- Cualquier otra incoherencia entre el prototipo y la app se anota y se pregunta; no se resuelve sola.

**Ruta.** El importador de proyectos reconoce Ruta (Básica / Avanzada) con sinónimos. Mismos criterios para ambas; la ruta sirve para las tablas del seguimiento.

**Salas y monitores.**
- Hoja "Salas" en el importador: Sala (1 a 7) y Enlace.
- El sistema asigna sala a cada mentor en cada hora según los mentores activos (máximo 7 a la vez), y mantiene al mentor en la misma sala en horas seguidas cuando se pueda.
- El admin descarga el "Plan de salas" (Día, Hora, Sala, Mentor) en Excel.
- Monitores, dos formas: importar (Día, Hora, Sala y Monitor; acepta Mentor en lugar de Sala) o automática desde "Disponibilidad monitores" (Monitor, Día, Hora), repartiendo la carga y en la misma sala en horas seguidas cuando se pueda. Lo importado manda. Un monitor por sala y hora; nadie en dos salas a la misma hora. Los monitores son usuarios con rol monitor; si un nombre no coincide, aviso en la vista previa. El admin cambia el monitor de una sala (changeLog).
- En las presentaciones el monitor ve estudiantes de cualquier ciudad, solo los de sus salas asignadas; en la inscripción (Fase 1) sigue viendo solo su ciudad.

**Cambios de hora.**
- El monitor reprograma directamente a un cupo libre de la ciudad del estudiante, en los días habilitados para esa ciudad.
- Fuera de eso (otro día, otra ciudad o después de su clausura, p. ej. Cali el martes 17), el monitor solo SUGIERE el cambio con un motivo; el admin lo aprueba o rechaza en /admin/horarios. Todo queda en changeLog.

**Protección del mentor (no cambia criterios).**
- Borrador guardado automáticamente en el servidor mientras califica; se recupera al recargar.
- Sesión de toda la jornada; si vence, no se pierde el borrador.
- El refresco periódico nunca sobrescribe el formulario abierto.
- Aviso al salir o abrir otro estudiante sin guardar.
- Prueba de carga simple: 7 mentores guardando a la vez.

**Reglas de la Fase 2.** Sin Google Apps Script; el módulo de evaluación (vista del mentor, del monitor en salas y seguimiento: Pasos 11, 12 y 15) usa el diseño aprobado del prototipo con `EvalShell` y `src/app/tema-evaluacion.css`; portal e inscripción siguen con `tokens.css`; refresco periódico (sin websockets); un paso a la vez.

### Pasos de la Fase 2
- [x] 8. Leer el prototipo una vez y crear `docs/EVALUACION.md` (máx. 100 líneas). Después no volver a abrir index.html salvo para una pantalla concreta.
- [x] 9. Importador: Ruta, Salas, Monitores y Disponibilidad monitores; asignación automática de salas y de monitores (lo importado manda), plan de salas en el admin con salas sin monitor marcadas y cambio de monitor (changeLog), y descarga del Plan de salas.
- [x] 10. Módulo de evaluación: `src/lib/evaluacion/`, `/api/evaluacion/*`, colecciones `evaluacion_*`. Funciones puras con pruebas (incluida `calc()`). Un mentor solo evalúa sus proyectos. Borrador automático. Todo deja changeLog.
- [x] 11. Vista del MENTOR ("Mis evaluaciones"), igual al prototipo: agenda del día por bloques de 15 min, filtros por estado y pantalla de evaluar; en cada hora, su SALA y ENLACE con "Abrir sala". Coordinación y admin pueden ver la vista de cualquier mentor.
- [x] 12. Vista del MONITOR por horario: sus salas asignadas por día y hora (estudiantes de cualquier ciudad) con ENLACE, mentor y proyectos con contacto completo. Pruebas de permisos: solo los de sus salas. Por integrante: se presentó sí/no, motivo de inasistencia, comentarios, reprogramar en su ciudad o sugerir cambio especial.
- [x] 13. Usuarios (antes de las presentaciones del 12): integrar la gestión del prototipo (agregar, cargar por Excel Nombre/Correo/Rol, revisión de nombres) con los usuarios y roles actuales. Sin login por correo y código.
- [x] 14. Admin: bandeja de cambios sugeridos en /admin/horarios. Cada sugerencia: proyecto e integrantes, ciudad, hora actual, monitor que sugiere, texto y fecha. "Aprobar" elige el cupo nuevo (también de otro día, otra ciudad o después de la clausura, con advertencia); "Rechazar" pide motivo. El monitor ve en su ficha si fue aprobada o rechazada. Contador de pendientes en el menú del admin. Todo en changeLog.
- [x] 15. Seguimiento general (coordinación y admin): todas las tablas del prototipo y criterios editables, sin CSV. Exportar resultados en Excel (.xlsx), filtrable por día y ciudad: una fila por estudiante con todas las columnas (incluidos "Asunto del correo" y "Mensaje para el estudiante") y una hoja por cada tabla del seguimiento (ruta, ciudad, modalidad, mentor, monitor, día, inasistencias, destacados). Solo exportar.

## Fase 3 · Lista ANTES de las presentaciones del 12 (el despliegue va después)
Correos: más adelante (PENDIENTES). La pantalla del mentor sigue con "Guarda la evaluación". Un paso a la vez.
- [x] 16. Tablero de horarios tipo Trello en /admin/tablero (estilo del panel del admin; prototipo Admin.dc.html · Tablero): selector de día; filtros por ciudad, ruta y estado; columnas = horas con sus 4 bloques de 15 min y capacidad usada/total; tarjeta = proyecto (integrantes, ciudad con color, proyecto, mentor, sala, monitor, chip de estado con los colores sutiles de la vista del mentor); columna "Sin hora" filtrable por ciudad (soltar ahí = liberar, con confirmación). Soltar en un bloque usa la MISMA lógica y transacción de cambiar hora: bloque lleno → no se mueve; ciudad sin ese día o después de su clausura → advertencia y confirmación; asiento de otra ciudad → advertencia; ya evaluado → no se mueve; todo con changeLog. Clic: detalle, historial, liberar y cambiar mentor. Refresco periódico; si un estudiante toma el cupo mientras se arrastra, se rechaza con aviso y la tarjeta vuelve. Solo admin mueve; coordinación solo lee. Mouse, táctil (tablet) y teclado; en celular, lista por hora. Rápido con 130+ tarjetas. Librería de arrastre conocida (versión con 2+ semanas).
- [x] 16b. Salida de emergencia solo para el admin: "Anular evaluación" en la ficha del proyecto (Horarios y Tablero), con motivo obligatorio y confirmación. La evaluación anulada se guarda (no se borra), deja changeLog y el proyecto vuelve a Pendiente (se puede mover o volver a evaluar). Coordinación no puede anular.
- [x] 16c. Portal del estudiante en computador: versión web de dos columnas (prototipo Reserva.dc.html, 1280 px) desde 900 px en todas las pantallas; por debajo, la móvil sin cambios. Logo completo y nítido; /login y /admin/importar revisados en pantalla ancha.
- [x] 17. Editor de reglas de cupos (admin): por día, ciudades habilitadas, mínimo, máximo, sobrante y apertura; días por ciudad respetando su clausura. Vista previa del reparto por hora y validación de capacidad. Al aplicar solo se reetiquetan asientos LIBRES (nadie que ya reservó se mueve), con changeLog. La hoja Cupos sigue funcionando; lo editado en pantalla manda hasta la próxima importación, con aviso.
- [x] 17b. Franjas y mentores (/admin/franjas, prototipo 5b): mentores por hora, capacidad, ocupados y libres por ciudad; agregar y quitar mentor (solo admin).
- [x] 18. Modo oscuro para el panel, el portal y el módulo de evaluación con las variables existentes: sigue la preferencia del sistema, con botón que se recuerda; contraste revisado (tintes de estado, chips y logos).
- [x] Cierre técnico (con "siguiente"): 1) code-review de las Fases 2 y 3, corregir altos y medios; 2) ensayo de extremo a extremo con la semilla demo y --hoy (reserva → asistencia → evaluación → sugerencia aprobada → tablero → reglas de cupos → Excel), anotar fallas; 3) docs/PENDIENTES.md con la lista única y ordenada de lo que toca al usuario (datos reales con sus plantillas, despliegue según DESPLIEGUE.md con security-review, prueba en celular real, apertura de inscripciones; correos en "Más adelante"). Además, preparar el despliegue en dos tiempos (Preview contra `proyecto_final_jc_pruebas` con la semilla demo; luego Production contra `proyecto_final_jc` con datos reales): habilitar `semilla:demo` para Atlas SOLO contra `proyecto_final_jc_pruebas` con la confirmación explícita `--si-atlas-pruebas` (nunca contra `proyecto_final_jc`), y en DESPLIEGUE.md variables de pruebas solo en el ambiente Preview de Vercel y de producción solo en Production, con un usuario de Atlas distinto para cada base (readWrite solo sobre la suya).

## Fase 4 · Ajustes de noviembre (rama feature/ajustes-noviembre) — PLAN POR APROBAR
La app está en producción con >90 % de los proyectos con hora y muchos cambios hechos a mano.

**Reglas de datos (valen para todos los pasos).** Cero migraciones, cero scripts que escriban en producción, cero
cambios masivos. Los documentos e índices existentes no cambian de forma: solo campos NUEVOS y OPCIONALES y
colecciones NUEVAS (con sus índices); todo funciona igual con documentos sin esos campos. Un dato existente solo cambia
cuando un usuario hace a mano una acción sobre ESE registro. `ensureIndexes` solo suma índices de colecciones nuevas.
Sin push (lo hace el usuario); local con la demo → Preview (base de pruebas) → `respaldo:produccion` → main.

**Prueba "como producción" (en cada paso).** Helper nuevo `tests/helpers/foto-base.ts`: carga la demo, hace cambios a
mano típicos (pareja separada, unida, hora movida, asiento de otra ciudad) y toma una foto (hash por documento) de
proyectos, asientos, evaluaciones, evaluacion_monitor, users, dias, planSalas y changeLog; luego corre lo nuevo sin
acciones de usuario (arranque, `ensureIndexes`, lecturas del portal, del admin, del monitor y del seguimiento, interruptor
apagado) y compara: idéntico. Además, `consultar` y `agenda` del portal responden lo mismo para cada documento.

### Paso 19 · Cupos por orden de llegada: núcleo (urgente)
- **Interruptor:** colección nueva `ajustes`, documento `{_id: "modoCupos", ordenLlegada: boolean, actualizadoEn,
  actualizadoPor}`. Sin documento = apagado = la app exactamente como hoy (mismo código de reserva, sin transacción).
  Cambiarlo deja changeLog `modo_cupos` (valor nuevo del enum; solo documentos nuevos).
- **Encendido:** cualquier asiento libre de un día lo toma cualquier ciudad habilitada ese día; las etiquetas
  (`asientos.ciudades`) se ignoran, no se borran ni cambian. Se siguen respetando días por ciudad, clausura, apertura
  (`abre`) y cierre de inscripciones (las mismas funciones de hoy: `puedeElegir`, `estadoCiudad`).
- **Tope por ciudad y día** = el «Máximo del día» de Reglas (`max`); si la ciudad no tiene máximo, sus `cupos` (hoy son
  exactos); la ciudad de sobrante no tiene tope (ver preguntas). Ocupación = proyectos de esa ciudad (`proyectos.ciudad`
  actual) con asiento ese día. Se calcula siempre de la verdad (asientos + proyectos), así que **no hay contadores que
  inicializar ni mantener**: liberar, mover, separar, unir o editar la ciudad quedan bien solos.
- **Atomicidad sin tocar datos existentes:** en modo nuevo la reserva es una transacción (`transaccion()` de db.ts):
  1) `$inc` en un candado `candados_cupo {_id: "<día>|<ciudad>", v}` (colección nueva); 2) contar la ocupación;
  3) si llegó al tope → error nuevo `dia_lleno` («Ese día ya no tiene horas para tu ciudad. Elige otro.»);
  4) tomar el asiento con `findOneAndUpdate({inicio, dia, proyectoId: null})`; 5) comprobar que el documento siga en el
  proyecto (como hoy). Dos reservas de la misma ciudad y día escriben el mismo candado: MongoDB aborta una por conflicto
  de escritura y `withTransaction` la reintenta ya con la ocupación nueva, así que el tope no se pasa ni en simultáneo.
  Que nadie tome el mismo asiento lo siguen garantizando el `findOneAndUpdate` atómico y el índice único de
  `proyectoId` (sin cambios). Los candados se crean al encender el modo (uno por día × ciudad, `insertOne` que ignora
  duplicados) y, si falta uno, se crea fuera de la transacción antes de entrar. Mover (admin, monitor, bandeja) y editar
  la ciudad de un proyecto con hora también tocan el candado del día de destino, para que la reserva simultánea lo vea.
- **Portal (`agenda`):** días = los habilitados con ocupación < tope y algún asiento libre futuro; horas = todos los
  bloques libres del día. Sigue sin mostrar conteos. Si el tope se llena entre ver y confirmar: `dia_lleno`.
- **Reglas:** tarjeta «Modo orden de llegada» (activado/desactivado, con confirmación) y, por día, «Cartagena 27 de 30».
  Aplicar reglas sigue reetiquetando solo libres (sin efecto mientras el modo esté encendido).
- Archivos: `src/lib/modoCupos.ts` (nuevo: modo, topes, ocupación, candado), `reservas.ts`, `estudiante.ts`, ruta y
  pantalla de Reglas, `db.ts` (colecciones nuevas e índices solo de ellas).
- Pruebas: funciones puras del tope; reserva en ambos modos (apagado = mismos resultados de hoy); **concurrencia**:
  120 estudiantes de Cartagena a la vez el mismo día con tope 30 y 60 libres → exactamente 30 reservas y ningún asiento
  doble; mezcla Cali + Cartagena simultánea; reserva mientras el admin libera o mueve; apagar el modo deja todo como
  estaba (las reservas en asientos «ajenos» se conservan). Foto «como producción».
- Riesgos: (a) el candado serializa las reservas de una misma ciudad y día (más reintentos en un pico; se mide en la
  prueba de concurrencia con el pool de 5); (b) con el modo encendido quedan proyectos en asientos con etiqueta de
  otra ciudad: si luego se apaga y se aplican Reglas, la vista previa podría reportar reservas «fuera de su cupo» (se
  prueba; si pasa, se muestra como aviso y no como error); (c) ciudades que llegan por «Todas» (ver preguntas).

### Paso 20 · Orden de llegada en admin, monitor, bandeja y tablero
- Admin (Horarios, Tablero, bandeja): con el modo encendido ve todos los bloques libres (sin el aviso «asiento de otra
  ciudad») y, si la ciudad ya llegó al tope ese día, «Cartagena ya tiene 30 de 30 el jueves 12. ¿Mover igual?»; el
  servidor exige la confirmación (`confirmarTope`) y el changeLog lo anota («· sobre el tope»).
- Monitor (reprogramar): respeta el tope (no lo pasa); si está lleno, «Sugerir un cambio especial» como hoy.
- Resumen de coordinación: «asientos libres» por ciudad = mín(libres del día, tope − ocupación) con el modo encendido.
  `mover.ts` sigue siendo la única lógica de mover y liberar (se le suma el candado).
- Pruebas: mover sobre el tope con y sin confirmación, monitor rechazado al tope, tablero; foto «como producción».
- Riesgo: un admin que mueve a la vez que un estudiante reserva puede dejar la ciudad 1 sobre el tope (el admin puede
  pasarlo de todas formas; queda en el changeLog).

### Paso 21 · Estado «Sin proyecto»
- **Participantes sin proyecto:** colección nueva `sin_proyecto {nombre, documento, ciudad, celular?, correo?, monitor?,
  creadoEn, creadoPor, convertidoEn?, proyectoId?}` con índice único en `documento`. Apartado «Sin proyecto» en el admin:
  cargar por Excel (Nombre, Documento, Ciudad, Celular, Correo, Monitor; sinónimos y vista previa como el importador) y
  agregar uno por uno. Un documento no puede estar a la vez aquí y en un proyecto (se revisa en las dos direcciones,
  en una transacción). «Convertir en proyecto» abre «Nuevo proyecto» con sus datos y, al crearlo, marca el registro
  como convertido (no se borra).
- **Marcar un proyecto como «Sin proyecto»:** solo si NO tiene hora (si la tiene: «Primero libera su hora»). Campo nuevo
  y opcional en ese proyecto: `sinProyecto?: {desde, por, motivo?}`; «Quitar marca» lo borra. Los dos dejan changeLog
  (`sin_proyecto` / `quitar_sin_proyecto`). Proyectos sin el campo = como hoy. `reservar` rechaza un proyecto marcado
  (y lo vuelve a comprobar después de tomar el asiento, como ya hace con separar y unir).
- **Portal:** un documento de `sin_proyecto` o de un proyecto marcado ve «No tienes un proyecto inscrito. Escríbele a tu
  monitor.» (mismo límite de intentos; no revela nada más).
- **Estadísticas:** los marcados no cuentan en el seguimiento de inscripción (resumen, avance por ciudad), en el avance
  del monitor ni en el Seguimiento general de evaluaciones. Apartado nuevo en el Seguimiento de evaluaciones: «Sin
  proyecto» por ciudad (participantes + proyectos marcados) y «Eligieron hora y no se presentaron» por ciudad
  (integrantes con «No se presentó» guardado, o asistencia «No» del monitor sin evaluación guardada).
- Pruebas: carga por Excel con errores, documento repetido entre colecciones, marcar con hora (rechazado), carrera
  marcar/reservar, portal, conteos; foto «como producción» (sin marcas, todos los conteos idénticos a hoy).

### Paso 22 · Comentarios en proyectos (seguimiento)
- Colección nueva `comentarios {proyectoId, autor (usuario), autorNombre, rol, texto (máx. 1000, texto plano),
  creadoEn, editadoEn?, borradoEn?}`, índice `{proyectoId, creadoEn}`. El proyecto no se toca.
- Monitor: en su seguimiento (sus ciudades, como hoy) agrega comentarios; edita o borra solo los suyos (borrar = oculto
  con `borradoEn`). Admin y coordinación ven todos en la ficha del proyecto (Horarios y Tablero). Indicador «Con
  comentarios» en las listas (Horarios, Tablero y seguimiento del monitor).
- Los comentarios de salas de la evaluación (`evaluacion_monitor`) no cambian.
- Rutas con Zod `.strict()`, `exigir(permiso)` y `sameOrigin`. Pruebas de permisos (monitor de otra ciudad, editar ajeno).

### Paso 23 · El estudiante edita nombre y descripción
- Portal, después de entrar con su documento: «Editar nombre y descripción» (cualquiera de los integrantes).
- Nombre 3–120 caracteres, descripción 0–600; texto plano (sin etiquetas ni caracteres de control, espacios
  normalizados, NFC); tildes y ñ permitidas. No se puede si el proyecto tiene evaluación guardada.
- Escribe solo `nombre` y `descripcion` de ESE proyecto (acción manual del estudiante), con versión (`actualizadoEn`)
  para no pisar un cambio simultáneo del admin. changeLog `editar_proyecto` con antes y después, actor estudiante con
  documento enmascarado. En la ficha del admin, «Revertir» sobre esa entrada (solo si el valor actual sigue siendo el
  «después»), con changeLog.
- Límite de intentos: cuenta para el límite por documento (como consultar y reservar) y por IP.
- Riesgo: el portal solo pide el documento; quien conozca el documento de otro podría cambiarle el nombre. Mitigación:
  historial, revertir y límite. Pruebas: largos, tildes, evaluado, carrera con el admin, revertir.

### Paso 24 · Carga de los mentores (solo lectura)
- /admin/carga-mentores (admin y coordinación, solo lectura) y Excel: por mentor, día y hora, cuántos proyectos tiene,
  con las horas de 1 o 2 proyectos marcadas y las horas sueltas (con huecos entre ellas).
- Propuestas de redistribución (no se aplican): en cada hora, juntar proyectos para que cada mentor que califique tenga
  al menos 3. Primero, cambio de mentor en el MISMO bloque (el estudiante no cambia de hora); si no alcanza, otro bloque
  de la misma hora (marcado «cambia la hora del estudiante»). Nunca otro día (así se respetan los días por ciudad) y
  nunca proyectos evaluados. Cada propuesta: proyecto, de mentor/bloque → a mentor/bloque. El admin las aplica a mano
  en el Tablero.
- **Solo propuesta, sin implementar:** que una reserva nueva prefiera al mentor que ya tiene proyectos en esa hora.
  Cómo: antes del `findOneAndUpdate`, ordenar los mentores libres del bloque por proyectos en esa hora (más primero) y
  probarlos en ese orden. A favor: menos horas sueltas sin mover a nadie. En contra: una consulta más por reserva, y
  concentra la carga (un mentor puede quedar con 4 en todos los bloques de la hora). Se decide después del reporte.

### Respuestas del usuario (plan aprobado)
1. Sin «Máximo del día», el tope de la ciudad son sus «Cupos reservados».
2. Las ciudades que presentan por «Todas» no tienen tope: comparten los libres del día por orden de llegada.
3. El estudiante edita nombre y descripción también después del cierre de su ciudad, mientras no haya evaluación
   guardada y el portal esté encendido.
4. «Sin proyecto» con el campo nuevo y opcional en el proyecto.
5. Agregado al Paso 19: la tarjeta del modo en Reglas muestra, por día y ciudad, el tope, cuántos lleva y cuántos libres
   quedan, para revisarlo antes de encender.

### Pasos de la Fase 4
- [x] 19. Cupos por orden de llegada: interruptor, tope por ciudad y día, reserva atómica con candado, portal, Reglas.
- [x] 20. Orden de llegada en admin, monitor, bandeja, tablero y resumen (mover sobre el tope con advertencia).
- [x] 21. «Sin proyecto»: colección, carga por Excel y uno por uno, marcar/quitar, portal, estadísticas y apartado.
- [x] 22. Comentarios en proyectos (monitor escribe; admin y coordinación ven; indicador «Con comentarios»).
- [x] 23. El estudiante edita nombre y descripción (historial y revertir).
- [x] 24. Reporte de carga de los mentores con propuestas (solo lectura) y propuesta de preferencia de mentor.

### Pasos de mentor y roles (rama feature/mentor-y-roles)
- [x] 25. Cambiar mentor (mismo bloque) desde la ficha de Horarios, filtro por mentor y buscador en el Tablero.
- [x] 26. Un usuario con varios roles (`rolesExtra`, solo el admin los asigna, con changeLog).

## Fase 5 · Citaciones por calendario (rama feature/citaciones) — PLAN APROBADO
Producción activa; presentaciones desde el jueves 12. Mismas reglas de datos de la Fase 4: cero migraciones ni scripts
que escriban en producción; solo campos nuevos y opcionales y colecciones nuevas; foto «como producción» en cada paso.

**Google.** OAuth de la cuenta organizadora (jovenescreativos@) con refresh token y alcance mínimo `calendar.events`,
sobre su calendario principal. Sin librería nueva: `fetch` a la API REST (token + events). Variables solo en Vercel:
`GOOGLE_CAL_CLIENT_ID`, `GOOGLE_CAL_CLIENT_SECRET`, `GOOGLE_CAL_REFRESH_TOKEN` y la opcional `CITACIONES_CORREO_PRUEBA`
(si existe, TODA invitación va solo a ese correo: sirve para Preview y para la primera prueba). Sin variables, la
pantalla dice «Google Calendar no está conectado» y no envía nada. Nunca se registran tokens ni respuestas completas.
Eventos con `sendUpdates=all`, `guestsCanSeeOtherGuests=false`, `guestsCanInviteOthers=false`, `guestsCanModify=false`.

**Qué se cita** (hora COL, tal como pidió el usuario): participantes = un evento por proyecto en su bloque de 15 min,
solo sus integrantes; mentor = un evento por franja (bloques con proyecto unidos si hay ≤ 30 min entre ellos), solo el
mentor, sin datos de contacto de estudiantes; monitor = un evento por franja de los bloques con proyecto de SUS salas
(planSalas), con nombre, celular y correo de esos integrantes y el cierre de reprogramaciones. Sala, enlace y monitor de
cada bloque salen de planSalas + salasConfig; correo y celular del mentor, de `mentores` (si no, de su usuario).

**Registro.** Colección nueva `citaciones` (índice único `{tipo, clave, dia}`: proyecto o usuario/mentor): ids de los
eventos, `resumen` (hora, sala, enlace, mentor, monitor, invitados y proyectos; sin contactos) y su huella, estado
(`citado` · `externo` = marcado sin evento · `error` + mensaje · `cancelado`), fecha y quién. «Desactualizado» se calcula:
huella actual ≠ huella citada (y dice qué cambió). Colección nueva `citaciones_config` con el texto «Ten en cuenta».
Todo deja changeLog (acciones nuevas: `citar`, `actualizar_citacion`, `cancelar_citacion`, `marcar_citado`,
`texto_citacion`). Antes de llamar a Google se reserva la fila (`enviando`) y se guardan los ids del evento generados
por la app: un reintento o un doble clic actualiza el mismo evento, nunca crea otro.

### Pasos de la Fase 5
- [x] 27. Núcleo puro `src/lib/citaciones/`: armar los eventos de los tres tipos para un día (título, horario, invitados,
  descripción), franjas ≤ 30 min, resumen/huella y qué cambió. Celular del monitor: campo nuevo y opcional `celular` en
  `users`, editable en Usuarios → Editar (y columna opcional Celular en la carga por Excel). Pruebas puras de contenido,
  invitados y privacidad (contactos solo en el evento del monitor de esa sala).
- [x] 28. Cliente de Google con interfaz simulable (refresh del token, insertar / actualizar / cancelar, lotes con pausa
  y reintentos ante 403-rate/429/5xx, modo correo de prueba) y servicio con base: citar, actualizar, cancelar, marcar
  como citado (uno, o en bloque por día y pestaña), «citar pendientes» por lotes (uno falla → Error y sigue). Pruebas
  con cliente simulado: no duplicar, desactualizadas, errores de la API, marcar; foto «como producción».
- [x] 29. Rutas `/api/admin/citaciones/*` (solo admin, `exigir`, `sameOrigin`, Zod `.strict()`) y pantalla
  /admin/citaciones: día, pestañas Participantes / Mentores / Monitores, estado por fila, Vista previa, Citar, Actualizar,
  Cancelar, Marcar como citado, «Citar todos los pendientes de este día» (confirmación con cuántos y a quiénes; el
  navegador envía lotes de 10 y muestra el avance), «Marcar todos como citados (sin evento)» y editor de «Ten en cuenta».
  `docs/CITACIONES.md`: credenciales de Google, prueba con un proyecto y el correo propio, y publicación.

### Respuestas y ajustes del usuario (plan aprobado)
- Las 5 preguntas: sí a las respuestas por defecto. tocaunavida.org usa Google Workspace: consentimiento Interno.
- Con `CITACIONES_CORREO_PRUEBA`: aviso grande y fijo «MODO PRUEBA: todas las invitaciones van a <correo>» y el
  título de cada evento empieza con «[PRUEBA] ». En Preview la variable va siempre; en Production solo durante la
  primera prueba, y luego se borra (con Redeploy). Va en DESPLIEGUE.md y CITACIONES.md.
- Monitor sin celular: el evento del mentor dice «Celular: sin registrar» (no falla).

### Preguntas para el usuario (respondidas)
1. El celular del monitor no existe hoy en la app: ¿campo nuevo y opcional en Usuarios (editable a mano y por Excel)?
2. Franja = desde el primer bloque con proyecto hasta el fin del último (no la hora completa de la sala). ¿Así?
3. «Monitor a cargo» del participante = el monitor de su sala en esa hora (planSalas), no el monitor de inscripción.
4. Integrante sin correo: se cita a los demás con aviso; si nadie tiene correo, la fila queda «No se puede citar».
5. Lo marcado «como citado» (externo) no tiene evento en la app: si luego se desactualiza, «Actualizar» crea un evento
   nuevo y avisa que el anterior se cancela a mano en Google Calendar.

## Fase 6 · Vistas del monitor — PLAN APROBADO (dos entregas, ver abajo)
Producción activa. SOLO VISUAL: mismas rutas de escritura, permisos y datos; cero migraciones, colecciones, campos o
índices. Diseño: `docs/DISENO-VISTAS.md` (resumen de los prototipos 00–06).

**Se reutiliza:** `EvalShell` y `tema-evaluacion.css` (se agregan `--ev-m1..m7`, `--ev-hora` y lo que falte, con
oscuro), `BotonesContacto`, `estadoFila`/`estadoPersona`, `horaTxt`/`fechaLarga`, la lógica de `MonitorHoja` (mismos
fetch: GET/POST `/api/evaluacion/salas/[id]` y GET `…/cupos`), `listaSalas` (GET `/api/evaluacion/salas`),
`misProyectos` (GET `/api/monitor/mis-proyectos`), el alcance `scopeFilter` del seguimiento y `planSalas`.
**Se crea:** `src/components/evaluacion/vistas/` (chips, cabecera de bloque, resumen con barra, filtros web + hoja
inferior, buscador, estados, cajón de menú móvil, `formatoCelular`), `GestionPanel` (cuerpo de MonitorHoja sin el modal,
para usarlo en la fila), `MiCiudadPanel` + GET `/api/monitor/mi-ciudad`, `MonitoresPanel` + GET
`/api/evaluacion/monitores` y funciones puras (`src/lib/vistas/`: agrupar bloques, «sin margen», salas sin monitor, filtros).
**Mis proyectos (monitor):** une en el navegador las dos lecturas que ya existen (salas = asistencia/estado;
mis-proyectos = celulares, mentor, sala, hora UY) por id de proyecto. Coordinación/admin: solo mis-proyectos, como hoy.
`/monitor/salas` → `redirect("/monitor/proyectos")`.

**Riesgos:** (1) romper anotar/reprogramar/sugerir al pasar la ficha del modal a la fila → se extrae el cuerpo sin
tocar sus llamadas y se prueba igual que hoy; (2) el refresco pisando lo escrito → se pausa mientras haya un panel
abierto y se avisa al cerrar con cambios; (3) mezcla de dos lecturas que no coinciden un instante → la fila sale de
salas y lo que falte de mis-proyectos queda «Sin registrar»; (4) privacidad de Mi ciudad y Monitores → la ruta arma un
objeto nuevo campo por campo (nunca un spread) y una prueba revisa que no salgan notas, documento ni correo; (5) el
cambio de EvalShell afecta al mentor → el cajón móvil solo se activa en estas vistas.

**Lo que el prototipo no define (propuesta):**
- Corte web/móvil: 900 px (como el portal). Bloque = horas seguidas de la misma sala y mentor («8:00 a 10:00 a. m.»).
- «Ahora» = el proyecto cuyo bloque de 15 min contiene la hora actual; «Siguiente» = el próximo de ese día. «Ir a
  ahora» abre el día de hoy, quita filtros que lo oculten y baja hasta ese proyecto (o el siguiente); sin
  presentaciones hoy, se desactiva con «Hoy no tienes presentaciones».
- Salas sin proyectos (hoy se ven con un día elegido): se ocultan, como en el prototipo.
- Chip de la fila en Mis proyectos: el de asistencia del prototipo (Pendiente / Se presentó / No se presentó; con
  evaluación guardada, «Evaluado»), y se conservan como chips extra los de hoy: «Sin motivo»/«Motivo: …», «Destacado»
  y «Cambio sugerido». El resultado (Excelente, Aprobado…) queda en el panel Gestionar. ← pregunta 1
- Mi ciudad: «No se presentó» = el mentor lo marcó o el monitor marcó «No» sin evaluación guardada (como `estadoFila`).
  Sin hora: no aparecen (respuesta 2).
- Monitores: color del monitor por orden alfabético (m1..m7, se repite). «Sin margen» = último proyecto de un bloque a
  las :45 y el siguiente bloque del mismo monitor, en otra sala, empieza a la hora en punto siguiente. «Ver como» se
  recuerda en el navegador. ← pregunta 3 (botones del plan de salas)

**Respuestas del usuario (plan aprobado):**
1. Sí: chip de asistencia del prototipo + motivo, Destacado y Cambio sugerido; el resultado solo dentro de Gestionar.
2. CORRECCIÓN: los proyectos SIN HORA NO aparecen en Mi ciudad (ni bloque, ni copiar lista, ni chip, filtro o tarjeta
   «Sin hora»). Tarjetas y barra cuentan solo proyectos con día y hora; la ruta no los devuelve; siguen fuera los «Sin
   proyecto». Sin ninguno: «No hay proyectos con esos filtros». Quién no ha elegido hora sigue en el Panel.
3. «Descargar plan de salas» y «Cambiar en Salas» solo los ve el admin. No se cambia ningún permiso.
Lo demás, como se propuso (900 px, Ahora/Siguiente, ocultar salas vacías, color por monitor, «Ver como» recordado).

**Dos entregas.** A (primero, rama `feature/vistas-nuevas` desde `feature/vistas-monitor`): Pasos 2 (solo lo que
necesitan 4 y 5), 4 y 5, solo aditivo: no se tocan MonitorHoja, la ficha, Mis salas, Mis proyectos ni ningún
componente, ruta o estilo usado hoy (variables nuevas del tema: solo agregar). Menú: monitor = Mis salas · Mis proyectos
· Mi ciudad · Panel; coordinación y admin = las actuales + «Monitores»; el cajón ☰ móvil solo en Mi ciudad y Monitores.
Cierre de A: permisos, privacidad, «como producción», npm test, typecheck, build y solo las pruebas con base nuevas y de
permisos (una a la vez). B (después, rama `feature/vistas-monitor-fusion` desde main ya con A publicada): Pasos 3 y 6,
con una prueba previa que fije las llamadas de asistencia, motivo, observación, reprogramar y sugerir.

### Pasos de la Fase 6
- [x] 1. Lectura de prototipos, `docs/DISENO-VISTAS.md` y este plan.
- [x] 2. (A) Componentes nuevos en `evaluacion/vistas/`, variables nuevas del tema y `formatoCelular`, con pruebas puras.
- [x] 4. (A) «Mi ciudad»: ruta GET de solo lectura + pantalla; prueba de privacidad. revisor-seguridad.
- [x] 5. (A) «Monitores»: ruta GET + pantalla (cuadrícula, por monitor, por sala, panel). revisor-seguridad.
- [ ] 3. (B) «Mis proyectos» fusionada con Gestionar en la fila; `/monitor/salas` redirige; menú sin «Mis salas».
- [ ] 6. (B) Cierre: menú final, pruebas, batería completa, build, revisores, guía de prueba.

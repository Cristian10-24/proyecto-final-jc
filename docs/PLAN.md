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

**Reglas de la Fase 2.** Sin Google Apps Script; mismo diseño del prototipo con `tokens.css`; refresco periódico (sin websockets); un paso a la vez.

### Pasos de la Fase 2
- [x] 8. Leer el prototipo una vez y crear `docs/EVALUACION.md` (máx. 100 líneas). Después no volver a abrir index.html salvo para una pantalla concreta.
- [x] 9. Importador: Ruta, Salas, Monitores y Disponibilidad monitores; asignación automática de salas y de monitores (lo importado manda), plan de salas en el admin con salas sin monitor marcadas y cambio de monitor (changeLog), y descarga del Plan de salas.
- [ ] 10. Módulo de evaluación: `src/lib/evaluacion/`, `/api/evaluacion/*`, colecciones `evaluacion_*`. Funciones puras con pruebas (incluida `calc()`). Un mentor solo evalúa sus proyectos. Borrador automático. Todo deja changeLog.
- [ ] 11. Vista del MENTOR ("Mis evaluaciones"), igual al prototipo: agenda del día por bloques de 15 min, filtros por estado y pantalla de evaluar; en cada hora, su SALA y ENLACE con "Abrir sala". Coordinación y admin pueden ver la vista de cualquier mentor.
- [ ] 12. Vista del MONITOR por horario: sus salas asignadas por día y hora (estudiantes de cualquier ciudad) con ENLACE, mentor y proyectos con contacto completo. Pruebas de permisos: solo los de sus salas. Por integrante: se presentó sí/no, motivo de inasistencia, comentarios, reprogramar en su ciudad o sugerir cambio especial.
- [ ] 13. Admin: bandeja de cambios sugeridos (aprobar o rechazar) en /admin/horarios.
- [ ] 14. Seguimiento general (coordinación y admin): todas las tablas del prototipo y criterios editables, sin CSV (descarga en Excel por confirmar).
- [ ] 15. Usuarios: integrar la gestión del prototipo (agregar, cargar por Excel Nombre/Correo/Rol, revisión de nombres) con los usuarios y roles actuales. Sin login por correo y código.

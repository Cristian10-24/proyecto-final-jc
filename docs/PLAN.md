# Plan · Proyecto final JC 2026

Meta: Fase 1 en producción antes de que empiecen las presentaciones, para que los estudiantes elijan a tiempo.

## Reglas confirmadas
- Bloques de 15 min; cada mentor califica 4 proyectos por hora. Capacidad de un bloque = número de mentores de esa hora.
- El estudiante elige día y bloque exacto, sin ver mentores ni conteos. El sistema asigna el mentor (sala).
- Monitor: 1 por sala (mentor-hora). El admin lo asigna después.
- Jueves 12: 80 cupos reservados para Cali y máximo 40 para Cartagena. Viernes 13: lo que falte de Cartagena; Barranquilla se abre en la fecha y hora que configure el admin. Cali no puede el 13.
- Uruguay participa: se muestra la hora COL y la de UY.
- Límite de intentos: por documento (bajo) y por IP (solo fallos, con un tope alto).
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
- [ ] 1. Plantillas de Excel (proyectos y mentores con disponibilidad) e importador con vista previa y errores por fila; genera los asientos etiquetados por ciudad. Verificación: los totales por día coinciden con la pestaña "Proyectos por franja".
- [ ] 2. Funciones puras de agenda: días por ciudad, horas disponibles y reparto proporcional por hora. Pruebas con el caso 80 Cali / 40 Cartagena.
- [ ] 3. Ruta de reserva atómica y prueba de concurrencia con 300 simultáneos (pool de 5, sin doble asignación).
- [ ] 3b. Sistema visual (una sola vez): leer solo los `.dc.html` de `docs/diseno/`; crear `src/app/tokens.css` (colores, Outfit y JetBrains Mono, radios, sombras, espaciados), `docs/DISENO.md` (máx. 80 líneas: pantallas y estados por rol, textos de botones y mensajes, componentes repetidos) y copiar los logos a `public/`. Desde aquí, portal, admin y monitor usan SOLO `docs/DISENO.md` y `tokens.css`; si un prototipo contradice el PLAN, gana el PLAN (anotar en DECISIONES). Móvil primero: estudiante en 390 px, admin en 1280 px.
- [ ] 4. Portal del estudiante, móvil primero: documento → datos y pareja (solo lectura) → día → hora → confirmar → "tu horario", con todos los estados de error.
- [ ] 5. Admin: liberar o cambiar la hora de un proyecto y reetiquetar asientos libres de un día; todo con registro en changeLog.
- [ ] 6. Panel del monitor: quién eligió y quién falta, copiar pendientes para WhatsApp y exportar el cronograma a Excel.
- [ ] 7. Preparar el despliegue: checklist en `docs/DESPLIEGUE.md` con lo que el usuario debe crear (GitHub, Atlas, Vercel, variables). Sin publicar nada.

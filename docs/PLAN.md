# Plan y decisiones · Proyecto final JC 2026

Meta: Fase 1 en producción el **8 de noviembre de 2026**, para que los estudiantes elijan antes de que empiecen las presentaciones el 12.

## Reglas confirmadas (2026-11-02)
- Bloques de 15 min; cada mentor califica 4 proyectos por hora. Capacidad de un bloque = número de mentores de esa hora.
- El estudiante elige día y bloque exacto, sin ver mentores ni conteos. El sistema asigna el mentor (sala).
- Monitor: 1 por sala (mentor-hora). El admin lo asigna después.
- Jueves 12: 80 cupos reservados para Cali y máximo 40 para Cartagena. Viernes 13: lo que falte de Cartagena; Barranquilla se abre en la fecha y hora que configure el admin. Cali no puede el 13.
- Uruguay participa: se muestra la hora COL y la de UY.
- Límite de intentos: por documento (bajo) y por IP (solo fallos, con un tope alto).
- Fase 1 incluye una acción de admin para liberar o cambiar la hora de un proyecto, con registro en changeLog.

## Decisión: cupos por ciudad con asientos etiquetados (diseño b)
Cada asiento (bloque × mentor) se crea al importar con la lista de ciudades que pueden tomarlo, por ejemplo `["Cali"]`, `["Cartagena"]` o `["Cartagena", "Barranquilla"]`.
Para reservar se hace un solo `findOneAndUpdate({inicio, proyectoId: null, ciudades: ciudad}, {$set: {proyectoId}})`. Un índice único parcial sobre `proyectoId` impide que un proyecto tenga dos asientos.
La apertura por fecha (Barranquilla el 13) se revisa antes de reservar, contra la configuración del día.

Comparado con la colección `cuotas` y una transacción (diseño a):
- **a)** El admin fija números por día ("Cali 80, Cartagena máx. 40"). El estudiante puede tomar cualquier hora libre del día, pero hay contadores que deben cuadrar cuando se libera o se cambia una hora.
- **b)** El admin ve y mueve asientos concretos: cada hora tiene su parte para cada ciudad. Liberar es vaciar el asiento y no hay contadores que descuadrar. Si una ciudad no usa sus cupos, el admin reetiqueta los libres con un solo cambio.
- Lo que cuesta b): una ciudad puede quedarse sin cupo en una hora aunque el día tenga espacio. Por eso el reparto entre ciudades se hace **por hora y en proporción**, no en bloque.

Solo el cambio de hora hecho por el admin usa una transacción (libera el asiento viejo y toma el nuevo). Es raro y sin carga.

## Infraestructura
- Repositorio, proyecto de Vercel: `proyecto-final-jc`. Base de Atlas: `proyecto_final_jc`, con un usuario readWrite solo sobre ella.
- Vercel en `iad1` (`vercel.json`) y Atlas en AWS us-east-1 (N. Virginia): misma región.
- Un solo cliente de Mongo en caché global con `maxPoolSize` 5 (`MONGODB_MAX_POOL`). Hay pruebas en `tests/db.db.test.ts`.

## Plan de la Fase 1
| Día | Entrega | Cómo se verifica |
|---|---|---|
| 1 · 3 nov | Base copiada de validation-jc, login, usuarios, límites, base local en replica set, despliegue vacío | `npm test`, `npm run test:db`, build; `/login` 200 en Vercel |
| 2 · 4 nov | Plantillas de Excel (proyectos, mentores) e importador con vista previa; genera salas y asientos etiquetados | Los totales por día coinciden con la pestaña "Proyectos por franja" |
| 3 · 5 nov | Funciones puras: días por ciudad, reparto proporcional, aperturas, horas disponibles | Pruebas: 80 Cali / 40 Cartagena / Barranquilla según apertura |
| 4 · 5–6 nov | Reserva atómica y acción de admin para liberar o cambiar la hora (changeLog) | Prueba de concurrencia: 300 reservas a la vez con pool de 5, sin doble asignación |
| 5 · 6 nov | Portal del estudiante (documento → datos → día → bloque → confirmar → tu horario) | Prueba en celular; límite por documento |
| 6 · 7 nov | Seguimiento del monitor (eligió / falta, copiar a WhatsApp), resumen y Excel del cronograma | Cada rol ve solo lo suyo |
| 7 · 8 nov | Revisión de secretos, carga de datos reales en Atlas, prueba con 2–3 estudiantes, apertura | Lista de la sección 15.4 de la guía de validation-jc |

# Decisiones de diseño (una línea cada una)

- Cupos por ciudad con asientos etiquetados (diseño b), no colección `cuotas` con contadores (diseño a). Ver `docs/PLAN.md`.
- Referencias rescatadas de PROYECTOFINALJC en `docs/referencia/` (ADR 0005, hora.js, datos.js; el Excel no se versiona).
- Libro de mentores = mismo formato del Excel real (hojas Mentores y Horarios, cualquier marca = disponible) + hoja nueva Cupos (Día, Ciudad, Cupos, Sobrante, Abre).
- Cupos: exacto (máximo) para cada ciudad; la ciudad marcada Sobrante (una por día) tiene un mínimo y se queda con lo que sobre. Asientos sin ciudad solo si el día no tiene ciudad de Sobrante.
- Ciudad "Todas" en Cupos = asientos libres para cualquier ciudad que aún no tenga su clausura ese día (del martes 17 en adelante). Una ciudad nunca presenta el día de su clausura ni después (ADR 0005).
- Reparto proporcional por puesto en orden de hora (Bresenham): cada hora recibe su parte de cada ciudad y los totales son exactos.
- Identidad del mentor = encabezado de su columna en Horarios; la hoja Mentores solo agrega correo y celular (aviso si falta).
- Reimportar mentores sincroniza asientos en una transacción: reservados se conservan, libres se reetiquetan o borran; si una hora reservada desaparece, es conflicto y no se aplica nada. Reimportar proyectos actualiza por código y no borra.
- La fuente de verdad de la disponibilidad es la hoja Horarios; "Proyectos por franja" ya no es verificación obligatoria y `verificar:franjas` solo informa diferencias.

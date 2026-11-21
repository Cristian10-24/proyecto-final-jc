# Inventario del Seguimiento general (hoy) y dónde queda en v2

Fuente de hoy: `src/components/evaluacion/SeguimientoGeneral.tsx`, `src/lib/evaluacion/resultados.ts` (`seguimiento`,
`cuposDesdeHoy`, `noSePresentaronPorCiudad`, `excelResultados`), `src/lib/evaluacion/tablero.ts` (`tablero`) y
GET `/api/evaluacion/seguimiento` (`ver_evaluaciones`, filtro `dia` y `ciudad`). Diseño nuevo: DISENO-SEGUIMIENTO.md.

## Lo que hoy se ve → dónde queda

| Hoy | v2 |
|---|---|
| Título «Seguimiento general» + «Se actualiza cada minuto mientras los mentores evalúan.» | Cabecera con punto vivo «Se actualiza cada minuto · hace N min · Hora COL» |
| «Descargar resultados (Excel)» (`descargar_excel`, con día y ciudad) | Mismo botón y misma ruta, mismos parámetros (día y ciudad): el Excel no cambia |
| Selector de día («Todos los días», «Hoy, …», «Sin fecha») | Barra de filtros · Día (+ «Hoy»). «Sin fecha» pasa al bloque Sin agendar |
| Selector de ciudad | Barra de filtros · Ciudad (aplica también a Sin agendar) |
| Refresco cada minuto; carga, error y «Reintentar» | Igual (esqueletos y error) |
| KPI «N / N estudiantes evaluados» | Resumen · KPI 1 (+ sparkline y otro modo) |
| KPI «proyectos registrados» | Resumen · KPI 2 «Proyectos agendados» / «Estudiantes agendados» |
| KPI «de avance» · «% de los que se presentaron fueron excelentes» · «resultados excelentes» · «no se presentaron» · «proyectos destacados» | Resumen · KPI 3 a 7 |
| «Resultados» (barra apilada + leyenda con números) | Resumen · waffle + leyenda con N y %; tabla «Ver como tabla» |
| «¿Qué funcionó en la demo?» (7 barras, rojo bajo 60 %) | Resultados · radar + barras ordenadas; tabla |
| «Nivel de conocimiento por tema» (promedio, n, meta 2) | Resultados · balas por tema; tabla (Evaluados, Promedio, Meta) |
| «Por ruta» (Estudiantes, Evaluados, No se presentaron, % excelentes, Nivel) | Resultados · dumbbell Ruta; tabla con las mismas columnas |
| «Por ciudad» (mismas columnas) | Resultados · burbujas + tabla por ciudad (suma Asistencia) |
| «Individual o en pareja» (tabla) | Resultados · dumbbell Modalidad; tabla con las mismas columnas |
| Texto de parejas (ambos / uno / ninguno + consejo) | Resultados · barra 100 % + el mismo texto; tabla |
| «Cupos para reprogramar»: texto ofrecidos/ocupados/libres desde ahora; tablas por día y por mentor | Resumen · medidor de hoy por hora; «Ver como tabla» suma «Desde ahora, por día» y «Cupos libres por mentor» (no se pierden) |
| «Inasistencias y monitoreo»: texto total / con motivo / sin motivo | Inasistencias · aviso de arriba |
| Tabla «Motivo de inasistencia (incluye reprogramados)» | Inasistencias · barras de motivos (+ «Sin motivo todavía»); tabla |
| Tabla por monitor (Estudiantes, No se presentaron, Con motivo, Sin motivo) | Inasistencias · barras apiladas por monitor; tabla igual |
| «Sin proyecto y no se presentaron» · texto explicativo | Inasistencias: «No se presentaron» explica arriba; «Sin proyecto» dentro de Sin agendar |
| Tabla «Sin proyecto» por ciudad (Participantes, Proyectos marcados, Estudiantes) | Inasistencias › Sin agendar › «2. Sin proyecto» (igual) |
| Tabla «Eligieron hora y no se presentaron» por ciudad | Inasistencias · barras por ciudad (N y %); tabla |
| «Proyectos destacados» (Estudiante, Emprendimiento, Mentor, Resultado, Lo que hizo muy bien) | Resultados · lista con buscador y orden |
| «Resultados excelentes» (Estudiante, Emprendimiento, Mentor, Funciona, Nivel) | Resultados · lista |
| «Avance por día» (Fecha, Programados, Evaluados, No se presentaron, Avance) | Resumen · combo; tabla (+ Asistencia, Acumulado). La fila «Sin fecha» pasa a Sin agendar |
| «Avance por mentor» + «Si un mentor tiene promedios muy distintos…» | Mentores y monitores · dispersión + aviso + lista. «Sin asignar» pasa a Sin agendar |
| «Criterios de resultado» (dos campos, Guardar, mensaje, solo `editar_criterios` edita) | Criterios · igual + vista previa y «Deshacer cambios». Misma ruta POST |

Nuevo sin equivalente hoy (solo lectura): Ruta, Modalidad, Buscar, «Contar por», Reporte del día, Ciudad × Tema,
lista de inasistencias, lista Sin agendar, «Avance por monitor», ⚠ de mentor distinto, cupos de hoy por hora.

## No cabe sin quitar o sin dato nuevo (no detiene: se resuelve sin quitar nada)
- «N reprogramados» por motivo y chip «Reprogramado»: la base no guarda si una inasistencia se reprogramó (solo que el
  motivo sigue). No se muestra ese número; se conserva el texto de hoy «incluye reprogramados». Sin campos nuevos.
- Monitores asignados a mano y «Sin monitor» de un bloque agendado: siguen contando (agendaron); «Sin monitor» de Sin
  agendar es otra cosa (el proyecto no tiene sala).

## Plan
- Reutilizar: `filasEstudiantes` (ya trae día, ciudad, ruta, pareja, mentor, monitor efectivo, evaluación y motivo),
  `calc`, `criterios`, `cuposDesdeHoy`, `sinProyectoPorCiudad`, EvalShell, `.ev-*` y la ruta POST de criterios.
- Funciones puras nuevas (`src/lib/evaluacion/seguimientoV2.ts`, con pruebas): unidades por estudiante y por proyecto
  (reglas de DECISIONES), conteos, por día acumulado, Ciudad × Tema, grupos, mentores (distancia a la mediana),
  monitores, inasistencias, Sin agendar, reporte del día. `tablero()` se queda para el Excel (no cambia).
- Lecturas ampliadas (mismo permiso `ver_evaluaciones`, cálculo en el servidor):
  GET `/api/evaluacion/seguimiento` acepta además `ruta`, `modalidad` y `q` (Zod `.strict()`, q ≤ 60) y devuelve las
  dos vistas (estudiantes y proyectos) ya agregadas + listas acotadas a nombres (sin documento, correo ni celular);
  GET `/api/evaluacion/seguimiento/reporte?dia=` (todas las ciudades, por estudiantes). Cupos: se agrega «hoy por hora».
- Tamaño: hoy la respuesta lleva todas las filas de destacados y excelentes. v2 manda agregados por modo (unos KB) y
  listas con solo los campos que se ven; se mide con la demo (objetivo < 150 KB sin comprimir) y se anota.
- Gráficos: hoy el proyecto NO usa librería de gráficos (barras CSS). v2: SVG propio en componentes React, como el
  prototipo; la imagen del reporte con canvas del navegador. Cero dependencias nuevas.
- Riesgos: (1) cambia el total (agendados) frente a hoy: lo explican el aviso y el bloque Sin agendar; (2) costo del
  refresco: una sola pasada sobre las filas, sin consultas extra por modo; (3) la imagen depende de la fuente Inter
  cargada (se espera `document.fonts`); (4) definiciones por proyecto distintas al Excel (que sigue por estudiante).

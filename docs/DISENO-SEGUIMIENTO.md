# Seguimiento general v2 (resumen de los prototipos)

Fuente: `docs/diseno/seguimiento/` (01 escritorio, 02 reporte, 03 móvil, 04 reporte móvil; un mismo HTML con otra vista
inicial y datos inventados), leídos una vez. Textos entre «» = literales. La barra gris de arriba (Tema, Contar por, Día,
«Datos inventados») es solo del prototipo: NO se implementa. En lo visual gana el prototipo; en lo funcional, la app.

## Estructura (EvalShell, pestaña «Seguimiento general»)
- Cabecera: «Seguimiento general» + punto vivo «Se actualiza cada minuto · hace N min · Hora COL»; a la derecha
  «Descargar resultados (Excel)» (ícono de descarga; solo con `descargar_excel`).
- Barra de filtros (escritorio, pegajosa): Día («Todos los días», «Hoy (21 nov)», cada día «Jueves 12 nov · hoy»),
  Ciudad, Ruta («Todas las rutas», «Básica», «Avanzada»), Modalidad («Individual y en pareja», «Individual», «En pareja»),
  Buscar («Estudiante o proyecto»), «Limpiar filtros (N)» y «Contar por» [Estudiantes | Proyectos].
- Sub-navegación (seis): «Resumen», «Reporte del día», «Resultados», «Inasistencias», «Mentores y monitores»,
  «Criterios». Escritorio: segmentado; móvil: chips con scroll horizontal.
- Línea de contexto (no en Reporte ni Criterios): «**N estudiantes agendados** (N proyectos) · Todos los días · Todas
  las ciudades [· Ruta básica · En pareja · «texto»]».
- En «Reporte del día» los filtros y «Contar por» quedan deshabilitados con candado: «Estos filtros no aplican al
  reporte del día. El reporte es oficial: siempre incluye todas las ciudades y cuenta estudiantes. Solo cambia con su
  selector de día.»

## Componente tarjeta (todas las sub-secciones)
- Título = la conclusión con el número (p. ej. «El 38 % de los que se presentaron fue excelente»), subtítulo gris con
  qué se mide, botón «Ver como tabla» / «Ver gráfico» (aria-pressed). Cada gráfico tiene su tabla equivalente.
- Tooltips `data-tip` en cada marca; SVG en línea, sin librerías; colores: azul `--c-az` (evaluados, ok), naranja
  `--c-nar` (excelente, alerta suave, % asistencia), rojo `--c-bad` (no se presentó, bajo 60 %), grises.
- Listas largas: buscador propio, columnas ordenables (▲▼↕, aria-sort), «Mostrando N de M», «Ver más» (+10) y
  «Ver menos»; en móvil tarjetas + selector «Ordenar por». Sin resultados: «No hay resultados con esa búsqueda.»

## 1 · Resumen
- Siete KPI con sparkline del acumulado por día y delta («+N hoy», «+N pts hoy»; un día elegido: «Solo 18 nov»; hoy:
  «Hoy, en curso»); línea secundaria con el otro modo («N / N proyectos»):
  «N / N estudiantes evaluados» (azul) · «Estudiantes agendados» / «Proyectos agendados» · «N % de avance» ·
  «N % de los que se presentaron fueron excelentes» · «resultados excelentes» · «no se presentaron» (con «!») ·
  «estudiantes destacados» / «proyectos destacados» (naranja).
- Waffle 10×10 «El N % de los que se presentaron fue excelente» · «Cada cuadro = 1 % de N estudiantes agendados · N
  pendientes por evaluar»; leyenda Excelente (•), Aprobado, Incompleto, No se presentó (×), Pendiente (punteado).
- Medidor semicircular «Quedan N cupos libres hoy para reprogramar» · «Desde ahora (h) hasta las 5:00 p. m. · todas las
  ciudades · Hora COL»; tabla por hora (Ocupados, Libres).
- Combo ancho «Avance acumulado: N %. Hoy van N de N estudiantes»: columnas Programados (gris) y Evaluados (azul) por día,
  línea naranja % asistencia, línea punteada avance acumulado; pie «Los N estudiantes sin fecha no cuentan aquí. Están
  en Sin agendar.» (enlace). Tabla: Fecha, Programados, Evaluados, No se presentaron, Avance, Asistencia, Acumulado.
- Aviso final: «N estudiantes (N proyectos) aún no tienen día ni hora. No cuentan en las estadísticas.» + «Ver sin
  agendar» (salta a Inasistencias › #sin-agendar).

## 2 · Reporte del día (oficial)
- «Día del reporte» (del más reciente al primero, «(hoy, en curso)», «Todos los días (acumulado)») y «Descargar imagen»
  (PNG 16:9, 3840 × 2160, canvas del navegador) · «Imagen 16:9 (3840 × 2160 px) · siempre con todas las ciudades y
  contando estudiantes». Hoy: «Hoy está en curso: el reporte cambia a medida que los mentores guardan evaluaciones.»
- Lienzo 2000×1125 = el reporte que ya se envía: «Jóvenes creaTIvos», «Reporte de evaluación», fecha y «Siete ciudades»;
  4 tarjetas «N / N estudiantes evaluados (N %)», «N / N proyectos presentados», «N proyectos excelentes (N
  estudiantes) y N aprobados», «N proyectos destacados (N % de los presentados)»; «Proyectos presentados por ciudad»
  (barras presentados / no / pendientes, «N / N · N estudiantes», «No presentados: N (N individuales y N en pareja)»,
  «Pendientes por evaluar: N»); dona «Asistencia de estudiantes» (N asistieron, N no asistieron, «N de Ciudad»…).
- Móvil (04): el mismo contenido apilado y debajo «Así sale la imagen descargada (16:9)».

## 3 · Resultados
- Radar de 7 criterios + barras ordenadas ««X» y «Y» son lo que menos funciona en la demo» (línea roja = 60 %; móvil:
  solo barras). Balas por tema «X es el tema más flojo: N de promedio» (meta 2, «✓ meta» / «▼ bajo la meta»).
- Mapa de calor Ciudad × Tema «Ciudad tiene el nivel más bajo en Tema (N)» (▼ bajo 2; escala naranja→azul).
- Burbujas por ciudad (x = % asistencia, y = nivel, tamaño = agendados, color = % excelentes, línea «Meta de nivel: 2»)
  + tabla con mini barras: Ciudad, Agendados, Evaluados, No se presentaron, Asistencia, % excelentes, Nivel prom.
  (móvil: tarjetas por ciudad).
- Dumbbell Ruta (Básica vs Avanzada) y Modalidad (Individual vs En pareja): % asistencia, % avance, % excelentes,
  Funciona prom., Nivel prom.; títulos «La ruta avanzada tiene N pts más de excelentes» / «Individual tiene …».
- Barra 100 % de parejas «En N de N parejas evaluadas los dos fueron excelentes» (siempre por estudiantes) + texto.
- Listas «N estudiantes en proyectos destacados» (Estudiante, Emprendimiento, Mentor, Resultado, Lo que hizo muy bien)
  y «N resultados excelentes» («Funciona N % o más y nivel N o más»).

## 4 · Inasistencias
- Aviso: «N estudiantes no se presentaron: N con motivo registrado por su monitor y N sin motivo todavía. Eligieron
  hora, así que sí cuentan en las estadísticas.»
- Barras de motivos (+ «Sin motivo todavía», naranja); barras por ciudad «Eligieron hora y no se presentaron · por
  ciudad» (N y %); barras apiladas por monitor (con / sin motivo); lista de inasistencias (Estudiante + proyecto, Ciudad,
  Día y hora (COL), Monitor, Motivo / chip «Sin motivo»).
- Bloque «Sin agendar» (#sin-agendar) con la marca «No cuentan en las estadísticas»: «Aquí solo aplican los filtros de
  ciudad, ruta, modalidad y búsqueda; el día no aplica porque no tienen fecha.» 1. «Sin día ni hora: N proyectos · N
  estudiantes» (tabla por ciudad con Sin monitor + «Ver los N proyectos» plegable con lista); 2. «Sin proyecto: N
  participantes · N proyectos marcados» (tabla por ciudad, la de hoy).

## 5 · Mentores y monitores
- Dispersión de mentores (x = funciona prom., y = nivel prom., medianas punteadas, ⚠ el que califica muy distinto,
  solo con ≥ 3 evaluados) + aviso «Si un mentor tiene promedios muy distintos al resto, vale la pena revisar cómo está
  calificando.» (móvil: lista ordenada de más distinto a más parecido).
- Listas «Avance por mentor» (Asignados, Evaluados, Avance con mini barra, Funciona prom., Nivel prom., chip «⚠
  Revisar») y «Avance por monitor» (Ciudad, A cargo, Avance, No se presentaron, Sin motivo).

## 6 · Criterios
- «Criterios de resultado» · «Aplican a todo el seguimiento y al reporte del día»; dos campos; vista previa «Con estos
  mínimos quedarían N estudiantes excelentes (hoy son N)»; «Guardar criterios» y «Deshacer cambios».

## Celular (03 · 04, < 760 px)
- Barra negra compacta con ☰ (cajón). Barra fija: «Filtros (N)» (hoja inferior con los mismos campos, «Limpiar» y
  «Aplicar»), «Contar por» y los chips de sub-sección. Tablas → tarjetas; radar y dispersión → listas; combo y
  dumbbell más estrechos. Reporte: contenido apilado + vista previa de la imagen.

## Estados
- Cargando: esqueletos. Error: «No se pudo cargar el seguimiento» + «Reintentar» (como hoy). Sin datos con filtros:
  «Sin evaluaciones con estos filtros.» / «Con estos filtros solo hay un grupo; mira la tabla.». Toast al guardar.

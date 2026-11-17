# Vistas del mentor (resumen de los prototipos)

Fuente: `docs/diseno/vistas-mentores/` (01–05 e index, datos inventados), leídos una vez. Textos entre comillas =
literales. Solo visual: en lo funcional gana la app (ver «Diferencias» y DECISIONES). 01 y 02 son el mismo archivo con
la variante mentor o coordinación; 04 también trae las dos variantes. Sistema visual = el de las vistas del monitor
(`--ev-*`, Lexend en títulos y horas, táctil ≥ 44 px, foco naranja de 3 px, radios 14/9/999).

## Barra superior
- Web: la de las vistas nuevas (ShellVistas): logos, pestañas, luna/sol, primer nombre y «Salir» con ícono. Mentor:
  «Mis evaluaciones». Coordinación/admin en el prototipo: «Panel · Evaluaciones · Monitores» y «Mónica · Coordinación».
- Móvil: barra negra compacta (logo 40 px) con ☰ → cajón con nombre, rol («Mentor», «Coordinación»), enlaces (el activo
  resaltado), «Cambiar a modo oscuro» y «Salir» con ícono al final.

## 01 · Mis evaluaciones (mentor, web)
- «Hola, Julián» / «Tus estudiantes de la jornada. Toca «Evaluar» cuando empiece cada presentación. Hora Colombia (COL).»
  (El prototipo suma «Son las 7:50 p. m.» e «Ir a ahora»: NO van, ver Diferencias.)
- Tarjeta resumen: «**N estudiantes** · N evaluados · N no se presentaron · N pendientes» a la izquierda, «N % listo» a la
  derecha; barra verde (evaluados) + roja (no se presentaron). Se calcula sobre lo filtrado.
- Tarjeta de filtros (grid auto-fit 170 px): Fecha («Todas las fechas», «Hoy, jueves 12…», días), Estado («Todos los
  estados», «Pendientes», «Evaluados», «No se presentó», «Destacados»), Monitor («Todos los monitores», nombres) y
  buscador a 2 columnas «Buscar por participante o emprendimiento».
- Por día: h2 17 px «Jueves 12 de noviembre» + chip naranja «Hoy». Por bloque (`ev-grupo`, radio 14):
  - Cabecera gris (grid 0,9fr | 1,4fr | auto): h3 «Sala 2 · 7:00 a 8:00 p. m.» y gris «4 proyectos»; en el centro
    «Monitor a cargo» (gris) y «**Nombre** · +57 310 445 6789» con Llamar/WhatsApp en columna de 96 px; a la derecha
    «Abrir sala» negro (ícono de cámara).
  - Encabezado de tabla: «(Acción) · Hora · Participantes y proyecto · Resultado» (136 · 112 · 1fr · 240 px).
  - Fila: botón «Evaluar» (naranja, si hay algún pendiente) o «Revisar» (borde), con ícono de check; hora Lexend
    16 px + chip azul «9:00 p. m. UY» (Colonia/Paysandú); nombres en negrita (pareja «A y B»), gris «Emprendimiento ·
    Ruta básica · Ciudad[ · Uruguay][ · En pareja]»; Resultado: un chip por integrante («Laura: Pendiente» en pareja) y
    «★ Destacado» naranja. aria-label «Evaluar a …», «Revisar evaluación de …».
  - Chips: Aprobado azul (info), Excelente verde, Incompleto amarillo (mid), Pendiente gris, No se presentó rojo.
  - Fondo de fila: verde 7 % si nadie pendiente y no todos ausentes; rojo 6 % si todos no se presentaron.
- Vacío: «No hay estudiantes con esos filtros» / «Prueba con otro nombre o emprendimiento, o cambia la fecha, el estado
  o el monitor.» [Limpiar filtros].

## 02 · Evaluaciones (coordinación y admin, web)
- «Evaluaciones» / «Todas las evaluaciones, por día y sala. Hora Colombia (COL).»
- Filtros: Fecha, Estado, Ciudad («Todas las ciudades»), Mentor («Todos los mentores»), Monitor, buscador.
- Cabecera de bloque suma «4 proyectos · Mentor: **Nombre**». Botón «Ver» (borde) en todas las filas, aria «Ver evaluación de …».

## 03 · Evaluar presentación (web)
- Barra fija bajo la cabecera (fondo surface, sombra): «Volver» (ev-btn-sm, chevron); h1 22 px nombres; gris
  «**7:45 p. m.** (COL)[ · 9:45 p. m. UY] · Ruta básica»; cronómetro: anillo de 60 px (conic naranja sobre gris, centro
  48 px con «15:00»), fase en Lexend 15 px + ayuda gris, botón «Iniciar» (negro) / «Pausar» (borde) y «Reiniciar».
  Fases: «Listo para empezar» / «Inicia cuando el estudiante empiece»; «Parte A · ¿Funciona?», «Parte B · ¿Lo
  entiende?», «Cierre» con «Corriendo · min 0 de 15» o «En pausa · min N de 15»; al final «Guarda la evaluación».
- Aviso amarillo (otro día): «Este estudiante está programado para el martes 17 de noviembre a las 7:00 p. m. COL ·
  9:00 p. m. UY, no para hoy. Verifica que sea la persona correcta antes de calificar.»
- Main en 2 columnas (1fr | 340 px). Izquierda (gap 16):
  - Fila de 2 tarjetas (1,5fr | 1fr): «Proyecto» (gris) + h2 19 px nombre; descripción; dl 96 px: Día, Hora «7:45 p. m.
    (COL) · 15 minutos[ · UY]», Sala, Ciudad, Ruta, Integrantes («Nombre · Doc. •••• 4471» por línea).
    «Monitor a cargo» (h2 16): nombre negrita, celular gris, Llamar/WhatsApp (96 px); gris «Escríbele si el
    estudiante no entra a la sala o hay problemas de conexión.»; dl «Enlace» con meet.google.com/… naranja; «Abrir
    sala» naranja al pie.
  - «Parte A · ¿Funciona?» (h2 18) + pista; 7 filas (borde arriba): título negrita, descripción gris, segmentado
    Sí/Parcial/No (activo verde/ámbar/rojo con texto surface).
  - «Parte B · ¿Lo entiende?»: 5 temas con la pregunta en cursiva, segmentado 0–4 (activo negro); leyenda al pie.
  - «Cierre»: pista; «Lo que hizo muy bien» y «Qué puede mejorar» en 2 columnas (84 px) y «Percepción del mentor» (72).
- Derecha fija (sticky, gap 14): tarjeta «Resultado» (Lexend 28 px coloreado: Pendiente gris, Excelente verde, Aprobado
  azul, Incompleto ámbar, No se presentó rojo), «Funciona (A)» y «Nivel promedio (B)» a los lados, ámbar «Faltan N de 7
  criterios de la Parte A.»; tarjeta «¿Se presentó?» con nombre corto y Sí/No (verde/rojo); tarjeta-check «Nominar como
  proyecto destacado» (22 px, naranja); «Guardar evaluación» naranja a todo el ancho; «Guardada a las 7:58 p. m. …».

## 04 · Mis evaluaciones (móvil)
- Barra fija (65 px, fondo bg): buscador «Participante o emprendimiento» + «Filtros» (con «(n)»). Hoja «Filtros» (asa,
  X): Fecha, Estado, [Ciudad, Mentor en coordinación], Monitor; «Limpiar» y «Aplicar» (negro, doble ancho).
- «Hola, Julián» 24 px y gris «Hoy, jueves 12 de noviembre · Hora COL»; tarjeta resumen «N estudiantes · N evaluados ·
  N no · N pendientes» + barra. Título de día solo con «Todas las fechas».
- Cabecera de bloque pegajosa (gris): título 15,5 px, «4 proyectos[ · mentor]», «Abrir sala» negro chico; «Monitor ·
  **Nombre**» + celular con Llamar/WhatsApp (96 px).
- Tarjeta por proyecto: hora (+UY), nombres 15,5 px, «Emprendimiento · Ruta · Ciudad», chips, botón a todo el ancho
  «Evaluar» / «Revisar evaluación» / «Ver evaluación» (coordinación). Mismo fondo por estado.

## 05 · Evaluar presentación (móvil)
- Encabezado fijo (surface): Volver circular (44 px, «Volver a Mis evaluaciones»), nombres 16 px, «hora · UY · ruta»;
  fila del cronómetro: anillo 60 px, fase 13,5 px + ayuda 12 px, Iniciar/Pausar y Reiniciar como ícono.
- Contenido (gap 12): aviso amarillo «Programado para el …, no para hoy. Verifica…»; `details` «Proyecto · [nombre]»
  cerrado (descripción, Día, Sala, Ciudad, Integrantes); «Monitor a cargo» (Llamar/WhatsApp, «Abrir sala» a todo el
  ancho); Parte A (segmentado a todo el ancho); Parte B (leyenda corta «0 No conoce · 1 Conoce · 2 Comprende · 3
  Practica · 4 Domina»); Cierre (3 campos de 70 px); «¿Se presentó?»; «Nominar como proyecto destacado».
- Barra inferior fija: resultado 18 px coloreado y gris «A — · B — · faltan 7 de A»; botón «Guardar» naranja.

## Qué cambia entre web y móvil
Web: tablas por bloque, filtros visibles, evaluación en 2 columnas con resultado fijo a la derecha. Móvil (< 900 px):
barra de búsqueda + hoja de filtros, tarjetas con botón a todo el ancho, evaluación en una columna con proyecto plegable,
cronómetro en el encabezado y resultado + «Guardar» en la barra inferior. El marco de teléfono es solo del prototipo.

## Diferencias con la app (gana la app; detalle en DECISIONES)
1. Sin reloj en las listas: ni «Son las…», ni «Ir a ahora», ni chips «Ahora»/«Siguiente», ni fila resaltada.
2. El cronómetro conserva su comportamiento (uno por proyecto, sigue al volver o recargar, «Reanudar» tras pausar).
3. calc() de la app (no el del prototipo): A en %, B con n temas; en pareja, una tarjeta de resultado por integrante,
   Parte B por integrante y «¿Se presentó?» por integrante (con «Deshacer» y el motivo como hoy).
4. Se conserva todo lo del inventario (docs/INVENTARIO-EVALUACION.md): motivo de inasistencia, «Borrador sin guardar»,
   «Inasistencias sin motivo registrado», lo que anotó el monitor, avisos de sesión y de borrador recuperado.
5. Pestañas: las de hoy por permiso (coordinación también ve Mis proyectos y Seguimiento general) + «Panel».
6. La pantalla de evaluar sigue dentro de /mentor (sin ruta nueva), con tope de 1440 px centrado.

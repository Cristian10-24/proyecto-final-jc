# Vistas del monitor (resumen de los prototipos)

Fuente: `docs/diseno/prototipo-evaluacion-html/prototipo-evaluacion-html/` (00–06, datos inventados), leídos una vez
(Fase 6, Paso 1). Textos entre comillas = literales. Solo visual: en lo funcional gana la app (ver «Diferencias»).

## 00 · Sistema visual (= tema-evaluacion.css)
- Colores claro/oscuro = `--ev-*`. Nuevos solo para Monitores: `--m1..m7` y fondos `--m1b..m7b` (con oscuro). Lexend
  en títulos y horas (600, 16 px; `--hora` negro en claro, naranja en oscuro), Inter el resto. Táctil ≥ 44 px; foco
  naranja de 3 px. Radios: tarjeta 14, campo 9, botones y chips 999.
- Botones: «Abrir sala» (naranja, cámara), «Limpiar filtros» (borde), «Aplicar» (negro), íconos de 44 px Llamar y WhatsApp (verde).
- Chips Mis proyectos: «Pendiente» (gris), «Se presentó» (verde), «No se presentó» (rojo), «Ahora» (naranja), «Siguiente»
  (borde naranja), «En pareja» (borde gris), «10:00 a. m. UY» (azul). Mi ciudad, «solo el estado, nunca la nota»:
  «Evaluado» (verde), «Pendiente», «No se presentó» (rojo). (El chip «Sin hora» del prototipo NO se usa.)
- Filas: fondo verde ~7 % / rojo ~6 % + chip con texto; fila «Ahora» con borde naranja interior de 2 px.
- Estados: cargando = esqueletos; vacío/error = ícono de 56 px, título 20 px, texto y botón (error: rojo, `role="alert"`).

## Barra superior
- Web: la de EvalShell (logos, pestañas, luna/sol, nombre, «Salir»). Monitor: «Mis proyectos · Mi ciudad»; coordinación
  (05): «Panel · Evaluaciones · Monitores» y «Mónica · Coordinación».
- Móvil: barra negra compacta (logo 40 px) con botón ☰ que abre un cajón a la derecha: nombre, rol («Monitora»), los
  enlaces con ícono (el activo resaltado), «Cambiar a modo oscuro»; X para cerrar.

## 01/02 · Mis proyectos (fusiona «Mis salas»)
- ENTREGA B (usuario): sin reloj (ni «Son las», «Ir a ahora», «Ahora», «Siguiente» ni fila resaltada); abre en hoy, por
  hora; el chip UY sí. «Gestionar» lleva a una PÁGINA de detalle `/monitor/proyectos/[id]` (no acordeón). Ancho completo.
- Cabecera: «Hola, {nombre}» + «Tus salas y sus proyectos, de cualquier ciudad. Toca Gestionar para ver los datos y
  marcar asistencia.» Resumen: «N proyectos · N estudiantes: N se presentaron · N no se presentaron · N pendientes»,
  «N % con asistencia» y barra verde + roja. Filtros (en la URL): día (hoy), ciudad, sala, estado («Pendientes», «Se
  presentaron», «No se presentaron», «Inasistencias sin motivo registrado») y buscador.
- Grupo por sala y bloque: «Sala 2 · 8:00 a 9:00 a. m.», chip «4 proyectos», «Mentor · Nombre · +57 …» (o «Sin
  registrar»), Llamar, WhatsApp y «Abrir sala». Tabla «Acción · Hora · Proyecto · Integrantes · Asistencia»: «Gestionar»
  (›), hora + chip UY, proyecto («Ciudad · Ruta básica», «En pareja»), integrantes con celular e íconos, chips de
  asistencia (por integrante en pareja) + motivo, Destacado, Cambio sugerido; fondo verde/rojo con estadoFila.
- Detalle: «← Volver a Mis proyectos», nombre y chips; tarjetas Sesión (Día, Hora COL · 15 minutos (+UY), Sala, enlace
  visible, «Abrir sala», «Copiar enlace» → «Enlace copiado»), Mentor, Sobre el proyecto, una por integrante (contacto,
  ¿Se presentó? Sí/No, motivo, observación, «Guardar observación», resultado y retroalimentación), Reprogramar, Sugerir
  un cambio especial y Tus sugerencias. ≥1440: 3 columnas; 900–1439: 2; móvil: 1 (Sesión primero).
- Móvil: barra fija con buscador y «Filtros», «Hola, …», resumen corto + barra; cabecera de bloque pegajosa; una
  tarjeta por proyecto con chips y «Gestionar» → detalle.
- Hoja inferior «Filtros» (asa, X): Día, Ciudad, Sala, Estado; «Limpiar» y «Aplicar». Estados: «Aún no tienes salas asignadas» / «Cuando coordinación te asigne salas, aquí verás sus proyectos de cualquier
  ciudad. Si crees que es un error, escríbele a coordinación.» [Ir a Mi ciudad] · «No hay proyectos con esos filtros» /
  «Prueba con otro nombre de proyecto o de integrante, o cambia el día, la ciudad, la sala o el estado.» [Limpiar filtros]
  · «No pudimos cargar tus proyectos» / «Revisa tu conexión e intenta otra vez. Los datos no se perdieron.» [Intentar de nuevo].

## 03/04 · Mi ciudad (solo lectura)
- Título = ciudad («Barranquilla»), «Todos los proyectos de tu ciudad, de todos los días. Aquí solo ves el estado, nunca
  la nota.» Selector «Ciudad» arriba a la derecha (solo con varias). Bajo el título «N proyectos · N estudiantes». Tarjetas-filtro
  «Total · Evaluados · Pendientes · No se presentó» que cuentan ESTUDIANTES (opción B; «estudiantes» en gris bajo el número;
  la elegida con borde negro); barra «N de N estudiantes evaluados · %». Al tocar una tarjeta se listan los proyectos con
  algún integrante en ese estado; pareja mixta con chip extra «1 ausente» / «1 pendiente». «Pendientes primero» = algún pendiente.
- Filtros: Día, Sala, Ordenar («Pendientes primero» / «Por fecha y hora»), buscador «Buscar por proyecto o integrante».
- Tabla «Proyecto e integrantes · Día, hora y sala · Mentor · Estado»: proyecto (+«En pareja»), «Nombre · +57 …» (o «Sin
  registrar») con Llamar y WhatsApp; «3:30 p. m.» / «Jueves 12 de noviembre» / «Sala 3»; mentor sin celular; chip;
  en pareja, línea «Laura: Pendiente · Andrés: Pendiente».
- SIN HORA = NO APARECE (usuario): sin bloque «Aún no eligen hora», «Copiar lista…» ni chip o filtro «Sin hora»; tarjetas
  y barra solo con proyectos con día y hora. Sin ninguno: «No hay proyectos con esos filtros».
- Móvil: barra con buscador y «Filtros»; título + «Todos los días · Pendientes primero»; tarjetas 2×2; barra; una
  tarjeta por proyecto (proyecto + chip, «3:30 p. m. · Jue 12 · Sala 3», «Mentor · …», integrantes con íconos). Hoja
  «Filtros»: Ciudad, Estado (Todos/Pendientes/Evaluados/No se presentó), Día, Ordenar; «Limpiar» y «Aplicar».
- Estados: «Aún no tienes una ciudad asignada» / «Cuando coordinación te asigne una ciudad, aquí verás todos sus proyectos
  y cuáles ya están evaluados. Si crees que es un error, escríbele a coordinación.» [Ir a Mis proyectos] · «No hay
  proyectos con esos filtros» / «… o cambia el estado, el día o la sala.» · «No pudimos cargar los proyectos de tu ciudad».

## 05/06 · Asignaciones de monitores (coordinación y admin, solo lectura)
- «Asignaciones de monitores» / «En qué sala está cada monitor, con qué mentor y a qué hora. Solo lectura · Hora COL.»
  Botones «Cambiar en Salas» (blanco) y «Descargar plan de salas» (negro, ícono de descarga).
- Filtros: Día, Monitor («Todos los monitores»), Sala, Mentor («Todos los mentores») y «Buscar monitor, mentor, sala o proyecto».
- Alertas: amarilla «2 salas sin monitor · Sala 8 8:00 a. m., Sala 1 8:00 p. m.»; roja «1 monitor cambia de sala sin
  margen · Santiago Lemus: Sala 4 (último turno 10:45 a. m.) → Sala 6 a las 11:00 a. m.».
- «Jueves 12 de noviembre» + «Ver como» (segmentado): «Cuadrícula» · «Por monitor» · «Por sala».
  - Cuadrícula: fila por monitor (avatar con iniciales y color, nombre, celular), columna por hora «8 a. m.»…«8 p. m.»,
    barras «Sala 2 / Julián Restrepo / 4 proyectos» (horas seguidas en la misma sala = una barra), chip «Sin margen»,
    columna «Total» «4 h / 15 proyectos»; fila «Sin monitor» amarilla con «!» y «2 salas por cubrir».
  - Por monitor: tarjetas (3 por fila) con avatar, «4 h · 15 proyectos» y línea de tiempo «8:00 a 9:00 a. m.» / «Sala 2
    · Julián Restrepo Gaviria · 4 proyectos».
  - Por sala: fila por sala con sus bloques «8:00 a 10:00 a. m. Laura Camila Vargas [Monitor · Natalia Bernal Ochoa]» o
    chip amarillo «Sin monitor».
- Tocar una barra abre un panel lateral: día, sala, rango, «Enlace de la sala» «Abrir …», Mentor y Monitor (nombre y
  celular), «4 proyectos del bloque» (hora · nombre del proyecto).
- Móvil: buscador «Monitor, mentor o sala» + «Filtros» (Día, Monitor, Sala, Mentor; Limpiar/Aplicar); título, «Jueves
  12 de noviembre · Solo lectura · Hora COL», chips de alerta «2 salas sin monitor» y «1 cambio sin margen»; acordeón
  «Sin monitor» (amarillo, abierto) y uno por monitor con línea de tiempo; al final «Descargar plan de salas» y «Cambiar en Salas».
- Estados: «No hay salas con proyectos este día» [Ir a Salas] · «Nada coincide con esos filtros» / «Prueba con otro
  nombre de monitor, mentor, sala o proyecto, o cambia de día.» · «No pudimos cargar las asignaciones».

## Diferencias con la app (gana la app en lo funcional)
1. Gestionar conserva lo que hoy muestra la ficha y el prototipo no: resultado por integrante y retroalimentación del
   mentor. «Tus sugerencias de cambio» se conserva al final. «Sin celular cargado» pasa a «Sin registrar».
2. Coordinación y admin: Mis proyectos sin Gestionar ni asistencia (como hoy); pestañas actuales + «Monitores».
3. Fila de Mis proyectos: chip de asistencia (Pendiente / Se presentó / No se presentó / Evaluado) + motivo, Destacado y
   Cambio sugerido; el resultado solo en Gestionar. «Descargar plan de salas», «Cambiar en Salas» e «Ir a Salas»: solo admin.

## Ancho completo (entrega B)
- Vistas nuevas (ShellVistas): contenedor fluido, márgenes laterales clamp(16px, 2vw, 40px); la barra superior usa los
  mismos márgenes (logo alineado con el contenido); tope centrado de 2560 px. Cortes: <900 móvil, 900–1439 estándar,
  ≥1440 ancho. Tablas con columnas flexibles (lo sobrante a Proyecto, Integrantes y Mentor; Día/hora y Estado con mínimo
  y máximo), fila resaltada al pasar el cursor, Llamar/WhatsApp junto al celular desde 900 px, parejas en 2 columnas ≥1440.

## Gestionar (detalle) — diseños 1m (claro, pareja) y 1n (oscuro, individual, Uruguay), en docs/diseno/vistas-2/
- Columna única en `ev-main` (gap 20 px). «← Volver a Mis proyectos» (ev-btn-sm, ícono chevron). Kicker gris y en negrita
  «Sala 2 · Jueves 12 de noviembre · 8:45 a. m. (COL)»; h1 30 px (letter-spacing −.02em) y, en la misma fila a la derecha
  (flex, align-items flex-end, wrap), «Abrir sala» naranja (ícono de cámara). Chips c-line: ciudad («Paysandú · Uruguay»),
  ruta, «En pareja»; Uruguay: chip azul c-uy «12:15 p. m. UY».
- Fila de 3 tarjetas iguales (grid 3 × 1fr, gap 16, stretch; ev-tarjeta: padding 18, radio 14), h2 16 px, gap interno 14:
  · Sesión: dl 72 px | 1fr: Día; Hora «8:45 a. m. (COL) · 15 minutos» (+ línea gris 500 «12:15 p. m. UY»); Sala; Enlace =
    «meet.google.com/…» en naranja (--orange-ink) que abre la sala. Al pie (margin-top auto) «Copiar enlace» (ev-btn-sm,
    ícono copiar) → aviso «Enlace copiado».
  · Mentor: grid 1fr | 96 px: nombre en negrita y celular gris (o «Sin registrar»); Llamar/WhatsApp a la derecha (columna
    fija de 96 px). Al pie gris «Evalúa el bloque 8:00 a 9:00 a. m. en Sala 2.»
  · Proyecto: descripción y dl 92 px | 1fr: Ciudad, Ruta, Integrantes («A y B»).
- «Asistencia y observaciones» (h2 20 px) con ayuda gris a la derecha «Marca si cada integrante se presentó. Tocar otra
  vez Sí o No lo deja en Pendiente.» Pareja: 2 columnas iguales; individual: una columna de máx. 620 px.
  · Tarjeta por integrante (gap 14): h3 17 px + chip (Pendiente c-idle, Se presentó c-ok, No se presentó c-bad). Caja de
    contacto (fondo surface-2, radio 9, padding 12, grid 1fr | 96 px): celular en negrita (o «Celular sin registrar»),
    «Doc. •••• 5701 · correo» gris; Llamar/WhatsApp a la derecha. Si el mentor evaluó: recuadro con borde (radio 9,
    padding 10/12) «Evaluación del mentor · [chip resultado]» y la retroalimentación.
  · «¿Se presentó?» (negrita, 13 px) con segmentado Sí/No a la derecha; activo: Sí fondo --ok, No fondo --bad, texto
    surface. Con «No»: «Motivo de inasistencia» (select «— Sin motivo —») y aviso --mid 600 «Falta registrar el motivo de
    la inasistencia.» «Observación del monitor» (textarea min 72 px) y «Guardar observación» (ev-btn-sm).
- Al pie, `details` ev-tarjeta (padding 4/18), summary 52 px: reloj + «¿Hay que cambiar la hora?» + gris «Reprogramar o
  sugerir un cambio especial» + flecha que gira. Abierto: 2 columnas (gap 24): Reprogramar (h3 15 px; Día y Cupo en 2
  columnas; Motivo; botón) y Sugerir un cambio especial.
- Funcional (gana la app): el diseño deshabilita «Guardar» hasta escribir observación; la app lo habilita ante cualquier
  cambio (asistencia, motivo u observación). El texto de «Reprogramar» y el aviso de evaluado conservan los de la app.

## Monitores: ventana de detalle — diseño 3a (claro, interactivo)
- Cuadrícula, Por monitor y Por sala usan el mismo `abrir` → estado `panel = { día, sala, hora de inicio }`; el panel se
  busca en las barras del día (si no existe, no se muestra). Cambiar de día lo cierra.
- Cada barra/ítem es un botón con aria-label «Sala 5, 10:00 a 11:00 a. m., mentor …, 4 proyectos[, sin margen]. Ver detalle».
- Panel: velo + `aside` ev-lado (400 px, padding 20, role dialog, aria-modal, aria-label «Sala N»). Cabecera: fecha gris,
  «Sala N» 22 px, rango en ev-hora 15 px; X «Cerrar detalle» (ev-ibtn). Avisos: rojo «El monitor llega de otra sala sin
  margen: su bloque anterior termina con un turno a las :45.»; amarillo «Esta sala no tiene monitor. Asígnalo en Salas.»
  Luego (gap 14): «Enlace de la sala» botón naranja a todo el ancho «Abrir meet.google.com/…»; «Mentor» (nombre negrita,
  celular gris o «Sin registrar», Llamar/WhatsApp); «Monitor» (igual, o chip c-mid «Sin monitor»); «N proyectos del
  bloque» (ev-grupo: filas 96 px | 1fr, hora + nombre).
- Funcional (gana la app / pedido del usuario): también cierra con Escape y con el fondo; «Asignar en Salas» solo para el
  admin; sin datos de estudiantes. Móvil: hoja inferior casi a pantalla completa con el mismo contenido.

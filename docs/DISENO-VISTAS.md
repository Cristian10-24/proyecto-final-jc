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
  «Evaluado» (verde), «Pendiente», «No se presentó» (rojo), «Sin hora» (amarillo).
- Filas: fondo verde ~7 % / rojo ~6 % + chip con texto; fila «Ahora» con borde naranja interior de 2 px.
- Estados: cargando = esqueletos que laten; vacío/error = ícono redondo de 56 px, título 20 px, texto gris y un botón
  (error: ícono rojo y `role="alert"`).

## Barra superior
- Web: la de EvalShell (logos, pestañas, luna/sol, nombre, «Salir»). Monitor: «Mis proyectos · Mi ciudad»; coordinación
  (05): «Panel · Evaluaciones · Monitores» y «Mónica · Coordinación».
- Móvil: barra negra compacta (logo 40 px) con botón ☰ que abre un cajón a la derecha: nombre, rol («Monitora»), los
  enlaces con ícono (el activo resaltado), «Cambiar a modo oscuro»; X para cerrar.

## 01/02 · Mis proyectos (fusiona «Mis salas»)
- Cabecera web: «Hola, {nombre}» + «Tus salas y sus proyectos, de cualquier ciudad. Toca **Gestionar** para ver los
  datos, marcar asistencia o reprogramar. Hora Colombia (COL).»; «Son las **10:20 a. m.**» y botón naranja «Ir a ahora».
- Resumen (tarjeta): «**15 proyectos** · 19 estudiantes: 4 se presentaron · 2 no se presentaron · 13 pendientes» y a la
  derecha «32 % con asistencia»; barra verde (presentes) + roja (ausentes) sobre gris.
- Filtros web (selects en fila + buscador debajo): «Hoy, jueves 12 de noviembre» / «Viernes 13 de noviembre»…;
  «Todas las ciudades»; «Todas las salas»; «Todos los estados», «Pendientes», «Se presentaron», «No se presentaron»,
  «Inasistencias sin motivo registrado»; buscador «Buscar por proyecto o integrante».
- Grupo por sala y bloque: cabecera gris «Sala 2 · 8:00 a 9:00 a. m.», chip «4 proyectos», «Mentor · **Julián
  Restrepo Gaviria** · +57 315 402 7781» (o «Sin registrar»), Llamar, WhatsApp y «Abrir sala» a la derecha.
- Tabla: columnas «Acción · Hora · Proyecto · Integrantes · Asistencia». Fila: botón «Gestionar» (›) / «Cerrar» (˅,
  negro); hora + chip UY debajo + «Ahora»/«Siguiente»; proyecto en negrita, «Ciudad · Ruta básica» (Colonia/Paysandú:
  «Colonia · Uruguay · Ruta avanzada»), chip «En pareja»; integrantes: nombre, celular y los dos íconos (uno debajo de
  otro en pareja); asistencia: un chip, o uno por integrante «Daniela: Se presentó».
- Panel «Gestionar» dentro de la fila (acordeón), en dos columnas: «Datos de la presentación» (Día, Hora «8:45 a. m.
  (COL) · 15 minutos», Sala «Sala 2 · Abrir sala», Mentor + celular, Proyecto, Ciudad, Ruta, Integrantes), «Sobre el
  proyecto», una tarjeta por integrante (nombre + chip, «Doc. •••• 5701 · correo», «Cel. …», «Llamar», «WhatsApp»,
  «¿Se presentó?» Sí/No, «Motivo de inasistencia» con «— Sin motivo —», aviso «Falta registrar el motivo de la
  inasistencia.», «Observación del monitor», «Guardar observación»); «Reprogramar» (texto, Día «(54 libres)», «Cupo libre
  (hora · mentor)», «Motivo del cambio», «Reprogramar en este cupo») y «Sugerir un cambio especial» («Qué cambio
  sugieres», «Motivo», «Enviar sugerencia»). Móvil (390): barra fija con buscador «Proyecto o integrante» y botón «Filtros»; «Hola, Valeria», «Jueves 12 de
  noviembre · Hora COL», «Ir a ahora» a la derecha; resumen corto «15 proyectos · 4 se presentaron · 2 no · 13
  pendientes» + barra. Cabecera del bloque pegajosa (sala, rango, «4 proyectos», «Abrir sala», mentor, celular,
  íconos). Una tarjeta por proyecto: hora (+UY, Ahora/Siguiente), proyecto, ciudad · ruta, «En pareja», chips «Sofía: Se
  presentó», botón «Gestionar» → el mismo panel en una columna dentro de la tarjeta (sin el celular de los integrantes en
  la tarjeta cerrada: va en el panel).
- Hoja inferior «Filtros» (asa, X): Día, Ciudad, Sala, Estado; «Limpiar» y «Aplicar». Estados: «Aún no tienes salas asignadas» / «Cuando coordinación te asigne salas, aquí verás sus proyectos de cualquier
  ciudad. Si crees que es un error, escríbele a coordinación.» [Ir a Mi ciudad] · «No hay proyectos con esos filtros» /
  «Prueba con otro nombre de proyecto o de integrante, o cambia el día, la ciudad, la sala o el estado.» [Limpiar filtros]
  · «No pudimos cargar tus proyectos» / «Revisa tu conexión e intenta otra vez. Los datos no se perdieron.» [Intentar de nuevo].

## 03/04 · Mi ciudad (solo lectura)
- Título = ciudad («Barranquilla»), «Todos los proyectos de tu ciudad, de todos los días. Aquí solo ves el estado, nunca
  la nota.» Selector «Ciudad» arriba a la derecha (solo con varias). Cuatro tarjetas-filtro «Total · Evaluados · Pendientes · No se presentó» (la elegida con borde negro); barra «16 de 28
  evaluados · 57 %» y a la derecha «2 no se presentaron · 10 pendientes».
- Filtros: Día («Todos los días»…), Sala («Todas las salas»), Ordenar («Pendientes primero» / «Por fecha y hora»),
  buscador «Buscar por proyecto o integrante».
- Tabla «Proyecto e integrantes · Día, hora y sala · Mentor · Estado»: proyecto (+«En pareja»), «Nombre · +57 …» (o «Sin
  registrar») con Llamar y WhatsApp; «3:30 p. m.» / «Jueves 12 de noviembre» / «Sala 3»; mentor sin celular; chip;
  en pareja, línea «Laura: Pendiente · Andrés: Pendiente».
- Al final, bloque «Aún no eligen hora · 3 proyectos» / «Cuentan como pendientes. Escríbeles para que elijan día y
  hora.» con botón «Copiar lista de pendientes para WhatsApp» (toast «Lista copiada · 3 proyectos sin hora»); sus filas
  dicen «Aún no elige día ni hora» y «Sin mentor asignado».
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
2. Coordinación y admin ven Mis proyectos sin Gestionar ni asistencia (hoy no tienen ese permiso ni esos datos).
3. Pestañas de coordinación/admin: las actuales + «Monitores». Plan de salas (Excel y Salas) hoy es solo del admin.

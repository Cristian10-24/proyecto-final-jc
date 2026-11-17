# Inventario de datos de evaluación (antes del rediseño de las vistas del mentor)

Lo que HOY se ve de una evaluación (rama main) y dónde queda en el diseño nuevo. Regla: nada se quita, se resume ni se
mueve a un sitio al que hoy no se llega. Fuentes: `MentorPanel.tsx` (lista de /mentor), `EvaluarHoja.tsx` (pantalla de
evaluar) y las lecturas GET /api/evaluacion/proyectos y GET /api/evaluacion/proyectos/[id] (`datos.ts`).

## (a) Lista del mentor («Mis evaluaciones», /mentor)
| Dato hoy | Dónde queda |
|---|---|
| Avance «n evaluados · k no se presentaron · p pendientes de total» y % | Tarjeta resumen «N estudiantes · N evaluados · N no se presentaron · N pendientes» + «N % listo» y barra |
| Resultado por integrante (Pendiente, Incompleto, Aprobado, Excelente, No se presentó), «Nombre: » en pareja | Columna Resultado (web) y chips de la tarjeta (móvil), uno por integrante |
| Chip «Destacado» | «★ Destacado» en la misma columna |
| Motivo de inasistencia («Motivo: Salud» / «Sin motivo») de quien no se presentó | Mismo chip, junto al «No se presentó» |
| «Borrador sin guardar» | Mismo chip en la columna Resultado |
| Hora COL y hora UY (Colonia, Paysandú) | Hora Lexend + chip azul «… UY» |
| Nombres, emprendimiento, ruta, ciudad, «En pareja» | Celda «Participantes y proyecto» (móvil: tarjeta) |
| Sala («Sala N» / «Sala por asignar») y «Abrir sala» por hora | Cabecera del bloque «Sala N · rango» y «Abrir sala» |
| Fondo verde/rojo por `estadoFila` | Igual (misma función) |
| Filtros fecha, búsqueda (nombre, código, emprendimiento) y estado (Pendientes, Ya evaluados, No se presentaron, Inasistencias sin motivo registrado) | Fecha, Estado («Evaluados», + «Destacados»; se conserva «Inasistencias sin motivo registrado»), Monitor y buscador (también por código); en la URL |
| Abrir una evaluación (tocar la fila) | Botón «Evaluar» o «Revisar» |

## (b) Pantalla de evaluar con una evaluación ya guardada
| Dato hoy | Dónde queda |
|---|---|
| Nombres de los integrantes | Barra fija (h1) |
| Fecha y hora (COL · UY), emprendimiento, ciudad, ruta, «Proyecto en pareja» | Barra fija (hora COL · UY · ruta) + tarjeta Proyecto (Día, Hora, Sala, Ciudad, Ruta, Integrantes) |
| Documento enmascarado por integrante | Tarjeta Proyecto → Integrantes («Nombre · Doc. ••••1234») |
| «Sobre el proyecto» (descripción) | Tarjeta Proyecto (móvil: plegable «Proyecto · nombre») |
| «Lo que anotó el monitor»: motivo de inasistencia y observación, por integrante | Tarjeta «Lo que anotó el monitor» (igual, bajo Proyecto/Monitor); el motivo también bajo «¿Se presentó?» |
| Respuestas de la Parte A (Sí/Parcial/No) | Parte A, mismos segmentados marcados |
| Puntajes de la Parte B (0–4) por integrante; «No se presentó» en lugar del selector | Parte B por integrante, igual |
| «Lo que hizo muy bien», «Qué puede mejorar», «Percepción del mentor» | Cierre, mismos campos con lo guardado |
| Resultado por integrante, «Funciona (A)» %, «Nivel promedio (B)» con n temas, aviso de faltantes | Tarjeta(s) Resultado en la columna derecha (móvil: en el contenido y resumen en la barra inferior) |
| Destacado | «Nominar como proyecto destacado» marcado |
| «No se presentó» por integrante, banner «X está marcado como «No se presentó»» + «Deshacer» | «¿Se presentó?» Sí/No por integrante + el mismo banner con «Deshacer» |
| Avisos: sesión vencida, solo lectura, otro día, borrador recuperado | Iguales (aviso amarillo de otro día con el texto nuevo) |
| Estado del borrador («Borrador guardado (hora)…», «Cambios sin guardar.») | Bajo «Guardar evaluación» (móvil: sobre la barra inferior) |
| Momento en que se guardó (`guardadoEn`) | Hoy llega pero NO se muestra. Se mostrará «Guardada el … a las …» (dato existente) |
| Sala y enlace (`sala`, `enlace`) | Hoy llegan pero no se muestran en la hoja. Se muestran en Proyecto y Monitor a cargo |

## (c) Coordinación y admin («Evaluaciones», misma pantalla en solo lectura)
Lo mismo de (a) y (b), sin escribir: hoy eligen el mentor en un selector (o «Todos los mentores») y abren cualquier
proyecto con el aviso «Solo lectura: la evaluación la hace el mentor del proyecto.». Queda: filtro «Mentor» (y Ciudad,
Monitor, Fecha, Estado, buscador), cabecera de bloque con «Mentor: Nombre» y botón «Ver»; la pantalla muestra todo lo de
(b) con los controles deshabilitados y el mismo aviso. Los permisos no cambian (`evaluar` / `ver_evaluaciones`).

## No se toca
Seguimiento general, «Mis proyectos» y «Gestionar» del monitor, rutas de escritura, permisos, esquema y datos.

## Monitor del bloque (verificación)
Ni la agenda (`FilaEvaluacion`: sala y enlace) ni la ficha (`DetalleEvaluacion`: sala y enlace) traen el monitor.
Única excepción permitida: ampliar la lectura de evaluaciones (`listaEvaluaciones` y `detalleEvaluacion`, mismas rutas
GET y mismos permisos) con `monitor: { nombre, celular } | null`, tomado del plan de salas (día + hora + mentor, la
misma clave de `salasDe`, Mi ciudad y las citaciones); usuario inexistente o desactivado o bloque sin monitor = null
(«Sin monitor»). Sin escrituras ni campos nuevos. La revisa revisor-seguridad.

## Plan
- Reutiliza: ShellVistas (barra, cajón ☰, «Salir»), Basicos (Chip, BotonesLlamar, Telefono, ResumenBarra, Selector,
  Buscador), Dialogos (HojaFiltros, BarraMovil, useDialogo), Estados, Iconos, Vistas.module.css y `estadoFila`.
- Reemplaza: el marco EvalShell en /mentor (EvalShell sigue para Seguimiento general), el JSX y estilos de MentorPanel
  (lista) y de EvaluarHoja (misma lógica, hooks y llamadas; pasa de ventana a pantalla completa dentro de /mentor).
- Nuevo: `src/lib/vistas/listaEvaluaciones.ts` (filtros en la URL, agrupación por bloque, resumen; puras),
  `src/lib/evaluacion/ayudas.ts` (textos «?») y el componente de ayuda; `monitoresDe` en datos.ts (solo lectura).
- Riesgos: (1) que el rediseño cambie la lógica de guardar o del borrador → la lógica de EvaluarHoja no se toca, solo
  el marcado, y se prueba en el navegador y con paridad; (2) que el refresco pise el formulario → el refresco sigue
  detenido mientras la evaluación está abierta; (3) Escape: con la ayuda abierta cierra solo la ayuda; (4) teclado del
  móvil sobre la barra inferior → la barra sube con `visualViewport` y los campos dejan margen al hacer scroll.

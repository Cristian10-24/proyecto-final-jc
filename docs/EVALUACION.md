# Evaluación del proyecto final (resumen del prototipo)

Fuente: `docs/diseno/evaluacion/index.html` (leído una vez en el Paso 8). Desde aquí se trabaja con
este archivo; el prototipo solo se abre para mirar una pantalla concreta. Textos entre comillas = literales.

## Criterios (no cambiar)
**Parte A · ¿Funciona?** (min 0–6). Cada ítem: Sí / Parcial / No (parcial = 0,5). Clave · título · descripción:
- a1 "App publicada" · "Abre desde una URL de internet, no desde su computador."
- a2 "Marca, inicio y catálogo" · "Identidad visual, navegación clara y productos o servicios completos."
- a3 "Contacto real" · "Envía una solicitud en vivo y queda guardada o enviada."
- a4 "Login y panel" · "Inicia sesión y entra al panel privado."
- a5 "Asistente de clientes" · "Preguntas frecuentes interactivas con respuestas útiles."
- a6 "Responsive" · "Al achicar la ventana o en el celular se sigue viendo bien."
- a7 "GitHub" · "Muestra el repositorio con mínimo 10 commits."

**Parte B · ¿Lo entiende?** (min 6–12). Escala 0–4 por tema; mínimo 2 temas (`MIN_B = 2`). Pregunta guía en cursiva:
- b1 "Componentes y props" · "Muéstrame un componente que reutilices y cómo le llegan los datos."
- b2 "Estado y datos (hooks)" · "¿Cómo llega el catálogo a la pantalla? Muéstrame dónde usas useState o useEffect."
- b3 "Backend con Express" · "Cuando envías el formulario, ¿qué ruta lo recibe? Muéstramela."
- b4 "Base de datos con Mongoose" · "¿Dónde quedó guardada la solicitud? Muéstrame el esquema o el registro."
- b5 "Visión general" · "Explícame el recorrido de un dato: del formulario a la base de datos y de vuelta a la pantalla."
- Leyenda: "0 No conoce · 1 Conoce · 2 Comprende (explica la idea con ayuda) · 3 Practica (lo muestra y explica solo) · 4 Domina (podría modificarlo en vivo)".
- Tocar de nuevo el valor marcado lo desmarca (A y B).

**Cierre** (min 12–15), común en pareja: "Lo que hizo muy bien" (fortaleza), "Qué puede mejorar" (mejora),
"Percepción del mentor" (percepcion), y casilla "Nominar como proyecto destacado" (destacado).

## calc(ev) → { res, a, b, nb } (copiar tal cual)
1. Sin evaluación → Pendiente. `noPresento` → "No se presentó" (a, b nulos).
2. aVals = ítems de A marcados; bVals = temas de B con número. Ninguno → Pendiente.
3. a = Σ(si=1, parcial=0,5, no=0) / 7 (siempre sobre 7). b = promedio de bVals (null si no hay).
4. Si faltan ítems de A (< 7) o bVals < 2 → Incompleto.
5. Si a ≥ exA y b ≥ exB → Excelente; si no → Aprobado ("presentar el proyecto es el requisito para aprobar").
- Criterios por defecto exA = 0,9 y exB = 3; el admin los edita ("Excelente · Parte A mínima (%)", "Parte B mínima (0–4)", paso 0,5).
- Orden y color: Excelente (ok), Aprobado (info), Incompleto (mid), No se presentó (muted), Pendiente (idle).

## Mis evaluaciones (mentor)
- Saludo "Hola, {primer nombre}"; avance "{n} evaluados · {k} no se presentaron · {p} pendientes de {total}", % y barra.
- Filtros: fecha (por defecto hoy, "Hoy, …"), búsqueda (nombre, documento, emprendimiento, pareja) y estado:
  "Pendientes", "Ya evaluados", "No se presentaron", "Inasistencias sin motivo registrado".
- Lista agrupada por día (el de hoy resaltado), ordenada por hora y nombre. La pareja va en UNA fila:
  hora · "Nombre y Nombre" · subtítulo (emprendimiento · ruta · ciudad · "En pareja") · chips por persona
  ("Ana: Aprobado"), "Destacado" y, si no se presentó, "Motivo: …" o "Sin motivo".
- Vacío: "No tienes estudiantes asignados todavía" / "No hay estudiantes con ese filtro."

## Pantalla de evaluar
- Cabecera: "Volver", nombres, meta (fecha y hora · emprendimiento · ciudad · ruta · "Proyecto en pareja"), documentos.
- Cronómetro de 15 min con anillo: "Iniciar" / "Pausar" / "Reanudar". Fases: <6 min "Demo" ("Parte A · hasta el minuto 6"),
  <12 "Preguntas" ("Parte B · hasta el minuto 12"), <15 "Cierre" ("Escribe fortaleza y mejora"), luego "Tiempo cumplido"
  con "Guarda la evaluación" (corrección del PLAN). No bloquea nada.
- Avisos amarillos: programado para otro día, sin fecha, asignado a otro mentor + "Verifica que sea la persona correcta antes de calificar."
- Caja "Sobre el proyecto" (descripción) y lo que anotó el monitor (motivo, observación).
- Lateral: tarjeta de resultado por persona (resultado, "Funciona (A)" %, "Nivel promedio (B)" con n temas; si Incompleto:
  "Faltan datos: marca los 7 puntos de la Parte A y mínimo 2 temas de la Parte B."), destacado, "Guardar evaluación"
  ("…de la pareja") y "No se presentó" ("{Nombre} no se presentó" en pareja).
- Guardar exige A completa y ≥ 2 temas de B por cada integrante presente; si no, alerta "Para guardar, completa:" con la lista.
- "No se presentó": confirma (avisa si ya tenía notas), borra su B y guarda `noPresento`; banner con "Deshacer". Si todos
  quedan así, cierra la pantalla. Salir con cambios: "Tienes cambios sin guardar. ¿Salir de todas formas?".
- Pareja: A, cierre y destacado comunes (al abrir se toman de quien ya los tenga); B y "no se presentó" por integrante.
  Textos de pista distintos para pareja (ver prototipo líneas 771–772).

## Monitor (por estudiante en el prototipo)
- Por integrante: resultado, contacto (documento, correo, celular con "Llamar" y "WhatsApp"; 10 dígitos que empiezan
  por 3 → prefijo 57), retroalimentación del mentor, "Motivo de inasistencia" y "Observación del monitor", "Guardar observación".
- Motivos: Salud · Conexión o equipo · Trabajo o estudio · Calamidad familiar · Se retiró del programa · No avisó · Otro.
- Reprogramar: día con "(n libres)", cupo "hora · mentor", "Motivo del cambio" obligatorio, confirmación. El cupo anterior
  queda libre y si estaba "No se presentó" vuelve a Pendiente.

## Seguimiento general (admin)
- KPIs: "{n} / {total} estudiantes evaluados", proyectos registrados (pareja cuenta 1), % de avance,
  % excelentes de los que se presentaron, excelentes, no se presentaron, destacados.
- Barra apilada de resultados con leyenda; "¿Qué funcionó en la demo?" (% de Sí por ítem A, rojo < 60 %);
  "Nivel de conocimiento por tema" (promedio 0–4 y n, rojo < 2, "Meta: 2 o más").
- Tablas "Por ruta" (siempre Básica y Avanzada), "Por ciudad", "Individual o en pareja": Estudiantes, Evaluados,
  No se presentaron, % excelentes, Nivel prom.; frase de parejas (los dos / solo uno / ninguno excelente).
- "Cupos para reprogramar" (ocupados/libres por día; libres por mentor), "Inasistencias y monitoreo" (motivos, por monitor:
  Estudiantes, No se presentaron, Con motivo, Sin motivo), "Proyectos destacados", "Resultados excelentes",
  "Avance por día", "Avance por mentor" (Asignados, Evaluados, Avance, Funciona prom., Nivel prom.).
- Exportar resultados: una fila por estudiante con datos, A1–A7 (Sí/Parcial/No), B1–B5, % Funciona, Nivel, Resultado,
  Destacado, cierre, motivo y observación del monitor.

## No se copia (ya decidido)
Apps Script, login por código al correo, carga de estudiantes por CSV/pegado, carga de cupos, "Borrar ejemplos/todo",
correo "Copiar texto" (sin correos por ahora). Los cupos libres salen de nuestras reservas y el monitor va por sala y hora.

## Incoherencias del prototipo (preguntar antes de decidir)
1. `crit` trae `apA = 0,7` y `apB = 2` que `calc()` no usa; "En proceso" tiene color y texto de correo pero nunca sale.
2. El export incluye "Asunto del correo" y "Mensaje para el estudiante" (solo Aprobado/Excelente): ¿se exportan sin correos?
3. Guardar exige todo completo, así que una evaluación guardada nunca queda Incompleto; con el borrador automático del PLAN,
   ¿el borrador cuenta como Incompleto en el seguimiento o sigue Pendiente hasta "Guardar evaluación"?
4. El prototipo asigna monitor por estudiante; el PLAN, por sala y hora. La tabla "por monitor" se calcularía por sala.

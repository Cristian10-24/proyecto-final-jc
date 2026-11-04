# Sistema visual · Proyecto final JC 2026

Fuente: `docs/diseno/*.dc.html` (Claude Design; datos inventados). Tokens: `src/app/tokens.css`.
Si algo choca con `docs/PLAN.md`, gana el PLAN (ver DECISIONES). Logos en `public/`: `logo-jc.png`, `logo-jc-redondo.webp`, `logo-sofka.webp`.
Horas siempre "Hora COL"; si la ciudad es de Uruguay, también UY. Móvil primero: estudiante en 390 px; admin, monitor y coordinación en 1280 px.

## Componentes que se repiten
- **Tarjeta**: blanca, borde `--line-2`, radio `--r-2xl`, padding 20, `--sh-card`. Destacada (boleto): `--sh-raised`.
- **Botón principal**: alto `--h-button`, radio `--r-xl`, `--orange`, texto blanco `--t-button`, ancho completo en móvil; ocupado `--orange-busy` + spinner. Variantes: oscuro (`--ink`), fantasma (borde `--line`), suave (`--soft`), enlace.
- **Campo**: alto `--h-input`, radio `--r-md`, borde 2px `--line`; foco `--orange` + anillo `--orange-chip`; error `--red` + mensaje debajo.
- **Chip de estado**: alto `--h-chip`, `--r-pill`, `--t-chip`, punto de 8 px. Eligió = verde; Sin hora = amarillo; neutro = `--soft`; marca = `--orange-chip`.
- **Barra de avance**: segmentos de `--h-progress` (uno por paso) + "Paso n de 4"; en paneles, barra de % por ciudad (≥85 verde, 65–84 amarillo, <65 rojo).
- **Toast**: abajo al centro, fondo `--ink`, radio `--r-md`, `--sh-toast`, 2,6 s.
- **Modal / hoja inferior**: en móvil sube desde abajo (radio 22 arriba, asa de 44×5); en web, centrado. Overlay `rgba(28,26,36,.45)`.
- **Aviso (note)**: info `--surface-2`, aviso `--yellow-soft`, error `--red-soft`; radio `--r-md`.
- **Kicker**: `--t-kicker` en mayúsculas, `--muted-2` (o `--orange-dark` en la marca). **Skeleton** con `shimmer` al cargar.
- **Encabezado de panel**: logo + menú lateral en web, barra superior + pestañas en móvil (ya en `AppShell`).

## 1 · Estudiante (portal, sin sesión) — meta: menos de 1 minuto
Encabezado: logo, "Atrás", "Paso n de 4"; pie "¿Problemas? Escríbele a tu monitor". Tocar un día o una hora avanza solo.
- **Ingreso**: kicker "Proyecto final · 2026", "Elige la hora de tu presentación", "Presentas tu proyecto ante un mentor durante 15 minutos. Te toma menos de un minuto." Campo "Número de documento" (placeholder "Sin puntos ni espacios"), botón **Buscar mi proyecto**, ayuda "Sirve el documento de cualquiera de los integrantes."
  Errores: "Escribe tu número de documento" · "Escribe solo números, sin puntos ni espacios" · "El número parece incompleto. Revísalo."
- **Buscando**: kicker "Un momento", "Buscando tu proyecto…".
- **No encontrado**: "Tu documento no aparece" · "Revisa que el número esté bien escrito. Si sigue sin aparecer, escríbele a tu monitor." Muestra "Número que escribiste". Botones **Intentar con otro número**, **Escribirle a mi monitor**.
- **Paso 1 · Tus datos** (solo lectura): "Hola, {nombre}" · "Revisa que todo esté bien. Aquí no se puede editar." Tarjetas "Tú" y "Tu pareja (no se puede cambiar)" o "Proyecto individual"; "TU PROYECTO" con nombre y descripción. Documento, celular y correo enmascarados. Botón **Mis datos están bien, elegir hora**; enlace "¿Algo está mal? Escríbele a tu monitor".
- **Paso 2 · Día**: "¿Qué día presentas?" · "Estos son los días habilitados para {ciudad}." Tarjetas de día (día de la semana, número, mes). Sin etiquetas de cupo.
- **Paso 3 · Hora**: "¿A qué hora?" · "{día} · Hora COL · 15 minutos". Bloques agrupados por hora.
- **Paso 4 · Confirmar**: kicker "Último paso", "Confirma tu hora" · "Revisa antes de confirmar." TU PRESENTACIÓN (día, hora, "15 minutos · Hora COL"), INTEGRANTES. Botones **Confirmar mi hora** (ocupado: "Reservando tu hora…"), **Elegir otra hora**. Nota: "Si necesitas cambiarla, escríbele a tu monitor."
- **Éxito (boleto)**: kicker "Hora confirmada", "¡Listo! Ya tienes tu hora" · "Presentas ante un mentor por 15 minutos. Conéctate 5 minutos antes." Boleto: día, HORA COL, "15 minutos con tu mentor", PROYECTO, integrantes. "Tu monitor te enviará el enlace de la sala por WhatsApp." (sin correos). Botón **Agregar a mi calendario** (→ "Agregado a tu calendario").
- **Ya tienes una hora**: kicker "Todo en orden" · "Tu compañero/a {nombre} ya eligió la hora." o "Ya elegiste tu hora antes." Muestra el boleto.
- **Esa hora se acaba de ocupar** (aviso sobre el paso 3): "Esa hora se acaba de ocupar, elige otra." · "Alguien la confirmó segundos antes que tú."
- **Ya no quedan horas en tu día**: "Escríbele a tu monitor para que te ayude."
- **Aún cerradas**: "Todavía no puedes elegir tu hora" · "Las inscripciones abren pronto. Guarda la fecha." + fecha y hora de apertura.
- **Cerradas**: "Las inscripciones ya cerraron" · "Si aún no tienes hora, escríbele a tu monitor."
- **Demasiados intentos** (429): "Demasiados intentos. Espera unos minutos e intenta otra vez."

## 2 · Monitor (solo sus ciudades)
- **Login**: "Ingresa a tu panel" · "Usa el usuario y la clave que te dio coordinación." Usuario, Clave, **Entrar**, "¿Olvidaste la clave? Pídela a coordinación". Error en rojo bajo el formulario.
- **Mi grupo**: título "{Ciudad} · {Grupo}", barra de avance "{n} de {m} con hora", filtros Todos / Sin hora / Eligió, búsqueda por nombre o documento, lista Integrantes · Proyecto · Estado (chip Eligió + hora, o Sin hora). Botones **Copiar pendientes** (texto para WhatsApp → toast "Copiado") y **Copiar enlace de inscripción**.
- Estados: cargando (skeleton), "¡Tu grupo está al día!", sin resultados ("Prueba con otro nombre o con el número de documento." + **Limpiar búsqueda**). Móvil: la lista pasa a tarjetas.

## 4 · Coordinación (todas las ciudades)
- **Resumen**: "Avance total" en % y "{n} de {m} proyectos con hora"; tabla Por ciudad (Ciudad, Avance, Con hora, Cupos, Días) de menor a mayor avance; Ocupación por día (Libre → Lleno, "Ocupados / capacidad").
- **Cronograma en Excel**: "Día, hora, mentor, sala, monitor e integrantes… Una hoja por día." Botón **Descargar cronograma** → "Generando Excel…" → "Descargado ✓"; error "No pudimos generar el archivo" · "Revisa tu conexión e intenta otra vez. Los datos no se perdieron." **Intentar de nuevo**.

## 5 · Administrador (además de lo de coordinación)
- **Tablero** (hora COL): franjas con sus proyectos y columna "Sin hora". Detalle de tarjeta: HORA, MENTOR, MONITOR, INTEGRANTES, HISTORIAL DE CAMBIOS; acciones liberar y cambiar hora. Avisos: franja llena (rojo, "No cabe.") y ciudad sin ese día (amarillo, **Mover de todas formas** / **Cancelar**).
- **Franjas y mentores** y **Reglas de cupos** (Ciudad, Cupos reservados, Máximo del día, "El sobrante va para"): en Fase 1 se ven, se cargan por Excel (hoja Cupos).
- **Importar inscritos**: vista previa con filas con error y avisos; si no reconoce una columna obligatoria, "Elige qué columna corresponde a cada campo"; monitores por asignar; "Importar {n} proyectos". **Usuarios y roles**: ya existen.

## 3 · Mentor (fuera de Fase 1)
Agenda, login con código y "Calificar" (diseño con Sofka). No se construye en esta fase.
- **Modo oscuro**: solo tokens. Texto sobre `--ink` usa `--on-ink` (se invierte); fondos blancos usan `--card`; velos `--overlay`; el panel de marca del login `--night`. Nada de `#fff` como fondo en componentes nuevos.

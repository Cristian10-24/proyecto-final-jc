# Citaciones por Google Calendar · Proyecto final JC 2026

La pantalla **Administración → Citaciones** (`/admin/citaciones`, solo admin) envía las invitaciones de calendario de las
presentaciones desde la cuenta organizadora (jovenescreativos@tocaunavida.org), sobre su calendario principal:

- **Participantes** («Presentación de Proyecto Final · Jóvenes creaTIvos 2026»): un evento por proyecto en su bloque
  de 15 min; invitados solo sus integrantes. Lleva fecha, hora (hora Colombia; Colonia y Paysandú también hora Uruguay), sala, enlace y «Ten en cuenta». Sin datos
  del monitor ni contactos de nadie.
- **Mentores** («Calificación de proyectos · …»): un evento por franja (bloques con proyecto unidos si hay ≤ 30 min
  entre ellos). Lleva sala, enlace, nombre y **celular del monitor** a cargo, y de los participantes solo los nombres.
- **Monitores** («Monitoría de salas · …»): un evento por franja de SUS salas. Por sala: horario, enlace, nombre y
  **celular del mentor**, y nombre, celular y correo de cada integrante.

Los invitados no se ven entre sí ni pueden invitar ni editar. Todo deja registro (colección `citaciones` + changeLog).

## 1. Credenciales de Google (una sola vez)
1. Google Cloud Console, con una cuenta de tocaunavida.org → proyecto nuevo (p. ej. `pfjc-citaciones`).
2. **APIs y servicios → Biblioteca** → habilitar **Google Calendar API**.
3. **Pantalla de consentimiento de OAuth**: tipo **Interno** (Workspace), nombre de la app, correo de soporte. Alcance:
   solo `https://www.googleapis.com/auth/calendar.events`.
4. **Credenciales → Crear ID de cliente de OAuth** → tipo «Aplicación web» → URI de redireccionamiento:
   `https://developers.google.com/oauthplayground`.
5. Refresh token con el [OAuth Playground](https://developers.google.com/oauthplayground): engranaje → «Use your own
   OAuth credentials» (pega ID y secreto) → en el paso 1 escribe el alcance `https://www.googleapis.com/auth/calendar.events`
   → «Authorize APIs» **iniciando sesión con jovenescreativos@** → paso 2 «Exchange authorization code for tokens» →
   copia el **Refresh token**.
6. Vercel → Settings → Environment Variables (nunca en el repositorio ni en archivos `.env` subidos):

| Variable | Valor | Ambientes |
| --- | --- | --- |
| `GOOGLE_CAL_CLIENT_ID` | ID de cliente de OAuth | Production y Preview |
| `GOOGLE_CAL_CLIENT_SECRET` | Secreto del cliente | Production y Preview |
| `GOOGLE_CAL_REFRESH_TOKEN` | Refresh token de jovenescreativos@ | Production y Preview |
| `CITACIONES_CORREO_PRUEBA` | Tu correo de prueba (distinto de jovenescreativos@) | **Siempre en Preview**; en Production solo durante la primera prueba |

Sin las tres primeras, la pantalla dice «Google Calendar no está conectado» y no envía nada. Con
`CITACIONES_CORREO_PRUEBA` mal escrita, la pantalla muestra el error y no hace nada (ni siquiera marcar).
La app nunca muestra ni registra los secretos. Si el token deja de servir (revocado o cambio de clave), repite el paso 5.

## 2. Modo prueba (`CITACIONES_CORREO_PRUEBA`)
- Arriba de la pantalla, aviso fijo: **«MODO PRUEBA: todas las invitaciones van a <correo>»**.
- Cada evento lleva como único invitado ese correo y su título empieza con **«[PRUEBA] »**. La app bloquea además, en
  el propio cliente de Google, cualquier envío a otro invitado.
- En modo prueba no se marca nada «como citado» y nunca se toca lo ya citado de verdad.
- Usa un correo distinto de la cuenta organizadora: Google no le envía invitaciones al organizador.
- Debe ser un correo de administración: la descripción del evento de prueba indica a quiénes se habría invitado
  (correos reales de estudiantes, mentores o monitores).

## 3. Prueba en Preview con un proyecto y tu correo
1. La rama en Preview usa la base `proyecto_final_jc_pruebas` (ver DESPLIEGUE.md §7). Datos: la demo
   (`npm run semilla:demo:atlas -- --reset --si-atlas-pruebas`) o los tuyos de prueba.
2. Entra como admin → **Citaciones**. Debe verse el aviso amarillo de MODO PRUEBA con tu correo.
3. Elige el día → pestaña **Participantes** → **Vista previa** de un proyecto: revisa título, hora, sala, enlace,
   mentor, monitor y «Ten en cuenta». El único invitado debe ser tu correo.
4. **Citar** ese proyecto: te llega la invitación «[PRUEBA] …» y la fila pasa a «Citado · Prueba».
5. Cambia la hora del proyecto en Horarios (o su mentor, o la sala en Salas): la fila queda «Desactualizado» y dice
   qué cambió → **Actualizar**: te llega la actualización del MISMO evento (no uno nuevo). El texto «Ten en cuenta» NO
   marca desactualizado (decisión del Paso 27): solo se usa en las citaciones que se envíen después de guardarlo.
6. Repite con una fila de **Mentores** y una de **Monitores** (la del monitor trae los contactos de los integrantes).
7. **Cancelar** cada fila probada: te llega la cancelación y el evento sale del calendario de jovenescreativos@.

## 4. Publicación (Production)
1. Unir la rama a `main` como dice DESPLIEGUE.md §7 (respaldo antes). Sin migraciones: solo colecciones nuevas
   (`citaciones`, `citaciones_config`) y el campo opcional `celular` de los usuarios.
2. Primera prueba en Production: agrega `CITACIONES_CORREO_PRUEBA` también a **Production** → Redeploy → cita y
   cancela un proyecto real (te llega solo a ti).
3. Borra `CITACIONES_CORREO_PRUEBA` de Production → **Redeploy** (sin redeploy sigue en modo prueba). El aviso amarillo
   debe desaparecer.
4. Revisa celulares de monitores (Usuarios → Editar) y el texto «Ten en cuenta». Luego, por día y pestaña:
   **Citar todos los pendientes de este día** (pide confirmación con cuántos y a quiénes; envía lotes de 10 y muestra el
   avance; no cierres la página). Las que fallen quedan en «Error» con el motivo: **Reintentar**.
5. Lo que ya citaste por fuera: **Marcar como citado** (o «Marcar todos como citados (sin evento)»). Si después cambia,
   «Actualizar» crea un evento nuevo: cancela a mano en Google Calendar el que enviaste por fuera.
6. Si alguien cambia de hora, mentor o sala después de citar, su fila queda «Desactualizado»: **Actualizar** reenvía el
   mismo evento. Si ya no va ese día, aparece «Ya no va este día»: **Cancelar**.

## 5. Límites y errores
- Google limita los envíos: la app espera y reintenta ante 403 (límite), 429 y 5xx, con tope de tiempo. Un error
  queda en la fila; un reintento o un doble clic actualiza el mismo evento, nunca crea otro.
- Una fila «Enviando…» está tomada por otro envío; se libera sola a los 5 minutos si ese envío se cortó.

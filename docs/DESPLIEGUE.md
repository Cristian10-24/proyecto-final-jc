# Despliegue · Proyecto final JC 2026

Guía para publicar las Fases 1 a 3 (inscripción, evaluación, salas, monitores, tablero, reglas de cupos).
**La haces tú**: Claude no crea cuentas, no hace push y no despliega.
Marca cada casilla al terminar. Los secretos nunca van al repositorio, a un chat ni a un Excel.

## 0. Antes de empezar (en local)
- [ ] `npm test`, `npm run test:db` (con `npm run db:local` abierta), `npm run typecheck` y `npm run build` pasan.
- [ ] `git status` limpio y la última entrada de `docs/BITACORA.md` corresponde al último commit.
- [ ] Revisa `docs/PENDIENTES.md` (en especial, el Excel de horarios corregido).

## 1. GitHub
- [ ] Crea el repositorio **privado** `proyecto-final-jc` en la cuenta u organización de la fundación.
- [ ] Súbelo desde esta carpeta (`git remote add origin …` y `git push -u origin main`).
- [ ] Revisa en GitHub que NO estén: `.env*`, `.mongo-data/`, Excel reales (solo `docs/plantillas/*.xlsx` con datos inventados) ni `docs/diseno/evaluacion/`.
- [ ] Ya con remoto, corre la skill `security-review` (antes no se podía, ver PENDIENTES).

## 2. MongoDB Atlas: dos bases, dos usuarios
- [ ] Cluster en **AWS us-east-1 (N. Virginia)**, la misma región que Vercel (`iad1`).
- [ ] Un usuario de base de datos **distinto para cada base**, cada uno con `readWrite` **solo sobre la suya** (no `readWriteAnyDatabase`, no admin) y clave larga generada. **Nunca tu usuario personal**: tiene acceso a otras bases del cluster que usan otras apps.

| Base | Usuario de Atlas | Permiso | Dónde se usa |
| --- | --- | --- | --- |
| `proyecto_final_jc` | p. ej. `pfjc-produccion` | `readWrite@proyecto_final_jc` | Solo en el ambiente **Production** de Vercel |
| `proyecto_final_jc_pruebas` | p. ej. `pfjc-pruebas` | `readWrite@proyecto_final_jc_pruebas` | Solo en el ambiente **Preview** de Vercel y en tu `.env.atlas.local` |

- [ ] Así, si una clave se filtra, solo expone su base: la de pruebas nunca puede tocar la de producción, ni al revés.
- [ ] Network Access: permitir el acceso de Vercel (con plan M0 suele ser `0.0.0.0/0`; la protección es el usuario de mínimo privilegio y la clave).
- [ ] Copia la cadena de conexión `mongodb+srv://…` solo para pegarla en Vercel (paso 3).
- [ ] Nunca uses esta cadena en tu computador: en local siempre es la base de `npm run db:local`.

## 3. Vercel
- [ ] Importa el repositorio de GitHub como proyecto `proyecto-final-jc` (framework Next.js; la región sale de `vercel.json`: `iad1`).
- [ ] Node.js 22 en Project Settings → General (coincide con `.node-version`).
- [ ] Variables de entorno, **separadas por ambiente** (Project Settings → Environment Variables, marcando solo el ambiente indicado):
  - **Production**: `MONGODB_URI` con el usuario `pfjc-produccion`, `MONGODB_DB=proyecto_final_jc` y su propio `SESSION_SECRET`.
  - **Preview**: `MONGODB_URI` con el usuario `pfjc-pruebas`, `MONGODB_DB=proyecto_final_jc_pruebas` y **otro** `SESSION_SECRET` (así una sesión de pruebas no sirve en producción).
  - Ninguna variable de base de datos en "All Environments" ni en Development.

| Variable | Valor | Obligatoria |
| --- | --- | --- |
| `MONGODB_URI` | La cadena `mongodb+srv://…` con el usuario de ESE ambiente | Sí |
| `MONGODB_DB` | `proyecto_final_jc` (Production) · `proyecto_final_jc_pruebas` (Preview) | Sí |
| `SESSION_SECRET` | Texto aleatorio de 32+ caracteres (p. ej. `openssl rand -hex 32`) | Sí |
| `MONGODB_MAX_POOL` | `5` (por defecto) | No |
| `PFJC_MODO` | **No la definas en Vercel** (es solo para el modo Atlas de pruebas en local) | — |
| `STUDENT_PORTAL_OPENS_AT` | Apertura general en UTC, p. ej. `2026-11-09T13:00:00Z` (8:00 a. m. COL). Manda sobre todo | No |
| `STUDENT_PORTAL_CLOSES_AT` | Cierre general en UTC. Normalmente no hace falta: el cierre por ciudad se maneja en Reglas de cupos | No |
| `STUDENT_PORTAL_ENABLED` | `false` solo para cerrar el portal de emergencia | No |
| `RATE_LIMIT_DOC_MAX` / `RATE_LIMIT_IP_MAX` | `15` / `300` por defecto | No |

- [ ] Deployment Protection: deja activa la protección de Vercel para los despliegues **Preview** (solo personas del equipo los abren).
- [ ] Despliega y abre `/login`: debe responder 200 y traer el encabezado `Content-Security-Policy` (en las DevTools, sin errores de CSP en la consola).
- [ ] Revisa en los logs de Vercel que no aparezcan errores de conexión a Mongo.

## 3b. Preview con la demo (antes de producción)
- [ ] Con tu `.env.atlas.local` (usuario `pfjc-pruebas`, `MONGODB_DB=proyecto_final_jc_pruebas`): `npm run semilla:demo:atlas -- --reset --si-atlas-pruebas --hoy=2026-11-12`. Se niega sin `--si-atlas-pruebas` y con cualquier otra base. La clave de los usuarios `*.demo` se genera al azar (no es `demo-2026`) y se muestra **una sola vez** en la terminal: guárdala.
- [ ] Haz un despliegue Preview (una rama distinta de `main`) y prueba con esas cuentas: portal, monitor, mentor, tablero, reglas, franjas, en claro y oscuro.
- [ ] Nunca corras la semilla demo contra `proyecto_final_jc`.

## 4. Datos y usuarios (en producción), en este orden
- [ ] Primer admin: desde tu computador, con `MONGODB_URI` de Atlas solo en esa terminal y por esa vez, `npm run usuario:add -- <usuario> "Nombre" --rol=admin --atlas`. Sin `--atlas` el script se niega a escribir fuera de la base local. Cierra esa terminal al terminar.
- [ ] Importar → Mentores y disponibilidad (Excel corregido: Horarios, Cupos y Mentores) → revisa la vista previa (horas por mentor, cupos por día) → confirma.
- [ ] Usuarios → «Cargar varias personas desde Excel» (Nombre · Correo · Rol): mentores con el nombre igual que en Horarios, monitores (Ciudades opcional) y coordinación. Entrega las claves temporales que se muestran una sola vez. Revisa la «Revisión de nombres».
- [ ] Importar → Salas y monitores (Salas con sus 7 enlaces, Monitores o Disponibilidad monitores) → confirma → Salas: revisa salas sin monitor.
- [ ] Importar → Proyectos (archivo de inscritos, con Ruta) → revisa columnas, errores por fila y monitores por asignar → confirma.
- [ ] Horarios → asigna monitor a los proyectos "por asignar".
- [ ] Reglas de cupos → revisa cada día y el «Cierre de inscripciones por ciudad» (por defecto 24 h antes del primer bloque; Barranquilla, que abre el mismo día que presenta, necesita cierre a mano).
- [ ] No cargues la semilla local ni la demo en la base de producción (las dos se niegan).

## 5. Prueba antes de abrir
- [ ] Con 2–3 estudiantes reales (de distintas ciudades, uno en pareja): entrar, ver sus datos enmascarados, elegir hora, ver el boleto (en computador y en celular).
- [ ] Monitor: /monitor muestra sus ciudades y "Copiar pendientes" funciona; «Mis salas» muestra sus salas.
- [ ] Mentor: «Mis evaluaciones» muestra sus proyectos con sala y «Abrir sala».
- [ ] Coordinación: /admin muestra el avance, el Excel del cronograma se descarga y «Seguimiento general» abre (solo lectura del tablero).
- [ ] Admin: mover una hora de prueba en el Tablero, liberarla y comprobar el historial.
- [ ] Desde el celular, por datos móviles (no el wifi de la oficina).

## 6. Apertura y durante las inscripciones
- [ ] Ajusta `STUDENT_PORTAL_OPENS_AT` / `CLOSES_AT` y vuelve a desplegar (las variables se leen al arrancar).
- [ ] Comparte el enlace con los monitores ("Copiar enlace de inscripción").
- [ ] Si algo falla: `STUDENT_PORTAL_ENABLED=false` cierra el portal sin tocar los datos.
- [ ] Respaldo: activa los backups de Atlas (o exporta las colecciones `proyectos`, `asientos`, `dias` y `changeLog` antes de abrir y al cerrar).

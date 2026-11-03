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

## 2. MongoDB Atlas
- [ ] Cluster en **AWS us-east-1 (N. Virginia)**, la misma región que Vercel (`iad1`).
- [ ] Base `proyecto_final_jc`. Usuario de base de datos **nuevo, solo para producción, con readWrite únicamente sobre `proyecto_final_jc`** (no `readWriteAnyDatabase`, no admin) y clave larga generada. **Nunca tu usuario personal**: tiene acceso a otras bases del cluster que usan otras apps.
- [ ] El usuario de pruebas (`.env.atlas.local`, base `proyecto_final_jc_pruebas`) tampoco va a Vercel.
- [ ] Network Access: permitir el acceso de Vercel (con plan M0 suele ser `0.0.0.0/0`; la protección es el usuario de mínimo privilegio y la clave).
- [ ] Copia la cadena de conexión `mongodb+srv://…` solo para pegarla en Vercel (paso 3).
- [ ] Nunca uses esta cadena en tu computador: en local siempre es la base de `npm run db:local`.

## 3. Vercel
- [ ] Importa el repositorio de GitHub como proyecto `proyecto-final-jc` (framework Next.js; la región sale de `vercel.json`: `iad1`).
- [ ] Node.js 22 en Project Settings → General (coincide con `.node-version`).
- [ ] Variables de entorno (Production; en Preview solo si vas a usar despliegues de prueba con OTRA base):

| Variable | Valor | Obligatoria |
| --- | --- | --- |
| `MONGODB_URI` | La cadena `mongodb+srv://…` de Atlas con el usuario de producción | Sí |
| `MONGODB_DB` | `proyecto_final_jc` | Sí |
| `SESSION_SECRET` | Texto aleatorio de 32+ caracteres (p. ej. `openssl rand -hex 32`) | Sí |
| `MONGODB_MAX_POOL` | `5` (por defecto) | No |
| `PFJC_MODO` | **No la definas en Vercel** (es solo para el modo Atlas de pruebas en local) | — |
| `STUDENT_PORTAL_OPENS_AT` | Apertura general en UTC, p. ej. `2026-11-09T13:00:00Z` (8:00 a. m. COL). Manda sobre todo | No |
| `STUDENT_PORTAL_CLOSES_AT` | Cierre general en UTC. Normalmente no hace falta: el cierre por ciudad se maneja en Reglas de cupos | No |
| `STUDENT_PORTAL_ENABLED` | `false` solo para cerrar el portal de emergencia | No |
| `RATE_LIMIT_DOC_MAX` / `RATE_LIMIT_IP_MAX` | `15` / `300` por defecto | No |

- [ ] Despliega y abre `/login`: debe responder 200.
- [ ] Revisa en los logs de Vercel que no aparezcan errores de conexión a Mongo.

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

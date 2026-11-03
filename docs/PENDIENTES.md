# Pendientes al cierre de la Fase 1

Lo que queda abierto. Cada línea dice quién lo hace. Al resolver una, se borra de aquí y se anota en la bitácora.

## Del usuario (datos y pruebas)
- Excel de horarios: quitar 4 horas a Jhan Carlos (queda en 23) y 2 a Yehiron (queda en 30), y reimportar antes de abrir inscripciones.
- Excel original: "Martes 16" → "Martes 17" (Hoja 1, A5) y "Stiven Posada" en Mentores!B15 (con correo y celular si los hay).
- Recargar la semilla local para tener el monitor de prueba: `npm run semilla:local -- --reset` (borra los proyectos y reservas locales de prueba).
- Probar /monitor con `monitor.prueba` (Cali y Cartagena) y el portal en un celular real por el wifi.
- Archivo real de inscritos: importarlo y revisar en la vista previa columnas reconocidas, monitores por asignar y errores por fila.

- Atlas: crear un usuario de base de datos con readWrite SOLO sobre `proyecto_final_jc_pruebas` y ponerlo en `.env.atlas.local` en lugar del usuario personal (que tiene acceso a otras bases del cluster).
- Confirmar que `revisor-pruebas` corre con los permisos de `.claude/settings.json` (en esta sesión el modo automático negó lanzar el subagente; puede requerir abrir una sesión nueva).

## Técnicos (bajos, conscientes)
- Formato de fechas repetido en cinco componentes (ImportPanel, HorariosPanel, portal, SeguimientoPanel, ResumenPanel): unificar en un módulo de `src/lib`. Hoy hay diferencias menores ("Jue 12 de nov" / "jue 12 nov").
- `reservar` lee la colección `dias` completa en cada intento (menos de 10 documentos): se puede precalcular al importar si la carga lo pide.
- `sameOrigin` acepta peticiones sin cabecera Origin (lo cubre SameSite=Lax de la cookie).
- `agenda` no cuenta para el límite por documento: permite saber si un documento existe (sin datos personales), con el tope de fallos por IP.
- En la red local (`dev:red`) la IP del límite se puede falsificar con x-forwarded-for; en Vercel no.
- La clave de los usuarios de prueba está en `scripts/semilla-local.ts`; solo existe en la base local.
- Límites: revisar y luego contar (`bloqueado` + `contar`) permite que una ráfaga en paralelo pase un poco del tope por IP (login y portal). `intentar` (atómico) ya se usa para el límite por documento.
- Importar: `req.formData()` lee el archivo antes de revisar los 4 MB y exceljs no limita el tamaño descomprimido. Solo el admin importa y Vercel corta en 4,5 MB.
- Sin `Content-Security-Policy`: agregarla y probar que no rompa los scripts en línea de Next.
- La skill `security-review` necesita un remoto (`origin/HEAD`): se reemplazó por `revisor-seguridad` sobre todo el código. Correrla cuando exista el repositorio en GitHub.

## Para la Fase 2 (ver PLAN)
- Pasos 8 a 15: evaluación, salas y monitores, cambios sugeridos, seguimiento general y usuarios.

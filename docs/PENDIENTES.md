# Pendientes al cierre de la Fase 1

Lo que queda abierto. Cada línea dice quién lo hace. Al resolver una, se borra de aquí y se anota en la bitácora.

## Del usuario (datos y pruebas)
- Excel de horarios: quitar 4 horas a Jhan Carlos (queda en 23) y 2 a Yehiron (queda en 30), y reimportar antes de abrir inscripciones.
- Excel original: "Martes 16" → "Martes 17" (Hoja 1, A5) y "Stiven Posada" en Mentores!B15 (con correo y celular si los hay).
- Recargar la semilla local para tener el monitor de prueba: `npm run semilla:local -- --reset` (borra los proyectos y reservas locales de prueba).
- Probar /monitor con `monitor.prueba` (Cali y Cartagena) y el portal en un celular real por el wifi.
- Archivo real de inscritos: importarlo y revisar en la vista previa columnas reconocidas, monitores por asignar y errores por fila.

- Atlas: crear un usuario de base de datos con readWrite SOLO sobre `proyecto_final_jc_pruebas` y ponerlo en `.env.atlas.local` en lugar del usuario personal (que tiene acceso a otras bases del cluster).

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

## Fase 3 (ver PLAN)
- Pasos 16 a 18 y cierre técnico, antes de las presentaciones del 12; el despliegue va después.

## Pendiente de construir (pedido por el usuario)
- Pantalla 5b "Franjas y mentores" (/admin/franjas), como el prototipo Admin.dc.html: selector de días; por hora, mentores como chips con "×" y "+ Agregar mentor", número de mentores y capacidad (1 mentor = 4 por hora; 0 mentores = no se ofrece); en la misma tabla, ocupados y libres ("10 de 16 · 6 libres") y libres por ciudad; en el encabezado del día, total, ocupados y libres; refresco periódico. Agregar un mentor crea sus asientos con las reglas del día (reutilizar el reetiquetado de `src/lib/reglasCupos.ts`) y recalcula el plan de salas; quitar solo si sus asientos de esa hora están libres (si no, mostrar los proyectos a mover); sin duplicados; changeLog; lo editado manda hasta la próxima importación de Horarios, con aviso. Solo admin edita; coordinación lee; lista en el celular. Se pospuso para publicar primero.

## Más adelante
- Correos a estudiantes (resultado y retroalimentación): el Excel de resultados ya trae "Asunto del correo" y "Mensaje para el estudiante". Mientras no haya correos, la pantalla del mentor dice "Guarda la evaluación".

## Mejoras futuras
- (El modo oscuro pasó al Paso 18 del PLAN.)

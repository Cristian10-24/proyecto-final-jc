# Pendientes al cierre de la Fase 3

Lo que queda abierto después del cierre técnico. Cada línea dice quién lo hace. Al resolver una, se borra de aquí y se
anota en la bitácora. El despliegue sigue en `docs/DESPLIEGUE.md`.

## Del usuario (datos, cuentas y pruebas)
- Excel de horarios: quitar 4 horas a Jhan Carlos (queda en 23) y 2 a Yehiron (queda en 30), y reimportar antes de abrir inscripciones.
- Excel original: "Martes 16" → "Martes 17" (Hoja 1, A5) y "Stiven Posada" en Mentores!B15 (con correo y celular si los hay).
- Archivo real de inscritos: importarlo y revisar en la vista previa columnas reconocidas, monitores por asignar y errores por fila.
- Atlas: dos usuarios de base de datos, cada uno con `readWrite` solo sobre su base (`proyecto_final_jc` para Production, `proyecto_final_jc_pruebas` para Preview y `.env.atlas.local`). Nunca el usuario personal. Ver DESPLIEGUE §2.
- GitHub y Vercel (DESPLIEGUE §1 y §3): repositorio privado, variables separadas por ambiente, protección de los Preview.
- Preview con la demo (`npm run semilla:demo:atlas -- --reset --si-atlas-pruebas --hoy=2026-11-12`) y prueba en un celular real por datos móviles.
- Con el repositorio en GitHub: correr la skill `security-review` (necesita `origin/HEAD`).

## Técnicos (bajos, conscientes)
- `npm run test:db` usa la misma base local que la demo del navegador (`proyecto_final_jc_pruebas`) y la borra: después de correr las pruebas, recargar la demo con `MONGODB_DB=proyecto_final_jc_pruebas npm run semilla:demo -- --reset --hoy=…`.
- `style-src` de la CSP lleva `'unsafe-inline'`: React escribe atributos `style="…"` al renderizar en el servidor y un nonce no los cubre. Solo afecta estilos (no ejecuta código); los scripts van solo con nonce.
- Cierre automático de inscripciones: "24 h antes del primer bloque del día" usa el primer bloque de ese día de cualquier ciudad, no el de la ciudad (si una ciudad empieza más tarde, cierra unas horas antes). Se puede fijar a mano por ciudad.
- Agregar o quitar un mentor en Franjas vuelve a aplicar las reglas de cupos a todos los libres del día: un reetiquetado manual hecho en Horarios sobre libres de ese día se recalcula.
- Excel de resultados: un celular que empieza por "+" sale con apóstrofo visible ('+57 …), por la protección contra fórmulas.
- Historial de "reprogramar" del monitor: muestra el identificador del mentor en vez de su nombre.
- Carga de usuarios por Excel: si la red se cae justo después de confirmar, las claves nuevas no se ven (habría que restablecerlas una por una). El aviso dice "No se pudo enviar".
- Ficha del monitor: para proyectos de Uruguay, la hora del cupo para reprogramar no dice "COL" ni la hora de Uruguay.
- Pantalla de evaluar: lo que se escribe mientras se está guardando queda marcado como guardado (el borrador automático lo vuelve a tomar al siguiente cambio).
- Botones deshabilitados (naranja claro con texto blanco) quedan bajo 3:1; la norma de contraste los exceptúa.
- Portal: `estadoCiudad` hace 3 consultas más en cada consulta, agenda y reserva (vigilar en Atlas M0 si la carga sube).
- Formato de fechas repetido en cinco componentes (ImportPanel, HorariosPanel, portal, SeguimientoPanel, ResumenPanel): unificar en un módulo de `src/lib`.
- `reservar` lee la colección `dias` completa en cada intento (menos de 10 documentos): se puede precalcular si la carga lo pide.
- `sameOrigin` acepta peticiones sin cabecera Origin (lo cubre SameSite=Lax de la cookie).
- `agenda` no cuenta para el límite por documento: permite saber si un documento existe (sin datos personales), con el tope de fallos por IP.
- En la red local (`dev:red`) la IP del límite se puede falsificar con x-forwarded-for; en Vercel no.
- Límites: revisar y luego contar (`bloqueado` + `contar`) permite que una ráfaga en paralelo pase un poco del tope por IP (login y portal).
- Importar: `req.formData()` lee el archivo antes de revisar los 4 MB y exceljs no limita el tamaño descomprimido. Solo el admin importa y Vercel corta en 4,5 MB.
- Las claves fáciles de prueba (`semilla-local`, `semilla:demo` local) solo existen en la base local; en Atlas la demo genera una al azar.

## Más adelante
- Correos a estudiantes (resultado y retroalimentación): el Excel de resultados ya trae "Asunto del correo" y "Mensaje para el estudiante". Mientras no haya correos, la pantalla del mentor dice "Guarda la evaluación".

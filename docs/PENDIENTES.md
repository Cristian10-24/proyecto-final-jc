# Pendientes al cierre de la Fase 3

Lo que queda abierto después del cierre técnico. Cada línea dice quién lo hace. Al resolver una, se borra de aquí y se
anota en la bitácora. El despliegue sigue en `docs/DESPLIEGUE.md`.

## Del usuario (datos, cuentas y pruebas)
- Excel de horarios: quitar 4 horas a Jhan Carlos (queda en 23) y 2 a Yehiron (queda en 30), y reimportar antes de abrir inscripciones.
- Excel original: "Martes 16" → "Martes 17" (Hoja 1, A5) y "Stiven Posada" en Mentores!B15 (con correo y celular si los hay).
- Archivo real de inscritos: importarlo y revisar en la vista previa columnas reconocidas, monitores por asignar y errores por fila.
- Atlas: dos usuarios de base de datos, cada uno con `readWrite` solo sobre su base (`proyecto_final_jc` para Production, `proyecto_final_jc_pruebas` para Preview y `.env.atlas.local`). Nunca el usuario personal. Ver DESPLIEGUE §2.
- Vercel (DESPLIEGUE §3): variables separadas por ambiente y protección de los Preview. (GitHub ya está: Fundacion-ROFE/proyecto-final-jc.)
- Preview con la demo (`npm run semilla:demo:atlas -- --reset --si-atlas-pruebas --hoy=2026-11-12`) y prueba en un celular real por datos móviles.

## Técnicos (bajos, conscientes)
- Gestión manual de proyectos: después de crear, separar o unir proyectos a mano, **no reimportes el Excel de inscritos** sin revisar la vista previa: el importador empareja por código y documento, y podría volver a juntar una pareja separada (o chocar con el documento ya movido).
- Al unir proyectos, si el estudiante del proyecto eliminado reserva en ese mismo instante, su asiento se repara justo después de la transacción (pasa al proyecto unido o se libera). Si el proceso se cayera entre las dos cosas, ese asiento quedaría con un proyecto que ya no existe (se ve en Horarios → asientos ocupados sin proyecto).
- `respaldo:produccion` es de solo lectura por código, pero usa el usuario `pfjc_produccion` (que puede escribir): para garantía total, un usuario de Atlas con rol `read`.
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
- Cerrar sesión solo borra la cookie (no sube `tokenVersion`): una cookie robada sirve hasta que vence (7 días) salvo que el admin restablezca la clave o desactive al usuario.
- `agenda` no cuenta para el límite por documento: permite saber si un documento existe (sin datos personales), con el tope de fallos por IP.
- En la red local (`dev:red`) la IP del límite se puede falsificar con x-forwarded-for; en Vercel no.
- Límites: revisar y luego contar (`bloqueado` + `contar`) permite que una ráfaga en paralelo pase un poco del tope por IP (login y portal).
- Importar: `req.formData()` lee el archivo antes de revisar los 4 MB y exceljs no limita el tamaño descomprimido. Solo el admin importa y Vercel corta en 4,5 MB.
- Las claves fáciles de prueba (`semilla-local`, `semilla:demo` local) solo existen en la base local; en Atlas la demo genera una al azar.

- Modo orden de llegada: el interruptor se lee antes de la transacción (reserva, reprogramar, mover y aprobar). Justo en el instante en que el admin lo enciende o apaga, una acción en curso puede ir con el modo anterior (p. ej. una reserva sin candado que pasa el tope en 1, o un reprogramar que toma un asiento de otra ciudad).
- Modo orden de llegada: editar la ciudad de un proyecto con hora o unir proyectos de distinta ciudad conservando la hora del otro escribe el candado (las reservas lo cuentan), pero no avisa si la ciudad nueva queda sobre el tope: el admin la deja así sin confirmación (se ve en la tarjeta de Reglas).
- «Sin proyecto»: agregar un integrante nuevo o cambiar un documento en Editar revisa «Sin proyecto» dentro de su transacción (o antes), no después; si en ese mismo instante otro admin carga ese documento en «Sin proyecto», puede quedar en los dos (el portal muestra el proyecto). Igual con el importador, que revisa en la vista previa.
- «Sin proyecto»: convertir crea el proyecto y luego marca el registro como convertido; si alguien quita al participante en ese instante (o el proceso se cae entre los dos pasos), el proyecto queda creado y el registro borrado o pendiente.
- «Sin proyecto»: el portal revela que un documento está «sin proyecto» (cuenta para el límite por documento, no para el de la IP), sin dar nombre, ciudad ni datos.
- Comentarios: el texto anterior de un comentario editado se guarda (`anteriores`) pero no se muestra en pantalla; coordinación solo ve la marca «editado».
- Edición del estudiante: quien conozca el documento de otro puede cambiarle el nombre y la descripción (lo cubren el límite por documento, el historial y «Revertir»). Un estudiante sin hora cuya ciudad ya cerró ve «cerrado» y no llega a la pantalla para editar.
- Carga de mentores: el plan solo usa asientos que están libres al calcular; al aplicar una hora se liberan otros y el plan siguiente puede proponer más cambios (en la demo, 4 vueltas hasta quedar estable). En casos raros un proyecto cambia de mentor dos veces (la hora del estudiante nunca cambia). Con pocos proyectos por día, «Equilibrar» reparte mucho (en la demo, máximo 2 proyectos por mentor).
- Carga de mentores: el revisor de seguridad (subagente) no se pudo correr en este ajuste porque el sistema de permisos bloqueó su lanzamiento; la revisión se hizo a mano (ver bitácora).

## Más adelante
- Reserva que prefiera al mentor que ya tiene proyectos en esa hora (propuesta del Paso 24, sin implementar): antes del `findOneAndUpdate`, ordenar los mentores libres del bloque por proyectos en esa hora. A favor: menos horas sueltas sin mover a nadie. En contra: una consulta más por reserva y concentra la carga. Decidir después de ver el reporte de carga.
- Número de proyecto: hoy el código es `P-<documento>` (al separar una pareja puede quedar `P-<doc>` y `P-<doc>-2`).
  Más adelante, un número consecutivo propio que no dependa del documento.
- Correos a estudiantes (resultado y retroalimentación): el Excel de resultados ya trae "Asunto del correo" y "Mensaje para el estudiante". Mientras no haya correos, la pantalla del mentor dice "Guarda la evaluación".

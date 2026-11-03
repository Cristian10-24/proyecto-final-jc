// Texto de pendientes para pegar en WhatsApp. Puro: lo usan la pantalla del monitor y las pruebas.

type Fila = { nombre: string; ciudad: string; integrantes: { nombre: string }[]; hora: string | null };

/** Texto para pegar en WhatsApp con los proyectos que aún no eligen hora. */
export function textoPendientes(filas: Fila[], enlace: string): string {
  const pendientes = filas.filter((f) => !f.hora);
  if (!pendientes.length) return "";
  const porCiudad = new Map<string, typeof pendientes>();
  for (const f of pendientes) porCiudad.set(f.ciudad, [...(porCiudad.get(f.ciudad) ?? []), f]);
  const partes = [...porCiudad].map(([ciudad, fs]) =>
    [`*${ciudad}* · faltan ${fs.length}`, ...fs.map((f) => `• ${f.integrantes.map((i) => i.nombre).join(" y ")} — ${f.nombre}`)].join("\n"));
  return [`Proyecto final JC 2026: estos proyectos aún no eligen la hora de su presentación.`, ...partes,
    `Entra con tu documento y elige tu hora aquí: ${enlace}`].join("\n\n");
}

// Lo usa scripts/demo.mjs: imprime los usuarios demo y los documentos del portal, solo leyendo, por src/lib/db.ts
// (así valen sus candados: base permitida y sin operaciones de administración). Sale con 2 si no hay demo cargada.
async function main() {
  const { closeDb, collections, dbName } = await import("@/lib/db");

  const c = await collections();
  const usuarios = await c.users.find({ usuario: /\.demo$/, activo: true }, { projection: { usuario: 1, rol: 1, nombre: 1, ciudades: 1 } }).sort({ rol: 1, usuario: 1 }).toArray();
  if (!usuarios.length) {
    console.error(`La base "${dbName()}" no tiene usuarios demo. Carga la demo: npm run semilla:demo -- --reset`);
    await closeDb();
    process.exit(2);
  }
  const conHora = new Set((await c.asientos.find({ proyectoId: { $type: "objectId" } }, { projection: { proyectoId: 1 } }).toArray()).map((a) => String(a.proyectoId)));
  const proyectos = await c.proyectos.find({}, { projection: { ciudad: 1, integrantes: 1 } }).sort({ codigo: 1 }).toArray();
  const caso = (f: (p: (typeof proyectos)[number]) => boolean) => proyectos.find(f);
  const docs = (p?: (typeof proyectos)[number]) => (p ? p.integrantes.map((x) => x.documento).join(" / ") : "—");
  const portal = ([
    ["individual sin hora", caso((p) => p.integrantes.length === 1 && !conHora.has(String(p._id)))],
    ["pareja sin hora", caso((p) => p.integrantes.length > 1 && !conHora.has(String(p._id)))],
    ["con hora", caso((p) => conHora.has(String(p._id)))],
  ] as const).map(([nombre, p]) => ({ caso: nombre, ciudad: p?.ciudad ?? "—", documento: docs(p) }));

  console.log(`\nUsuarios demo (clave: demo-2026, SOLO base local) · base ${dbName()}`);
  console.table(usuarios.map((u) => ({ usuario: u.usuario, rol: u.rol, nombre: u.nombre, ciudades: u.ciudades.join(", ") || "—" })));
  console.log("Portal del estudiante (documentos):");
  console.table(portal);
  await closeDb();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

export {}; // módulo propio: su main() no choca con el de otros scripts

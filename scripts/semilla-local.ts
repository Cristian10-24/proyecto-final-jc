// Carga datos de prueba INVENTADOS en la base LOCAL que usa `npm run dev`, para probar el portal:
//   1000000001            → proyecto individual (Cali), sin hora.
//   1000000002 / ...0003  → proyecto en pareja (Cartagena), sin hora.
//   1000000004            → proyecto individual (Barranquilla) con hora ya reservada.
// También crea días, mentores de prueba, asientos y dos usuarios de prueba (clave abajo):
//   admin.prueba   → administración.
//   monitor.prueba → monitor de Cali y Cartagena (asignado a esos dos proyectos; Barranquilla queda "por asignar").
// Base: la local (127.0.0.1/localhost) o, con `npm run semilla:atlas`, SOLO proyecto_final_jc_pruebas en Atlas.
// Uso: npm run semilla:local            (falla si ya hay proyectos o asientos)
//      npm run semilla:local -- --reset (borra proyectos, asientos, días, mentores y changeLog de esa base)
//      npm run semilla:atlas -- --reset --si-atlas-pruebas  (en Atlas, --reset exige la confirmación)
// Para limpiar solo se borran documentos de las colecciones propias: nunca dropDatabase ni otra base.
import { ObjectId } from "mongodb";
import { generarAsientos, type HoraMentores } from "@/lib/agenda";
import type { CupoCiudad } from "@/lib/types";

const URI_LOCAL = "mongodb://127.0.0.1:27018/?replicaSet=rs0";
// Usuarios de prueba (base local o de pruebas, nunca producción). Misma clave para los dos.
const CLAVE_PRUEBA = "prueba-local-2026";
const USUARIOS_PRUEBA = [
  { usuario: "admin.prueba", nombre: "Admin Prueba Local", rol: "admin" as const, ciudades: [] as string[] },
  { usuario: "monitor.prueba", nombre: "Monitor Prueba Local", rol: "monitor" as const, ciudades: ["Cali", "Cartagena"] },
];

async function main() {
  const atlas = process.env.PFJC_MODO === "atlas"; // solo lo pone scripts/con-atlas.mjs
  if (!atlas) process.env.MONGODB_URI ||= URI_LOCAL;
  const { BASE_ATLAS_PRUEBAS, closeDb, collections, dbHost, dbName, esUriLocal } = await import("@/lib/db");
  if (atlas) {
    if (dbName() !== BASE_ATLAS_PRUEBAS) throw new Error(`Modo Atlas: solo ${BASE_ATLAS_PRUEBAS}.`);
    if (process.argv.includes("--reset") && !process.argv.includes("--si-atlas-pruebas"))
      throw new Error("En Atlas, --reset borra los datos de proyecto_final_jc_pruebas: confirma agregando --si-atlas-pruebas.");
  } else if (!esUriLocal(process.env.MONGODB_URI!)) {
    throw new Error(`semilla:local solo corre contra una base local; MONGODB_URI apunta a "${dbHost()}". Para Atlas usa npm run semilla:atlas.`);
  }

  const { reservar } = await import("@/lib/reservas");
  const { hashClave } = await import("@/lib/usuarios");
  const c = await collections();
  console.log(atlas ? `Base: ${dbName()} (Atlas de pruebas)` : `Base local: ${dbHost()} / ${dbName()}`);

  const hay = (await c.proyectos.countDocuments()) + (await c.asientos.countDocuments());
  if (hay && !process.argv.includes("--reset")) throw new Error("La base ya tiene proyectos o asientos. Usa --reset para reemplazarlos.");
  if (process.argv.includes("--reset"))
    await Promise.all([c.proyectos.deleteMany({}), c.asientos.deleteMany({}), c.dias.deleteMany({}), c.mentores.deleteMany({}), c.changeLog.deleteMany({}), c.rateLimits.deleteMany({}), c.ajustes.deleteMany({}), c.candadosCupo.deleteMany({}), c.sinProyecto.deleteMany({}), c.comentarios.deleteMany({})]);

  // Disponibilidad: 3 mentores en las horas del Excel real del jueves y el viernes; 2 el martes 17.
  const mentores = ["mentor-prueba-1", "mentor-prueba-2", "mentor-prueba-3"];
  const HORAS = [8, 9, 10, 11, 16, 17, 18, 19, 20];
  const horas: HoraMentores[] = [
    ...HORAS.map((hora) => ({ dia: "2026-11-12", hora, mentores })),
    ...HORAS.map((hora) => ({ dia: "2026-11-13", hora, mentores })),
    ...HORAS.map((hora) => ({ dia: "2026-11-17", hora, mentores: mentores.slice(0, 2) })),
  ];
  const cupos = new Map<string, CupoCiudad[]>([
    ["2026-11-12", [{ ciudad: "Cali", cupos: 70, sobrante: true, abre: null }, { ciudad: "Cartagena", cupos: 30, sobrante: false, abre: null }]],
    ["2026-11-13", [{ ciudad: "Cartagena", cupos: 40, sobrante: false, abre: null }, { ciudad: "Barranquilla", cupos: null, sobrante: true, abre: null }]],
    ["2026-11-17", [{ ciudad: "Barranquilla", cupos: 20, sobrante: false, abre: null }, { ciudad: "Todas", cupos: null, sobrante: true, abre: null }]],
  ]);
  const asientos = generarAsientos(horas, cupos);
  await c.mentores.insertMany(mentores.map((m, i) => ({ _id: m, nombre: `Mentor Prueba ${i + 1}` })));
  await c.dias.insertMany([...cupos].map(([dia, ciudades]) => ({ _id: dia, ciudades })));
  await c.asientos.insertMany(asientos.map((a) => ({ _id: new ObjectId(), ...a, proyectoId: null })));

  const now = new Date();
  const proyecto = (codigo: string, ciudad: string, monitor: string | null, nombre: string, descripcion: string, integrantes: { documento: string; nombre: string; celular?: string; correo?: string }[]) =>
    ({ _id: new ObjectId(), codigo, ciudad, monitor, nombre, descripcion, integrantes, creadoEn: now, actualizadoEn: now });
  await c.proyectos.insertMany([
    proyecto("P-1000000001", "Cali", "monitor.prueba", "App de reciclaje escolar", "Mapa de puntos de reciclaje y recordatorios de recolección para el colegio.",
      [{ documento: "1000000001", nombre: "Valentina Prueba Gómez", celular: "+573001110001", correo: "valentina.prueba@ejemplo.org" }]),
    proyecto("P-1000000002", "Cartagena", "monitor.prueba", "Guía turística por voz", "Recorridos narrados por audio para visitantes del centro histórico.", [
      { documento: "1000000002", nombre: "Andrés Prueba Pérez", celular: "+573011110002", correo: "andres.prueba@ejemplo.org" },
      { documento: "1000000003", nombre: "Mariana Prueba Castro", celular: "+573011110003", correo: "mariana.prueba@ejemplo.org" },
    ]),
    proyecto("P-1000000004", "Barranquilla", null, "Tienda virtual para artesanos", "Catálogo en línea y pedidos por WhatsApp para artesanos.",
      [{ documento: "1000000004", nombre: "Sofía Prueba Herrera", celular: "+573021110004", correo: "sofia.prueba@ejemplo.org" }]),
  ]);
  const r = await reservar("1000000004", new Date("2026-11-13T21:15:00Z")); // vie 13, 4:15 p. m. COL
  if (!r.ok) throw new Error(`No se pudo reservar la hora de prueba: ${r.error}`);

  for (const u of USUARIOS_PRUEBA)
    if (!(await c.users.findOne({ usuario: u.usuario })))
      await c.users.insertOne({ _id: new ObjectId(), ...u, passwordHash: await hashClave(CLAVE_PRUEBA), activo: true, tokenVersion: 0, creadoEn: now });

  console.log(`Listo: ${asientos.length} asientos, 3 proyectos (1 con hora), usuarios ${USUARIOS_PRUEBA.map((u) => u.usuario).join(" y ")} (clave en scripts/semilla-local.ts).`);
  await closeDb();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

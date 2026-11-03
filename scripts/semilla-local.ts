// Carga datos de prueba INVENTADOS en la base LOCAL que usa `npm run dev`, para probar el portal:
//   1000000001            → proyecto individual (Cali), sin hora.
//   1000000002 / ...0003  → proyecto en pareja (Cartagena), sin hora.
//   1000000004            → proyecto individual (Barranquilla) con hora ya reservada.
// También crea días, mentores de prueba, asientos y un admin de prueba (admin.prueba, clave abajo).
// Solo corre contra 127.0.0.1/localhost: si MONGODB_URI apunta a otro host (Atlas), se niega.
// Uso: npm run semilla:local            (falla si ya hay proyectos o asientos)
//      npm run semilla:local -- --reset (borra proyectos, asientos, días, mentores y changeLog de la base local)
import { ObjectId } from "mongodb";
import { generarAsientos, type HoraMentores } from "@/lib/agenda";
import type { CupoCiudad } from "@/lib/types";

const URI_LOCAL = "mongodb://127.0.0.1:27018/?replicaSet=rs0";
const ADMIN_PRUEBA = { usuario: "admin.prueba", clave: "prueba-local-2026" }; // solo base local

async function main() {
  process.env.MONGODB_URI ||= URI_LOCAL;
  const host = process.env.MONGODB_URI.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?]/)[0] ?? "";
  if (/mongodb\.net|\+srv/i.test(process.env.MONGODB_URI) || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))
    throw new Error(`La semilla solo corre contra una base local; MONGODB_URI apunta a "${host}".`);

  const { closeDb, collections, dbName } = await import("@/lib/db");
  const { reservar } = await import("@/lib/reservas");
  const { hashClave } = await import("@/lib/usuarios");
  const c = await collections();
  console.log(`Base local: ${host} / ${dbName()}`);

  const hay = (await c.proyectos.countDocuments()) + (await c.asientos.countDocuments());
  if (hay && !process.argv.includes("--reset")) throw new Error("La base local ya tiene proyectos o asientos. Usa --reset para reemplazarlos.");
  if (process.argv.includes("--reset"))
    await Promise.all([c.proyectos.deleteMany({}), c.asientos.deleteMany({}), c.dias.deleteMany({}), c.mentores.deleteMany({}), c.changeLog.deleteMany({}), c.rateLimits.deleteMany({})]);

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
  const proyecto = (codigo: string, ciudad: string, nombre: string, descripcion: string, integrantes: { documento: string; nombre: string; celular?: string; correo?: string }[]) =>
    ({ _id: new ObjectId(), codigo, ciudad, nombre, descripcion, monitor: null, integrantes, creadoEn: now, actualizadoEn: now });
  await c.proyectos.insertMany([
    proyecto("P-1000000001", "Cali", "App de reciclaje escolar", "Mapa de puntos de reciclaje y recordatorios de recolección para el colegio.",
      [{ documento: "1000000001", nombre: "Valentina Prueba Gómez", celular: "+573001110001", correo: "valentina.prueba@ejemplo.org" }]),
    proyecto("P-1000000002", "Cartagena", "Guía turística por voz", "Recorridos narrados por audio para visitantes del centro histórico.", [
      { documento: "1000000002", nombre: "Andrés Prueba Pérez", celular: "+573011110002", correo: "andres.prueba@ejemplo.org" },
      { documento: "1000000003", nombre: "Mariana Prueba Castro", celular: "+573011110003", correo: "mariana.prueba@ejemplo.org" },
    ]),
    proyecto("P-1000000004", "Barranquilla", "Tienda virtual para artesanos", "Catálogo en línea y pedidos por WhatsApp para artesanos.",
      [{ documento: "1000000004", nombre: "Sofía Prueba Herrera", celular: "+573021110004", correo: "sofia.prueba@ejemplo.org" }]),
  ]);
  const r = await reservar("1000000004", new Date("2026-11-13T21:15:00Z")); // vie 13, 4:15 p. m. COL
  if (!r.ok) throw new Error(`No se pudo reservar la hora de prueba: ${r.error}`);

  if (!(await c.users.findOne({ usuario: ADMIN_PRUEBA.usuario })))
    await c.users.insertOne({ _id: new ObjectId(), usuario: ADMIN_PRUEBA.usuario, nombre: "Admin Prueba Local", passwordHash: await hashClave(ADMIN_PRUEBA.clave), rol: "admin", ciudades: [], activo: true, tokenVersion: 0, creadoEn: now });

  console.log(`Listo: ${asientos.length} asientos, 3 proyectos (1 con hora), usuario ${ADMIN_PRUEBA.usuario} (clave en scripts/semilla-local.ts).`);
  await closeDb();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

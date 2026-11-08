// Semilla de DEMOSTRACIÓN con datos INVENTADOS, para probar todo antes de importar los datos reales.
//   npm run semilla:demo                       (falla si la base ya tiene proyectos o asientos)
//   npm run semilla:demo -- --reset            (borra proyectos, horarios, salas, evaluaciones y changeLog de la base local)
//   npm run semilla:demo -- --reset --hoy=2026-11-03   (mueve las presentaciones para que el día "en vivo" sea esa fecha)
//
// Pasa por los MISMOS importadores que los Excel reales (Mentores/Horarios/Cupos, Proyectos y Salas y monitores):
// los libros se arman en memoria con las reglas reales de Cupos. Base LOCAL (127.0.0.1/localhost) o, con
// `npm run semilla:demo:atlas -- --reset --si-atlas-pruebas`, SOLO proyecto_final_jc_pruebas en Atlas (para el Preview);
// se niega con cualquier otra. La clave fácil es SOLO local; en Atlas se genera una al azar.
//
// Día "en vivo": hoy si hoy cae entre el 12 y el 21 de noviembre; si no, el jueves 12. Con --hoy=AAAA-MM-DD
// (hasta el 21 de noviembre): si la fecha cae en esos días, ese es el día en vivo; si es antes del 12, todo el
// calendario se corre para que el jueves 12 caiga en esa fecha (las clausuras de las ciudades se siguen cumpliendo).
import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/lib/auth";
import type { Formulario } from "@/lib/evaluacion/criterios";

const URI_LOCAL = "mongodb://127.0.0.1:27018/?replicaSet=rs0";
const CLAVE = "demo-2026"; // SOLO local
const ACTOR = { rol: "admin" as const, usuario: "semilla.demo" };

// ---- calendario ----
const DIAS_REALES = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"];
const HORAS = [8, 9, 10, 11, 16, 17, 18, 19, 20]; // como el Excel real
const sumarDias = (dia: string, n: number) => new Date(Date.parse(dia + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

/** Ciudades que presentan cada día real (reglas de Cupos de la edición). "Todas" = las que no tienen días propios. */
const CIUDADES_DIA: Record<string, string[]> = {
  "2026-11-12": ["Cali", "Cartagena"], "2026-11-13": ["Cartagena", "Barranquilla"],
  "2026-11-17": ["Barranquilla"], "2026-11-18": ["Barranquilla"],
};
const ciudadesDelDia = (diaReal: string) => CIUDADES_DIA[diaReal] ?? ["Medellín"];

// ---- datos inventados ----
const MENTORES = [
  "Camila Demo Ríos", "Andrés Demo Salazar", "Paola Demo Cárdenas", "Julián Demo Herrera", "Natalia Demo Quintero",
  "Sergio Demo Valencia", "Daniela Demo Ospina", "Mateo Demo Arango", "Laura Demo Benítez",
];
const MONITORES = [
  { usuario: "monitor.demo", nombre: "Monitora Demo Cali", ciudades: ["Cali"] },
  { usuario: "monitor.ctg.demo", nombre: "Monitor Demo Cartagena", ciudades: ["Cartagena"] },
  { usuario: "monitor.baq.demo", nombre: "Monitora Demo Barranquilla", ciudades: ["Barranquilla"] },
  { usuario: "monitor.med.demo", nombre: "Monitor Demo Medellín", ciudades: ["Medellín"] },
];
const USUARIOS = [
  { usuario: "admin.demo", nombre: "Admin Demo", rol: "admin" as const, ciudades: [] as string[] },
  { usuario: "coordinacion.demo", nombre: "Coordinación Demo", rol: "coordinador" as const, ciudades: [] as string[] },
  ...MONITORES.map((m) => ({ ...m, rol: "monitor" as const })),
  { usuario: "mentor.demo", nombre: MENTORES[0]!, rol: "mentor" as const, ciudades: [] as string[] },
];
const NOMBRES = ["Valentina", "Santiago", "Isabella", "Samuel", "Mariana", "Matías", "Sofía", "Emiliano", "Luciana", "Tomás", "Gabriela", "Martín", "Antonella", "Joaquín", "Salomé", "Simón", "Valeria", "Nicolás", "Juliana", "Sebastián"];
const APELLIDOS = ["Demo Gómez", "Demo Pérez", "Demo Castro", "Demo Torres", "Demo Rojas", "Demo Muñoz", "Demo Vargas", "Demo Mejía", "Demo Duarte", "Demo Lozano"];
const IDEAS = [
  ["Reciclaje escolar", "Mapa de puntos de reciclaje y recordatorios de recolección."], ["Tienda de artesanías", "Catálogo en línea con pedidos y panel de inventario."],
  ["Turismo por voz", "Recorridos narrados para visitantes del centro histórico."], ["Huerta en casa", "Guía de cultivos y recordatorios de riego."],
  ["Tutorías entre pares", "Agenda de tutorías con reservas y calificaciones."], ["Mascotas en adopción", "Catálogo de mascotas y formulario de adopción."],
  ["Ruta segura", "Reporte de puntos inseguros del barrio con mapa."], ["Café de barrio", "Menú, pedidos para recoger y programa de puntos."],
  ["Banco de tiempo", "Intercambio de servicios entre vecinos."], ["Moda circular", "Venta e intercambio de ropa de segunda mano."],
] as const;

/** Generador pseudoaleatorio fijo: la demo sale igual cada vez. */
function azar(semilla: number) {
  let a = semilla;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function opciones() {
  const hoyArg = process.argv.find((a) => a.startsWith("--hoy="))?.slice(6);
  const hoyCOL = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const hoy = hoyArg ?? hoyCOL;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy) || Number.isNaN(Date.parse(hoy))) throw new Error(`--hoy debe ser AAAA-MM-DD: "${hoy}".`);
  if (hoy > DIAS_REALES.at(-1)!) throw new Error(`--hoy no puede ser después del ${DIAS_REALES.at(-1)} (Cali y Cartagena ya habrían tenido su clausura).`);
  if (DIAS_REALES.includes(hoy)) return { desfase: 0, vivoReal: hoy };
  if (hoy > DIAS_REALES[0]!) { // entre días de presentación (p. ej. domingo 15): sin mover, el día en vivo es el siguiente
    if (hoyArg) throw new Error(`El ${hoy} no es día de presentaciones. Usa uno de: ${DIAS_REALES.join(", ")}.`);
    return { desfase: 0, vivoReal: DIAS_REALES.find((d) => d > hoy)! };
  }
  return hoyArg ? { desfase: diasEntre(DIAS_REALES[0]!, hoy), vivoReal: DIAS_REALES[0]! } : { desfase: 0, vivoReal: DIAS_REALES[0]! };
}

function libro(hojas: Record<string, (string | number | null)[][]>): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) { const ws = wb.addWorksheet(nombre); filas.forEach((f) => ws.addRow(f)); }
  return wb;
}
const ampm = (h: number) => `${String(h % 12 || 12).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;

async function main() {
  // ---- base local o, con `npm run semilla:demo:atlas`, SOLO proyecto_final_jc_pruebas en Atlas ----
  const atlas = process.env.PFJC_MODO === "atlas"; // solo lo pone scripts/con-atlas.mjs
  if (!atlas) process.env.MONGODB_URI ||= URI_LOCAL;
  const { BASE_ATLAS_PRUEBAS, closeDb, collections, dbHost, dbName, esUriLocal } = await import("@/lib/db");
  if (atlas) {
    if (dbName() !== BASE_ATLAS_PRUEBAS) throw new Error(`semilla:demo en Atlas: solo ${BASE_ATLAS_PRUEBAS}, nunca otra base.`);
    if (!process.argv.includes("--si-atlas-pruebas"))
      throw new Error(`semilla:demo borra los datos de ${BASE_ATLAS_PRUEBAS} en Atlas: confirma agregando --si-atlas-pruebas.`);
  } else if (!esUriLocal(process.env.MONGODB_URI ?? "")) throw new Error(`semilla:demo solo corre contra la base local; MONGODB_URI apunta a "${dbHost()}".`);
  // En Atlas (el Preview se abre por internet) la clave no es la fácil: una al azar, que se muestra una sola vez.
  const clave = atlas ? randomBytes(12).toString("base64url") : CLAVE;
  const { desfase, vivoReal } = opciones();
  const mover = (dia: string) => sumarDias(dia, desfase);
  const vivo = mover(vivoReal);
  const r = azar(2026);
  const toma = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;

  const { idMentor, leerLibroMentores } = await import("@/lib/importar/mentores");
  const { leerLibroProyectos } = await import("@/lib/importar/proyectos");
  const { leerLibroSalas } = await import("@/lib/importar/salas");
  const { aplicarMentores, aplicarProyectos, previaMentores, previaProyectos } = await import("@/lib/importar/aplicar");
  const { aplicarSalas, previaSalas } = await import("@/lib/planSalas");
  const { hashClave, mentorIdDe } = await import("@/lib/usuarios");
  const { horaCOL } = await import("@/lib/edicion");
  const ev = await import("@/lib/evaluacion/datos");
  const mon = await import("@/lib/evaluacion/monitor");

  const c = await collections();
  console.log(`${atlas ? "Atlas de PRUEBAS" : "Base local"}: ${dbHost()} / ${dbName()}${desfase ? ` · calendario movido ${desfase} días` : ""} · día en vivo: ${vivo}`);
  const hay = (await c.proyectos.countDocuments()) + (await c.asientos.countDocuments());
  if (hay && !process.argv.includes("--reset")) throw new Error("La base ya tiene proyectos o asientos. Usa --reset para reemplazarlos por la demo.");
  await Promise.all([c.proyectos, c.asientos, c.dias, c.mentores, c.changeLog, c.rateLimits, c.planSalas, c.salasConfig, c.evalResultados, c.evalBorradores, c.evalConfig, c.evalMonitor, c.cambiosSugeridos, c.evalAnuladas, c.inscripciones, c.ajustes, c.candadosCupo]
    .map((col) => (col as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({})));

  // ---- usuarios (uno por rol + monitores para la asignación automática) ----
  const hash = await hashClave(clave), ahora = new Date();
  await c.users.deleteMany({ usuario: { $in: USUARIOS.map((u) => u.usuario) } });
  await c.users.deleteMany({ mentorId: mentorIdDe("mentor", MENTORES[0]!) }); // otro usuario con el mismo mentor
  await c.users.insertMany(USUARIOS.map((u) => ({
    _id: new ObjectId(), usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.ciudades, activo: true,
    passwordHash: hash, tokenVersion: 0, creadoEn: ahora, actualizadoEn: ahora,
    ...(u.rol === "mentor" ? { mentorId: mentorIdDe("mentor", u.nombre) } : {}),
  })));

  // ---- 1) Mentores, Horarios y Cupos (como el Excel real) ----
  const horarios: (string | number | null)[][] = [["Día", "Bloque (1 hora) - Hora COL", ...MENTORES, "N° mentores"]];
  DIAS_REALES.forEach((diaReal, di) => {
    HORAS.forEach((hora, hi) => {
      // 1 a 7 mentores por hora; el jueves 12 lleva más (Cali 80 + Cartagena 40). La mentora de mentor.demo siempre está el día en vivo.
      const n = diaReal === "2026-11-12" ? [5, 6, 7, 6, 4, 5, 6, 7, 5][hi]! : 1 + Math.floor(r() * 7);
      const orden = MENTORES.map((_, i) => (i + di * 2 + hi) % MENTORES.length);
      const elegidos = new Set(orden.slice(0, n));
      if (diaReal === vivoReal) { elegidos.add(0); if (elegidos.size > n && n > 1) elegidos.delete([...elegidos].find((x) => x !== 0)!); }
      horarios.push([mover(diaReal), `${ampm(hora)} – ${ampm(hora + 1)}`, ...MENTORES.map((_, i) => (elegidos.has(i) ? "x" : null)), elegidos.size]);
    });
  });
  const abre = "2026-10-01 08:00"; // ya abierto
  const cupos: (string | number | null)[][] = [["Día", "Ciudad", "Cupos", "Sobrante", "Abre (hora COL)"]];
  for (const diaReal of DIAS_REALES) {
    const d = mover(diaReal);
    if (diaReal === "2026-11-12") cupos.push([d, "Cali", 80, "x", abre], [d, "Cartagena", 40, null, abre]);
    else if (diaReal === "2026-11-13") cupos.push([d, "Cartagena", 20, null, abre], [d, "Barranquilla", null, "x", abre]);
    else if (diaReal === "2026-11-17" || diaReal === "2026-11-18") cupos.push([d, "Barranquilla", null, "x", abre]);
    else cupos.push([d, "Todas", null, "x", abre]);
  }
  const libroM = leerLibroMentores(libro({
    Mentores: [["Nombre", "Correo", "Celular"], ...MENTORES.map((m, i) => [m, `${idMentor(m)}@ejemplo.org`, `300555${String(i).padStart(4, "0")}`])],
    Horarios: horarios, Cupos: cupos,
  }));
  const pm = await previaMentores(libroM);
  if (pm.errores.length) throw new Error("Mentores: " + pm.errores.map((e) => `${e.hoja} ${e.fila}: ${e.mensaje}`).join(" | "));
  await aplicarMentores(libroM, ACTOR);

  // ---- 2) Proyectos (40: Cali, Cartagena, Barranquilla y Medellín; individuales y en pareja; Básica y Avanzada) ----
  const reparto: [string, number][] = [["Cali", 14], ["Cartagena", 10], ["Barranquilla", 10], ["Medellín", 6]];
  const filasP: (string | number | null)[][] = [["Ciudad", "Nombre del proyecto", "Descripción", "Nombre 1", "Documento 1", "Celular 1", "Correo 1", "Nombre 2", "Documento 2", "Celular 2", "Correo 2", "Ruta", "Monitor"]];
  let doc = 1_000_200_000, k = 0;
  const persona = () => { const nombre = `${toma(NOMBRES)} ${toma(APELLIDOS)}`; doc++; return [nombre, String(doc), `3${String(doc).slice(-9)}`, `${nombre.split(" ")[0]!.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}.${doc}@ejemplo.org`]; };
  for (const [ciudad, n] of reparto)
    for (let i = 0; i < n; i++, k++) {
      const [idea, desc] = IDEAS[k % IDEAS.length]!;
      const p1 = persona(), p2 = i % 3 === 1 ? persona() : [null, null, null, null];
      filasP.push([ciudad, `${idea} ${ciudad.slice(0, 3)}-${i + 1}`, desc, ...p1, ...p2, i % 2 ? "Avanzada" : "Básica", MONITORES.find((m) => m.ciudades.includes(ciudad))!.usuario]);
    }
  const lectura = leerLibroProyectos(libro({ Proyectos: filasP }));
  const pp = await previaProyectos(lectura);
  if (pp.errores.length) throw new Error("Proyectos: " + pp.errores.map((e) => `${e.fila}: ${e.mensaje}`).join(" | "));
  await aplicarProyectos(lectura.proyectos, pp.asignaciones, ACTOR);

  // ---- 3) Reservas: la mitad con hora, varias de mentor.demo el día en vivo ----
  const proyectos = await c.proyectos.find({}).sort({ ciudad: 1, nombre: 1 }).toArray();
  const mentorDemo = idMentor(MENTORES[0]!);
  const sinHora = new Set(proyectos.map((p) => String(p._id)));
  async function asignar(p: (typeof proyectos)[number], filtro: Record<string, unknown>) {
    const a = await c.asientos.findOneAndUpdate({ ...filtro, ciudades: p.ciudad, proyectoId: null }, { $set: { proyectoId: p._id, reservadoEn: ahora } }, { sort: { inicio: 1 }, returnDocument: "after" });
    if (a) sinHora.delete(String(p._id));
    return a;
  }
  // Portal: un individual sin hora, una pareja sin hora y uno con hora (de ciudades con días abiertos).
  const individualSinHora = proyectos.find((p) => p.ciudad === "Barranquilla" && p.integrantes.length === 1)!;
  const parejaSinHora = proyectos.find((p) => p.ciudad === "Barranquilla" && p.integrantes.length === 2)!;
  const reservados = new Set([String(individualSinHora._id), String(parejaSinHora._id)]);
  const libres = (ciudad: string) => proyectos.filter((p) => p.ciudad === ciudad && !reservados.has(String(p._id)));
  const vivoCiudades = ciudadesDelDia(vivoReal);
  const deMentorDemo: (typeof proyectos)[number][] = [];
  // mentor.demo: dos por ciudad del día en vivo (si hay asientos), en horas distintas.
  for (const ciudad of vivoCiudades)
    for (const p of libres(ciudad).slice(0, vivoCiudades.length > 1 ? 3 : 6)) {
      reservados.add(String(p._id));
      const usados = deMentorDemo.length;
      const a = await asignar(p, { dia: vivo, mentorId: mentorDemo, inicio: { $gte: new Date(Date.parse(vivo + "T13:00:00Z") + usados * 30 * 60e3) } });
      if (a) deMentorDemo.push(p);
    }
  // El resto de la mitad: otros mentores en los días de su ciudad.
  const diasDe = (ciudad: string) => DIAS_REALES.filter((d) => ciudadesDelDia(d).includes(ciudad)).map(mover);
  // Más o menos la mitad de cada ciudad (contando los de mentor.demo).
  for (const p of proyectos) {
    const deCiudad = proyectos.filter((x) => x.ciudad === p.ciudad);
    const yaConHora = deCiudad.filter((x) => !sinHora.has(String(x._id))).length;
    if (reservados.has(String(p._id)) || yaConHora >= Math.ceil(deCiudad.length / 2)) continue;
    reservados.add(String(p._id));
    const dias = diasDe(p.ciudad);
    await asignar(p, { dia: dias.includes(vivo) && r() < 0.5 ? vivo : toma(dias), mentorId: { $ne: mentorDemo } });
  }
  const conHora = proyectos.find((p) => !sinHora.has(String(p._id)) && !deMentorDemo.includes(p))!;

  // ---- 4) Salas y monitores: monitor.demo (Cali) importado en las salas de mentor.demo el día en vivo,
  //         que tienen estudiantes de otras ciudades; los demás, automáticos por disponibilidad ----
  const asientosDemo = await c.asientos.find({ mentorId: mentorDemo, dia: vivo, proyectoId: { $type: "objectId" } }).toArray();
  const horasDemo = [...new Set(asientosDemo.map((a) => horaCOL(a.inicio)))];
  const libroS = leerLibroSalas(libro({
    Salas: [["Sala", "Enlace"], ...[1, 2, 3, 4, 5, 6, 7].map((s) => [s, `https://meet.google.com/demo-sala-${s}`])],
    Monitores: [["Día", "Hora", "Mentor", "Monitor"], ...horasDemo.map((h) => [vivo, `${h}:00`, MENTORES[0]!, "monitor.demo"])],
    "Disponibilidad monitores": [["Monitor", "Día", "Hora"], ...DIAS_REALES.map(mover).flatMap((d) =>
      HORAS.flatMap((h) => MONITORES.filter((_, i) => (i + h) % 4 !== 0).map((m) => [m.usuario, d, `${h}:00`])))],
  }));
  const ps = await previaSalas(libroS);
  if (ps.errores.length) throw new Error("Salas: " + ps.errores.map((e) => `${e.hoja} ${e.fila}: ${e.mensaje}`).join(" | "));
  await aplicarSalas(libroS, ACTOR);

  // ---- 5) Evaluaciones de mentor.demo el día en vivo: guardada, destacado, pareja, No se presentó y borrador ----
  const yo: SessionUser = { id: new ObjectId().toHexString(), usuario: "mentor.demo", nombre: MENTORES[0]!, rol: "mentor", ciudades: [], mentorId: mentorDemo };
  const A = (no = 0): Formulario["a"] => Object.fromEntries(["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((x, i) => [x, i < no ? "no" : i < no + 1 ? "parcial" : "si"]));
  const form = (b: Formulario["b"], extra: Partial<Formulario> = {}): Formulario => ({ a: A(), b, destacado: false, fortaleza: "Explicó con seguridad cómo llegan los datos.", mejora: "Probar el formulario en el celular.", percepcion: "", ...extra });
  const orden = [...deMentorDemo].sort((x, y) => String(x._id).localeCompare(String(y._id)));
  const [p1, p2, p3, p4] = [orden.find((p) => p.integrantes.length === 1), orden.find((p) => p.integrantes.length === 2), ...orden.filter((p) => p.integrantes.length === 1).slice(1, 3)];
  const hechas: string[] = [];
  const ok = (x: { ok?: true } | { error: string }, que: string) => { if ("error" in x) throw new Error(`${que}: ${x.error}`); hechas.push(que); };
  if (p1) ok(await ev.guardarEvaluacion(yo, String(p1._id), form([{ b1: 4, b2: 3, b5: 4 }], { destacado: true })), "Excelente y destacado");
  if (p2) { ok(await ev.marcarAsistencia(yo, String(p2._id), 1, true), "pareja: uno no se presentó"); ok(await ev.guardarEvaluacion(yo, String(p2._id), form([{ b1: 2, b3: 3 }, {}], { a: A(2) })), "pareja: el otro Aprobado"); }
  if (p3) ok(await ev.marcarAsistencia(yo, String(p3._id), 0, true), "No se presentó");
  if (p4) ok(await ev.guardarBorrador(yo, String(p4._id), { a: { a1: "si", a2: "parcial" }, fortaleza: "Va bien la demo." }), "borrador sin guardar");
  // Lo que anota monitor.demo en esas salas: un motivo de inasistencia y un "se presentó".
  const monitorDemo: SessionUser = { id: new ObjectId().toHexString(), usuario: "monitor.demo", nombre: "Monitora Demo Cali", rol: "monitor", ciudades: ["Cali"] };
  if (p2) ok(await mon.anotar(monitorDemo, String(p2._id), 1, { asistencia: "no", motivo: "Conexión o equipo", observacion: "Se le cayó el internet; escribió por WhatsApp." }), "monitor: motivo de inasistencia");
  if (p4) ok(await mon.anotar(monitorDemo, String(p4._id), 0, { asistencia: "si", motivo: null, observacion: "" }), "monitor: se presentó");
  // Otros mentores ese día: unas pocas guardadas, para que el seguimiento tenga datos.
  for (const a of (await c.asientos.find({ dia: vivo, mentorId: { $ne: mentorDemo }, proyectoId: { $type: "objectId" } }).limit(3).toArray())) {
    const p = proyectos.find((x) => x._id.equals(a.proyectoId!))!;
    const otro: SessionUser = { ...yo, usuario: `demo.${a.mentorId}`, mentorId: a.mentorId };
    ok(await ev.guardarEvaluacion(otro, String(p._id), form(p.integrantes.map(() => ({ b1: 3, b2: 2 })), { a: A(1) })), `otro mentor: ${p.nombre}`);
  }

  // ---- resumen ----
  const total = await c.proyectos.countDocuments(), reservadosN = await c.asientos.countDocuments({ proyectoId: { $type: "objectId" } });
  console.log(`\nListo: ${MENTORES.length} mentores, ${await c.asientos.countDocuments()} asientos en ${DIAS_REALES.length} días, ${total} proyectos (${reservadosN} con hora), 7 salas.`);
  console.log(`Día en vivo ${vivo}: ${deMentorDemo.length} proyectos de mentor.demo (${[...new Set(deMentorDemo.map((p) => p.ciudad))].join(", ")}); monitor.demo en sus salas a las ${horasDemo.sort((a, b) => a - b).join(", ")} h.`);
  console.log(`Evaluaciones: ${hechas.join(" · ")}.`);
  console.log(atlas ? `\nUsuarios (clave para todos: ${clave} · guárdala ahora, no se vuelve a mostrar):` : `\nUsuarios (clave para todos: ${CLAVE}, SOLO base local):`);
  console.table(USUARIOS.map((u) => ({ usuario: u.usuario, rol: u.rol, nombre: u.nombre, ciudades: u.rol === "mentor" ? "sus proyectos" : u.ciudades.join(", ") || "todas" })));
  const docs = (p: (typeof proyectos)[number]) => p.integrantes.map((x) => x.documento).join(" / ");
  console.log("Portal del estudiante (documentos):");
  console.table([
    { caso: "individual sin hora", ciudad: individualSinHora.ciudad, documento: docs(individualSinHora) },
    { caso: "pareja sin hora", ciudad: parejaSinHora.ciudad, documento: docs(parejaSinHora) },
    { caso: "con hora", ciudad: conHora.ciudad, documento: docs(conHora) },
  ]);
  await closeDb();
}

main().catch(async (e) => {
  console.error("\nNo se pudo crear la demo:", e instanceof Error ? e.message : e);
  process.exit(1);
});

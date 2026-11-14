// Libro «Plan de salas» de prueba para la semilla DEMO (nombres inventados): cada monitor de la demo con su sala
// propia del martes 17 al sábado 21, y una sala nueva (la 8) para los mentores sin monitor.
//   npm run plan-salas:demo                      (lee la base local y escribe C:\ROFÉ\datos\plan-salas-demo.xlsx)
//   npm run plan-salas:demo -- --salida=otro.xlsx
// Solo LEE la base (local); no importa nada. Se importa a mano en /admin/importar (Salas y monitores).

import ExcelJS from "exceljs";

const URI_LOCAL = "mongodb://127.0.0.1:27018/?replicaSet=rs0";
const SALIDA = "C:\\ROFÉ\\datos\\plan-salas-demo.xlsx";
/** Enlaces de la demo (semilla-demo.ts) y la sala nueva. */
export const ENLACE_DEMO = (s: number) => `https://meet.google.com/demo-sala-${s}`;
const SALAS = [1, 2, 3, 4, 5, 6, 7, 8];

const fmt = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
/** "2026-11-17" → "Martes 17 nov" (el formato de la hoja Monitores). */
export function diaTexto(dia: string): string {
  const p = Object.fromEntries(fmt.formatToParts(new Date(dia + "T12:00:00Z")).map((x) => [x.type, x.value]));
  return `${p.weekday!.charAt(0).toUpperCase()}${p.weekday!.slice(1)} ${p.day} ${p.month!.replace(".", "")}`;
}
export const horaTexto = (h: number) => `${String(h % 12 || 12).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;

/**
 * Arma el libro con la base ya conectada. Por hora: los bloques con evaluación o asistencia conservan su sala; cada
 * monitor activo (en orden de usuario) tiene su sala (1, 2, 3…) y acompaña a un mentor; los demás mentores van sin
 * monitor a las salas libres desde la 8 hacia abajo.
 */
export async function libroPlanSalasDemo(desde = "2026-11-17", hasta = "2026-11-21"): Promise<ExcelJS.Workbook> {
  const { collections } = await import("@/lib/db");
  const { diaCOL, horaCOL } = await import("@/lib/edicion");
  const { bloquesConDatos } = await import("@/lib/planSalas");
  const c = await collections();
  const asientos = await c.asientos.find({ dia: { $gte: desde, $lte: hasta } }, { projection: { inicio: 1, mentorId: 1 } }).toArray();
  const nombre = new Map((await c.mentores.find({}).toArray()).map((m) => [m._id, m.nombre]));
  const monitores = (await c.users.find({ rol: "monitor", activo: true }, { projection: { usuario: 1 } }).toArray()).map((u) => u.usuario).sort();
  const actual = await c.planSalas.find({ dia: { $gte: desde, $lte: hasta } }).toArray();
  const dias = [...new Set(asientos.map((a) => diaCOL(a.inicio)))].sort();
  const protegidos = await bloquesConDatos(dias);

  const horas = new Map<string, Set<string>>();
  for (const a of asientos) {
    const k = `${diaCOL(a.inicio)}|${horaCOL(a.inicio)}`;
    horas.set(k, (horas.get(k) ?? new Set()).add(a.mentorId));
  }
  const plan: [string, string, string, number, string][] = [];
  for (const k of [...horas.keys()].sort((a, b) => a.localeCompare(b, "en", { numeric: true }))) {
    const [dia, h] = k.split("|") as [string, string];
    const hora = +h;
    const mentores = [...horas.get(k)!].sort();
    const usadas = new Set<number>(), conMonitor = new Set<string>(), fila = new Map<string, [number, string]>();
    for (const m of mentores) {
      if (!protegidos.has(`${dia}|${hora}|${m}`)) continue;
      const p = actual.find((x) => x.dia === dia && x.hora === hora && x.mentorId === m)!;
      fila.set(m, [p.sala, p.monitor ?? ""]); usadas.add(p.sala); if (p.monitor) conMonitor.add(p.monitor);
    }
    let i = 0;
    for (const m of mentores) {
      if (fila.has(m)) continue;
      while (i < monitores.length && (conMonitor.has(monitores[i]!) || usadas.has(i + 1))) i++;
      if (i < monitores.length) { fila.set(m, [i + 1, monitores[i]!]); usadas.add(i + 1); conMonitor.add(monitores[i]!); i++; continue; }
      const libre = [...SALAS].reverse().find((s) => !usadas.has(s));
      if (libre === undefined) throw new Error(`El ${dia} a las ${hora}:00 hay más mentores que salas.`);
      fila.set(m, [libre, ""]); usadas.add(libre);
    }
    for (const m of mentores) plan.push([diaTexto(dia), horaTexto(hora), nombre.get(m) ?? m, ...fila.get(m)!]);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Proyecto final JC 2026 · demo";
  const hoja = (n: string, filas: (string | number)[][], anchos: number[]) => {
    const ws = wb.addWorksheet(n);
    filas.forEach((f) => ws.addRow(f));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((col, j) => { col.width = anchos[j] ?? 14; });
  };
  hoja("Leeme", [
    ["Plan de salas de prueba para la DEMO (datos inventados) · martes 17 a sábado 21 de noviembre"],
    ["Cada monitor de la demo tiene su sala propia; los mentores sin monitor van a las salas libres (desde la Sala 8, que es nueva)."],
    ["Importar en /admin/importar → Salas y monitores. Solo cambian los días de la hoja Plan de salas."],
  ], [110]);
  hoja("Plan de salas", [["Día", "Hora", "Mentor", "Sala", "Monitor"], ...plan], [18, 10, 28, 8, 20]);
  hoja("Salas", [["Sala", "Enlace"], ...SALAS.map((s) => [s, ENLACE_DEMO(s)])], [8, 50]);
  hoja("Monitores", [["Día", "Hora", "Mentor", "Monitor"], ...plan.filter((p) => p[4]).map((p) => [p[0], p[1], p[2], p[4]])], [18, 10, 28, 20]);
  hoja("Disponibilidad monitores", [["Monitor", "Día", "Hora"], ...monitores.flatMap((m) => [...horas.keys()].sort().map((k) => {
    const [d, h] = k.split("|") as [string, string];
    return [m, diaTexto(d), horaTexto(+h)];
  }))], [20, 18, 10]);
  return wb;
}

async function main() {
  process.env.MONGODB_URI ||= URI_LOCAL;
  const { closeDb, dbHost, dbName, esUriLocal } = await import("@/lib/db");
  if (!esUriLocal(process.env.MONGODB_URI ?? "")) throw new Error(`plan-salas:demo solo lee la base local; MONGODB_URI apunta a "${dbHost()}".`);
  const salida = process.argv.find((a) => a.startsWith("--salida="))?.slice(9) || SALIDA;
  const wb = await libroPlanSalasDemo();
  const { mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(salida), { recursive: true });
  await wb.xlsx.writeFile(salida);
  console.log(`Base local ${dbHost()} / ${dbName()} → ${salida} (${wb.getWorksheet("Plan de salas")!.rowCount - 1} filas en Plan de salas).`);
  await closeDb();
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/plan-salas-demo.ts")) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}

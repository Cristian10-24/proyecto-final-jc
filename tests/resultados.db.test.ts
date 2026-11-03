import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Seguimiento general y Excel de resultados (Paso 15) contra la base LOCAL. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const r = await import("@/lib/evaluacion/resultados");
const { diaCOL, inicioUTC } = await import("@/lib/edicion");

const D = diaCOL(new Date(Date.now() + 10 * 86400_000)), D2 = diaCOL(new Date(Date.now() + 11 * 86400_000));
const ids: Record<string, ObjectId> = {};

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections(), now = new Date();
  await c.mentores.insertMany([{ _id: "mentor-a", nombre: "Mentor A" }, { _id: "mentor-b", nombre: "Mentor B" }]);
  await c.users.insertOne({ _id: new ObjectId(), usuario: "mon.uno", nombre: "Monitora Uno", rol: "monitor", ciudades: [], activo: true, passwordHash: "x", creadoEn: now });
  const proyecto = async (codigo: string, ciudad: string, integrantes: string[], asiento?: [string, number, string]) => {
    const _id = new ObjectId();
    ids[codigo] = _id;
    await c.proyectos.insertOne({
      _id, codigo, ciudad, nombre: `App ${codigo}`, ruta: "Básica", creadoEn: now, actualizadoEn: now,
      integrantes: integrantes.map((nombre, i) => ({ nombre, documento: `99${codigo.replace(/\D/g, "")}${i}`, correo: `${codigo.toLowerCase()}${i}@ejemplo.org`, celular: "3001112233" })),
    });
    if (asiento) await c.asientos.insertOne({ _id: new ObjectId(), dia: asiento[0], inicio: inicioUTC(asiento[0], asiento[1]), mentorId: asiento[2], ciudades: [ciudad], proyectoId: _id });
  };
  await proyecto("R1", "Cali", ["Ana Uno", "Beto Uno"], [D, 8, "mentor-a"]);
  await proyecto("R2", "Cartagena", ["Carla Dos"], [D2, 9, "mentor-b"]);
  await proyecto("R3", "Cali", ["Dario Tres"]); // sin hora
  await c.asientos.insertOne({ _id: new ObjectId(), dia: D, inicio: inicioUTC(D, 8, 15), mentorId: "mentor-a", ciudades: ["Cali"], proyectoId: null });
  await c.planSalas.insertOne({ _id: `${D}|8|1`, dia: D, hora: 8, sala: 1, mentorId: "mentor-a", monitor: "mon.uno", origen: "importado" });
  const A = Object.fromEntries(["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map((k) => [k, "si"]));
  await c.evalResultados.insertMany([
    { _id: `${ids.R1!.toHexString()}|9910`, proyectoId: ids.R1!, documento: "9910", mentorId: "mentor-a", a: A, b: { b1: 4, b2: 3 }, destacado: true, fortaleza: "Gran demo", mejora: "", percepcion: "", noPresento: false, actualizadoEn: now, actualizadoPor: "m" },
    { _id: `${ids.R1!.toHexString()}|9911`, proyectoId: ids.R1!, documento: "9911", mentorId: "mentor-a", a: {}, b: {}, destacado: false, fortaleza: "", mejora: "", percepcion: "", noPresento: true, actualizadoEn: now, actualizadoPor: "m" },
  ]);
  await c.evalMonitor.insertOne({ _id: `${ids.R1!.toHexString()}|9911`, proyectoId: ids.R1!, documento: "9911", asistencia: "no", motivo: "Salud", observacion: "Avisó", actualizadoEn: now, actualizadoPor: "mon.uno" });
});
afterAll(() => db.closeDb());

describe("filas por estudiante", () => {
  it("todos los proyectos (también sin hora), con sala, mentor, monitor de la sala, evaluación y nota del monitor", async () => {
    const f = await r.filasEstudiantes();
    expect(f.map((x) => [x.nombre, x.dia, x.mentor, x.monitor, x.sala])).toEqual([
      ["Ana Uno", D, "Mentor A", "Monitora Uno", 1], ["Beto Uno", D, "Mentor A", "Monitora Uno", 1],
      ["Dario Tres", null, "Sin asignar", "Sin monitor", null],
      ["Carla Dos", D2, "Mentor B", "Sin monitor", null],
    ]);
    expect(f[1]).toMatchObject({ motivo: "Salud", observacion: "Avisó", pareja: { nombre: "Ana Uno" } });
  });

  it("filtra por día y por ciudad", async () => {
    expect((await r.filasEstudiantes({ dia: D2 })).map((x) => x.nombre)).toEqual(["Carla Dos"]);
    expect((await r.filasEstudiantes({ ciudad: "Cali" })).map((x) => x.nombre)).toEqual(["Ana Uno", "Beto Uno", "Dario Tres"]);
    expect(await r.filasEstudiantes({ dia: D2, ciudad: "Cali" })).toEqual([]);
  });

  it("cupos desde ahora: ocupados y libres por día, libres por mentor; con ciudad, solo los de esa ciudad", async () => {
    const cu = await r.cuposDesdeHoy();
    expect(cu).toMatchObject({ ofrecidos: 3, ocupados: 2, libres: 1, porMentor: [{ mentor: "Mentor A", libres: 1 }] });
    expect((await r.cuposDesdeHoy({ ciudad: "Cartagena" })).libres).toBe(0);
    expect((await r.cuposDesdeHoy({}, new Date(Date.now() + 30 * 86400_000))).ofrecidos).toBe(0);
  });
});

describe("criterios", () => {
  it("se guardan con changeLog y cambian el resultado", async () => {
    await r.guardarCriterios({ exA: 0.9, exB: 3.6 }, { rol: "coordinador", usuario: "coord.p" });
    expect((await r.seguimiento()).kpis.excelentes).toBe(0); // B = 3,5 < 3,6
    const log = await (await db.collections()).changeLog.findOne({ accion: "criterios" });
    expect([log?.anterior, log?.nuevo, log?.actor.usuario]).toEqual(["A ≥ 90 % · B ≥ 3", "A ≥ 90 % · B ≥ 3.6", "coord.p"]);
    await r.guardarCriterios({ exA: 0.9, exB: 3 }, { rol: "coordinador", usuario: "coord.p" });
    expect((await r.seguimiento()).kpis.excelentes).toBe(1);
  });
});

describe("Excel de resultados", () => {
  it("hoja Resultados (una fila por estudiante, con asunto y mensaje) y una hoja por tabla; respeta el filtro", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await r.excelResultados()) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resultados", "Por ruta", "Por ciudad", "Por modalidad", "Por mentor", "Por monitor", "Por día", "Inasistencias", "Destacados"]);
    const ws = wb.getWorksheet("Resultados")!;
    const head = (ws.getRow(1).values as unknown[]).slice(1);
    // Comparado con el prototipo (docs/EVALUACION.md · Exportar), no con la constante del código.
    expect(head).toEqual([
      "Estudiante", "Documento", "Correo", "Celular", "Ciudad", "Ruta", "Modalidad", "Pareja (nombre)", "Pareja (documento)", "Emprendimiento", "Descripción",
      "Día", "Hora (COL)", "Sala", "Evaluador(a)", "Monitor(a)",
      "A · App publicada", "A · Marca, inicio y catálogo", "A · Contacto real", "A · Login y panel", "A · Asistente de clientes", "A · Responsive", "A · GitHub",
      "B · Componentes y props", "B · Estado y datos (hooks)", "B · Backend con Express", "B · Base de datos con Mongoose", "B · Visión general",
      "% Funciona", "Nivel promedio", "Resultado", "Destacado", "Lo que hizo bien", "Qué mejorar", "Percepción del mentor",
      "Asistencia", "Motivo de inasistencia", "Observación del monitor", "Asunto del correo", "Mensaje para el estudiante",
    ]);
    expect(ws.rowCount).toBe(5);
    const col = (h: string) => head.indexOf(h) + 1;
    const ana = ws.getRow(2);
    expect([ana.getCell(col("Estudiante")).value, ana.getCell(col("Documento")).value, ana.getCell(col("Resultado")).value, ana.getCell(col("Destacado")).value]).toEqual(["Ana Uno", "9910", "Excelente", "Sí"]);
    expect(String(ana.getCell(col("Asunto del correo")).value)).toMatch(/Felicitaciones.*Ana/);
    expect(String(ana.getCell(col("Mensaje para el estudiante")).value)).toContain("junto a Beto");
    expect([ana.getCell(col("A · App publicada")).value, ana.getCell(col("B · Componentes y props")).value, ana.getCell(col("% Funciona")).value, ana.getCell(col("Nivel promedio")).value, ana.getCell(col("Hora (COL)")).value])
      .toEqual(["Sí", 4, "100 %", 3.5, "8:00 a. m."]);
    expect(ws.getRow(4).getCell(col("Día")).value).toBe("Sin fecha"); // R3 sin hora
    const beto = ws.getRow(3);
    expect([beto.getCell(col("Asistencia")).value, beto.getCell(col("Motivo de inasistencia")).value, beto.getCell(col("Asunto del correo")).value]).toEqual(["No se presentó", "Salud", ""]);
    expect((wb.getWorksheet("Destacados")!.getRow(2).values as unknown[]).slice(1, 3)).toEqual(["Ana Uno", "App R1"]);
    const solo = new ExcelJS.Workbook();
    await solo.xlsx.load((await r.excelResultados({ ciudad: "Cartagena" })) as unknown as ArrayBuffer);
    expect(solo.getWorksheet("Resultados")!.rowCount).toBe(2);
    const porDia = new ExcelJS.Workbook();
    await porDia.xlsx.load((await r.excelResultados({ dia: D })) as unknown as ArrayBuffer);
    expect(porDia.getWorksheet("Resultados")!.rowCount).toBe(3); // Ana y Beto
    const nada = new ExcelJS.Workbook();
    await nada.xlsx.load((await r.excelResultados({ dia: D, ciudad: "Cartagena" })) as unknown as ArrayBuffer);
    expect(nada.getWorksheet("Resultados")!.rowCount).toBe(1); // solo encabezados
  });
});

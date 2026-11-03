import ExcelJS from "exceljs";
import { COLUMNAS_CUPOS, HOJAS_MENTORES } from "./mentores";
import { COLUMNAS_PROYECTOS, HOJA_PROYECTOS } from "./proyectos";

type Fila = (string | number | null)[];

/** Filas de ejemplo INVENTADAS, en el orden de COLUMNAS_PROYECTOS. */
export const EJEMPLO_PROYECTOS: Fila[] = [
  ["Cali", "Individual", "App de reciclaje escolar", "Mapa de puntos de reciclaje para el colegio.", "Ana Ejemplo Pérez", "1000000001", "+57 300 000 0001", "ana.ejemplo@ejemplo.org", null, null, null, null, "Grupo 1", null],
  ["Cartagena", "En pareja", "Guía turística accesible", "Recorridos narrados por audio.", "Luis Ejemplo Gómez", "1000000002", "300 000 0002", "luis.ejemplo@ejemplo.org", "Sara Ejemplo Ruiz", "1000000003", "0057 300 000 0003", "sara.ejemplo@ejemplo.org", "Grupo 3", null],
];

// Plantillas vacías (con filas de ejemplo INVENTADAS) que el admin descarga desde "Importar".

export type TipoPlantilla = "proyectos" | "mentores";

function hojaCon(wb: ExcelJS.Workbook, nombre: string, columnas: readonly string[], filas: Fila[], anchos?: number[]) {
  const ws = wb.addWorksheet(nombre);
  ws.addRow([...columnas]).font = { bold: true };
  filas.forEach((f) => ws.addRow(f));
  ws.columns.forEach((c, i) => { c.width = anchos?.[i] ?? Math.max(14, String(columnas[i] ?? "").length + 4); });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

function instrucciones(wb: ExcelJS.Workbook, lineas: string[]) {
  const ws = wb.addWorksheet("Instrucciones");
  lineas.forEach((l) => ws.addRow([l]));
  ws.getColumn(1).width = 110;
  ws.getRow(1).font = { bold: true };
}

export async function plantilla(tipo: TipoPlantilla): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  if (tipo === "proyectos") {
    const ws = hojaCon(wb, HOJA_PROYECTOS, COLUMNAS_PROYECTOS, EJEMPLO_PROYECTOS, [12, 12, 30, 40, 26, 16, 18, 28, 26, 16, 18, 28, 10, 18]);
    // Documentos y celulares como texto: Excel no les quita ceros ni los pasa a notación científica.
    for (const c of [6, 7, 10, 11]) ws.getColumn(c).numFmt = "@";
    instrucciones(wb, [
      "Plantilla de inscritos · Proyecto final JC 2026",
      "Una fila por proyecto. Borra las filas de ejemplo antes de importar.",
      "Los encabezados pueden variar: se reconocen por sinónimos (documento / identificación / cédula / CC; celular / teléfono / WhatsApp;",
      "nombre del proyecto / proyecto / título). Si falta uno obligatorio, en la vista previa eliges qué columna es.",
      "Obligatorios: Ciudad, Nombre del proyecto, Nombre 1 y Documento 1. Modalidad: Individual o En pareja.",
      "Integrante 2: solo si es en pareja, con nombre y documento. Un documento no puede estar en dos proyectos.",
      "Documentos sin puntos ni espacios, como texto (no decimales). Celular con o sin indicativo: +57 300 123 4567 o 3001234567.",
      "Monitor (opcional): si no viene, se asigna el monitor de la ciudad; si la ciudad tiene varios, queda por asignar.",
      "El estudiante ve su documento, celular y correo enmascarados (•••• 4567, an•••@gmail.com).",
      "Volver a importar actualiza cada proyecto (por el documento del integrante 1); los que no estén en el archivo no se borran.",
    ]);
  } else {
    hojaCon(wb, HOJAS_MENTORES.mentores, ["N°", "Nombre del mentor", "Correo", "Celular"], [
      ["M1", "Mentora Ejemplo Uno", "mentora1@ejemplo.org", "+57 300 000 0001"],
      ["M2", "Mentor Ejemplo Dos", "mentor2@ejemplo.org", "+57 300 000 0002"],
    ], [6, 30, 30, 20]);
    hojaCon(wb, HOJAS_MENTORES.horarios, ["Día", "Bloque (1 hora) - Hora COL", "Mentora Ejemplo Uno", "Mentor Ejemplo Dos", "N° mentores"], [
      ["Jueves 12 nov", "08 am – 09 am", "x", "x", 2],
      ["Jueves 12 nov", "09 am – 10 am", "x", null, 1],
      ["Jueves 12 nov", "04 pm – 05 pm", "x", "x", 2],
      ["Viernes 13 nov", "08 am – 09 am", null, "x", 1],
      ["Viernes 13 nov", "05 pm – 06 pm", "x", "x", 2],
      ["Martes 17 nov", "08 am – 09 am", "x", "x", 2],
    ], [16, 26, 22, 22, 13]);
    hojaCon(wb, HOJAS_MENTORES.cupos, COLUMNAS_CUPOS, [
      ["Jueves 12 nov", "Cali", 12, "x", null],
      ["Jueves 12 nov", "Cartagena", 8, null, null],
      ["Viernes 13 nov", "Cartagena", 6, null, null],
      ["Viernes 13 nov", "Barranquilla", null, "x", "2026-11-13 14:00"],
      ["Martes 17 nov", "Barranquilla", 4, null, null],
      ["Martes 17 nov", "Todas", null, "x", null],
    ], [16, 16, 10, 11, 20]);
    instrucciones(wb, [
      "Plantilla de mentores y disponibilidad · Proyecto final JC 2026",
      "Mentores: nombre, correo y celular de cada mentor. El nombre debe ser igual al encabezado de su columna en Horarios.",
      "Horarios: una fila por día y hora de inicio (hora de Colombia). Una columna por mentor; cualquier marca = disponible esa hora.",
      "Cada mentor disponible en una hora da 4 asientos de 15 minutos. Las filas sin día ni hora (totales) se ignoran.",
      "Cupos: una fila por día y ciudad que presenta ese día.",
      "  Cupos = asientos exactos de esa ciudad (máximo). En la ciudad marcada como Sobrante es un mínimo: recibe además todo lo que sobre.",
      "  Sobrante: marca con x una sola ciudad por día. Si ningún día la tiene, lo que sobre queda sin ciudad y se reetiqueta después.",
      "  Todas: el sobrante queda libre para cualquier ciudad que no haya tenido su clausura ese día (p. ej. del martes 17 en adelante).",
      "  Una ciudad no puede presentar el día de su clausura ni después.",
      "  Abre: fecha y hora de Colombia desde la que esa ciudad puede elegir ese día (vacío = desde que se abre el portal).",
      "Los cupos se reparten en proporción en cada hora del día, para que todas las ciudades tengan opciones en todas las horas.",
      "Volver a importar reemplaza mentores y cupos. Las horas ya reservadas se conservan; si el archivo quita una, la vista previa la muestra como conflicto.",
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

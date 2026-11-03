// Genera los Excel de ejemplo de docs/plantillas/ con datos INVENTADOS (ningún nombre, documento,
// celular ni correo es real). Sirven para las pruebas y para ver el formato sugerido.
// Uso: npm run plantillas:ejemplo
import ExcelJS from "exceljs";
import { mkdir, writeFile } from "node:fs/promises";
import { plantilla } from "@/lib/importar/plantillas";
import { COLUMNAS_PROYECTOS } from "@/lib/importar/proyectos";

type Fila = (string | number | null)[];

const DIR = "docs/plantillas";

// Formato sugerido: encabezados de la plantilla, todo bien.
const INSCRITOS: Fila[] = [
  ["Cali", "Individual", "App de reciclaje escolar", "Mapa de puntos de reciclaje para el colegio.", "Valentina Prueba Gómez", "1100000001", "+57 300 111 0001", "valentina.prueba@ejemplo.org", null, null, null, null, "Grupo 1", null],
  ["Cali", "En pareja", "Agenda digital para la tienda", "Pedidos y fiados de la tienda del barrio.", "Santiago Prueba Muñoz", "1100000002", "3001110002", "santiago.prueba@ejemplo.org", "Isabella Prueba Ríos", "1100000003", "300 111 0003", "isabella.prueba@ejemplo.org", "Grupo 2", null],
  ["Cartagena", "Individual", "Guía turística por voz", "Recorridos narrados por audio para visitantes.", "Andrés Prueba Pérez", "1100000004", "+57 301 111 0004", "andres.prueba@ejemplo.org", null, null, null, null, "Grupo 1", null],
  ["Cartagena", "En pareja", "Huerta escolar con sensores", "Riego automático con sensores de humedad.", "Mariana Prueba Castro", "1100000005", "0057 301 111 0005", "mariana.prueba@ejemplo.org", "Juan Prueba Rojas", "1100000006", "301-111-0006", null, "Grupo 2", null],
  ["Barranquilla", "Individual", "Tienda virtual para artesanos", "Catálogo en línea y pedidos por WhatsApp.", "Sofía Prueba Herrera", "1100000007", "302 111 0007", "sofia.prueba@ejemplo.org", null, null, null, null, null, null],
  ["Medellín", "En pareja", "Mapa de wifi gratis", "Puntos de wifi gratis en la ciudad.", "Tomás Prueba Arango", "1100000008", "303 111 0008", "tomas.prueba@ejemplo.org", "Lucía Prueba Henao", "1100000009", "303 111 0009", "lucia.prueba@ejemplo.org", null, null],
  ["Paysandú", "Individual", "Bitácora de lectura", "Registro de libros leídos en el liceo.", "Martín Prueba Sosa", "1100000010", "+598 99 111 010", "martin.prueba@ejemplo.org", null, null, null, null, null, null],
];

// Encabezados distintos (sinónimos) y errores típicos, uno por fila.
const ENC_ERRORES = ["Sede", "Tipo de proyecto", "Título", "Descripción", "Nombre del estudiante", "Cédula", "WhatsApp", "E-mail",
  "Nombre compañero(a)", "Identificación pareja", "Teléfono pareja", "Correo pareja"];
const CON_ERRORES: Fila[] = [
  ["Cali", "Individual", "Fila buena", "Sin errores.", "Ana Prueba Uno", "1200000001", "300 222 0001", "ana.uno@ejemplo.org", null, null, null, null],
  ["Cali", "Individual", "Documento repetido", "Repite el documento de la fila 2.", "Luis Prueba Dos", "1200000001", "300 222 0002", null, null, null, null, null],
  ["Cartagena", "En pareja", "Pareja incompleta", "Falta el documento del integrante 2.", "Sara Prueba Tres", "1200000003", "300 222 0003", null, "Eva Prueba Cuatro", null, null, null],
  ["Montería", "Individual", "Ciudad desconocida", "Montería no es una ciudad de la edición.", "Juan Prueba Cinco", "1200000005", "300 222 0005", null, null, null, null, null],
  ["Cali", "Individual", "Documento decimal", "Excel lo guardó como número con decimales.", "Tomás Prueba Seis", 1200000006.5, "300 222 0006", null, null, null, null, null],
  ["Cali", "Individual", "Celular incompleto", "Al celular le faltan dígitos.", "Lina Prueba Siete", "1200000007", "+57 300 22", null, null, null, null, null],
  ["Cali", "Individual", "Correo inválido", "El correo no tiene dominio.", "Kevin Prueba Ocho", "1200000008", "300 222 0008", "kevin@", null, null, null, null],
  ["Cali", "En pareja", "Modalidad sin pareja", "Dice en pareja pero no hay integrante 2.", "Paula Prueba Nueve", "1200000009", "300 222 0009", null, null, null, null, null],
];

async function guardar(nombre: string, hojas: Record<string, Fila[]>, textoCols: number[] = []) {
  const wb = new ExcelJS.Workbook();
  for (const [hoja, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(hoja);
    filas.forEach((f) => ws.addRow(f));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
    for (const c of textoCols) ws.getColumn(c).numFmt = "@";
  }
  await writeFile(`${DIR}/${nombre}`, Buffer.from(await wb.xlsx.writeBuffer()));
  console.log(`${DIR}/${nombre}`);
}

async function main() {
  await mkdir(DIR, { recursive: true });
  await guardar("inscritos-ejemplo.xlsx", { Proyectos: [[...COLUMNAS_PROYECTOS], ...INSCRITOS] }, [6, 7, 10, 11]);
  await guardar("inscritos-con-errores.xlsx", { Inscritos: [ENC_ERRORES, ...CON_ERRORES] });
  await writeFile(`${DIR}/mentores-ejemplo.xlsx`, await plantilla("mentores"));
  console.log(`${DIR}/mentores-ejemplo.xlsx`);
}

main().catch((e) => { console.error(e); process.exit(1); });

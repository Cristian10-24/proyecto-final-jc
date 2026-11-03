import ExcelJS from "exceljs";

// Libros de prueba con datos INVENTADOS.

type Fila = (string | number | null)[];

export function libro(hojas: Record<string, Fila[]>): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = wb.addWorksheet(nombre);
    filas.forEach((f) => ws.addRow(f));
  }
  return wb;
}

export const ENC_PROYECTOS: Fila = ["Código", "Ciudad", "Nombre del proyecto", "Grupo", "Documento 1", "Nombre 1", "Documento 2", "Nombre 2"];
export const ENC_CUPOS: Fila = ["Día", "Ciudad", "Cupos", "Sobrante", "Abre (hora COL)"];

/** Horarios con `n` mentores todas las horas indicadas del día (4 asientos por mentor y hora). */
export function horarios(dias: { dia: string; horas: number[]; mentores: number }[]): Fila[] {
  const max = Math.max(...dias.map((d) => d.mentores));
  const filas: Fila[] = [["Día", "Bloque (1 hora) - Hora COL", ...Array.from({ length: max }, (_, i) => `Mentor Prueba ${i + 1}`), "N° mentores"]];
  for (const d of dias)
    for (const h of d.horas) {
      const ampm = (x: number) => `${String(x % 12 || 12).padStart(2, "0")} ${x < 12 ? "am" : "pm"}`;
      filas.push([d.dia, `${ampm(h)} – ${ampm(h + 1)}`, ...Array.from({ length: max }, (_, i) => (i < d.mentores ? "x" : null)), d.mentores]);
    }
  return filas;
}

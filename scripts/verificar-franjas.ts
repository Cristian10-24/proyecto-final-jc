// Compara los asientos por día que genera el importador (hoja Horarios) con la pestaña
// "Proyectos por franja" del mismo Excel. Solo imprime totales por día: ningún dato personal.
// Uso: npm run verificar:franjas -- "ruta/al/archivo.xlsx"
import { clave, hoja, leerDia, leerLibro, texto, valor } from "@/lib/importar/excel";
import { asientosPorDia, leerHorarios } from "@/lib/importar/mentores";
import { readFile } from "node:fs/promises";

async function main() {
  const ruta = process.argv[2];
  if (!ruta) { console.error('Uso: npm run verificar:franjas -- "archivo.xlsx"'); process.exit(1); }
  const wb = await leerLibro(await readFile(ruta));
  const wsH = hoja(wb, "Horarios"), wsF = hoja(wb, "Proyectos por franja");
  if (!wsH || !wsF) { console.error("El archivo necesita las hojas Horarios y Proyectos por franja."); process.exit(1); }

  const { horas, errores } = leerHorarios(wsH);
  if (errores.length) console.log(`Horarios: ${errores.length} filas con error (no se cuentan).`);
  const generados = asientosPorDia(horas);

  // Encabezado de la tabla por franja: la fila que tiene "Día" y "Proyectos a calificar".
  let filaEnc = 0, colDia = 0, colProy = 0;
  wsF.eachRow((row, r) => {
    if (filaEnc) return;
    row.eachCell((c, i) => {
      const h = clave(texto(c.value));
      if (h === "dia") colDia = i;
      if (h === "proyectos a calificar") colProy = i;
    });
    if (colDia && colProy) filaEnc = r; else colDia = colProy = 0;
  });
  if (!filaEnc) { console.error('No encontré las columnas "Día" y "Proyectos a calificar".'); process.exit(1); }

  // La tabla de franjas termina en su fila TOTAL; el "Resumen por día" de abajo repetiría los días.
  const esperados = new Map<string, number>();
  let fin = false;
  wsF.eachRow((row, r) => {
    if (r <= filaEnc || fin) return;
    if (clave(texto(row.getCell(colDia).value)) === "total") { fin = true; return; }
    const dia = leerDia(row.getCell(colDia).value);
    const n = valor(row.getCell(colProy).value);
    if (dia && typeof n === "number") esperados.set(dia, (esperados.get(dia) ?? 0) + n);
  });

  let ok = true;
  console.log("Día         Importador  Excel");
  for (const dia of [...new Set([...generados.keys(), ...esperados.keys()])].sort()) {
    const a = generados.get(dia) ?? 0, b = esperados.get(dia) ?? 0;
    if (a !== b) ok = false;
    console.log(`${dia}  ${String(a).padStart(10)}  ${String(b).padStart(5)}${a === b ? "" : "  ← no coincide"}`);
  }
  const tA = [...generados.values()].reduce((x, y) => x + y, 0), tB = [...esperados.values()].reduce((x, y) => x + y, 0);
  console.log(`TOTAL       ${String(tA).padStart(10)}  ${String(tB).padStart(5)}`);
  console.log(ok ? "Coinciden todos los días." : "Hay días que no coinciden.");
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

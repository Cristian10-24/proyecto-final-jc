import type { Reporte } from "@/lib/evaluacion/seguimientoV2";
import { ciudadesTxt, diaAnio, N } from "./formato";

// Seguimiento v2 · Reporte del día: la MISMA escena (2000 × 1125, 16:9) se dibuja en SVG (pantalla) y en canvas
// (imagen descargada de 3840 × 2160), así las dos se ven igual. Colores fijos: el reporte oficial siempre va en claro.
// Réplica del reporte que ya se envía (prototipo 02).

export const ANCHO = 2000, ALTO = 1125, ESCALA = 1.92; // 2000 × 1,92 = 3840; 1125 × 1,92 = 2160
export const RC = { bg: "#f4f2ef", az: "#00105E", nar: "#FF9714", ink: "#1a1a1a", gris: "#5c5c5c", borde: "#e4e0da", blanco: "#ffffff", gr2: "#c9c6c1" };
export const FUENTE = "Inter, system-ui, sans-serif";

export type Run = { t: string; c: string; w?: number; s?: number };
export type Elemento =
  | { t: "r"; x: number; y: number; w: number; h: number; r: number; fill: string; st?: string }
  | { t: "arc"; cx: number; cy: number; r0: number; r1: number; a0: number; a1: number; fill: string }
  | { t: "tx"; x: number; y: number; s: number; txt: string; w: number; fill: string; a: "start" | "middle" | "end"; runs?: Run[] };

/** Medida del texto: canvas en el navegador; aproximada fuera de él (pruebas). Igual para SVG y canvas. */
export type Medir = (txt: string, size: number, weight: number) => number;
export const medirAprox: Medir = (t, sz, w) => t.length * sz * (w >= 700 ? 0.57 : 0.53);

function partir(txt: string, sz: number, w: number, ancho: number, medir: Medir): string[] {
  const l: string[] = []; let act = "";
  for (const p of txt.split(" ")) { const t = act ? `${act} ${p}` : p; if (medir(t, sz, w) > ancho && act) { l.push(act); act = p; } else act = t; }
  if (act) l.push(act);
  return l;
}
const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);

export function textoNoPresentados(r: Reporte): string {
  const n = r.p.nsp, i = r.p.nspIndividual, p = r.p.nspPareja;
  if (!n) return "No presentados: 0";
  if (!p) return `No presentados: ${n}${n === 1 ? ", individual" : ", todos individuales"}`;
  if (!i) return `No presentados: ${n}${n === 1 ? ", en pareja" : ", todos en pareja"}`;
  return `No presentados: ${n} (${i} ${i === 1 ? "individual" : "individuales"} y ${p} en pareja)`;
}

/** Fecha y subtítulo del reporte. */
export function encabezado(r: Reporte & { dias: string[] }, hoy: string): { fecha: string; sub: string } {
  if (!r.dia) {
    const ds = r.dias;
    const fecha = ds.length ? `Del ${Number(ds[0].slice(8))} al ${diaAnio(ds[ds.length - 1]).replace(/^\S+ /, "")}` : "Todos los días";
    return { fecha, sub: `${ciudadesTxt(r.ciudades)} · acumulado` };
  }
  return { fecha: diaAnio(r.dia), sub: `${ciudadesTxt(r.ciudades)}${r.dia === hoy ? " · en curso" : ""}` };
}

/** Escena 16:9 del reporte (elementos para SVG y canvas). */
export function escena(r: Reporte & { dias: string[] }, hoy: string, medir: Medir = medirAprox): Elemento[] {
  const E: Elemento[] = [];
  const rect = (x: number, y: number, w: number, h: number, rr: number, fill: string, st?: string) => E.push({ t: "r", x, y, w, h, r: rr, fill, st });
  const tx = (x: number, y: number, s: number, txt: string, o: { w?: number; c?: string; a?: "start" | "middle" | "end"; runs?: Run[] } = {}) =>
    E.push({ t: "tx", x, y, s, txt, w: o.w ?? 400, fill: o.c ?? RC.ink, a: o.a ?? "start", runs: o.runs });
  const { fecha, sub } = encabezado(r, hoy);
  rect(0, 0, ANCHO, ALTO, 0, RC.bg);
  tx(134, 130, 30, "", { w: 700, runs: [{ t: "Jóvenes crea", c: RC.nar }, { t: "TI", c: RC.az }, { t: "vos", c: RC.nar }] });
  tx(134, 205, 66, "Reporte de evaluación", { w: 700 });
  tx(1866, 173, 30, fecha, { a: "end", c: RC.gris });
  tx(1866, 209, 30, sub, { a: "end", c: RC.gris });

  // Cuatro tarjetas
  const cw = 411, ch = 268, cy = 258, xs = [134, 575, 1016, 1456];
  const card = (i: number, fill: string, st: string | undefined, big: string, de: string, label: string, cTxt: string, cDe: string, nota?: string) => {
    rect(xs[i], cy, cw, ch, 24, fill, st);
    const bx = xs[i] + 40;
    tx(bx, cy + 100, 76, "", { w: 700, runs: [{ t: big, c: cTxt, w: 700, s: 76 }, ...(de ? [{ t: ` ${de}`, c: cDe, w: 400, s: 40 }] : [])] });
    const ls = partir(label, 29, 400, cw - 80, medir).slice(0, nota ? 2 : 3);
    ls.forEach((l, k) => tx(bx, cy + 152 + k * 35, 29, l, { c: cTxt }));
    if (nota) { const ln = partir(nota, 19, 400, cw - 80, medir).slice(0, 2); ln.forEach((l, k) => tx(bx, cy + ch - 24 - (ln.length - 1 - k) * 24, 19, l, { c: cDe })); }
  };
  card(0, RC.az, undefined, N(r.e.pres), `/ ${N(r.e.tot)}`, `estudiantes evaluados (${pct(r.e.pres, r.e.tot)} %)`, "#ffffff", "#b9c0e3", "Evaluados = se presentaron y fueron calificados");
  card(1, RC.blanco, RC.borde, N(r.p.pres), `/ ${N(r.p.tot)}`, "proyectos presentados", RC.ink, RC.gris);
  card(2, RC.blanco, RC.borde, N(r.p.exc), "", `proyectos excelentes (${r.e.exc} estudiantes) y ${r.p.apr} aprobados`, RC.ink, RC.gris);
  card(3, RC.nar, undefined, N(r.p.des), "", `proyectos destacados (${pct(r.p.des, r.p.pres)} % de los presentados)`, RC.ink, RC.ink);

  // Proyectos presentados por ciudad: presentados (azul), no presentados (naranja), pendientes (gris)
  rect(134, 568, 1034, 497, 24, RC.blanco, RC.borde);
  tx(177, 638, 33, "Proyectos presentados por ciudad", { w: 700 });
  const n = r.porCiudad.length, sp = n > 1 ? Math.min(44.5, 268 / (n - 1)) : 44.5, bh = Math.min(32, sp - 9), fs = n > 8 ? 22 : 25;
  const mx = Math.max(1, ...r.porCiudad.map((c) => c.proyectos)), esc = 383 / mx;
  r.porCiudad.forEach((c, i) => {
    const y = 690 + i * sp, x0 = 379, wp = c.presentados * esc, wn = c.noPresentados * esc, wpe = c.pendientes * esc;
    tx(177, y + 9, fs, c.ciudad, { w: 700 });
    if (wp) rect(x0, y - bh / 2, wp, bh, 6, RC.az);
    if (wn) rect(x0 + wp - (wp ? 6 : 0), y - bh / 2, wn + (wp ? 6 : 0), bh, 6, RC.nar);
    if (wpe) rect(x0 + wp + wn - (wp || wn ? 6 : 0), y - bh / 2, wpe + (wp || wn ? 6 : 0), bh, 6, RC.gr2);
    if (wn && wp) rect(x0 + wp - 6, y - bh / 2, 6, bh, 0, RC.az);
    if (wpe && wn) rect(x0 + wp + wn - 6, y - bh / 2, 6, bh, 0, RC.nar);
    tx(x0 + c.proyectos * esc + 16, y + 9, fs, "", { runs: [{ t: `${c.presentados} / ${c.proyectos}`, c: RC.ink, w: 700 }, { t: ` · ${c.estudiantes} ${c.estudiantes === 1 ? "estudiante" : "estudiantes"}`, c: RC.gris, w: 400 }] });
  });
  const ly = r.p.pend ? 990 : 1003, lt = textoNoPresentados(r);
  let lf = 24; while (lf > 18 && medir("Presentados", lf, 400) + medir(lt, lf, 400) + 100 > 1130 - 379) lf--;
  const x2 = 415 + medir("Presentados", lf, 400) + 36;
  rect(379, ly - 20, 24, 24, 4, RC.az); tx(415, ly, lf, "Presentados", { c: RC.gris });
  rect(x2, ly - 20, 24, 24, 4, RC.nar); tx(x2 + 36, ly, lf, lt, { c: RC.gris });
  if (r.p.pend) { rect(379, ly + 18, 24, 24, 4, RC.gr2); tx(415, ly + 38, lf, `Pendientes por evaluar: ${r.p.pend}`, { c: RC.gris }); }

  // Dona de asistencia (estudiantes)
  rect(1200, 568, 666, 497, 24, RC.blanco, RC.borde);
  tx(1243, 638, 33, "Asistencia de estudiantes", { w: 700 });
  const as = r.e.pres, no = r.e.nsp, tt = as + no, a0 = -Math.PI / 2, a1 = a0 + (tt ? (2 * Math.PI * as) / tt : 0);
  if (!tt) E.push({ t: "arc", cx: 1387, cy: 818, r0: 92, r1: 137, a0, a1: a0 + 2 * Math.PI, fill: RC.gr2 });
  if (as) E.push({ t: "arc", cx: 1387, cy: 818, r0: 92, r1: 137, a0, a1, fill: RC.az });
  if (no) E.push({ t: "arc", cx: 1387, cy: 818, r0: 92, r1: 137, a0: a1, a1: a0 + 2 * Math.PI, fill: RC.nar });
  tx(1387, 834, 48, tt ? `${pct(as, tt)} %` : "—", { a: "middle", w: 700 });
  tx(1387, 864, 22, "asistencia", { a: "middle", c: RC.gris });
  rect(1563, 710, 24, 24, 4, RC.az); tx(1600, 732, 28, `${as} asistieron`, { w: 700 });
  rect(1563, 772, 24, 24, 4, RC.nar); tx(1600, 794, 28, `${no} no asistieron`, { w: 700 });
  const det = r.noAsistieron.slice(0, 4).map((x) => `${x.n} de ${x.ciudad}`);
  if (r.noAsistieron.length > 4) det[3] = `y ${r.noAsistieron.slice(3).reduce((a, x) => a + x.n, 0)} en ${r.noAsistieron.length - 3} ciudades más`;
  det.forEach((t, k) => tx(1600, 830 + k * 31, 23, t, { c: RC.gris }));
  if (r.e.pend) tx(1600, 830 + det.length * 31 + 14, 21, `${r.e.pend} ${r.e.pend === 1 ? "pendiente sin evaluar" : "pendientes sin evaluar"}`, { c: RC.gris });
  return E;
}

/** Trazo de un sector de dona. */
export function arcoPath(e: Extract<Elemento, { t: "arc" }>): string {
  const p = (r: number, a: number) => `${(e.cx + r * Math.cos(a)).toFixed(2)} ${(e.cy + r * Math.sin(a)).toFixed(2)}`;
  const full = e.a1 - e.a0 >= 2 * Math.PI - 1e-6, a1 = full ? e.a1 - 0.0001 : e.a1, lg = a1 - e.a0 > Math.PI ? 1 : 0;
  return `M${p(e.r1, e.a0)}A${e.r1} ${e.r1} 0 ${lg} 1 ${p(e.r1, a1)}L${p(e.r0, a1)}A${e.r0} ${e.r0} 0 ${lg} 0 ${p(e.r0, e.a0)}Z`;
}

/** Dibuja la escena en un canvas de 3840 × 2160 (ANCHO × ESCALA). */
export function dibujar(E: Elemento[], cv: HTMLCanvasElement): HTMLCanvasElement {
  cv.width = Math.round(ANCHO * ESCALA); cv.height = Math.round(ALTO * ESCALA);
  const c = cv.getContext("2d")!;
  c.scale(ESCALA, ESCALA); c.textBaseline = "alphabetic";
  for (const e of E) {
    if (e.t === "r") {
      c.beginPath(); if (c.roundRect) c.roundRect(e.x, e.y, e.w, e.h, e.r); else c.rect(e.x, e.y, e.w, e.h);
      c.fillStyle = e.fill; c.fill(); if (e.st) { c.lineWidth = 2; c.strokeStyle = e.st; c.stroke(); }
    } else if (e.t === "arc") { c.fillStyle = e.fill; c.fill(new Path2D(arcoPath(e))); }
    else if (e.runs) {
      let x = e.x;
      for (const r of e.runs) { c.font = `${r.w ?? e.w} ${r.s ?? e.s}px ${FUENTE}`; c.fillStyle = r.c; c.textAlign = "left"; c.fillText(r.t, x, e.y); x += c.measureText(r.t).width; }
    } else { c.font = `${e.w} ${e.s}px ${FUENTE}`; c.fillStyle = e.fill; c.textAlign = e.a === "end" ? "right" : e.a === "middle" ? "center" : "left"; c.fillText(e.txt, e.x, e.y); }
  }
  return cv;
}

import type { Cuenta } from "@/lib/evaluacion/seguimientoV2";
import { N, nf, P, pc } from "./formato";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · gráficos en SVG propio (sin librerías), portados del prototipo docs/diseno/seguimiento/.
// Cada marca lleva `data-tip` (detalle al pasar el cursor) y el color nunca es la única forma de leer el dato: los
// valores van escritos y hay formas o símbolos (×, •, ▼, círculo y cuadrado) donde el color distingue grupos.

export const RES = [
  { k: "exc", n: "Excelente", col: "var(--c-nar)" },
  { k: "apr", n: "Aprobado", col: "var(--c-az)" },
  { k: "inc", n: "Incompleto", col: "var(--c-gr)" },
  { k: "nsp", n: "No se presentó", col: "var(--c-bad)" },
  { k: "pend", n: "Pendiente", col: "var(--c-gr2)" },
] as const;
type K = (typeof RES)[number]["k"];

const T = ({ x, y, t, a, sz = 12, w, c, title }: { x: number; y: number; t: string; a?: "start" | "middle" | "end"; sz?: number; w?: number; c?: string; title?: boolean }) => (
  <text x={x} y={y} textAnchor={a} style={{ fontSize: sz, fontWeight: w, fill: c ?? "var(--ev-ink)", fontFamily: title ? "var(--ev-font-titulo)" : undefined }}>{t}</text>
);
const niceMax = (v: number) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };
const linea = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");

/** Mini tendencia: línea del acumulado por día con el punto del día elegido (o el último). */
export function Spark({ vals, sel }: { vals: number[]; sel?: number | null }) {
  if (vals.length < 2) return <svg className={s.spark} viewBox="0 0 120 34" aria-hidden="true" />;
  const w = 120, h = 34; let mx = Math.max(...vals), mn = Math.min(...vals); if (mx === mn) { mx += 1; mn -= 1; }
  const pts = vals.map((v, i): [number, number] => [4 + i * (w - 8) / (vals.length - 1), h - 5 - (v - mn) / (mx - mn) * (h - 10)]);
  const u = pts[sel ?? pts.length - 1] ?? pts[pts.length - 1];
  return (
    <svg className={s.spark} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={linea(pts)} style={{ fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round", opacity: .75 }} />
      <circle cx={u[0]} cy={u[1]} r={3.5} style={{ fill: "currentColor" }} />
    </svg>
  );
}

/** Cuadrícula 10 × 10: cada cuadro = 1 % del total (cuotas con el método del mayor residuo). */
export function Waffle({ c, uniTxt }: { c: Cuenta; uniTxt: (n: number) => string }) {
  const tot = c.tot || 1;
  const cuotas = RES.map((r) => { const q = (c[r.k as K] * 100) / tot; return { r, n: Math.floor(q), f: q - Math.floor(q) }; });
  const falta = 100 - cuotas.reduce((a, x) => a + x.n, 0);
  [...cuotas].sort((a, b) => b.f - a.f).slice(0, falta).forEach((x) => { x.n++; });
  const sz = 22, g = 4, cel: React.ReactNode[] = [];
  let i = 0;
  if (!c.tot) for (let k = 0; k < 100; k++) cel.push(<rect key={k} x={(k % 10) * (sz + g)} y={Math.floor(k / 10) * (sz + g)} width={sz} height={sz} rx={4} style={{ fill: "var(--ev-surface-2)" }} />);
  else for (const x of cuotas) for (let k = 0; k < x.n; k++, i++) {
    const cx = (i % 10) * (sz + g), cy = Math.floor(i / 10) * (sz + g), n = c[x.r.k as K];
    const tip = `${x.r.n}: ${N(n)} ${uniTxt(n)} (${P(n / tot)})`;
    if (x.r.k === "pend") cel.push(<rect key={i} x={cx + 1} y={cy + 1} width={sz - 2} height={sz - 2} rx={4} style={{ fill: "none", stroke: "var(--c-gr)", strokeWidth: 1.5, strokeDasharray: "3 2" }} data-tip={tip} />);
    else cel.push(
      <g key={i} data-tip={tip}>
        <rect x={cx} y={cy} width={sz} height={sz} rx={4} style={{ fill: x.r.col }} />
        {x.r.k === "nsp" && <path d={`M${cx + 7} ${cy + 7}l8 8M${cx + 15} ${cy + 7}l-8 8`} style={{ stroke: "#fff", strokeWidth: 1.8, strokeLinecap: "round", pointerEvents: "none" }} />}
        {x.r.k === "exc" && <circle cx={cx + 11} cy={cy + 11} r={3} style={{ fill: "#1a1a1a", opacity: .55, pointerEvents: "none" }} />}
      </g>,
    );
  }
  return <svg className={s.waffle} viewBox="0 0 256 256" role="img" aria-label="Cuadrícula de 100 cuadros: cada cuadro es 1 % del total">{cel}</svg>;
}

export function LeyendaRes({ c }: { c: Cuenta }) {
  return (
    <ul className={s.ley}>
      {RES.map((r) => (
        <li key={r.k}>
          <i style={r.k === "pend" ? { border: "1.5px dashed var(--c-gr)", background: "none" } : { background: r.col }}>{r.k === "nsp" ? "×" : r.k === "exc" ? "•" : ""}</i>
          <span>{r.n}</span><b>{N(c[r.k as K])}</b><em>{P(c.tot ? c[r.k as K] / c.tot : null)}</em>
        </li>
      ))}
    </ul>
  );
}

export type DiaCombo = { dia: string; etiqueta: string; largo: string; hoy: boolean; tot: number; ev: number; nsp: number; asis: number | null; acum: number };
/** Columnas programados/evaluados por día, línea % de asistencia y curva del avance acumulado. */
export function Combo({ filas, sel, movil }: { filas: DiaCombo[]; sel: string | null; movil: boolean }) {
  if (!filas.length) return <p className={s.muted}>Sin días con proyectos agendados.</p>;
  const w = movil ? 720 : 1040, h = 300, ml = 44, mr = 48, mt = 26, mb = 48, iw = w - ml - mr, ih = h - mt - mb;
  const mx = niceMax(Math.max(...filas.map((f) => f.tot)) * 1.1), gw = iw / filas.length, bw = Math.min(26, gw * 0.3);
  const pa: [number, number, number][] = [], pc2: [number, number][] = [];
  const out: React.ReactNode[] = [];
  for (let k = 0; k <= 4; k++) {
    const yy = mt + ih - (ih * k) / 4;
    out.push(<g key={`g${k}`}><line x1={ml} x2={w - mr} y1={yy} y2={yy} style={{ stroke: "var(--c-grid)" }} /><T x={ml - 8} y={yy + 4} t={N(Math.round((mx * k) / 4))} a="end" sz={11} c="var(--ev-muted)" /><T x={w - mr + 8} y={yy + 4} t={`${25 * k} %`} sz={11} c="var(--ev-muted)" /></g>);
  }
  filas.forEach((f, i) => {
    const x0 = ml + gw * i + gw / 2, hp = (ih * f.tot) / mx, he = (ih * f.ev) / mx;
    const tip = `${f.largo}${f.hoy ? " (hoy)" : ""}\nProgramados: ${N(f.tot)}\nEvaluados: ${N(f.ev)}\nNo se presentaron: ${N(f.nsp)}\nAsistencia: ${P(f.asis)}\nAvance acumulado: ${f.acum} %`;
    out.push(
      <g key={f.dia} data-tip={tip} style={{ opacity: sel && sel !== f.dia ? 0.35 : 1 }}>
        <rect x={x0 - gw / 2} y={mt} width={gw} height={ih} style={{ fill: "transparent" }} />
        <rect x={x0 - bw - 1} y={mt + ih - hp} width={bw} height={hp} rx={3} style={{ fill: "var(--c-gr2)" }} />
        <rect x={x0 + 1} y={mt + ih - he} width={bw} height={he} rx={3} style={{ fill: "var(--c-az)" }} />
        <T x={x0 - bw / 2 - 1} y={mt + ih - hp - 5} t={N(f.tot)} a="middle" sz={11} c="var(--ev-muted)" />
        <T x={x0 + bw / 2 + 1} y={mt + ih - he - 5} t={N(f.ev)} a="middle" sz={11} w={700} />
        <T x={x0} y={h - mb + 18} t={f.etiqueta} a="middle" sz={12} w={f.dia === sel ? 700 : 500} />
        {f.hoy && <T x={x0} y={h - mb + 33} t="hoy" a="middle" sz={11} w={700} c="var(--ev-orange-ink)" />}
      </g>,
    );
    if (f.asis !== null) pa.push([x0, mt + ih - ih * f.asis, pc(f.asis)]);
    pc2.push([x0, mt + ih - (ih * f.acum) / 100]);
  });
  const u = pc2[pc2.length - 1];
  return (
    <svg className={s.svg} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Avance por día: programados, evaluados, asistencia y avance acumulado">
      {out}
      <path d={linea(pc2)} style={{ fill: "none", stroke: "var(--ev-ink)", strokeWidth: 2, strokeDasharray: "5 4", pointerEvents: "none" }} />
      {pa.length > 0 && <path d={linea(pa.map((p) => [p[0], p[1]]))} style={{ fill: "none", stroke: "var(--c-nar)", strokeWidth: 2.5, pointerEvents: "none" }} />}
      {pa.map((p, i) => <g key={`a${i}`} style={{ pointerEvents: "none" }}><circle cx={p[0]} cy={p[1]} r={4} style={{ fill: "var(--c-nar)", stroke: "var(--ev-surface)", strokeWidth: 1.5 }} /><T x={p[0]} y={p[1] - 9} t={`${p[2]} %`} a="middle" sz={11} w={700} c="var(--ev-orange-ink)" /></g>)}
      <rect x={u[0] - 2.5} y={u[1] - 2.5} width={5} height={5} style={{ fill: "var(--ev-ink)" }} />
      <T x={u[0] + 8} y={u[1] + 4} t={`${filas[filas.length - 1].acum} % acumulado`} sz={11} w={700} />
    </svg>
  );
}

/** Medidor semicircular: libres sobre el total. */
export function Medidor({ ocupados, total }: { ocupados: number; total: number }) {
  const cx = 150, cy = 140, r = 110, sw = 26;
  const arc = (a0: number, a1: number) => `M${(cx + r * Math.cos(a0)).toFixed(1)} ${(cy + r * Math.sin(a0)).toFixed(1)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)}`;
  const f = total ? ocupados / total : 0, a = Math.PI + Math.PI * f;
  return (
    <svg className={s.gauge} viewBox="0 0 300 170" role="img" aria-label={`${ocupados} de ${total} cupos ocupados; ${total - ocupados} libres`}>
      <path d={arc(Math.PI, 2 * Math.PI - 0.0001)} style={{ fill: "none", stroke: "var(--c-gr2)", strokeWidth: sw }} data-tip={`Libres: ${total - ocupados} cupos`} />
      {ocupados > 0 && <path d={arc(Math.PI, Math.min(a, 2 * Math.PI - 0.0001))} style={{ fill: "none", stroke: "var(--c-az)", strokeWidth: sw }} data-tip={`Ocupados: ${ocupados} cupos`} />}
      <T x={cx} y={cy - 22} t={String(total - ocupados)} a="middle" sz={44} w={700} title />
      <T x={cx} y={cy + 4} t={`libres de ${total}`} a="middle" sz={14} c="var(--ev-muted)" />
      <T x={cx - r} y={cy + 26} t="0" a="middle" sz={11} c="var(--ev-muted)" />
      <T x={cx + r} y={cy + 26} t={String(total)} a="middle" sz={11} c="var(--ev-muted)" />
    </svg>
  );
}

/** Radar de los 7 criterios (0–100 %), con la línea del 60 %. */
export function Radar({ vals, nombres }: { vals: number[]; nombres: string[] }) {
  const cx = 210, cy = 170, R = 118, n = vals.length;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + (Math.cos(a) * R * v) / 100, cy + (Math.sin(a) * R * v) / 100]; };
  const poly = (v: (i: number) => number) => vals.map((_, i) => pt(i, v(i)).join(",")).join(" ");
  return (
    <svg className={s.svg} viewBox="0 0 420 345" role="img" aria-label="Radar de criterios de la Parte A">
      {[25, 50, 75, 100].map((v) => <polygon key={v} points={poly(() => v)} style={{ fill: "none", stroke: "var(--c-grid)" }} />)}
      <polygon points={poly(() => 60)} style={{ fill: "none", stroke: "var(--c-bad)", strokeDasharray: "4 3", opacity: .8 }} />
      {vals.map((_, i) => { const p = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} style={{ stroke: "var(--c-grid)" }} />; })}
      <polygon points={poly((i) => vals[i])} style={{ fill: "var(--c-az)", fillOpacity: .18, stroke: "var(--c-az)", strokeWidth: 2.5, strokeLinejoin: "round" }} />
      {vals.map((v, i) => {
        const p = pt(i, v), q = pt(i, 122), bajo = v < 60, a = Math.abs(q[0] - cx) < 10 ? "middle" : q[0] > cx ? "start" : "end";
        const pal = nombres[i].split(" "), largo = nombres[i].length > 16, m = Math.ceil(pal.length / 2);
        const l1 = largo ? pal.slice(0, m).join(" ") : nombres[i], l2 = largo ? pal.slice(m).join(" ") : "";
        const dy = q[1] < cy - 20 ? -4 : q[1] > cy + 20 ? 10 : 2;
        return (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={bajo ? 6 : 4.5} style={{ fill: bajo ? "var(--c-bad)" : "var(--c-az)", stroke: "var(--ev-surface)", strokeWidth: 2 }} data-tip={`${nombres[i]}: ${v} %${bajo ? " (por debajo de 60 %)" : ""}`} />
            <T x={q[0]} y={q[1] + dy - (l2 ? 7 : 0)} t={l1} a={a} sz={11.5} c="var(--ev-muted)" />
            {l2 && <T x={q[0]} y={q[1] + dy + 7} t={l2} a={a} sz={11.5} c="var(--ev-muted)" />}
            <T x={q[0]} y={q[1] + dy + (l2 ? 22 : 15)} t={`${v} %${bajo ? " ⚠" : ""}`} a={a} sz={12.5} w={700} c={bajo ? "var(--c-bad)" : "var(--ev-ink)"} />
          </g>
        );
      })}
    </svg>
  );
}

export type ItemBarra = { l: string; sub?: string; v: number; txt: React.ReactNode; col?: string; cls?: string; tip?: string; segs?: { v: number; col: string }[] };
/** Barras horizontales ordenadas (HTML). Con `segs`, barras apiladas. */
export function BarrasH({ items, max }: { items: ItemBarra[]; max?: number }) {
  const mx = max ?? Math.max(1, ...items.map((x) => x.v));
  return (
    <ul className={s.bh}>
      {items.map((x) => (
        <li key={x.l} data-tip={x.tip ?? `${x.l}: ${x.v}`}>
          <span className={s.l}>{x.l}{x.sub && <small>{x.sub}</small>}</span>
          <span className={s.t}>{(x.segs ?? [{ v: x.v, col: x.col ?? "var(--c-az)" }]).map((g, i) => <i key={i} style={{ width: `${(g.v * 100) / mx}%`, background: g.col }} />)}</span>
          <b className={x.cls ? s[x.cls] : undefined}>{x.txt}</b>
        </li>
      ))}
    </ul>
  );
}

/** Barras de bala por tema: promedio 0–4 con la meta en 2. */
export function Balas({ temas }: { temas: { l: string; v: number | null; n: number }[] }) {
  return (
    <div>
      <div className={`${s.bala} ${s.balaEsc}`} aria-hidden="true"><span /><div className={s.t}>{[0, 1, 2, 3, 4].map((k) => <em key={k} style={{ left: `${k * 25}%` }}>{k}{k === 2 ? " · meta" : ""}</em>)}</div><span /></div>
      {temas.map((t) => {
        const bajo = t.v !== null && t.v < 2;
        return (
          <div key={t.l} className={s.bala} data-tip={`${t.l}: ${nf(t.v)} de 4 · ${N(t.n)} evaluados${bajo ? " · por debajo de la meta" : ""}`}>
            <div className={s.l}><b>{t.l}</b><small>{N(t.n)} evaluados</small></div>
            <div className={s.t}><span className={s.b1} /><i style={{ width: `${(t.v ?? 0) * 25}%`, background: bajo ? "var(--c-nar)" : "var(--c-az)" }} /><em className={s.meta} /></div>
            <div className={s.v}><b>{nf(t.v)}</b>{t.v === null ? <small className={s.muted}>sin datos</small> : bajo ? <small className={s.bajo}>▼ bajo la meta</small> : <small className={s.ok}>✓ meta</small>}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Celda del mapa de calor: naranja bajo la meta (con ▼), azul sobre la meta. */
export function CeldaCalor({ v }: { v: number | null }) {
  if (v === null) return <td className={`${s.hc} ${s.vacia}`}>—</td>;
  if (v < 2) { const p = Math.round(15 + ((2 - v) / 2) * 70); return <td className={s.hc} style={{ background: `color-mix(in srgb, var(--c-nar) ${p}%, var(--ev-surface))`, color: "var(--ev-ink)" }}>▼ {nf(v)}</td>; }
  const q = Math.round(12 + ((v - 2) / 2) * 80);
  return <td className={s.hc} style={{ background: `color-mix(in srgb, var(--c-az) ${q}%, var(--ev-surface))`, color: q > 50 ? "#fff" : "var(--ev-ink)" }}>{nf(v)}</td>;
}
export const EscalaCalor = () => <div className={s.escala}><span>▼ bajo la meta (menos de 2)</span><i className={s.e1} /><i className={s.e2} /><i className={s.e3} /><i className={s.e4} /><span>sobre la meta (hasta 4)</span></div>;

export type Burbuja = { l: string; tot: number; asis: number; nivel: number; pctExc: number };
/** Burbujas por ciudad: x = % de asistencia, y = nivel promedio, tamaño = agendados, color = % de excelentes. */
export function Burbujas({ cs, uniTxt }: { cs: Burbuja[]; uniTxt: string }) {
  const w = 720, h = 380, ml = 50, mr = 30, mt = 20, mb = 46, iw = w - ml - mr, ih = h - mt - mb;
  const x0 = Math.max(0, Math.floor((Math.min(...cs.map((c) => c.asis)) - 3) / 5) * 5), x1 = 100;
  const ys = cs.map((c) => c.nivel);
  const y0 = Math.max(0, Math.floor((Math.min(...ys) - 0.3) * 2) / 2); let y1 = Math.min(4, Math.ceil((Math.max(...ys) + 0.3) * 2) / 2); if (y1 - y0 < 1) y1 = Math.min(4, y0 + 1);
  const es = cs.map((c) => c.pctExc), e0 = Math.min(...es); let e1 = Math.max(...es); if (e1 === e0) e1 = e0 + 1;
  const mxN = Math.max(...cs.map((c) => c.tot));
  const X = (v: number) => ml + ((v - x0) / (x1 - x0 || 1)) * iw, Y = (v: number) => mt + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const grid: React.ReactNode[] = [];
  for (let v = x0; v <= x1; v += 5) grid.push(<g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={mt} y2={mt + ih} style={{ stroke: "var(--c-grid)" }} /><T x={X(v)} y={mt + ih + 16} t={`${v} %`} a="middle" sz={11} c="var(--ev-muted)" /></g>);
  for (let y = y0; y <= y1 + 0.001; y += 0.5) grid.push(<g key={`y${y}`}><line x1={ml} x2={w - mr} y1={Y(y)} y2={Y(y)} style={{ stroke: "var(--c-grid)" }} /><T x={ml - 8} y={Y(y) + 4} t={nf(y)} a="end" sz={11} c="var(--ev-muted)" /></g>);
  const puestas: number[][] = [], etiquetas: React.ReactNode[] = [];
  const bolas = [...cs].sort((a, b) => b.tot - a.tot).map((c) => {
    const r = 6 + 20 * Math.sqrt(c.tot / mxN), k = Math.round(25 + (75 * (c.pctExc - e0)) / (e1 - e0)), px = X(c.asis), py = Y(c.nivel), lw = c.l.length * 6.6;
    const cand = [[px + r + 4, py + 4], [px - r - 4 - lw, py + 4], [px - lw / 2, py - r - 5], [px - lw / 2, py + r + 13], [px + r + 4, py + 18], [px + r + 4, py - 10]];
    let ok = cand.find((q) => { const bx = [q[0], q[1] - 11, lw, 14]; if (bx[0] < ml || bx[0] + lw > w - 4) return false; return !puestas.some((z) => bx[0] < z[0] + z[2] && bx[0] + bx[2] > z[0] && bx[1] < z[1] + z[3] && bx[1] + bx[3] > z[1]); });
    if (ok) puestas.push([ok[0], ok[1] - 11, lw, 14]); else ok = cand[0];
    etiquetas.push(<T key={c.l} x={ok[0]} y={ok[1]} t={c.l} sz={11.5} w={600} />);
    return <circle key={c.l} cx={px} cy={py} r={r.toFixed(1)} style={{ fill: `color-mix(in srgb, var(--c-az) ${k}%, var(--c-az3))`, fillOpacity: .9, stroke: "var(--ev-surface)", strokeWidth: 1.5 }}
      data-tip={`${c.l}\n${N(c.tot)} ${uniTxt}\nAsistencia: ${c.asis} %\nNivel promedio: ${nf(c.nivel)}\nExcelentes: ${c.pctExc} %`} />;
  });
  return (
    <>
      <svg className={s.svg} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Ciudades según asistencia y nivel promedio">
        {grid}
        {2 >= y0 && 2 <= y1 && <g><line x1={ml} x2={w - mr} y1={Y(2)} y2={Y(2)} style={{ stroke: "var(--c-nar)", strokeWidth: 1.5, strokeDasharray: "6 4" }} /><T x={w - mr} y={Y(2) - 6} t="Meta de nivel: 2" a="end" sz={11} w={600} c="var(--ev-orange-ink)" /></g>}
        <T x={ml + iw / 2} y={h - 6} t="% de asistencia →" a="middle" sz={12} c="var(--ev-muted)" />
        <text transform={`translate(14 ${mt + ih / 2}) rotate(-90)`} textAnchor="middle" style={{ fontSize: 12, fill: "var(--ev-muted)" }}>Nivel promedio (0 a 4) →</text>
        {bolas}{etiquetas}
      </svg>
      <p className={s.nota}>Tamaño = {uniTxt} agendados · Color más oscuro = más % de excelentes (de {e0} % a {Math.max(...es)} %)</p>
    </>
  );
}

export type FilaDumbbell = { l: string; a: number; b: number; max: number; fmt: (x: number) => string };
/** Dos grupos por métrica: círculo naranja (A) y cuadrado azul (B). */
export function Dumbbell({ filas, a, b, movil }: { filas: FilaDumbbell[]; a: string; b: string; movil: boolean }) {
  const w = movil ? 380 : 640, rh = 52, ml = movil ? 100 : 150, mr = movil ? 18 : 30, h = filas.length * rh + 34, iw = w - ml - mr;
  return (
    <svg className={s.svg} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Comparación ${a} y ${b}`}>
      <g transform={`translate(${movil ? 8 : ml} 14)`}>
        <circle cx={6} cy={0} r={6} style={{ fill: "var(--c-nar)" }} /><T x={18} y={4} t={a} sz={12} w={600} />
        <rect x={movil ? 100 : 118} y={-6} width={12} height={12} rx={2} style={{ fill: "var(--c-az)" }} /><T x={movil ? 118 : 136} y={4} t={b} sz={12} w={600} />
      </g>
      {filas.map((f, i) => {
        const y = 44 + i * rh, X = (v: number) => ml + (v / f.max) * iw, xa = X(f.a), xb = X(f.b), ta = f.fmt(f.a), tb = f.fmt(f.b), izqA = f.a <= f.b;
        return (
          <g key={f.l}>
            <T x={ml - 12} y={y + 4} t={f.l} a="end" sz={movil ? 11.5 : 12.5} w={600} />
            <line x1={ml} x2={ml + iw} y1={y} y2={y} style={{ stroke: "var(--c-grid)" }} />
            <T x={ml} y={y + 20} t="0" sz={10} c="var(--ev-muted)" /><T x={ml + iw} y={y + 20} t={f.max === 4 ? "4" : "100 %"} a="end" sz={10} c="var(--ev-muted)" />
            <line x1={xa} x2={xb} y1={y} y2={y} style={{ stroke: "var(--c-gr)", strokeWidth: 4, strokeLinecap: "round" }} />
            <circle cx={xa} cy={y} r={7.5} style={{ fill: "var(--c-nar)", stroke: "var(--ev-surface)", strokeWidth: 2 }} data-tip={`${f.l} · ${a}: ${ta}`} />
            <rect x={xb - 7} y={y - 7} width={14} height={14} rx={2.5} style={{ fill: "var(--c-az)", stroke: "var(--ev-surface)", strokeWidth: 2 }} data-tip={`${f.l} · ${b}: ${tb}`} />
            {Math.abs(xa - xb) < 2 ? <T x={xb + 12} y={y - 9} t={`${ta} · ${tb}`} sz={11.5} w={700} /> : (
              <><T x={xa + (izqA ? -11 : 11)} y={y - 9} t={ta} a={izqA ? "end" : "start"} sz={11.5} w={700} c="var(--ev-orange-ink)" /><T x={xb + (izqA ? 11 : -11)} y={y - 9} t={tb} a={izqA ? "start" : "end"} sz={11.5} w={700} /></>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Barra al 100 % con leyenda y valores. */
export function Barra100({ segs }: { segs: { l: string; v: number; col: string; ink?: string }[] }) {
  const tot = segs.reduce((a, x) => a + x.v, 0) || 1;
  return (
    <>
      <div className={s.b100}>{segs.map((g) => { const p = (g.v * 100) / tot; return p ? <span key={g.l} style={{ flex: g.v, background: g.col, color: g.ink ?? "#fff" }} data-tip={`${g.l}: ${g.v} (${Math.round(p)} %)`}>{p >= 9 && <b>{Math.round(p)} %</b>}</span> : null; })}</div>
      <ul className={`${s.ley} ${s.fila}`}>{segs.map((g) => <li key={g.l}><i style={{ background: g.col }} /><span>{g.l}</span><b>{g.v}</b></li>)}</ul>
    </>
  );
}

export type PuntoMentor = { l: string; funciona: number; nivel: number; ev: number; raro: boolean };
/** Dispersión de mentores (Funciona vs Nivel), tamaño = evaluados, medianas punteadas; ⚠ el atípico. */
export function Dispersion({ ms, medX, medY }: { ms: PuntoMentor[]; medX: number; medY: number }) {
  const w = 720, h = 400, ml = 50, mr = 24, mt = 20, mb = 46, iw = w - ml - mr, ih = h - mt - mb;
  const x0 = Math.max(0, Math.floor((Math.min(...ms.map((m) => m.funciona)) - 4) / 5) * 5), x1 = 100;
  const y0 = Math.max(0, Math.floor((Math.min(...ms.map((m) => m.nivel)) - 0.3) * 2) / 2), y1 = 4, mxN = Math.max(1, ...ms.map((m) => m.ev));
  const X = (v: number) => ml + ((v - x0) / (x1 - x0 || 1)) * iw, Y = (v: number) => mt + ih - ((v - y0) / (y1 - y0 || 1)) * ih;
  const g: React.ReactNode[] = [];
  for (let v = x0; v <= x1; v += 5) g.push(<g key={`x${v}`}><line x1={X(v)} x2={X(v)} y1={mt} y2={mt + ih} style={{ stroke: "var(--c-grid)" }} /><T x={X(v)} y={mt + ih + 16} t={`${v} %`} a="middle" sz={11} c="var(--ev-muted)" /></g>);
  for (let y = y0; y <= y1 + 0.001; y += 0.5) g.push(<g key={`y${y}`}><line x1={ml} x2={w - mr} y1={Y(y)} y2={Y(y)} style={{ stroke: "var(--c-grid)" }} /><T x={ml - 8} y={Y(y) + 4} t={nf(y)} a="end" sz={11} c="var(--ev-muted)" /></g>);
  return (
    <svg className={s.svg} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Mentores según Funciona promedio y Nivel promedio">
      {g}
      <line x1={X(medX)} x2={X(medX)} y1={mt} y2={mt + ih} style={{ stroke: "var(--ev-muted)", strokeDasharray: "5 4" }} /><T x={X(medX) + 5} y={mt + 12} t={`Mediana ${Math.round(medX)} %`} sz={11} w={600} c="var(--ev-muted)" />
      <line x1={ml} x2={w - mr} y1={Y(medY)} y2={Y(medY)} style={{ stroke: "var(--ev-muted)", strokeDasharray: "5 4" }} /><T x={ml + 6} y={Y(medY) - 6} t={`Mediana ${nf(medY)}`} sz={11} w={600} c="var(--ev-muted)" />
      <T x={ml + iw / 2} y={h - 6} t="Funciona promedio (%) →" a="middle" sz={12} c="var(--ev-muted)" />
      <text transform={`translate(14 ${mt + ih / 2}) rotate(-90)`} textAnchor="middle" style={{ fontSize: 12, fill: "var(--ev-muted)" }}>Nivel promedio (0 a 4) →</text>
      {ms.map((m) => {
        const r = 5 + 13 * Math.sqrt(m.ev / mxN), px = X(m.funciona), py = Y(m.nivel);
        const tip = `${m.l}\nEvaluados: ${m.ev}\nFunciona prom.: ${Math.round(m.funciona)} %\nNivel prom.: ${nf(m.nivel)}${m.raro ? "\nMuy distinto al resto" : ""}`;
        return m.raro ? (
          <g key={m.l}>
            <circle cx={px} cy={py} r={r + 5} style={{ fill: "none", stroke: "var(--c-nar)", strokeWidth: 2, strokeDasharray: "3 2" }} />
            <circle cx={px} cy={py} r={r} style={{ fill: "var(--c-nar)", stroke: "var(--ev-surface)", strokeWidth: 1.5 }} data-tip={tip} />
            <T x={px - r - 10} y={py + 4} t={`⚠ ${m.l}`} a="end" sz={12} w={700} c="var(--ev-orange-ink)" />
          </g>
        ) : <circle key={m.l} cx={px} cy={py} r={r} style={{ fill: "var(--c-az)", fillOpacity: .55, stroke: "var(--c-az)", strokeWidth: 1.2 }} data-tip={tip} />;
      })}
    </svg>
  );
}

/** Mini barra en tablas y tarjetas. */
export function Mini({ v, max, txt, col }: { v: number; max: number; txt: string; col?: string }) {
  return <><span className={s.mini}><i style={{ width: `${Math.max(0, Math.min(100, (v * 100) / max))}%`, background: col ?? "var(--c-az)" }} /></span><span className={s.mv}>{txt}</span></>;
}

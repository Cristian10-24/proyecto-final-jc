"use client";

import { useEffect, useRef, useState } from "react";
import { normal } from "@/lib/evaluacion/seguimientoV2";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · piezas comunes: tarjeta con «Ver como tabla», tabla, lista con buscador/orden/«Ver más» (tarjetas en
// el celular), aviso, íconos y el detalle al pasar el cursor (un solo tooltip para todos los `data-tip`).

const svg = (size: number, d: React.ReactNode) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
export const IcoTabla = () => svg(16, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></>);
export const IcoGraf = () => svg(16, <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />);
export const IcoBuscar = () => svg(18, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IcoDesc = () => svg(18, <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />);
export const IcoInfo = () => svg(20, <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>);
export const IcoAlerta = () => svg(20, <><path d="M12 3 2 21h20L12 3z" /><path d="M12 10v4M12 17h.01" /></>);
export const IcoCandado = () => svg(16, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>);
export const IcoFiltro = () => svg(18, <path d="M3 5h18M6 12h12M10 19h4" />);
export const IcoNo = () => svg(16, <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>);
export const IcoFlecha = () => svg(18, <path d="m6 9 6 6 6-6" />);

/** Tarjeta de gráfico: título con la conclusión, subtítulo, botón «Ver como tabla» / «Ver gráfico». */
export function Tarjeta({ id, titulo, sub, grafico, tabla, ley, pie, cls }: {
  id: string; titulo: React.ReactNode; sub?: React.ReactNode; grafico: React.ReactNode; tabla?: React.ReactNode; ley?: React.ReactNode; pie?: React.ReactNode; cls?: string;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className={`${s.c} ${cls ?? ""}`} id={`c-${id}`} aria-labelledby={`t-${id}`}>
      <div className={s.ch}>
        <div><h3 id={`t-${id}`}>{titulo}</h3>{sub && <p className={`${s.muted} ${s.small}`}>{sub}</p>}</div>
        {tabla && (
          <button type="button" className={s.vt} aria-pressed={verTabla} onClick={() => setVerTabla((x) => !x)}>
            {verTabla ? <><IcoGraf />Ver gráfico</> : <><IcoTabla />Ver como tabla</>}
          </button>
        )}
      </div>
      {ley && !verTabla && ley}
      <div>{verTabla ? tabla : grafico}</div>
      {pie}
    </section>
  );
}

export type Col = { t: string; num?: boolean };
/** Tabla simple; una fila puede ser { tot: true, c: [...] } (total). */
export function Tabla({ cols, filas, titulo, vacio = "Sin datos con estos filtros." }: { cols: Col[]; filas: (React.ReactNode[] | { tot: true; c: React.ReactNode[] })[]; titulo?: string; vacio?: string }) {
  return (
    <>
      {titulo && <p className={s.tablaT}>{titulo}</p>}
      {!filas.length ? <p className={`${s.muted} ${s.small}`}>{vacio}</p> : (
        <div className={s.tw}>
          <table className={s.tabla}>
            <thead><tr>{cols.map((c) => <th key={c.t} className={c.num ? s.num : undefined} scope="col">{c.t}</th>)}</tr></thead>
            <tbody>{filas.map((f, j) => {
              const tot = !Array.isArray(f), cs = Array.isArray(f) ? f : f.c;
              return <tr key={j} className={tot ? s.tot : undefined}>{cs.map((v, i) => <td key={i} className={cols[i]?.num ? s.num : undefined}>{v}</td>)}</tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

export type ColLista<T> = { k: string; t: string; num?: boolean; v?: (x: T) => string | number; f: (x: T) => React.ReactNode };
/** Lista con buscador, orden por columna, «Ver más» (+10) y «Ver menos»; en el celular, tarjetas y «Ordenar por». */
export function Lista<T>({ id, nombre, ph, cols, filas, texto, tarjeta, orden, movil, n0 = 10 }: {
  id: string; nombre: string; ph: string; cols: ColLista<T>[]; filas: T[]; texto: (x: T) => string; tarjeta: (x: T) => React.ReactNode;
  orden?: { k: string; dir: 1 | -1 }; movil: boolean; n0?: number;
}) {
  const [q, setQ] = useState("");
  const [k, setK] = useState(orden?.k ?? cols[0].k);
  const [dir, setDir] = useState<1 | -1>(orden?.dir ?? 1);
  const [n, setN] = useState(n0);
  let r = filas;
  const nq = normal(q);
  if (nq) r = r.filter((x) => normal(texto(x)).includes(nq));
  const c = cols.find((x) => x.k === k && x.v) ?? cols.find((x) => x.v);
  if (c?.v) r = [...r].sort((a, b) => { const va = c.v!(a), vb = c.v!(b); return (typeof va === "string" ? va.localeCompare(String(vb), "es") : Number(va) - Number(vb)) * dir; });
  const vis = r.slice(0, n);
  const ordenar = (col: string) => { if (col === k) setDir((d) => (d === 1 ? -1 : 1)); else { setK(col); setDir(1); } };
  return (
    <>
      <div className={s.lh}>
        <label className={s.buscar}>
          <span className={s.sr}>Buscar en {nombre}</span><IcoBuscar />
          <input className={s.control} type="search" placeholder={ph} value={q} onChange={(e) => { setQ(e.target.value); setN(n0); }} maxLength={60} />
        </label>
        {movil && (
          <label className={s.ord}>
            <span className={s.sr}>Ordenar por</span>
            <select className={s.control} value={`${k}|${dir}`} onChange={(e) => { const [a, b] = e.target.value.split("|"); setK(a); setDir(Number(b) as 1 | -1); }}>
              {cols.filter((x) => x.v).flatMap((x) => [1, -1].map((d) => <option key={`${x.k}|${d}`} value={`${x.k}|${d}`}>{x.t} {d === 1 ? "↑" : "↓"}</option>))}
            </select>
          </label>
        )}
      </div>
      {!r.length ? <p className={s.vacioLista}>{filas.length ? "No hay resultados con esa búsqueda." : "Todavía no hay datos con estos filtros."}</p> : movil ? (
        <ul className={s.cards}>{vis.map((x, i) => <li key={i} className={s.card}>{tarjeta(x)}</li>)}</ul>
      ) : (
        <div className={s.tw}>
          <table className={s.tabla}>
            <thead><tr>{cols.map((cc) => {
              const so = k === cc.k ? (dir === 1 ? "ascending" : "descending") : "none";
              return (
                <th key={cc.k} className={cc.num ? s.num : undefined} aria-sort={cc.v ? so : undefined} scope="col">
                  {cc.v ? <button type="button" className={s.ob} onClick={() => ordenar(cc.k)}>{cc.t}<span aria-hidden="true">{so === "ascending" ? "▲" : so === "descending" ? "▼" : "↕"}</span></button> : cc.t}
                </th>
              );
            })}</tr></thead>
            <tbody>{vis.map((x, i) => <tr key={`${id}${i}`}>{cols.map((cc) => <td key={cc.k} className={cc.num ? s.num : undefined}>{cc.f(x)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <div className={s.lf}>
        <span className={`${s.muted} ${s.small}`} aria-live="polite">Mostrando {vis.length} de {r.length}</span>
        {r.length > n && <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => setN((x) => x + 10)}>Ver más</button>}
        {n > n0 && <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={() => setN(n0)}>Ver menos</button>}
      </div>
    </>
  );
}

/** Detalle al pasar el cursor: un solo globo para todos los elementos con `data-tip` dentro de `raiz`. */
export function useTooltip(raiz: React.RefObject<HTMLElement | null>) {
  const tip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const t = document.createElement("div");
    t.className = s.tip; t.setAttribute("role", "tooltip"); document.body.appendChild(t); tip.current = t;
    const mover = (e: MouseEvent) => {
      const r = t.getBoundingClientRect();
      let x = e.clientX + 14, y = e.clientY + 14;
      if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
      if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
      t.style.left = `${x}px`; t.style.top = `${y}px`;
    };
    const sobre = (e: MouseEvent) => {
      const d = (e.target as Element | null)?.closest?.("[data-tip]");
      if (!d) { t.style.opacity = "0"; return; }
      t.textContent = d.getAttribute("data-tip"); t.style.opacity = "1"; mover(e);
    };
    const fuera = () => { t.style.opacity = "0"; };
    el.addEventListener("mouseover", sobre); el.addEventListener("mousemove", mover); el.addEventListener("mouseleave", fuera);
    return () => { el.removeEventListener("mouseover", sobre); el.removeEventListener("mousemove", mover); el.removeEventListener("mouseleave", fuera); t.remove(); };
  }, [raiz]);
}

/** true por debajo de 900 px (mismo corte que las otras vistas nuevas). */
export function useMovil() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)"), f = () => setM(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}

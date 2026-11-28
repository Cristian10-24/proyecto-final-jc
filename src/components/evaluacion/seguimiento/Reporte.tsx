"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Reporte as Datos } from "@/lib/evaluacion/seguimientoV2";
import { ALTO, ANCHO, arcoPath, dibujar, encabezado, ESCALA, escena, FUENTE, RC, textoNoPresentados, type Elemento, type Medir } from "./escenaReporte";
import { diaLargo, N } from "./formato";
import { IcoDesc } from "./Piezas";
import { BarraDatos, horaDatos, useRefresco } from "../../postEvento";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · Reporte del día (oficial): todas las ciudades, por estudiantes y proyectos; solo cambia con su día
// («Todos los días» = acumulado). Pantalla en SVG y «Descargar imagen» en canvas con la MISMA escena (PNG 16:9 de
// 3840 × 2160), después de cargar las fuentes. En el celular: el contenido apilado y la vista previa de la imagen.

type R = Datos & { dias: string[]; hoy: string };

let ctx: CanvasRenderingContext2D | null = null;
const medirCanvas: Medir = (t, sz, w) => { ctx ??= document.createElement("canvas").getContext("2d"); ctx!.font = `${w} ${sz}px ${FUENTE}`; return ctx!.measureText(t).width; };
const fuentesListas = async () => { try { await Promise.all(["400 30px Inter", "700 30px Inter"].map((f) => document.fonts.load(f))); await document.fonts.ready; } catch { /* sin API de fuentes */ } };

function Svg({ E, cls, box }: { E: Elemento[]; cls?: string; box?: string }) {
  return (
    <svg className={cls} viewBox={box ?? `0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Reporte de evaluación en formato 16:9">
      {E.map((e, i) => {
        if (e.t === "r") return <rect key={i} x={e.x} y={e.y} width={e.w} height={e.h} rx={e.r} fill={e.fill} stroke={e.st} strokeWidth={e.st ? 2 : undefined} />;
        if (e.t === "arc") return <path key={i} d={arcoPath(e)} fill={e.fill} />;
        const base = { x: e.x, y: e.y, textAnchor: e.a, fontFamily: FUENTE, fontSize: e.s, fontWeight: e.w, fill: e.fill };
        return e.runs
          ? <text key={i} {...base} xmlSpace="preserve">{e.runs.map((r, k) => <tspan key={k} fill={r.c} fontWeight={r.w} fontSize={r.s}>{r.t}</tspan>)}</text>
          : <text key={i} {...base}>{e.txt}</text>;
      })}
    </svg>
  );
}

export default function Reporte({ repDia, onDia, movil }: { repDia: string; onDia: (x: string) => void; movil: boolean }) {
  const [r, setR] = useState<R | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [fuentes, setFuentes] = useState(false);
  const [msg, setMsg] = useState("");
  const [al, setAl] = useState<number | null>(null);
  const dia = repDia === "todos" ? "" : repDia;
  const elegir = useRef(onDia);
  useEffect(() => { elegir.current = onDia; }, [onDia]);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/evaluacion/seguimiento/reporte${dia ? `?dia=${encodeURIComponent(dia)}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      const x: R = await res.json();
      // Sin día elegido: hoy si hay presentaciones; si no, el último día anterior; si no, el acumulado.
      if (!repDia) { const d = x.dias.includes(x.hoy) ? x.hoy : x.dias.filter((y) => y <= x.hoy).at(-1); if (d) return elegir.current(d); }
      setR(x); setCarga("listo"); setAl(horaDatos(res));
    } catch { setCarga((c) => (c === "listo" ? c : "error")); }
  }, [dia, repDia]);
  useEffect(() => { void cargar(); }, [cargar]);
  useRefresco(() => void cargar(), 60_000); // modo post-evento: no arranca
  useEffect(() => { void fuentesListas().then(() => setFuentes(true)); }, []);

  // La escena se mide con canvas cuando las fuentes ya cargaron (así pantalla e imagen parten igual las líneas).
  const E = useMemo(() => (r && fuentes ? escena(r, r.hoy, medirCanvas) : null), [r, fuentes]);

  async function descargar() {
    if (!r) return;
    await fuentesListas();
    const cv = dibujar(escena(r, r.hoy, medirCanvas), document.createElement("canvas"));
    const a = document.createElement("a");
    a.download = `reporte-evaluacion-${r.dia ?? "acumulado"}.png`;
    a.href = cv.toDataURL("image/png");
    document.body.appendChild(a); a.click(); a.remove();
    setMsg(`Imagen 16:9 descargada (${cv.width} × ${cv.height} px)`);
    setTimeout(() => setMsg(""), 2600);
  }

  const ctrl = (
    <>
    <BarraDatos al={al} cargar={cargar} />
    <div className={s.rctrl}>
      {/* Inter 400 y 700: las que usa la imagen (la cabecera solo carga hasta 600). */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" precedence="default" />
      <label className={s.f}><span className={s.lbl}>Día del reporte</span>
        <select className={s.control} value={repDia || (r?.dia ?? "")} onChange={(x) => onDia(x.target.value)}>
          {[...(r?.dias ?? [])].reverse().map((d) => <option key={d} value={d}>{diaLargo(d)}{d === r?.hoy ? " (hoy, en curso)" : ""}</option>)}
          <option value="todos">Todos los días (acumulado)</option>
        </select>
      </label>
      <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={!E} onClick={() => void descargar()}><IcoDesc />Descargar imagen</button>
      <p className={`${s.muted} ${s.small}`}>Imagen 16:9 ({Math.round(ANCHO * ESCALA)} × {Math.round(ALTO * ESCALA)} px) · siempre con todas las ciudades y contando estudiantes</p>
    </div>
    </>
  );
  if (carga === "error") return <>{ctrl}<div className={s.error} role="alert"><h2>No se pudo cargar el reporte</h2><button type="button" className={s.btn} onClick={() => { setCarga("cargando"); void cargar(); }}>Reintentar</button></div></>;
  if (!r || !E) return <>{ctrl}<div className={s.skel} aria-busy="true"><i /><i /><i /><i /></div></>;

  const enCurso = r.dia === r.hoy && <p className={s.repNota}>Hoy está en curso: el reporte cambia a medida que los mentores guardan evaluaciones; los pendientes van en gris.</p>;
  const toast = msg && <div className={s.toast} role="status">{msg}</div>;
  if (!movil) return <>{ctrl}<div className={s.lienzo}><Svg E={E} cls={s.rep} /></div>{enCurso}{toast}</>;

  // Celular: el mismo contenido apilado + la vista previa de la imagen.
  const { fecha, sub } = encabezado(r, r.hoy), tt = r.e.pres + r.e.nsp, mx = Math.max(1, ...r.porCiudad.map((c) => c.proyectos));
  const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);
  const dona: Elemento[] = [...E.filter((e) => e.t === "arc"), { t: "tx", x: 1387, y: 834, s: 52, txt: tt ? `${pct(r.e.pres, tt)} %` : "—", w: 700, fill: RC.ink, a: "middle" }];
  return (
    <>
      {ctrl}
      <div className={s.rm}>
        <p className={s.kick}>Jóvenes crea<span>TI</span>vos</p>
        <h2>Reporte de evaluación</h2>
        <p className={s.rmMuted}>{fecha} · {sub}</p>
        <div className={s.rmk}>
          <div className={s.az}><b>{N(r.e.pres)}<span> / {N(r.e.tot)}</span></b><p>estudiantes evaluados ({pct(r.e.pres, r.e.tot)} %)</p><small>Evaluados = se presentaron y fueron calificados</small></div>
          <div><b>{N(r.p.pres)}<span> / {N(r.p.tot)}</span></b><p>proyectos presentados</p></div>
          <div><b>{N(r.p.exc)}</b><p>proyectos excelentes ({r.e.exc} estudiantes) y {r.p.apr} aprobados</p></div>
          <div className={s.rnar}><b>{N(r.p.des)}</b><p>proyectos destacados ({pct(r.p.des, r.p.pres)} % de los presentados)</p></div>
        </div>
        <div className={s.rmc}>
          <h3>Proyectos presentados por ciudad</h3>
          <ul>{r.porCiudad.map((c) => (
            <li key={c.ciudad}><span className={s.l}>{c.ciudad}</span>
              <span className={s.t}><i style={{ width: `${(c.presentados * 100) / mx}%`, background: RC.az }} /><i style={{ width: `${(c.noPresentados * 100) / mx}%`, background: RC.nar }} /><i style={{ width: `${(c.pendientes * 100) / mx}%`, background: RC.gr2 }} /></span>
              <span className={s.v}><b>{c.presentados} / {c.proyectos}</b> · {c.estudiantes} est.</span></li>
          ))}</ul>
          <p className={s.rl}><i style={{ background: RC.az }} />Presentados <i style={{ background: RC.nar }} />{textoNoPresentados(r)}{r.p.pend > 0 && <> <i style={{ background: RC.gr2 }} />Pendientes: {r.p.pend}</>}</p>
        </div>
        <div className={s.rmc}>
          <h3>Asistencia de estudiantes</h3>
          <div className={s.rmd}>
            <svg viewBox="1240 670 300 300" width={130} height={130} aria-hidden="true">
              {dona.map((e, i) => (e.t === "arc" ? <path key={i} d={arcoPath(e)} fill={e.fill} /> : e.t === "tx" ? <text key={i} x={e.x} y={e.y} textAnchor="middle" fontSize={e.s} fontWeight={700} fontFamily={FUENTE} fill={RC.ink}>{e.txt}</text> : null))}
            </svg>
            <div><p><i style={{ background: RC.az }} /><b>{r.e.pres} asistieron</b></p><p><i style={{ background: RC.nar }} /><b>{r.e.nsp} no asistieron</b></p>
              {r.noAsistieron.slice(0, 5).map((x) => <p key={x.ciudad} className={s.rmMuted} style={{ paddingLeft: 22 }}>{x.n} de {x.ciudad}</p>)}</div>
          </div>
        </div>
      </div>
      {enCurso}
      <h3 className={s.h3}>Así sale la imagen descargada (16:9)</h3>
      <div className={s.lienzo}><Svg E={E} cls={s.rep} /></div>
      {toast}
    </>
  );
}

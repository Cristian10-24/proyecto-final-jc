"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { SeguimientoV2 as Datos } from "@/lib/evaluacion/resultados";
import type { Modo } from "@/lib/evaluacion/seguimientoV2";
import { puede } from "@/lib/permisos";
import { useDialogo } from "../vistas/Dialogos";
import { IcoCerrar } from "../vistas/Iconos";
import ShellVistas from "../vistas/ShellVistas";
import v from "../vistas/Vistas.module.css";
import Criterios from "./Criterios";
import { consulta, diaCorto, diaLargo, diaSemana, escribirUrl, ESTADO_VACIO, haceTxt, leerUrl, N, nFiltros, otro, SECCIONES, uni, type EstadoUrl, type Seccion } from "./formato";
import Inasistencias from "./Inasistencias";
import Mentores from "./Mentores";
import { IcoBuscar, IcoCandado, IcoDesc, IcoFiltro, useMovil, useTooltip } from "./Piezas";
import Reporte from "./Reporte";
import Resultados from "./Resultados";
import Resumen from "./Resumen";
import s from "./Seguimiento.module.css";

// Seguimiento general v2 (coordinación y admin): seis sub-secciones con la sub-navegación, filtros fijos (Día, Ciudad,
// Ruta, Modalidad, Buscar) y «Contar por», todo en la URL. Solo lectura salvo «Guardar criterios» (misma ruta de hoy).
// Se refresca cada minuto. En el celular (< 900 px): barra fija con «Filtros (n)», «Contar por» y chips.

type Filtros = Pick<EstadoUrl, "dia" | "ciudad" | "ruta" | "modalidad" | "q">;
const SIN_FILTROS: Filtros = { dia: "", ciudad: "", ruta: "", modalidad: "", q: "" };

export default function SeguimientoV2({ user }: { user: SessionUser }) {
  const [e, setE] = useState<EstadoUrl>(ESTADO_VACIO);
  const [listo, setListo] = useState(false); // estado leído de la URL
  const [d, setD] = useState<Datos | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [cuando, setCuando] = useState(0);
  const [ahora, setAhora] = useState(0);
  const [qTxt, setQTxt] = useState("");
  const [hoja, setHoja] = useState(false);
  const movil = useMovil();
  const raiz = useRef<HTMLDivElement>(null);
  useTooltip(raiz);

  useEffect(() => { const x = leerUrl(window.location.search); setE(x); setQTxt(x.q); setListo(true); }, []);
  useEffect(() => { if (listo) window.history.replaceState(null, "", window.location.pathname + escribirUrl(e)); }, [e, listo]);
  // La búsqueda se aplica al dejar de escribir.
  useEffect(() => { const t = setTimeout(() => setE((x) => (x.q === qTxt ? x : { ...x, q: qTxt })), 350); return () => clearTimeout(t); }, [qTxt]);

  const q = consulta(e);
  const pedido = useRef("");
  const cargar = useCallback(async () => {
    pedido.current = q;
    try {
      const res = await fetch(`/api/evaluacion/seguimiento${q ? `?${q}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (pedido.current !== q) return; // solo vale la respuesta del último filtro
      setD(data); setCarga("listo"); setCuando(Date.now());
    } catch { setCarga((c) => (c === "listo" ? c : "error")); }
  }, [q]);
  useEffect(() => { if (listo) void cargar(); }, [cargar, listo]);
  useEffect(() => { const t = setInterval(() => void cargar(), 60_000); return () => clearInterval(t); }, [cargar]);
  useEffect(() => { setAhora(Date.now()); const t = setInterval(() => setAhora(Date.now()), 20_000); return () => clearInterval(t); }, []);

  // La barra de filtros queda fija justo debajo de la cabecera (que en web es fija).
  useEffect(() => {
    const h = document.querySelector("header"), r = raiz.current;
    if (!h || !r) return;
    const f = () => r.style.setProperty("--sg-top", `${getComputedStyle(h).position === "sticky" ? h.offsetHeight : 0}px`);
    f(); const o = new ResizeObserver(f); o.observe(h);
    return () => o.disconnect();
  }, []);

  const set = (p: Partial<EstadoUrl>) => setE((x) => ({ ...x, ...p }));
  const irSinAgendar = () => { set({ seccion: "inasistencias" }); setTimeout(() => document.getElementById("sin-agendar")?.scrollIntoView({ block: "start" }), 60); };
  const rep = e.seccion === "reporte", nf = nFiltros(e);
  const excel = new URLSearchParams({ ...(e.dia ? { dia: e.dia } : {}), ...(e.ciudad ? { ciudad: e.ciudad } : {}) }).toString();

  const opcionesDia = (
    <>
      <option value="">Todos los días</option>
      {d && d.dias.includes(d.hoy) && <option value={d.hoy}>Hoy ({diaCorto(d.hoy)})</option>}
      {(d?.dias ?? []).map((x) => <option key={x} value={x}>{diaSemana(x)}{x === d?.hoy ? " · hoy" : ""}</option>)}
    </>
  );
  const campos = (f: Filtros, cambiar: (p: Partial<Filtros>) => void, dis: boolean, buscar: string, onBuscar: (x: string) => void, pref: string) => (
    <>
      <label className={s.f}><span className={s.lbl}>Día</span><select id={`${pref}dia`} className={s.control} value={f.dia} disabled={dis} onChange={(x) => cambiar({ dia: x.target.value })}>{opcionesDia}</select></label>
      <label className={s.f}><span className={s.lbl}>Ciudad</span><select className={s.control} value={f.ciudad} disabled={dis} onChange={(x) => cambiar({ ciudad: x.target.value })}><option value="">Todas las ciudades</option>{(d?.ciudades ?? []).map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className={s.f}><span className={s.lbl}>Ruta</span><select className={s.control} value={f.ruta} disabled={dis} onChange={(x) => cambiar({ ruta: x.target.value })}><option value="">Todas las rutas</option><option value="Básica">Básica</option><option value="Avanzada">Avanzada</option></select></label>
      <label className={s.f}><span className={s.lbl}>Modalidad</span><select className={s.control} value={f.modalidad} disabled={dis} onChange={(x) => cambiar({ modalidad: x.target.value })}><option value="">Individual y en pareja</option><option value="individual">Individual</option><option value="pareja">En pareja</option></select></label>
      <label className={`${s.f} ${s.ancho}`}><span className={s.lbl}>Buscar</span><span className={s.buscar}><IcoBuscar /><input className={s.control} type="search" placeholder="Estudiante o proyecto" value={buscar} maxLength={60} disabled={dis} onChange={(x) => onBuscar(x.target.value)} /></span></label>
    </>
  );
  const segModo = (
    <div className={s.seg} role="group" aria-label="Contar por">
      {([["est", "Estudiantes"], ["proy", "Proyectos"]] as [Modo, string][]).map(([k, t]) => <button key={k} type="button" aria-pressed={e.modo === k} disabled={rep} onClick={() => set({ modo: k })}>{t}</button>)}
    </div>
  );
  const nav = (secc: readonly (readonly [Seccion, string])[]) => secc.map(([k, t]) => <button key={k} type="button" aria-current={e.seccion === k ? "page" : undefined} onClick={() => { set({ seccion: k }); window.scrollTo(0, 0); }}>{t}</button>);
  const bloqueo = rep && <p className={s.bloq}><IcoCandado /><span><b>Estos filtros no aplican al reporte del día.</b> El reporte es oficial: siempre incluye todas las ciudades y cuenta estudiantes. Solo cambia con su selector de día.</span></p>;

  let contexto: React.ReactNode = null;
  if (d && !rep && e.seccion !== "criterios") {
    const c = d[e.modo].c, o = d[otro(e.modo)].c;
    const partes = [e.dia ? (e.dia === d.hoy ? `Hoy, ${diaCorto(e.dia)}` : diaLargo(e.dia)) : "Todos los días", e.ciudad || "Todas las ciudades"];
    if (e.ruta) partes.push(`Ruta ${e.ruta.toLowerCase()}`);
    if (e.modalidad) partes.push(e.modalidad === "pareja" ? "En pareja" : "Individual");
    if (e.q.trim()) partes.push(`«${e.q.trim()}»`);
    contexto = <p className={s.ctx}><b>{N(c.tot)} {uni(e.modo, c.tot)} agendados</b> <span className={s.muted}>({N(o.tot)} {uni(otro(e.modo), o.tot)})</span> · {partes.join(" · ")}</p>;
  }

  return (
    <ShellVistas user={user} active="seguimiento">
      <div ref={raiz} className={s.sg}>
        <div className={s.hello}>
          <div>
            <h1>Seguimiento general</h1>
            <p><span className={s.vivo} aria-hidden="true" />Se actualiza cada minuto{cuando && ahora ? ` · ${haceTxt(Math.max(0, ahora - cuando))}` : ""} · Hora COL</p>
          </div>
          {puede(user, "descargar_excel") && <a className={s.btn} href={`/api/evaluacion/seguimiento/excel${excel ? `?${excel}` : ""}`}><IcoDesc />Descargar resultados (Excel)</a>}
        </div>

        {movil ? (
          <div className={s.mbar}>
            <div className={s.mrow}>
              <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={rep} onClick={() => setHoja(true)} aria-haspopup="dialog"><IcoFiltro />Filtros{nf > 0 && !rep && <span className={s.nFil} aria-label={`${nf} activos`}>{nf}</span>}</button>
              {segModo}
            </div>
            {rep && <p className={s.bloq}><IcoCandado /><span>El reporte es oficial: no aplican filtros ni «Contar por». Solo cambia con su día.</span></p>}
            <nav className={s.chips} aria-label="Secciones del seguimiento">{nav(SECCIONES)}</nav>
          </div>
        ) : (
          <div className={s.fbar}>
            <div className={s.fin}>
              {campos(e, set, rep, qTxt, setQTxt, "f-")}
              <div className={s.f}><span className={s.lbl}>&nbsp;</span><button type="button" className={s.btn} disabled={rep || !nf} onClick={() => { set(SIN_FILTROS); setQTxt(""); }}>Limpiar filtros{nf > 0 && !rep ? ` (${nf})` : ""}</button></div>
              <div className={s.f}><span className={s.lbl}>Contar por</span>{segModo}</div>
            </div>
            {bloqueo}
          </div>
        )}

        {!movil && <nav className={s.sub} aria-label="Secciones del seguimiento"><div className={s.seg}>{nav(SECCIONES)}</div></nav>}
        {contexto}

        {rep ? <Reporte repDia={e.repDia} onDia={(x) => set({ repDia: x })} movil={movil} /> : (
          <>
            {carga === "cargando" && <div className={s.skel} aria-busy="true" aria-label="Cargando el seguimiento">{[1, 2, 3, 4, 5, 6, 7].map((i) => <i key={i} />)}</div>}
            {carga === "error" && (
              <div className={s.error} role="alert"><h2>No se pudo cargar el seguimiento</h2><p className={s.muted}>Revisa tu conexión.</p><button type="button" className={s.btn} onClick={() => { setCarga("cargando"); void cargar(); }}>Reintentar</button></div>
            )}
            {carga === "listo" && d && (
              e.seccion === "resumen" ? <Resumen d={d} modo={e.modo} dia={e.dia} ciudad={e.ciudad} movil={movil} onIrSinAgendar={irSinAgendar} />
                : e.seccion === "resultados" ? <Resultados d={d} modo={e.modo} movil={movil} />
                  : e.seccion === "inasistencias" ? <Inasistencias d={d} modo={e.modo} movil={movil} />
                    : e.seccion === "mentores" ? <Mentores d={d} modo={e.modo} movil={movil} />
                      : <Criterios inicial={d.criterios} pares={d.paresAB} editable={puede(user, "editar_criterios")} onGuardado={() => void cargar()} />
            )}
          </>
        )}

        {hoja && <HojaFiltros inicial={{ dia: e.dia, ciudad: e.ciudad, ruta: e.ruta, modalidad: e.modalidad, q: qTxt }} campos={campos}
          onAplicar={(f) => { set(f); setQTxt(f.q); }} onCerrar={() => setHoja(false)} />}
      </div>
    </ShellVistas>
  );
}

/** Hoja inferior «Filtros» del celular: se aplica con «Aplicar»; «Limpiar» los quita. */
function HojaFiltros({ inicial, campos, onAplicar, onCerrar }: {
  inicial: Filtros; onAplicar: (f: Filtros) => void; onCerrar: () => void;
  campos: (f: Filtros, cambiar: (p: Partial<Filtros>) => void, dis: boolean, buscar: string, onBuscar: (x: string) => void, pref: string) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [b, setB] = useState(inicial);
  useDialogo(ref, onCerrar);
  const n = nFiltros(b);
  return (
    <>
      <div className={v.velo} onClick={onCerrar} aria-hidden="true" />
      <div ref={ref} className={v.hoja} role="dialog" aria-modal="true" aria-labelledby="sg-hoja-t">
        <div className={v.asa} aria-hidden="true" />
        <div className={v.hojaHead}><h2 id="sg-hoja-t">Filtros</h2><button type="button" className={v.ibtn} aria-label="Cerrar filtros" onClick={onCerrar}><IcoCerrar /></button></div>
        <div className={s.hojaCampos}>{campos(b, (p) => setB((x) => ({ ...x, ...p })), false, b.q, (q) => setB((x) => ({ ...x, q })), "h-")}</div>
        <div className={s.hojaAcc}>
          <button type="button" className={s.btn} onClick={() => setB(SIN_FILTROS)}>Limpiar</button>
          <button type="button" className={`${s.btn} ${s.btnPri}`} onClick={() => { onAplicar(b); onCerrar(); }}>Aplicar{n ? ` (${n})` : ""}</button>
        </div>
      </div>
    </>
  );
}

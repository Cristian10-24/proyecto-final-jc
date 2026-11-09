"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { diaCOL } from "@/lib/edicion";
import type { Resultado } from "@/lib/evaluacion/criterios";
import type { Seguimiento } from "@/lib/evaluacion/resultados";
import type { FilaGrupo } from "@/lib/evaluacion/tablero";
import { puede } from "@/lib/permisos";
import EvalShell from "./EvalShell";
import s from "./Evaluacion.module.css";
import { claseResultado, fechaLarga, pct, uno } from "./comun";

// Seguimiento general (Paso 15), igual al tablero del prototipo: KPIs, resultados, Parte A y B, tablas por ruta,
// ciudad, modalidad, cupos, inasistencias, destacados, excelentes, día y mentor; filtros por día y ciudad, Excel de
// resultados (solo exportar) y criterios editables. Se refresca cada minuto mientras los mentores evalúan.

const COLOR: Record<Resultado, string> = {
  Excelente: "var(--ev-ok)", Aprobado: "var(--ev-info)", Incompleto: "var(--ev-parcial)", "No se presentó": "var(--ev-muted)", Pendiente: "var(--ev-idle-bg)",
};
const hoyCOL = () => diaCOL(new Date());
const diaTxt = (d: string | null) => (d ? `${d === hoyCOL() ? "Hoy, " : ""}${fechaLarga(d)}` : "Sin fecha");

export default function SeguimientoGeneral({ user }: { user: SessionUser }) {
  const [d, setD] = useState<Seguimiento | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [dia, setDia] = useState("");
  const [ciudad, setCiudad] = useState("");
  const filtro = new URLSearchParams({ ...(dia ? { dia } : {}), ...(ciudad ? { ciudad } : {}) }).toString();

  // Respuestas desordenadas: solo vale la del último filtro pedido.
  const pedido = useRef("");
  const cargar = useCallback(async () => {
    pedido.current = filtro;
    try {
      const res = await fetch(`/api/evaluacion/seguimiento${filtro ? `?${filtro}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (pedido.current !== filtro) return;
      setD(data);
      setCarga("listo");
    } catch {
      setCarga((c) => (c === "listo" ? c : "error"));
    }
  }, [filtro]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { const t = setInterval(() => void cargar(), 60_000); return () => clearInterval(t); }, [cargar]);

  const k = d?.kpis;
  return (
    <EvalShell user={user} active="seguimiento">
      <div className={s.hello}>
        <div><h1>Seguimiento general</h1><p>Se actualiza cada minuto mientras los mentores evalúan.</p></div>
        {puede(user, "descargar_excel") && (
          <a className="ev-btn ev-btn-navy" href={`/api/evaluacion/seguimiento/excel${filtro ? `?${filtro}` : ""}`}>Descargar resultados (Excel)</a>
        )}
      </div>

      <div className={s.filtros}>
        <select className="ev-campo" aria-label="Filtrar por día" value={dia} onChange={(e) => setDia(e.target.value)}>
          <option value="">Todos los días</option>
          {(d?.dias ?? []).map((x) => <option key={x} value={x}>{diaTxt(x)}</option>)}
        </select>
        <select className="ev-campo" aria-label="Filtrar por ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
          <option value="">Todas las ciudades</option>
          {(d?.ciudades ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>

      {carga === "cargando" && <div className={s.skel}>{[1, 2, 3, 4].map((i) => <i key={i} />)}</div>}
      {carga === "error" && (
        <div className={`${s.lista} ${s.vacio}`}><h2>No se pudo cargar el seguimiento</h2><p>Revisa tu conexión.</p><button type="button" className="ev-btn" onClick={() => { setCarga("cargando"); void cargar(); }}>Reintentar</button></div>
      )}
      {carga === "listo" && d && k && (
        <>
          <div className={s.kpis}>
            <Kpi v={`${k.evaluados} / ${k.estudiantes}`} t="estudiantes evaluados" hl />
            <Kpi v={String(k.proyectos)} t="proyectos registrados" />
            <Kpi v={k.avance === null ? "—" : pct(k.avance)} t="de avance" />
            <Kpi v={k.pctExcelentes === null ? "—" : pct(k.pctExcelentes)} t="de los que se presentaron fueron excelentes" />
            <Kpi v={String(k.excelentes)} t="resultados excelentes" />
            <Kpi v={String(k.noSePresentaron)} t="no se presentaron" />
            <Kpi v={String(k.destacados)} t="proyectos destacados" />
          </div>

          <div className={s.grid2}>
            <section className="ev-tarjeta">
              <h3 className={s.cardT}>Resultados</h3>
              <div className={s.stack} role="img" aria-label={d.resultados.map((r) => `${r.res}: ${r.n}`).join(", ")}>
                {d.resultados.filter((r) => r.n).map((r) => <i key={r.res} style={{ flexGrow: r.n, background: COLOR[r.res] }} title={`${r.res}: ${r.n}`} />)}
              </div>
              <div className={s.leyenda}>{d.resultados.map((r) => <span key={r.res}><i style={{ background: COLOR[r.res] }} />{r.res} <b>{r.n}</b></span>)}</div>
            </section>
            <section className="ev-tarjeta">
              <h3 className={s.cardT}>¿Qué funcionó en la demo?</h3>
              {d.parteA.map((x) => <Barra key={x.k} t={x.titulo} frac={x.si} v={x.si === null ? "—" : pct(x.si)} bajo={x.si !== null && x.si < 0.6} />)}
            </section>
          </div>

          <div className={s.grid2}>
            <section className="ev-tarjeta">
              <h3 className={s.cardT}>Nivel de conocimiento por tema</h3>
              <p className={s.cardSub}>Promedio de 0 a 4. Meta: 2 o más.</p>
              {d.parteB.map((x) => <Barra key={x.k} t={`${x.titulo} (${x.n})`} frac={x.promedio === null ? null : x.promedio / 4} v={uno(x.promedio)} bajo={x.promedio !== null && x.promedio < 2} />)}
            </section>
            <section className="ev-tarjeta"><h3 className={s.cardT}>Por ruta</h3><Grupos etiqueta="Ruta" filas={d.porRuta} /></section>
          </div>

          <section className={`ev-tarjeta ${s.bloque}`}><h3 className={s.cardT}>Por ciudad</h3><Grupos etiqueta="Ciudad" filas={d.porCiudad} /></section>
          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Individual o en pareja</h3>
            <Grupos etiqueta="Modalidad" filas={d.porModalidad} />
            <p className={s.nota}>{(() => {
              const p = d.parejas, tot = p.ambos + p.uno + p.ninguno;
              if (!tot) return "Todavía no hay parejas con los dos integrantes evaluados.";
              return <>De <b>{tot}</b> parejas evaluadas: en <b>{p.ambos}</b> los dos fueron excelentes, en <b>{p.uno}</b> solo uno y en <b>{p.ninguno}</b> ninguno.{p.uno ? " Cuando solo uno es excelente, vale la pena revisar si ambos dominan el código." : ""}</>;
            })()}</p>
          </section>

          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Cupos para reprogramar</h3>
            <p className={s.nota}>{d.cupos.ofrecidos ? `${d.cupos.ofrecidos} cupos desde ahora: ${d.cupos.ocupados} ocupados y ${d.cupos.libres} libres para reprogramar.` : "No quedan cupos desde ahora."}</p>
            <div className={s.grid2Interno}>
              <Tabla head={["Día", "Ocupados", "Libres"]} num={[1, 2]} vacio="Sin cupos." filas={d.cupos.porDia.map((x) => [diaTxt(x.dia), x.ocupados, x.libres])} />
              <Tabla head={["Mentor", "Cupos libres"]} num={[1]} vacio="Sin cupos libres." filas={d.cupos.porMentor.map((x) => [x.mentor, x.libres])} />
            </div>
          </section>

          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Inasistencias y monitoreo</h3>
            <p className={s.nota}>{d.inasistencias.total ? `${d.inasistencias.total} estudiantes no se presentaron: ${d.inasistencias.conMotivo} con motivo registrado por su monitor y ${d.inasistencias.total - d.inasistencias.conMotivo} sin motivo todavía.` : "Todavía no hay inasistencias registradas."}</p>
            <div className={s.grid2Interno}>
              <Tabla head={["Motivo de inasistencia (incluye reprogramados)", "Estudiantes"]} num={[1]} vacio="Sin motivos registrados todavía." filas={d.inasistencias.motivos.map((x) => [x.motivo, x.n])} />
              <Tabla head={["Monitor", "Estudiantes", "No se presentaron", "Con motivo", "Sin motivo"]} num={[1, 2, 3, 4]} filas={d.inasistencias.porMonitor.map((x) => [x.monitor, x.estudiantes, x.noSePresentaron, x.conMotivo, x.sinMotivo])} />
            </div>
          </section>

          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Sin proyecto y no se presentaron</h3>
            <p className={s.cardSub}>«Sin proyecto»: participantes que aún no tienen proyecto y proyectos marcados así (no cuentan en las demás tablas). «No se presentaron»: eligieron hora y quedaron con «No se presentó», o su monitor marcó que no asistieron y aún no hay evaluación guardada.</p>
            <div className={s.grid2Interno}>
              <Tabla head={["Ciudad", "Participantes", "Proyectos marcados", "Estudiantes"]} num={[1, 2, 3]} vacio="Nadie está sin proyecto."
                filas={d.sinProyecto.map((x) => [x.ciudad, x.participantes, x.proyectos, x.estudiantes])} />
              <Tabla head={["Ciudad", "Eligieron hora y no se presentaron"]} num={[1]} vacio="Todavía no hay inasistencias."
                filas={d.noSePresentaronCiudad.map((x) => [x.ciudad, x.estudiantes])} />
            </div>
          </section>

          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Proyectos destacados</h3>
            <Tabla head={["Estudiante", "Emprendimiento", "Mentor", "Resultado", "Lo que hizo muy bien"]} vacio="Todavía no hay proyectos nominados."
              filas={d.destacados.map((x) => [x.nombre, x.proyecto, x.mentor, <span key="r" className={claseResultado(x.res)}>{x.res}</span>, x.fortaleza])} />
          </section>
          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Resultados excelentes</h3>
            <Tabla head={["Estudiante", "Emprendimiento", "Mentor", "Funciona", "Nivel"]} num={[3, 4]} vacio="Todavía no hay resultados excelentes."
              filas={d.excelentes.map((x) => [x.nombre, x.proyecto, x.mentor, x.a === null ? "—" : pct(x.a), uno(x.b)])} />
          </section>
          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Avance por día</h3>
            <Tabla head={["Fecha", "Programados", "Evaluados", "No se presentaron", "Avance"]} num={[1, 2, 3, 4]}
              filas={d.porDia.map((x) => [diaTxt(x.dia), x.programados, x.evaluados, x.noSePresentaron, x.avance === null ? "—" : pct(x.avance)])} />
          </section>
          <section className={`ev-tarjeta ${s.bloque}`}>
            <h3 className={s.cardT}>Avance por mentor</h3>
            <p className={s.cardSub}>Si un mentor tiene promedios muy distintos al resto, vale la pena revisar cómo está calificando.</p>
            <Tabla head={["Mentor", "Asignados", "Evaluados", "Avance", "Funciona prom.", "Nivel prom."]} num={[1, 2, 3, 4, 5]}
              filas={d.porMentor.map((x) => [x.mentor, x.asignados, x.evaluados, x.avance === null ? "—" : pct(x.avance), x.funciona === null ? "—" : pct(x.funciona), uno(x.nivel)])} />
          </section>

          <CriteriosCard inicial={d.criterios} editable={puede(user, "editar_criterios")} onGuardado={() => void cargar()} />
        </>
      )}
    </EvalShell>
  );
}

function Kpi({ v, t, hl }: { v: string; t: string; hl?: boolean }) {
  return <div className={`${s.kpi} ${hl ? s.kpiHl : ""}`}><b>{v}</b><span>{t}</span></div>;
}

function Barra({ t, frac, v, bajo }: { t: string; frac: number | null; v: string; bajo: boolean }) {
  return (
    <div className={s.barra}>
      <span>{t}</span>
      <span className={s.pista_}><span className={`${s.relleno} ${bajo ? s.rellenoBajo : ""}`} style={{ transform: `scaleX(${frac ?? 0})` }} /></span>
      <span className={s.barraV}>{v}</span>
    </div>
  );
}

function Tabla({ head, filas, num = [], vacio = "Sin datos todavía." }: { head: string[]; filas: React.ReactNode[][]; num?: number[]; vacio?: string }) {
  if (!filas.length) return <p className={s.cardSub}>{vacio}</p>;
  return (
    <div className={s.tablaWrap}>
      <table className={s.tabla}>
        <thead><tr>{head.map((h, i) => <th key={h} className={num.includes(i) ? s.num : undefined}>{h}</th>)}</tr></thead>
        <tbody>{filas.map((f, j) => <tr key={j}>{f.map((c, i) => <td key={i} className={num.includes(i) ? s.num : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Grupos({ etiqueta, filas }: { etiqueta: string; filas: FilaGrupo[] }) {
  return <Tabla head={[etiqueta, "Estudiantes", "Evaluados", "No se presentaron", "% excelentes", "Nivel prom."]} num={[1, 2, 3, 4, 5]}
    filas={filas.map((x) => [x.grupo, x.estudiantes, x.evaluados, x.noSePresentaron, x.excelentes === null ? "—" : pct(x.excelentes), uno(x.nivel)])} />;
}

function CriteriosCard({ inicial, editable, onGuardado }: { inicial: { exA: number; exB: number }; editable: boolean; onGuardado: () => void }) {
  const [a, setA] = useState(String(Math.round(inicial.exA * 100)));
  const [b, setB] = useState(String(inicial.exB));
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function guardar() {
    const exA = Number(a) / 100, exB = Number(b);
    if (!(exA >= 0 && exA <= 1 && exB >= 0 && exB <= 4)) return setMsg("Revisa los valores: Parte A entre 0 y 100, Parte B entre 0 y 4.");
    setOcupado(true); setMsg("");
    const res = await fetch("/api/evaluacion/criterios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exA, exB }) }).catch(() => null);
    setOcupado(false);
    if (res?.status === 401) return window.location.assign("/login");
    setMsg(res?.ok ? "Criterios guardados. Los resultados se recalculan con estos mínimos." : "No se pudo guardar. Inténtalo otra vez.");
    if (res?.ok) onGuardado();
  }
  return (
    <section className={`ev-tarjeta ${s.bloque}`} aria-labelledby="crit-t">
      <h3 id="crit-t" className={s.cardT}>Criterios de resultado</h3>
      <p className={s.cardSub}>Todo estudiante que presenta su proyecto queda <b>Aprobado</b>. Queda <b>Excelente</b> si alcanza estos dos mínimos: el % de la Parte A (¿funciona?) y el nivel promedio de la Parte B (¿lo entiende?).</p>
      <div className={s.dosCampos}>
        <div className={s.campo}><label htmlFor="exA">Excelente · Parte A mínima (%)</label><input id="exA" className="ev-campo" type="number" min={0} max={100} step={5} value={a} disabled={!editable} onChange={(e) => setA(e.target.value)} /></div>
        <div className={s.campo}><label htmlFor="exB">Excelente · Parte B mínima (0–4)</label><input id="exB" className="ev-campo" type="number" min={0} max={4} step={0.5} value={b} disabled={!editable} onChange={(e) => setB(e.target.value)} /></div>
      </div>
      {editable && <button type="button" className="ev-btn ev-btn-navy" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar criterios"}</button>}
      {msg && <p className={s.nota} role="status">{msg}</p>}
    </section>
  );
}

"use client";

import type { SeguimientoV2 } from "@/lib/evaluacion/resultados";
import type { Modo, VistaModo } from "@/lib/evaluacion/seguimientoV2";
import { Dispersion, Mini } from "./Graficos";
import { N, nf, P, pc, uni } from "./formato";
import { IcoAlerta, Lista, Tabla, Tarjeta } from "./Piezas";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · Mentores y monitores: dispersión de mentores (Funciona vs Nivel, tamaño = evaluados, medianas) con
// el aviso de hoy y ⚠ al atípico (criterio en DECISIONES), y las listas «Avance por mentor» y «Avance por monitor».

type FM = VistaModo["porMentor"][number];
type FMo = VistaModo["porMonitor"][number];

export default function Mentores({ d, modo, movil }: { d: SeguimientoV2; modo: Modo; movil: boolean }) {
  const v = d[modo], at = v.atipicos, raros = at.lista.filter((x) => x.atipico);
  const out: React.ReactNode[] = [];
  const aviso = (
    <p className={`${s.aviso} ${s.avisoWarn}`} style={{ marginBottom: 12 }}>
      <IcoAlerta /><span>Si un mentor tiene promedios muy distintos al resto, vale la pena revisar cómo está calificando.{raros.length > 0 && <> <b>{raros.map((r) => `${r.mentor} (${pc(r.funciona)} % · ${nf(r.nivel)})`).join(", ")}</b>.</>}</span>
    </p>
  );
  if (at.medFunciona !== null && at.medNivel !== null) {
    const lista = (
      <ol className={s.ol}>{at.lista.map((x) => (
        <li key={x.mentor} className={x.atipico ? s.raro : undefined}>
          <span><b>{x.atipico ? "⚠ " : ""}{x.mentor}</b><small>{x.evaluados} evaluados</small></span>
          <span className={s.num}>{pc(x.funciona)} % · {nf(x.nivel)}</span>
        </li>
      ))}</ol>
    );
    out.push(<Tarjeta key="men" id="men" cls={s.span2} ley={aviso}
      titulo={raros.length ? `${raros[0].mentor} califica muy distinto al resto` : "Los mentores califican de forma parecida"}
      sub="Cada punto es un mentor · tamaño = evaluados · líneas = medianas · solo mentores con 3 o más evaluados"
      grafico={movil ? <><p className={`${s.small} ${s.muted}`} style={{ marginBottom: 8 }}>Ordenados de más distinto a más parecido a la mediana ({pc(at.medFunciona)} % · {nf(at.medNivel)})</p>{lista}</>
        : <Dispersion ms={at.lista.map((x) => ({ l: x.mentor, funciona: x.funciona * 100, nivel: x.nivel, ev: x.evaluados, raro: x.atipico }))} medX={at.medFunciona * 100} medY={at.medNivel} />}
      tabla={<Tabla cols={[{ t: "Mentor" }, { t: "Evaluados", num: true }, { t: "Funciona prom.", num: true }, { t: "Nivel prom.", num: true }, { t: "¿Distinto?" }]} filas={at.lista.map((x) => [x.mentor, x.evaluados, `${pc(x.funciona)} %`, nf(x.nivel), x.atipico ? "⚠ Revisar" : "—"])} />} />);
  } else out.push(<div key="men" className={`${s.c} ${s.span2}`}>{aviso}<p className={`${s.muted} ${s.small}`}>Para comparar cómo califican hacen falta al menos 3 mentores con 3 o más evaluados.</p></div>);

  out.push(
    <section key="am" className={`${s.c} ${s.spanAll}`} aria-labelledby="t-am">
      <div className={s.ch}><div><h3 id="t-am">Avance por mentor</h3><p className={`${s.muted} ${s.small}`}>{uni(modo, 2, true)} asignados y evaluados · los {N(d.sinAgendar.estudiantes)} sin agendar (mentor «Sin asignar») no cuentan</p></div></div>
      <Lista<FM> id="am" nombre="mentores" ph="Buscar mentor" movil={movil} filas={v.porMentor} orden={{ k: "av", dir: 1 }} n0={16} texto={(x) => x.mentor}
        cols={[
          { k: "n", t: "Mentor", v: (x) => x.mentor, f: (x) => <><b>{x.mentor}</b>{x.atipico && <> <span className={`${s.chip} ${s.cSig}`}>⚠ Revisar</span></>}</> },
          { k: "a", t: "Asignados", num: true, v: (x) => x.c.tot, f: (x) => N(x.c.tot) },
          { k: "e", t: "Evaluados", num: true, v: (x) => x.c.ev, f: (x) => N(x.c.ev) },
          { k: "av", t: "Avance", v: (x) => x.c.avance ?? 0, f: (x) => <Mini v={pc(x.c.avance)} max={100} txt={P(x.c.avance)} /> },
          { k: "f", t: "Funciona prom.", num: true, v: (x) => x.c.funciona ?? -1, f: (x) => P(x.c.funciona) },
          { k: "nv", t: "Nivel prom.", num: true, v: (x) => x.c.nivel ?? -1, f: (x) => nf(x.c.nivel) },
        ]}
        tarjeta={(x) => <><div className={s.ct}><b>{x.atipico ? "⚠ " : ""}{x.mentor}</b><span className={s.num}>{x.c.ev} / {x.c.tot}</span></div><div><Mini v={pc(x.c.avance)} max={100} txt={P(x.c.avance)} /></div><p className={`${s.small} ${s.muted}`}>Funciona {P(x.c.funciona)} · Nivel {nf(x.c.nivel)}</p></>} />
    </section>,
    <section key="amo" className={`${s.c} ${s.spanAll}`} aria-labelledby="t-amo">
      <div className={s.ch}><div><h3 id="t-amo">Avance por monitor</h3><p className={`${s.muted} ${s.small}`}>Seguimiento de los {uni(modo, 2)} que cada monitor tiene a cargo</p></div></div>
      <Lista<FMo> id="amo" nombre="monitores" ph="Buscar monitor o ciudad" movil={movil} filas={v.porMonitor} orden={{ k: "sm", dir: -1 }} n0={15} texto={(x) => `${x.monitor} ${x.ciudad}`}
        cols={[
          { k: "n", t: "Monitor", v: (x) => x.monitor, f: (x) => <b>{x.monitor}</b> },
          { k: "c", t: "Ciudad", v: (x) => x.ciudad, f: (x) => x.ciudad },
          { k: "a", t: "A cargo", num: true, v: (x) => x.c.tot, f: (x) => N(x.c.tot) },
          { k: "av", t: "Avance", v: (x) => x.c.avance ?? 0, f: (x) => <Mini v={pc(x.c.avance)} max={100} txt={P(x.c.avance)} /> },
          { k: "ns", t: "No se presentaron", num: true, v: (x) => x.c.nsp, f: (x) => N(x.c.nsp) },
          { k: "sm", t: "Sin motivo", num: true, v: (x) => x.sinMotivo, f: (x) => (x.sinMotivo ? <span className={`${s.chip} ${s.cSig}`}>{x.sinMotivo}</span> : "0") },
        ]}
        tarjeta={(x) => <><div className={s.ct}><b>{x.monitor}</b><span className={`${s.chip} ${s.cLine}`}>{x.ciudad}</span></div><div><Mini v={pc(x.c.avance)} max={100} txt={P(x.c.avance)} /></div><p className={`${s.small} ${s.muted}`}>{x.c.tot} a cargo · {x.c.nsp} no se presentaron · {x.sinMotivo} sin motivo</p></>} />
    </section>,
  );
  return <div className={s.grid}>{out}</div>;
}

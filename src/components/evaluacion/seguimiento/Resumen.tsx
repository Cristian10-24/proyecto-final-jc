"use client";

import type { SeguimientoV2 } from "@/lib/evaluacion/resultados";
import type { Cuenta, Modo } from "@/lib/evaluacion/seguimientoV2";
import { Combo, LeyendaRes, Medidor, RES, Spark, Waffle, type DiaCombo } from "./Graficos";
import { delta, diaCorto, diaLargo, N, otro, P, pc, uni } from "./formato";
import { IcoInfo, Tabla, Tarjeta } from "./Piezas";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · Resumen: 7 tarjetas con mini tendencia y cambio frente al día anterior, Resultados (waffle),
// Cupos para reprogramar (medidor) y Avance por día (combinado). Solo agendados; aviso de «Sin agendar» al final.

type Kpi = { k: string; cls?: string; big: string; de?: string; lbl: string; nota?: string; sec: string; sv: (c: Cuenta, totAll: number) => number; pct?: boolean; alerta?: boolean };

export default function Resumen({ d, modo, dia, ciudad, movil, onIrSinAgendar }: { d: SeguimientoV2; modo: Modo; dia: string; ciudad: string; movil: boolean; onIrSinAgendar: () => void }) {
  const v = d[modo], vo = d[otro(modo)], c = v.c, o = vo.c, om = otro(modo);
  const dias = v.dias.map((x) => x.dia), totAll = v.dias.at(-1)?.acum.tot ?? 0;
  const sel = dia ? dias.indexOf(dia) : null;
  const defs: Kpi[] = [
    { k: "ev", cls: s.azul, big: N(c.ev), de: ` / ${N(c.tot)}`, lbl: modo === "est" ? "estudiantes evaluados" : "proyectos evaluados", nota: "incluye a quienes no se presentaron", sec: `${N(o.ev)} / ${N(o.tot)} ${uni(om, 2)}`, sv: (x) => x.ev },
    { k: "tot", big: N(c.tot), lbl: modo === "est" ? "Estudiantes agendados" : "Proyectos agendados", sec: `${N(o.tot)} ${uni(om, o.tot)}`, sv: (x) => x.tot },
    { k: "av", big: String(pc(c.avance)), de: " %", lbl: "de avance", sec: `${P(o.avance)} contando ${uni(om, 2)}`, sv: (x, t) => (t ? Math.round((x.ev * 100) / t) : 0), pct: true },
    { k: "pe", big: c.pctExc === null ? "—" : String(pc(c.pctExc)), de: c.pctExc === null ? "" : " %", lbl: "de los que se presentaron fueron excelentes", sec: `${P(o.pctExc)} contando ${uni(om, 2)}`, sv: (x) => pc(x.pctExc), pct: true },
    { k: "exc", big: N(c.exc), lbl: "resultados excelentes", sec: `${N(o.exc)} ${uni(om, o.exc)}`, sv: (x) => x.exc },
    { k: "nsp", big: N(c.nsp), lbl: "no se presentaron", sec: `${N(o.nsp)} ${uni(om, o.nsp)}`, sv: (x) => x.nsp, alerta: true },
    { k: "des", cls: s.nar, big: N(c.des), lbl: modo === "est" ? "estudiantes destacados" : "proyectos destacados", sec: `${N(o.des)} ${uni(om, o.des)}`, sv: (x) => x.des },
  ];
  const rango = dias.length ? `${diaCorto(dias[0])} al ${diaCorto(dias[dias.length - 1])}` : "";
  const kpis = defs.map((k) => {
    const vals = v.dias.map((f) => k.sv(f.acum, totAll));
    const dl = dia ? (dia === d.hoy ? "Hoy, en curso" : `Solo ${diaCorto(dia)}`) : delta(vals, dias, d.hoy, k.pct);
    return (
      <article key={k.k} className={`${s.kpi} ${k.cls ?? ""}`} data-tip={`${k.lbl}: ${k.big}${k.de ?? ""}\nTambién: ${k.sec}${rango ? `\nLa línea muestra el acumulado por día (${rango})` : ""}`}>
        <p className={s.kn}><b>{k.big}</b>{k.de && <span>{k.de}</span>}{k.alerta && c.nsp > 0 && <em className={s.al} aria-label="atención">!</em>}</p>
        <p className={s.kl}>{k.lbl}</p>
        {k.nota && <p className={s.knota}>{k.nota}</p>}
        <p className={s.ks}>{k.sec}</p>
        <div className={s.kf}><Spark vals={vals} sel={sel !== null && sel >= 0 ? sel : null} />{dl && <span className={s.delta}>{dl}</span>}</div>
      </article>
    );
  });

  const uniTxt = (n: number) => uni(modo, n);
  const waffle = (
    <Tarjeta id="res" titulo={c.pctExc === null ? "Todavía nadie se ha presentado con estos filtros" : `El ${pc(c.pctExc)} % de los que se presentaron fue excelente`}
      sub={`Cada cuadro = 1 % de ${N(c.tot)} ${uni(modo, c.tot)} agendados · ${N(c.pend)} pendientes por evaluar`}
      grafico={<div className={s.wf}><Waffle c={c} uniTxt={uniTxt} /><LeyendaRes c={c} /></div>}
      tabla={<Tabla cols={[{ t: "Resultado" }, { t: "Cantidad", num: true }, { t: "%", num: true }]}
        filas={[...RES.map((r) => [r.n, N(c[r.k]), P(c.tot ? c[r.k] / c.tot : null)]), { tot: true as const, c: ["Total agendados", N(c.tot), "100 %"] }]} />} />
  );

  // Cupos para reprogramar: hoy por hora en el medidor; en la tabla, además, los de hoy desde ahora por día y por mentor.
  const ch = d.cuposHoy, tot = ch.ocupados + ch.libres;
  const cupos = (
    <Tarjeta id="cup" titulo={tot ? `Quedan ${ch.libres} cupos libres hoy para reprogramar` : "Hoy ya no quedan cupos para reprogramar"}
      sub={`Desde ahora (${ch.desde})${ch.porHora.length ? ` hasta las ${ch.porHora[ch.porHora.length - 1].hora}` : ""} · ${ciudad || "todas las ciudades"} · Hora COL`}
      grafico={tot ? (
        <div className={s.gw}><Medidor ocupados={ch.ocupados} total={tot} />
          <ul className={`${s.ley} ${s.fila}`}><li><i style={{ background: "var(--c-az)" }} /><span>Ocupados</span><b>{ch.ocupados}</b></li><li><i style={{ background: "var(--c-gr2)" }} /><span>Libres</span><b>{ch.libres}</b></li></ul></div>
      ) : <p className={`${s.muted} ${s.small}`}>No hay cupos de hoy desde ahora.</p>}
      tabla={<>
        <Tabla titulo="Hoy, por hora" cols={[{ t: "Hora (COL)" }, { t: "Ocupados", num: true }, { t: "Libres", num: true }]} filas={ch.porHora.map((x) => [x.hora, x.ocupados, x.libres])} vacio="Sin cupos hoy desde ahora." />
        <Tabla titulo="Desde ahora, por día" cols={[{ t: "Día" }, { t: "Ocupados", num: true }, { t: "Libres", num: true }]} filas={d.cupos.porDia.map((x) => [`${x.dia === d.hoy ? "Hoy, " : ""}${diaLargo(x.dia)}`, x.ocupados, x.libres])} vacio="Sin cupos." />
        <Tabla titulo="Cupos libres por mentor" cols={[{ t: "Mentor" }, { t: "Cupos libres", num: true }]} filas={d.cupos.porMentor.map((x) => [x.mentor, x.libres])} vacio="Sin cupos libres." />
      </>}
      pie={<p className={s.nota}>{d.cupos.ofrecidos ? `${d.cupos.ofrecidos} cupos desde ahora: ${d.cupos.ocupados} ocupados y ${d.cupos.libres} libres para reprogramar.` : "No quedan cupos desde ahora."}</p>} />
  );

  // Avance por día (con los filtros salvo el día; el día elegido queda resaltado).
  const filas: DiaCombo[] = v.dias.map((f) => ({
    dia: f.dia, etiqueta: diaCorto(f.dia), largo: diaLargo(f.dia), hoy: f.dia === d.hoy, tot: f.d.tot, ev: f.d.pres, nsp: f.d.nsp, asis: f.d.pres + f.d.nsp ? f.d.asis : null,
    acum: totAll ? Math.round((f.acum.ev * 100) / totAll) : 0,
  }));
  const fh = v.dias.find((f) => f.dia === d.hoy) ?? v.dias.filter((f) => f.dia <= d.hoy).at(-1);
  const acumTot = filas.at(-1)?.acum ?? 0;
  const tituloDia = fh ? `Avance acumulado: ${acumTot} %. ${fh.dia === d.hoy ? "Hoy van" : `El ${diaCorto(fh.dia)} fueron`} ${N(fh.d.ev)} de ${N(fh.d.tot)} ${uni(modo, fh.d.tot)}` : `Avance acumulado: ${acumTot} %`;
  const combo = (
    <Tarjeta id="dia" cls={s.span2} titulo={tituloDia} sub="Programados y evaluados por día, asistencia diaria y curva acumulada"
      ley={<ul className={`${s.ley} ${s.fila}`}><li><i style={{ background: "var(--c-gr2)" }} /><span>Programados</span></li><li><i style={{ background: "var(--c-az)" }} /><span>Evaluados</span></li><li><i className={s.ln} style={{ background: "var(--c-nar)" }} /><span>% asistencia</span></li><li><i className={s.dash} /><span>Avance acumulado</span></li></ul>}
      grafico={<Combo filas={filas} sel={dia || null} movil={movil} />}
      tabla={<Tabla cols={[{ t: "Fecha" }, { t: "Programados", num: true }, { t: "Evaluados", num: true }, { t: "No se presentaron", num: true }, { t: "Avance", num: true }, { t: "Asistencia", num: true }, { t: "Acumulado", num: true }]}
        filas={v.dias.map((f, i) => [<>{diaLargo(f.dia)}{f.dia === d.hoy && <> <span className={`${s.chip} ${s.cSig}`}>Hoy</span></>}</>, N(f.d.tot), N(f.d.pres), N(f.d.nsp), P(f.d.avance), P(f.d.asis), `${filas[i].acum} %`])} />}
      pie={<p className={s.nota}>En las columnas, Evaluados = se presentaron y fueron calificados; el avance incluye a quienes no se presentaron. Los {N(d.sinAgendar.estudiantes)} estudiantes sin fecha no cuentan aquí. Están en <button type="button" className={s.btnLink} onClick={onIrSinAgendar}>Sin agendar</button>.</p>} />
  );

  const sa = d.sinAgendar;
  return (
    <>
      <div className={s.kpis}>{kpis}</div>
      <div className={s.grid}>{waffle}{cupos}{combo}</div>
      {sa.estudiantes > 0 && (
        <div className={`${s.aviso} ${s.avsa}`}>
          <IcoInfo /><span><b>{N(sa.estudiantes)} {sa.estudiantes === 1 ? "estudiante" : "estudiantes"} ({N(sa.proyectos.length)} {sa.proyectos.length === 1 ? "proyecto" : "proyectos"}) aún no {sa.estudiantes === 1 ? "tiene" : "tienen"} día ni hora.</b> No cuentan en las estadísticas.</span>
          <button type="button" className={`${s.btn} ${s.btnSm}`} onClick={onIrSinAgendar}>Ver sin agendar</button>
        </div>
      )}
    </>
  );
}

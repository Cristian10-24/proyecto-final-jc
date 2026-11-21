"use client";

import type { SeguimientoV2 } from "@/lib/evaluacion/resultados";
import type { ItemLista, Modo, SinAgendar } from "@/lib/evaluacion/seguimientoV2";
import { horaMin } from "@/lib/evaluacion/seguimientoV2";
import { SIN_MONITOR } from "@/lib/evaluacion/tablero";
import { BarrasH } from "./Graficos";
import { diaCorto, N, uni } from "./formato";
import { IcoAlerta, IcoFlecha, IcoNo, Lista, Tabla, Tarjeta } from "./Piezas";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · Inasistencias: aviso, motivos, por ciudad, por monitor (con/sin motivo), lista y el bloque
// «Sin agendar» (no cuenta en las estadísticas: sin día ni hora + «Sin proyecto» por ciudad).

export default function Inasistencias({ d, modo, movil }: { d: SeguimientoV2; modo: Modo; movil: boolean }) {
  const v = d[modo], c = v.c, sin = c.nsp - c.conMotivo, out: React.ReactNode[] = [];
  out.push(
    <p key="av" className={`${s.aviso} ${s.spanAll}`} role="status">
      <IcoAlerta />
      <span>{c.nsp ? <><b>{N(c.nsp)} {uni(modo, c.nsp)} no se {c.nsp === 1 ? "presentó" : "presentaron"}:</b> {N(c.conMotivo)} con motivo registrado por su monitor y {N(sin)} sin motivo todavía. Eligieron hora, así que sí cuentan en las estadísticas.</> : "Todavía no hay inasistencias registradas con estos filtros."}</span>
    </p>,
  );

  // Motivos (incluye reprogramados, como hoy) + «Sin motivo todavía»
  const itM = v.motivos.map((x) => ({ l: x.motivo, v: x.n, txt: String(x.n) }));
  if (sin) itM.push({ l: "Sin motivo todavía", v: sin, txt: String(sin), col: "var(--c-nar)", cls: "nar", sub: "Pendiente que el monitor lo registre" } as typeof itM[number]);
  out.push(<Tarjeta key="mot" id="mot" titulo={v.motivos.length ? `«${v.motivos[0].motivo}» es el motivo más frecuente${sin ? `; ${sin} aún sin motivo` : ""}` : "Aún no hay motivos registrados"}
    sub="Motivos de inasistencia (incluye reprogramados)" grafico={itM.length ? <BarrasH items={itM} /> : <p className={s.muted}>Sin inasistencias con estos filtros.</p>}
    tabla={<Tabla cols={[{ t: "Motivo de inasistencia (incluye reprogramados)" }, { t: uni(modo, 2, true), num: true }]} filas={[...v.motivos.map((x) => [x.motivo, x.n]), ...(sin ? [["Sin motivo todavía", sin]] : [])]} />} />);

  // Por ciudad, como hoy (también el «No» del monitor sin evaluación guardada)
  const nsc = v.noSePresentaronCiudad, pct = (n: number, p: number) => (n + p ? Math.round((n * 100) / (n + p)) : 0);
  out.push(<Tarjeta key="nsc" id="nsc" titulo={nsc.length ? `${nsc[0].ciudad} concentra más inasistencias (${nsc[0].n})` : "Sin inasistencias por ciudad"}
    sub="Eligieron hora y no se presentaron · por ciudad"
    grafico={nsc.length ? <BarrasH items={nsc.map((x) => ({ l: x.ciudad, v: x.n, txt: <>{x.n} <small>{pct(x.n, x.pres)} %</small></>, tip: `${x.ciudad}: ${x.n} de ${x.tot} agendados (${pct(x.n, x.pres)} % de inasistencia)` }))} /> : <p className={s.muted}>Todavía no hay inasistencias.</p>}
    tabla={<Tabla cols={[{ t: "Ciudad" }, { t: "Agendados", num: true }, { t: "Eligieron hora y no se presentaron", num: true }, { t: "% inasistencia", num: true }]} filas={nsc.map((x) => [x.ciudad, x.tot, x.n, `${pct(x.n, x.pres)} %`])} vacio="Todavía no hay inasistencias." />}
    pie={<p className={s.nota}>Como hoy, incluye a quienes su monitor marcó «No» y aún no tienen evaluación guardada.</p>} />);

  // Por monitor: con y sin motivo
  const mons = [...v.porMonitor].sort((a, b) => b.sinMotivo - a.sinMotivo || b.c.nsp - a.c.nsp || a.monitor.localeCompare(b.monitor, "es"));
  const mxM = Math.max(1, ...mons.map((x) => x.c.nsp));
  out.push(<Tarjeta key="mon" id="mon" cls={s.span2}
    titulo={mons.length && mons[0].sinMotivo ? `${mons[0].monitor} tiene más inasistencias sin motivo (${mons[0].sinMotivo})` : "Todas las inasistencias tienen motivo"}
    sub="Monitoreo · con y sin motivo registrado, por monitor"
    ley={<ul className={`${s.ley} ${s.fila}`}><li><i style={{ background: "var(--c-az)" }} /><span>Con motivo</span></li><li><i style={{ background: "var(--c-nar)" }} /><span>Sin motivo</span></li></ul>}
    grafico={<BarrasH max={mxM} items={mons.map((x) => ({
      l: x.monitor, sub: `${x.c.tot} a cargo`, v: x.c.nsp, segs: [{ v: x.c.conMotivo, col: "var(--c-az)" }, { v: x.sinMotivo, col: "var(--c-nar)" }],
      txt: <>{x.c.conMotivo} · <span className={s.nar}>{x.sinMotivo} sin</span></>, tip: `${x.monitor}\n${x.c.tot} ${uni(modo, x.c.tot)} a cargo\nNo se presentaron: ${x.c.nsp}\nCon motivo: ${x.c.conMotivo}\nSin motivo: ${x.sinMotivo}`,
    }))} />}
    tabla={<Tabla cols={[{ t: "Monitor" }, { t: uni(modo, 2, true), num: true }, { t: "No se presentaron", num: true }, { t: "Con motivo", num: true }, { t: "Sin motivo", num: true }]} filas={[...v.porMonitor].map((x) => [x.monitor, x.c.tot, x.c.nsp, x.c.conMotivo, x.sinMotivo])} />} />);

  // Lista
  out.push(
    <section key="ina" className={`${s.c} ${s.spanAll}`} aria-labelledby="t-ina">
      <div className={s.ch}><div><h3 id="t-ina">Lista de inasistencias</h3><p className={`${s.muted} ${s.small}`}>Eligieron hora y quedaron con «No se presentó»</p></div></div>
      <Lista<ItemLista> id="ina" nombre="inasistencias" ph="Buscar estudiante, proyecto o monitor" movil={movil} filas={v.inasistencias} orden={{ k: "mt", dir: -1 }}
        texto={(x) => `${x.nombre} ${x.proyecto} ${x.monitor ?? ""} ${x.ciudad}`}
        cols={[
          { k: "n", t: modo === "est" ? "Estudiante" : "Estudiantes", v: (x) => x.nombre, f: (x) => <><b>{x.nombre}</b><br /><span className={`${s.muted} ${s.small}`}>{x.proyecto}</span></> },
          { k: "c", t: "Ciudad", v: (x) => x.ciudad, f: (x) => x.ciudad },
          { k: "d", t: "Día y hora (COL)", v: (x) => `${x.dia}${String(horaMin(x.hora ?? "")).padStart(4, "0")}`, f: (x) => `${x.dia ? diaCorto(x.dia) : ""} · ${x.hora}` },
          { k: "mo", t: "Monitor", v: (x) => x.monitor ?? "", f: (x) => x.monitor },
          { k: "mt", t: "Motivo", v: (x) => x.motivo ?? "", f: (x) => (x.motivo ? x.motivo : <span className={`${s.chip} ${s.cSig}`}>Sin motivo</span>) },
        ]}
        tarjeta={(x) => <><div className={s.ct}><b>{x.nombre}</b>{x.motivo ? <span className={`${s.chip} ${s.cLine}`}>{x.motivo}</span> : <span className={`${s.chip} ${s.cSig}`}>Sin motivo</span>}</div><p className={s.small}>{x.ciudad} · {x.dia ? diaCorto(x.dia) : ""} · {x.hora}</p><p className={`${s.small} ${s.muted}`}>Monitor: {x.monitor}</p></>} />
    </section>,
  );
  out.push(<BloqueSinAgendar key="sa" sa={d.sinAgendar} sp={d.sinProyecto} movil={movil} />);
  return <div className={s.grid}>{out}</div>;
}

function BloqueSinAgendar({ sa, sp, movil }: { sa: SinAgendar; sp: SeguimientoV2["sinProyecto"]; movil: boolean }) {
  const sm = sa.proyectos.filter((p) => p.monitor === SIN_MONITOR).length;
  const t = sp.reduce((a, x) => [a[0] + x.participantes, a[1] + x.proyectos, a[2] + x.estudiantes], [0, 0, 0]);
  type P = SinAgendar["proyectos"][number];
  return (
    <section className={`${s.sa} ${s.spanAll}`} id="sin-agendar" aria-labelledby="t-sa">
      <div className={s.sah}>
        <div><h2 id="t-sa">Sin agendar</h2><p className={s.muted}>Aún no tienen día ni hora, o no tienen proyecto.</p></div>
        <span className={s.nocuenta}><IcoNo />No cuentan en las estadísticas</span>
      </div>
      <p className={`${s.small} ${s.muted}`}>Aquí solo aplican los filtros de ciudad, ruta, modalidad y búsqueda; el día no aplica porque no tienen fecha.</p>
      <div className={s.sag}>
        <div className={s.c}>
          <div className={s.ch}><div><h3>1. Sin día ni hora: {N(sa.proyectos.length)} {sa.proyectos.length === 1 ? "proyecto" : "proyectos"} · {N(sa.estudiantes)} {sa.estudiantes === 1 ? "estudiante" : "estudiantes"}</h3><p className={`${s.muted} ${s.small}`}>Mentor «Sin asignar» · algunos también «Sin monitor»</p></div></div>
          <Tabla cols={[{ t: "Ciudad" }, { t: "Proyectos", num: true }, { t: "Estudiantes", num: true }, { t: "Sin monitor", num: true }]} vacio="Todos los proyectos tienen día y hora."
            filas={sa.porCiudad.length ? [...sa.porCiudad.map((x) => [x.ciudad, x.proyectos, x.estudiantes, x.sinMonitor]), { tot: true as const, c: ["Total", sa.proyectos.length, sa.estudiantes, sm] }] : []} />
          {sa.proyectos.length > 0 && (
            <details className={s.det}>
              <summary>Ver los {sa.proyectos.length} proyectos <IcoFlecha /></summary>
              <Lista<P> id="sa" nombre="sin agendar" ph="Buscar proyecto o estudiante" movil={movil} filas={sa.proyectos} orden={{ k: "c", dir: 1 }}
                texto={(p) => `${p.proyecto} ${p.estudiantes.join(" ")} ${p.ciudad}`}
                cols={[
                  { k: "p", t: "Proyecto", v: (p) => p.proyecto, f: (p) => <b>{p.proyecto}</b> },
                  { k: "e", t: "Estudiantes", v: (p) => p.estudiantes[0], f: (p) => p.estudiantes.map((x) => <div key={x}>{x}</div>) },
                  { k: "c", t: "Ciudad", v: (p) => p.ciudad, f: (p) => p.ciudad },
                  { k: "r", t: "Ruta", v: (p) => p.ruta, f: (p) => p.ruta || "—" },
                  { k: "mo", t: "Monitor", v: (p) => p.monitor, f: (p) => (p.monitor === SIN_MONITOR ? <span className={`${s.chip} ${s.cSig}`}>Sin monitor</span> : p.monitor) },
                  { k: "me", t: "Mentor", f: () => <span className={s.muted}>Sin asignar</span> },
                ]}
                tarjeta={(p) => <><div className={s.ct}><b>{p.proyecto}</b><span className={`${s.chip} ${s.cLine}`}>{p.ciudad}</span></div><p className={s.small}>{p.estudiantes.join(" · ")}</p><p className={`${s.small} ${s.muted}`}>{p.ruta || "Sin ruta"} · Monitor: {p.monitor} · Mentor: Sin asignar</p></>} />
            </details>
          )}
        </div>
        <div className={s.c}>
          <div className={s.ch}><div><h3>2. Sin proyecto: {N(t[0])} participantes · {N(t[1])} proyectos marcados</h3><p className={`${s.muted} ${s.small}`}>Participantes que aún no tienen proyecto y proyectos marcados así, con sus estudiantes</p></div></div>
          <Tabla cols={[{ t: "Ciudad" }, { t: "Participantes sin proyecto", num: true }, { t: "Proyectos marcados «Sin proyecto»", num: true }, { t: "Estudiantes", num: true }]} vacio="Nadie está sin proyecto."
            filas={sp.length ? [...sp.map((x) => [x.ciudad, x.participantes, x.proyectos, x.estudiantes]), { tot: true as const, c: ["Total", t[0], t[1], t[2]] }] : []} />
        </div>
      </div>
    </section>
  );
}

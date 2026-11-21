"use client";

import type { SeguimientoV2 } from "@/lib/evaluacion/resultados";
import type { Cuenta, Grupo, ItemLista, Modo } from "@/lib/evaluacion/seguimientoV2";
import { Balas, Barra100, BarrasH, Burbujas, CeldaCalor, Dumbbell, EscalaCalor, Mini, Radar, type FilaDumbbell } from "./Graficos";
import { diaCorto, N, nf, P, pc, uni } from "./formato";
import { Lista, Tabla, Tarjeta, type ColLista } from "./Piezas";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · Resultados: criterios de la Parte A (radar + barras), temas de la Parte B (balas), Ciudad × Tema,
// ciudades (burbujas + tabla), ruta y modalidad (dumbbell), parejas (barra 100 %), destacados y excelentes (listas).

const TEMAS_C = ["Componentes", "Estado (hooks)", "Express", "Mongoose", "Visión gral."];
const chipRes: Record<string, string> = { Excelente: "ev-c-Excelente", Aprobado: "ev-c-Aprobado", Incompleto: "ev-c-Incompleto", "No se presentó": "ev-c-NoSePresento", Pendiente: "ev-c-Pendiente" };
export const Chip = ({ r }: { r: string }) => <span className={`ev-chip ${chipRes[r] ?? ""}`}>{r}</span>;

function tablaGrupos(etq: string, g: Grupo[], modo: Modo) {
  return <Tabla cols={[{ t: etq }, { t: uni(modo, 2, true), num: true }, { t: "Evaluados", num: true }, { t: "No se presentaron", num: true }, { t: "% excelentes", num: true }, { t: "Nivel prom.", num: true }]}
    filas={g.map((x) => [x.grupo, N(x.c.tot), N(x.c.pres), N(x.c.nsp), P(x.c.pctExc), nf(x.c.nivel)])} />;
}

export default function Resultados({ d, modo, movil }: { d: SeguimientoV2; modo: Modo; movil: boolean }) {
  const v = d[modo], u2 = uni(modo, 2);
  const out: React.ReactNode[] = [];

  // Parte A: ¿qué funcionó en la demo?
  const cr = v.parteA.map((x) => ({ l: x.titulo, v: pc(x.si), k: x.cumplen, n: x.n, sin: x.si === null }));
  const conA = Math.max(0, ...cr.map((x) => x.n));
  const ord = [...cr].filter((x) => !x.sin).sort((a, b) => b.v - a.v), peor = ord.slice(-2);
  const lst = <BarrasH max={100} items={ord.map((x) => { const b = x.v < 60; return { l: x.l, v: x.v, txt: <>{x.v} %{b && <small> ⚠ bajo 60 %</small>}</>, col: b ? "var(--c-bad)" : "var(--c-az)", cls: b ? "bad" : undefined, tip: `${x.l}: ${x.k} de ${x.n} (${x.v} %)` }; })} />;
  out.push(<Tarjeta key="crit" id="crit" cls={s.span2}
    titulo={peor.length === 2 ? `«${peor[1].l}» y «${peor[0].l}» son lo que menos funciona en la demo` : "¿Qué funcionó en la demo?"}
    sub={`¿Qué funcionó en la demo? · % con «Sí» de ${N(conA)} ${uni(modo, conA)} evaluados · línea punteada roja = 60 %`}
    grafico={!ord.length ? <p className={s.muted}>Sin evaluaciones con estos filtros.</p> : movil ? lst : <div className={s.rad}><Radar vals={cr.map((x) => x.v)} nombres={cr.map((x) => x.l)} /><div>{lst}</div></div>}
    tabla={<Tabla cols={[{ t: "Criterio" }, { t: "Cumplen", num: true }, { t: "%", num: true }]} filas={ord.map((x) => [x.l, `${N(x.k)} de ${N(x.n)}`, `${x.v} %`])} />} />);

  // Parte B: nivel por tema (meta 2)
  const tem = v.parteB.map((x) => ({ l: x.titulo, v: x.promedio, n: x.n }));
  const flojo = tem.filter((t) => t.v !== null).sort((a, b) => a.v! - b.v!)[0];
  out.push(<Tarjeta key="niv" id="niv" titulo={flojo ? `${flojo.l} es el tema más flojo: ${nf(flojo.v)} de promedio` : "Nivel de conocimiento por tema"}
    sub="Nivel de conocimiento por tema · promedio de 0 a 4 · meta: 2 o más" grafico={<Balas temas={tem} />}
    tabla={<Tabla cols={[{ t: "Tema" }, { t: "Evaluados", num: true }, { t: "Promedio", num: true }, { t: "Meta (2)" }]} filas={tem.map((t) => [t.l, N(t.n), nf(t.v), t.v === null ? "—" : t.v >= 2 ? "✓ Cumple" : "▼ Bajo la meta"])} />} />);

  // Ciudad × Tema
  let peorC: { c: string; t: string; v: number } | null = null;
  for (const f of v.calor) f.temas.forEach((x, i) => { if (x !== null && (!peorC || x < peorC.v)) peorC = { c: f.ciudad, t: v.parteB[i].titulo, v: x }; });
  const pc0 = peorC as { c: string; t: string; v: number } | null;
  out.push(<Tarjeta key="cal" id="cal" titulo={pc0 ? `${pc0.c} tiene el nivel más bajo en ${pc0.t} (${nf(pc0.v)})` : "Nivel por ciudad y tema"}
    sub="Nivel promedio por ciudad y tema · las celdas con ▼ están bajo la meta de 2"
    grafico={v.calor.length ? <><div className={s.tw}><table className={`${s.tabla} ${s.calor}`}><thead><tr><th scope="col">Ciudad</th>{TEMAS_C.map((t) => <th key={t} scope="col">{t}</th>)}<th scope="col">Prom.</th></tr></thead>
      <tbody>{v.calor.map((f) => <tr key={f.ciudad}><th scope="row">{f.ciudad}</th>{f.temas.map((x, i) => <CeldaCalor key={i} v={x} />)}<CeldaCalor v={f.prom} /></tr>)}</tbody></table></div><EscalaCalor /></> : <p className={s.muted}>Sin evaluaciones con estos filtros.</p>} />);

  // Ciudades: burbujas + tabla con mini barras
  const cs = v.porCiudad;
  const bur = cs.filter((x) => x.c.nivel !== null && x.c.asis !== null).map((x) => ({ l: x.grupo, tot: x.c.tot, asis: pc(x.c.asis), nivel: x.c.nivel!, pctExc: pc(x.c.pctExc) }));
  const top = [...bur].sort((a, b) => b.nivel - a.nivel);
  const miniN = (c: Cuenta) => <Mini v={c.nivel ?? 0} max={4} txt={nf(c.nivel)} col={(c.nivel ?? 0) < 2 ? "var(--c-nar)" : "var(--c-az)"} />;
  const tabC = <Tabla cols={[{ t: "Ciudad" }, { t: "Agendados", num: true }, { t: "Evaluados", num: true }, { t: "No se presentaron", num: true }, { t: "Asistencia" }, { t: "% excelentes" }, { t: "Nivel prom." }]}
    filas={cs.map((x) => [x.grupo, N(x.c.tot), N(x.c.pres), N(x.c.nsp), <Mini key="a" v={pc(x.c.asis)} max={100} txt={P(x.c.asis)} />, <Mini key="e" v={pc(x.c.pctExc)} max={100} txt={P(x.c.pctExc)} col="var(--c-nar)" />, miniN(x.c)])} />;
  out.push(
    <section key="ciu" className={`${s.c} ${s.span2}`} aria-labelledby="t-ciu">
      <div className={s.ch}><div><h3 id="t-ciu">{top.length > 1 ? `${top[0].l} lidera en nivel (${nf(top[0].nivel)}); ${top[top.length - 1].l} es la más baja (${nf(top[top.length - 1].nivel)})` : "Resultados por ciudad"}</h3><p className={`${s.muted} ${s.small}`}>Por ciudad · asistencia, nivel y % de excelentes</p></div></div>
      {movil ? (
        <ul className={s.cards}>{cs.map((x) => (
          <li key={x.grupo} className={s.card}>
            <div className={s.ct}><b>{x.grupo}</b><span className={s.num}>{N(x.c.tot)}</span></div>
            <p className={`${s.small} ${s.muted}`}>{N(x.c.pres)} evaluados · {N(x.c.nsp)} no se presentaron</p>
            <div className={s.cm}><span>Asistencia</span><Mini v={pc(x.c.asis)} max={100} txt={P(x.c.asis)} /></div>
            <div className={s.cm}><span>Excelentes</span><Mini v={pc(x.c.pctExc)} max={100} txt={P(x.c.pctExc)} col="var(--c-nar)" /></div>
            <div className={s.cm}><span>Nivel</span>{miniN(x.c)}</div>
          </li>
        ))}</ul>
      ) : <>{bur.length > 1 && <Burbujas cs={bur} uniTxt={u2} />}{tabC}</>}
    </section>,
  );

  // Ruta y modalidad (dumbbell)
  const dumb = (id: string, g: Grupo[], na: string, nb: string, etq: string, tit: (A: Cuenta, B: Cuenta) => string) => {
    const A = g.find((x) => x.grupo === na)?.c, B = g.find((x) => x.grupo === nb)?.c;
    const fil: FilaDumbbell[] = A && B ? [
      { l: "% asistencia", a: pc(A.asis), b: pc(B.asis), max: 100, fmt: (x) => `${x} %` }, { l: "% avance", a: pc(A.avance), b: pc(B.avance), max: 100, fmt: (x) => `${x} %` },
      { l: "% excelentes", a: pc(A.pctExc), b: pc(B.pctExc), max: 100, fmt: (x) => `${x} %` }, { l: "Funciona prom.", a: pc(A.funciona), b: pc(B.funciona), max: 100, fmt: (x) => `${x} %` },
      { l: "Nivel prom.", a: A.nivel ?? 0, b: B.nivel ?? 0, max: 4, fmt: (x) => nf(x) },
    ] : [];
    return <Tarjeta key={id} id={id} titulo={A && B ? tit(A, B) : `Por ${etq.toLowerCase()}`} sub={`${N(A?.tot ?? 0)} ${na.toLowerCase()} · ${N(B?.tot ?? 0)} ${nb.toLowerCase()} (${u2})`}
      grafico={A && B ? <Dumbbell filas={fil} a={na} b={nb} movil={movil} /> : <p className={s.muted}>Con estos filtros solo hay un grupo; mira la tabla.</p>}
      tabla={tablaGrupos(etq, g, modo)} />;
  };
  out.push(dumb("ruta", v.porRuta, "Básica", "Avanzada", "Ruta", (A, B) => { const x = pc(B.pctExc) - pc(A.pctExc); return x === 0 ? "Ambas rutas tienen el mismo % de excelentes" : `La ruta ${x > 0 ? "avanzada" : "básica"} tiene ${Math.abs(x)} pts más de excelentes`; }));
  out.push(dumb("modo", v.porModalidad, "Individual", "En pareja", "Modalidad", (A, B) => { const x = pc(A.pctExc) - pc(B.pctExc); return x === 0 ? "Individual y en pareja rinden igual" : `${x > 0 ? "Individual" : "En pareja"} tiene ${Math.abs(x)} pts más de excelentes`; }));

  // Parejas (siempre por estudiantes)
  const p = d.parejas, tp = p.ambos + p.uno + p.ninguno;
  out.push(<Tarjeta key="par" id="par" titulo={tp ? `En ${p.ambos} de ${tp} parejas evaluadas los dos fueron excelentes` : "Parejas evaluadas"} sub="Análisis de parejas · siempre por estudiantes"
    grafico={tp ? <><Barra100 segs={[{ l: "Los dos excelentes", v: p.ambos, col: "var(--c-nar)", ink: "#1a1a1a" }, { l: "Solo uno excelente", v: p.uno, col: "var(--c-az)" }, { l: "Ninguno excelente", v: p.ninguno, col: "var(--c-gr)" }]} />
      <p className={s.nota}>De <b>{tp}</b> parejas evaluadas: en <b>{p.ambos}</b> los dos fueron excelentes, en <b>{p.uno}</b> solo uno y en <b>{p.ninguno}</b> ninguno.{p.uno ? " Cuando solo uno es excelente, vale la pena revisar si ambos dominan el código." : ""}</p></>
      : <p className={s.muted}>Todavía no hay parejas con los dos integrantes evaluados.</p>}
    tabla={<Tabla cols={[{ t: "Parejas evaluadas" }, { t: "Cantidad", num: true }, { t: "%", num: true }]} filas={[["Los dos excelentes", p.ambos, P(tp ? p.ambos / tp : null)], ["Solo uno excelente", p.uno, P(tp ? p.uno / tp : null)], ["Ninguno excelente", p.ninguno, P(tp ? p.ninguno / tp : null)]]} />} />);

  // Listas
  const colEst: ColLista<ItemLista> = { k: "n", t: modo === "est" ? "Estudiante" : "Estudiantes", v: (x) => x.nombre, f: (x) => <><b>{x.nombre}</b><br /><span className={`${s.muted} ${s.small}`}>{x.ciudad}{x.dia ? ` · ${diaCorto(x.dia)}` : ""}</span></> };
  const colEmp: ColLista<ItemLista> = { k: "e", t: "Emprendimiento", v: (x) => x.proyecto, f: (x) => x.proyecto };
  const colMen: ColLista<ItemLista> = { k: "m", t: "Mentor", v: (x) => x.mentor ?? "", f: (x) => x.mentor };
  const texto = (x: ItemLista) => `${x.nombre} ${x.proyecto} ${x.mentor ?? ""}`;
  out.push(
    <section key="des" className={`${s.c} ${s.spanAll}`} aria-labelledby="t-des">
      <div className={s.ch}><div><h3 id="t-des">{N(v.destacados.length)} {modo === "est" ? (v.destacados.length === 1 ? "estudiante destacado" : "estudiantes destacados") : v.destacados.length === 1 ? "proyecto destacado" : "proyectos destacados"}</h3><p className={`${s.muted} ${s.small}`}>Proyectos destacados · lo que el mentor resaltó</p></div></div>
      <Lista id="des" nombre="proyectos destacados" ph="Buscar estudiante, emprendimiento o mentor" movil={movil} filas={v.destacados} texto={texto}
        cols={[colEst, colEmp, colMen, { k: "r", t: "Resultado", v: (x) => (x.res === "Excelente" ? 0 : 1), f: (x) => <Chip r={x.res ?? ""} /> }, { k: "b", t: "Lo que hizo muy bien", f: (x) => <span className={s.small}>{x.fortaleza}</span> }]}
        tarjeta={(x) => <><div className={s.ct}><b>{x.nombre}</b><Chip r={x.res ?? ""} /></div><p className={s.small}>{x.proyecto} · {x.ciudad}</p><p className={`${s.small} ${s.muted}`}>Mentor: {x.mentor}</p>{x.fortaleza && <p className={`${s.small} ${s.bien}`}>«{x.fortaleza}»</p>}</>} />
    </section>,
    <section key="exc" className={`${s.c} ${s.spanAll}`} aria-labelledby="t-exc">
      <div className={s.ch}><div><h3 id="t-exc">{N(v.excelentes.length)} {v.excelentes.length === 1 ? "resultado excelente" : "resultados excelentes"}</h3><p className={`${s.muted} ${s.small}`}>Funciona {pc(d.criterios.exA)} % o más y nivel {nf(d.criterios.exB)} o más</p></div></div>
      <Lista id="exc" nombre="resultados excelentes" ph="Buscar estudiante, emprendimiento o mentor" movil={movil} filas={v.excelentes} texto={texto} orden={{ k: "nv", dir: -1 }}
        cols={[colEst, colEmp, colMen, { k: "f", t: "Funciona", num: true, v: (x) => x.a ?? 0, f: (x) => P(x.a) }, { k: "nv", t: "Nivel", num: true, v: (x) => x.b ?? 0, f: (x) => nf(x.b) }]}
        tarjeta={(x) => <><div className={s.ct}><b>{x.nombre}</b><span className={s.num}>{P(x.a)} · {nf(x.b)}</span></div><p className={s.small}>{x.proyecto} · {x.ciudad}</p><p className={`${s.small} ${s.muted}`}>Mentor: {x.mentor}</p></>} />
    </section>,
  );
  return <div className={s.grid}>{out}</div>;
}

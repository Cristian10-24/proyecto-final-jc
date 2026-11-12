"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import {
  cambiosSinMargen, horaCorta, horaLarga, porMonitor, rangoHoras, salasSinMonitor, totales, unirBloques, type Bloque, type Celda,
} from "@/lib/vistas/bloques";
import { coincide, coloresMonitores, plural } from "@/lib/vistas/formato";
import type { Persona, VistaMonitores } from "@/lib/vistas/monitores";
import { fechaLarga } from "../comun";
import { Acordeon, Avatar, Buscador, Chip, Segmentado, Selector, Telefono, type Opcion } from "./Basicos";
import { BarraMovil, HojaFiltros, PanelLateral, type CampoFiltro } from "./Dialogos";
import { Cargando, ErrorCarga, Vacio } from "./Estados";
import { IcoAlerta, IcoDescargar, IcoReloj } from "./Iconos";
import ShellVistas from "./ShellVistas";
import m from "./Monitores.module.css";
import v from "./Vistas.module.css";

// Fase 6 · «Monitores» (coordinación y admin, solo lectura; prototipos 05/06): en qué sala está cada monitor, con qué
// mentor y a qué hora. Alertas de salas sin monitor y de cambios de sala sin margen; «Ver como» Cuadrícula, Por monitor
// o Por sala (se recuerda en el navegador); panel lateral al tocar un bloque de la cuadrícula. «Descargar plan de
// salas», «Cambiar en Salas» e «Ir a Salas» solo para el admin (es quien tiene Salas). Nada escribe.

type Ver = "cuadricula" | "monitor" | "sala";
const CLAVE_VER = "pfjc-monitores-ver";
const POR_DEFECTO = { monitor: "", sala: "", mentor: "" };
const dosNombres = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(" ");

export default function MonitoresPanel({ user, admin }: { user: SessionUser; admin: boolean }) {
  const [datos, setDatos] = useState<VistaMonitores | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [dia, setDia] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>(POR_DEFECTO);
  const [q, setQ] = useState("");
  const [ver, setVerEstado] = useState<Ver>("cuadricula");
  const [hoja, setHoja] = useState(false);
  const [panel, setPanel] = useState<Bloque | null>(null);

  useEffect(() => {
    try { const x = localStorage.getItem(CLAVE_VER); if (x === "cuadricula" || x === "monitor" || x === "sala") setVerEstado(x); } catch { /* sin almacenamiento */ }
  }, []);
  const setVer = (x: Ver) => { setVerEstado(x); try { localStorage.setItem(CLAVE_VER, x); } catch { /* sin almacenamiento */ } };

  const cargar = useCallback(async (d: string | null) => {
    try {
      const res = await fetch(`/api/evaluacion/monitores${d ? `?dia=${d}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setCarga("listo");
    } catch {
      setCarga((x) => (x === "listo" ? x : "error"));
    }
  }, []);
  useEffect(() => { void cargar(dia); }, [cargar, dia]);
  useEffect(() => {
    if (hoja || panel) return;
    const t = setInterval(() => void cargar(dia), 60_000);
    return () => clearInterval(t);
  }, [cargar, dia, hoja, panel]);

  const celdas = useMemo(() => datos?.celdas ?? [], [datos]);
  const mon = useMemo(() => new Map((datos?.monitores ?? []).map((x) => [x.id, x])), [datos]);
  const men = useMemo(() => new Map((datos?.mentores ?? []).map((x) => [x.id, x])), [datos]);
  const enlace = useMemo(() => new Map((datos?.enlaces ?? []).map((x) => [x.sala, x.enlace])), [datos]);
  const colorDe = useMemo(() => {
    const c = coloresMonitores((datos?.monitores ?? []).map((x) => x.nombre));
    return (id: string | null) => (id ? c.get(mon.get(id)?.nombre ?? id) ?? 1 : ("sin" as const));
  }, [datos, mon]);
  const nombreMon = (id: string | null) => (id ? mon.get(id)?.nombre ?? id : "Sin monitor");
  const nombreMen = (id: string) => men.get(id)?.nombre ?? id;

  // Alertas sobre todo el día (no dependen de los filtros).
  const todos = useMemo(() => unirBloques(celdas), [celdas]);
  const sinMon = salasSinMonitor(todos);
  const sinMargen = cambiosSinMargen(todos);
  const destinoSinMargen = new Set(sinMargen.map((x) => `${x.a.monitor}|${x.a.sala}|${x.a.desde}`));
  const esSinMargen = (b: Bloque) => destinoSinMargen.has(`${b.monitor}|${b.sala}|${b.desde}`);

  const filtradas = celdas.filter((c: Celda) =>
    (!f.monitor || (f.monitor === "sin" ? c.monitor === null : c.monitor === f.monitor))
    && (!f.sala || String(c.sala) === f.sala) && (!f.mentor || c.mentorId === f.mentor)
    && coincide([nombreMon(c.monitor), nombreMen(c.mentorId), `Sala ${c.sala}`, ...c.proyectos.map((p) => p.nombre)], q));
  const bloques = unirBloques(filtradas);
  const grupos = porMonitor(bloques);
  const ordenMon = [...grupos.keys()].filter((k): k is string => k !== null).sort((a, b) => nombreMon(a).localeCompare(nombreMon(b), "es"));
  const horas = celdas.length ? range(Math.min(...celdas.map((c) => c.hora)), Math.max(...celdas.map((c) => c.hora))) : [];

  const dias = datos?.dias ?? [];
  const diaSel = datos?.dia ?? null;
  const opDia: Opcion[] = dias.map((d) => ({ valor: d, texto: fechaLarga(d) }));
  const opMon: Opcion[] = [{ valor: "", texto: "Todos los monitores" }, ...[...mon.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((x) => ({ valor: x.id, texto: x.nombre })), ...(sinMon.length ? [{ valor: "sin", texto: "Sin monitor" }] : [])];
  const opSala: Opcion[] = [{ valor: "", texto: "Todas las salas" }, ...[...new Set(celdas.map((c) => c.sala))].sort((a, b) => a - b).map((s) => ({ valor: String(s), texto: `Sala ${s}` }))];
  const opMen: Opcion[] = [{ valor: "", texto: "Todos los mentores" }, ...[...men.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((x) => ({ valor: x.id, texto: x.nombre }))];
  const campos: CampoFiltro[] = [
    ...(opDia.length ? [{ id: "dia", etiqueta: "Día", opciones: opDia }] : []),
    { id: "monitor", etiqueta: "Monitor", opciones: opMon }, { id: "sala", etiqueta: "Sala", opciones: opSala }, { id: "mentor", etiqueta: "Mentor", opciones: opMen },
  ];
  const activos = (["monitor", "sala", "mentor"] as const).filter((k) => f[k]).length;
  const limpiar = () => { setF(POR_DEFECTO); setQ(""); };
  const cambiarDia = (d: string) => { if (d && d !== diaSel) { setF(POR_DEFECTO); setPanel(null); setDia(d); } };

  const txtSinMon = sinMon.length ? `${plural(sinMon.length, "sala sin monitor", "salas sin monitor")} · ${sinMon.map((b) => `Sala ${b.sala} ${horaLarga(b.desde)}`).join(", ")}` : "";
  const nMonSm = new Set(sinMargen.map((x) => x.monitor)).size;
  const txtSinMargen = sinMargen.length
    ? `${nMonSm} ${nMonSm === 1 ? "monitor cambia" : "monitores cambian"} de sala sin margen · ${sinMargen.map((x) => `${dosNombres(nombreMon(x.monitor))}: Sala ${x.de.sala} (último turno ${horaLarga(x.ultimo.hora, x.ultimo.minuto)}) → Sala ${x.a.sala} a las ${horaLarga(x.a.desde)}`).join("; ")}`
    : "";

  const botones = admin && (
    <>
      <a className={v.btn} href="/admin/salas">Cambiar en Salas</a>
      <a className={`${v.btn} ${v.btnNegro}`} href="/api/admin/salas/excel"><IcoDescargar />Descargar plan de salas</a>
    </>
  );

  const especial = (() => {
    if (carga === "cargando") return <div className={m.envoltura}><Cargando /></div>;
    if (carga === "error") return <ErrorCarga titulo="No pudimos cargar las asignaciones" onReintentar={() => { setCarga("cargando"); void cargar(dia); }} />;
    return null;
  })();

  const sinDatosDia = carga === "listo" && !celdas.length;
  const nadaFiltrado = carga === "listo" && celdas.length > 0 && !bloques.length;

  const lista = () => {
    if (sinDatosDia)
      return <div className={v.tarjeta}><Vacio titulo="No hay salas con proyectos este día" texto={`${diaSel ? fechaLarga(diaSel) : "Este día"} todavía no tiene salas armadas ni monitores asignados. Cuando se armen en Salas, aparecerán aquí.`} accion={admin ? { texto: "Ir a Salas", href: "/admin/salas" } : undefined} /></div>;
    if (nadaFiltrado)
      return <div className={v.tarjeta}><Vacio titulo="Nada coincide con esos filtros" texto="Prueba con otro nombre de monitor, mentor, sala o proyecto, o cambia de día." accion={{ texto: "Limpiar filtros", onClick: limpiar }} /></div>;
    return null;
  };

  return (
    <ShellVistas user={user} active="monitores">
      {!especial && <div className={v.soloMovil}><BarraMovil buscar={q} onBuscar={setQ} placeholder="Monitor, mentor o sala" onFiltros={() => setHoja(true)} activos={activos} /></div>}
      {especial ?? (
        <div className={m.envoltura}>
          {/* ---- Web ---- */}
          <div className={v.soloWeb}>
            <div className={v.cabeza}>
              <div><h1>Asignaciones de monitores</h1><p>En qué sala está cada monitor, con qué mentor y a qué hora. Solo lectura · Hora COL.</p></div>
            </div>
            {botones && <div className={m.botones} style={{ marginTop: -4, marginBottom: 16 }}>{botones}</div>}
            <div className={`${v.tarjeta} ${v.filtros}`}>
              {opDia.length > 0 && <Selector id="mo-dia" etiqueta="Día" valor={diaSel ?? ""} opciones={opDia} onCambio={cambiarDia} />}
              <Selector id="mo-mon" etiqueta="Monitor" valor={f.monitor} opciones={opMon} onCambio={(x) => setF((y) => ({ ...y, monitor: x }))} />
              <Selector id="mo-sala" etiqueta="Sala" valor={f.sala} opciones={opSala} onCambio={(x) => setF((y) => ({ ...y, sala: x }))} />
              <Selector id="mo-men" etiqueta="Mentor" valor={f.mentor} opciones={opMen} onCambio={(x) => setF((y) => ({ ...y, mentor: x }))} />
              <div style={{ flexBasis: "100%", height: 0 }} />
              <div style={{ flex: "0 1 420px", minWidth: 0, display: "flex" }}><Buscador valor={q} onCambio={setQ} placeholder="Buscar monitor, mentor, sala o proyecto" /></div>
            </div>
            {(txtSinMon || txtSinMargen) && (
              <div className={m.alertas} role="status">
                {txtSinMon && <div className={`${v.aviso} ${v.avisoWarn}`}><IcoAlerta size={18} />{txtSinMon}</div>}
                {txtSinMargen && <div className={`${v.aviso} ${v.avisoErr}`}><IcoReloj size={18} />{txtSinMargen}</div>}
              </div>
            )}
            {diaSel && (
              <div className={m.vista}>
                <h2>{fechaLarga(diaSel)}</h2>
                <Segmentado<Ver> etiqueta="Ver como" valor={ver} onCambio={setVer}
                  opciones={[{ id: "cuadricula", texto: "Cuadrícula" }, { id: "monitor", texto: "Por monitor" }, { id: "sala", texto: "Por sala" }]} />
              </div>
            )}
            {lista() ?? (
              ver === "cuadricula" ? (
                <div className={m.scroll} style={{ ["--n" as string]: horas.length }}>
                  <div className={`${m.fila} ${m.cab}`}>
                    <span>Monitor</span>{horas.map((h) => <span key={h}>{horaCorta(h)}</span>)}<span>Total</span>
                  </div>
                  {ordenMon.map((id) => (
                    <FilaCuadricula key={id} horas={horas} bloques={grupos.get(id)!} color={colorDe(id)}
                      quien={<><b>{nombreMon(id)}</b><span><Telefono celular={mon.get(id)?.celular} /></span></>}
                      nombre={nombreMon(id)} nombreMen={nombreMen} esSinMargen={esSinMargen} onAbrir={setPanel} />
                  ))}
                  {grupos.get(null) && (
                    <FilaCuadricula horas={horas} bloques={grupos.get(null)!} color="sin" sin
                      quien={<><b>Sin monitor</b><span>{plural(grupos.get(null)!.length, "sala por cubrir", "salas por cubrir")}</span></>}
                      nombre="Sin monitor" nombreMen={nombreMen} esSinMargen={esSinMargen} onAbrir={setPanel} />
                  )}
                </div>
              ) : ver === "monitor" ? (
                <div className={m.tarjetas}>
                  {ordenMon.map((id) => (
                    <TarjetaMonitor key={id} nombre={nombreMon(id)} color={colorDe(id)} bloques={grupos.get(id)!} nombreMen={nombreMen} esSinMargen={esSinMargen} />
                  ))}
                  {grupos.get(null) && <TarjetaMonitor nombre="Sin monitor" color="sin" bloques={grupos.get(null)!} nombreMen={nombreMen} esSinMargen={esSinMargen} />}
                </div>
              ) : (
                <PorSala bloques={bloques} nombreMon={nombreMon} nombreMen={nombreMen} />
              )
            )}
          </div>

          {/* ---- Móvil ---- */}
          <div className={v.soloMovil}>
            <div className={m.movilCab}>
              <h1>Asignaciones de monitores</h1>
              <p>{diaSel ? fechaLarga(diaSel) : "Sin días"} · Solo lectura · Hora COL</p>
            </div>
            {(sinMon.length > 0 || sinMargen.length > 0) && (
              <div className={m.chipsAlerta} role="status">
                {sinMon.length > 0 && <Chip tono="mid">{plural(sinMon.length, "sala sin monitor", "salas sin monitor")}</Chip>}
                {sinMargen.length > 0 && <Chip tono="bad">{plural(sinMargen.length, "cambio sin margen", "cambios sin margen")}</Chip>}
              </div>
            )}
            {lista() ?? (
              <>
                {grupos.get(null) && (
                  <Acordeon aviso abierto titulo={<span className={m.resumenAcc}><Avatar nombre="" color="sin" /><span><b>Sin monitor</b><span>{plural(grupos.get(null)!.length, "sala por cubrir", "salas por cubrir")}</span></span></span>}>
                    <Linea bloques={grupos.get(null)!} color="sin" nombreMen={nombreMen} esSinMargen={esSinMargen} />
                  </Acordeon>
                )}
                {ordenMon.map((id) => {
                  const t = totales(grupos.get(id)!);
                  const sm = grupos.get(id)!.some(esSinMargen);
                  return (
                    <Acordeon key={id} titulo={<span className={m.resumenAcc}><Avatar nombre={nombreMon(id)} color={colorDe(id)} /><span><b>{nombreMon(id)}</b><span>{t.horas} h · {plural(t.proyectos, "proyecto", "proyectos")}</span></span>{sm && <Chip tono="bad">Sin margen</Chip>}</span>}>
                      <div className={`${v.small} ${v.muted}`} style={{ marginBottom: 10 }}>Celular: <Telefono celular={mon.get(id)?.celular} /></div>
                      <Linea bloques={grupos.get(id)!} color={colorDe(id)} nombreMen={nombreMen} esSinMargen={esSinMargen} />
                    </Acordeon>
                  );
                })}
              </>
            )}
            {botones && <div className={m.botonesMovil}>{botones}</div>}
          </div>
        </div>
      )}

      {hoja && (
        <HojaFiltros campos={campos} valores={{ ...f, dia: diaSel ?? "" }} porDefecto={{ ...POR_DEFECTO, dia: diaSel ?? "" }} onCerrar={() => setHoja(false)}
          onAplicar={({ dia: d, ...resto }) => { setF({ ...POR_DEFECTO, ...resto }); if (d && d !== diaSel) cambiarDia(d); }} />
      )}
      {panel && diaSel && (
        <PanelLateral subtitulo={fechaLarga(diaSel)} titulo={`Sala ${panel.sala}`} onCerrar={() => setPanel(null)}>
          <DetalleBloque b={panel} enlace={enlace.get(panel.sala)} mentor={men.get(panel.mentorId)} monitor={panel.monitor ? mon.get(panel.monitor) ?? { id: panel.monitor, nombre: panel.monitor, celular: null } : null} />
        </PanelLateral>
      )}
    </ShellVistas>
  );
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const claseColor = (c: number | "sin", pre: "b" | "p") => (c === "sin" ? (pre === "b" ? m.bSin : m.pSin) : m[`${pre}${c}`]);

function FilaCuadricula({ horas, bloques, color, quien, nombre, nombreMen, esSinMargen, onAbrir, sin }: {
  horas: number[]; bloques: Bloque[]; color: number | "sin"; quien: React.ReactNode; nombre: string;
  nombreMen: (id: string) => string; esSinMargen: (b: Bloque) => boolean; onAbrir: (b: Bloque) => void; sin?: boolean;
}) {
  const t = totales(bloques);
  const h0 = horas[0] ?? 0;
  return (
    <div className={`${m.fila} ${sin ? m.filaSin : ""}`}>
      <div className={m.quien}><Avatar nombre={nombre} color={color} /><div style={{ minWidth: 0 }}>{quien}</div></div>
      {horas.map((h, i) => <span key={h} className={m.celda} style={{ gridColumn: i + 2 }} aria-hidden="true" />)}
      {bloques.map((b) => (
        <button key={`${b.sala}|${b.desde}`} type="button" className={`${m.barra} ${claseColor(color, "b")}`}
          style={{ gridColumn: `${b.desde - h0 + 2} / span ${b.hasta - b.desde}` }}
          aria-label={`${nombre}: Sala ${b.sala}, ${rangoHoras(b.desde, b.hasta)}, ${nombreMen(b.mentorId)}, ${plural(b.proyectos.length, "proyecto", "proyectos")}${esSinMargen(b) ? ", sin margen" : ""}. Ver detalle`}
          onClick={() => onAbrir(b)}>
          <b>Sala {b.sala}</b><span>{dosNombres(nombreMen(b.mentorId))}</span><span>{plural(b.proyectos.length, "proyecto", "proyectos")}</span>
          {esSinMargen(b) && <span className={m.chipMini}><Chip tono="bad">Sin margen</Chip></span>}
        </button>
      ))}
      <div className={m.total} style={{ gridColumn: horas.length + 2 }}><b>{t.horas} h</b>{plural(t.proyectos, "proyecto", "proyectos")}</div>
    </div>
  );
}

function Linea({ bloques, color, nombreMen, esSinMargen }: { bloques: Bloque[]; color: number | "sin"; nombreMen: (id: string) => string; esSinMargen: (b: Bloque) => boolean }) {
  return (
    <ul className={m.linea}>
      {bloques.map((b) => (
        <li key={`${b.sala}|${b.desde}`} className={claseColor(color, "p")}>
          <b>{rangoHoras(b.desde, b.hasta)}</b>
          <span><strong>Sala {b.sala}</strong> · {nombreMen(b.mentorId)} · {plural(b.proyectos.length, "proyecto", "proyectos")}</span>
          {esSinMargen(b) && <div style={{ marginTop: 4 }}><Chip tono="bad">Sin margen</Chip></div>}
        </li>
      ))}
    </ul>
  );
}

function TarjetaMonitor({ nombre, color, bloques, nombreMen, esSinMargen }: { nombre: string; color: number | "sin"; bloques: Bloque[]; nombreMen: (id: string) => string; esSinMargen: (b: Bloque) => boolean }) {
  const t = totales(bloques);
  return (
    <section className={`${m.tarjeta} ${color === "sin" ? m.tarjetaSin : ""}`} aria-label={nombre}>
      <div className={m.tCab}>
        <Avatar nombre={nombre} color={color} />
        <div><b>{nombre}</b><span>{color === "sin" ? plural(bloques.length, "sala por cubrir", "salas por cubrir") : `${t.horas} h · ${plural(t.proyectos, "proyecto", "proyectos")}`}</span></div>
      </div>
      <Linea bloques={bloques} color={color} nombreMen={nombreMen} esSinMargen={esSinMargen} />
    </section>
  );
}

function PorSala({ bloques, nombreMon, nombreMen }: { bloques: Bloque[]; nombreMon: (id: string | null) => string; nombreMen: (id: string) => string }) {
  const salas = [...new Set(bloques.map((b) => b.sala))].sort((a, b) => a - b);
  return (
    <div className={m.salas}>
      <div className={m.salasCab}><span>Sala</span><span>Horas · mentor · monitor</span></div>
      {salas.map((s) => (
        <div key={s} className={m.salaFila}>
          <b>Sala {s}</b>
          <div className={m.salaBloques}>
            {bloques.filter((b) => b.sala === s).sort((a, b) => a.desde - b.desde).map((b) => (
              <div key={b.desde} className={m.salaBloque}>
                <b>{rangoHoras(b.desde, b.hasta)}</b><span>{nombreMen(b.mentorId)}</span>
                {b.monitor ? <Chip tono="borde">Monitor · {nombreMon(b.monitor)}</Chip> : <Chip tono="mid">Sin monitor</Chip>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetalleBloque({ b, enlace, mentor, monitor }: { b: Bloque; enlace?: string; mentor?: Persona; monitor: Persona | null }) {
  let corto = "";
  try { if (enlace) { const u = new URL(enlace); corto = u.host + u.pathname; } } catch { /* enlace inválido: no se muestra */ }
  return (
    <>
      <p className={v.muted} style={{ margin: "-6px 0 16px" }}>{rangoHoras(b.desde, b.hasta)}</p>
      <dl className={m.dl}>
        <dt>Enlace de la sala</dt>
        <dd>{enlace && corto ? <a href={enlace} target="_blank" rel="noopener noreferrer">Abrir {corto}</a> : <span className={v.sinReg}>Sin enlace</span>}</dd>
        <dt>Mentor</dt>
        <dd>{mentor?.nombre ?? b.mentorId}<span><Telefono celular={mentor?.celular} /></span></dd>
        <dt>Monitor</dt>
        <dd>{monitor ? <>{monitor.nombre}<span><Telefono celular={monitor.celular} /></span></> : <Chip tono="mid">Sin monitor</Chip>}</dd>
      </dl>
      <h3 style={{ fontSize: 15 }}>{plural(b.proyectos.length, "proyecto del bloque", "proyectos del bloque")}</h3>
      <ul className={m.listaProy}>
        {b.proyectos.map((p, i) => <li key={i}><b>{horaLarga(p.hora, p.minuto)}</b> · {p.nombre}</li>)}
      </ul>
    </>
  );
}

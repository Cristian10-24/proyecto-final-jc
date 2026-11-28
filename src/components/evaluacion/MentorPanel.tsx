"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarraDatos, esEventoCerrado, horaDatos } from "../postEvento";
import type { SessionUser } from "@/lib/auth";
import { CIUDADES, horaCO, horaUY } from "@/lib/ciudades";
import { diaCOL } from "@/lib/edicion";
import { estadoFila, primerNombre, type Resultado } from "@/lib/evaluacion/criterios";
import type { FilaEvaluacion } from "@/lib/evaluacion/datos";
import { puede } from "@/lib/permisos";
import { rangoHoras } from "@/lib/vistas/bloques";
import { plural } from "@/lib/vistas/formato";
import {
  accionFila, agruparEval, diaEval, escribirFiltrosEval, filtrarBaseEval, filtrarEstadoEval, FILTROS_EVAL_VACIOS, leerFiltrosEval,
  monitoresEval, OPCIONES_ESTADO, resumenEval, type BloqueEval, type FiltrosEval,
} from "@/lib/vistas/listaEvaluaciones";
import EvaluarHoja from "./EvaluarHoja";
import { fechaLarga } from "./comun";
import { BotonesLlamar, Buscador, Chip, ResumenBarra, Selector, Telefono, type Opcion, type Tono } from "./vistas/Basicos";
import { BarraMovil, HojaFiltros, type CampoFiltro } from "./vistas/Dialogos";
import { Cargando, ErrorCarga, Vacio } from "./vistas/Estados";
import { IcoCamara, IcoCheck } from "./vistas/Iconos";
import ShellVistas from "./vistas/ShellVistas";
import l from "./vistas/Lista.module.css";
import m from "./vistas/MisEvaluaciones.module.css";
import v from "./vistas/Vistas.module.css";

// «Mis evaluaciones» (mentor) y «Evaluaciones» (coordinación y admin), prototipos 01, 02 y 04 (docs/DISENO-VISTAS-MENTORES.md).
// Misma lectura de siempre (GET /api/evaluacion/proyectos), ahora con el monitor del bloque; filtros en la URL; por
// día y bloque de sala. Sin reloj. Se refresca cada minuto mientras no hay una evaluación abierta (el refresco nunca
// toca la evaluación). Coordinación y admin ven todo en solo lectura («Ver»).

type Datos = { filas: FilaEvaluacion[]; mentores?: { id: string; nombre: string }[] };

const TONO_RES: Record<Resultado, Tono> = { Excelente: "ok", Aprobado: "info", Incompleto: "mid", Pendiente: "idle", "No se presentó": "bad" };
const FONDO = { presente: l.presente, ausente: l.ausente, pendiente: "" } as const;
const esUY = (ciudad: string) => CIUDADES.find((c) => c.nombre === ciudad)?.pais === "UY";
const lugar = (f: FilaEvaluacion) => [f.proyecto, f.ruta ? `Ruta ${f.ruta.toLowerCase()}` : null, esUY(f.ciudad) ? `${f.ciudad} · Uruguay` : f.ciudad].filter(Boolean).join(" · ");
const tituloBloque = (b: BloqueEval) => `${b.sala !== null ? `Sala ${b.sala}` : "Sala por asignar"} · ${rangoHoras(b.desde, b.hasta)}`;
const fechaOpcion = (d: string, hoy: string) => (d === hoy ? `Hoy, ${fechaLarga(d).toLowerCase()}` : fechaLarga(d));

export default function MentorPanel({ user }: { user: SessionUser }) {
  const verTodos = puede(user, "ver_evaluaciones");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [al, setAl] = useState<number | null>(null); // modo post-evento: «Datos al …»
  const [f, setF] = useState<FiltrosEval>(FILTROS_EVAL_VACIOS);
  const [listoUrl, setListoUrl] = useState(false);
  const [hoja, setHoja] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const scroll = useRef(0);

  // Filtros: se leen de la URL al abrir y se escriben en ella al cambiar.
  useEffect(() => { setF(leerFiltrosEval(window.location.search)); setListoUrl(true); }, []);
  useEffect(() => {
    if (listoUrl) window.history.replaceState(null, "", `${window.location.pathname}${escribirFiltrosEval(f)}`);
  }, [f, listoUrl]);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluacion/proyectos", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setAl(horaDatos(res));
      setCarga("listo");
    } catch {
      setCarga((c) => (c === "listo" ? c : "error"));
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    if (abierto || esEventoCerrado()) return; // el refresco nunca toca una evaluación abierta; modo post-evento: sin refresco
    const t = setInterval(() => void cargar(), 60_000);
    return () => clearInterval(t);
  }, [cargar, abierto]);

  const abrir = (id: string) => { scroll.current = window.scrollY; setAbierto(id); };
  const cerrar = (cambio: boolean) => {
    setAbierto(null);
    if (cambio) void cargar();
    requestAnimationFrame(() => window.scrollTo(0, scroll.current));
  };

  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const hoy = diaCOL(new Date());
  const dias = useMemo(() => [...new Set(filas.map((x) => x.dia))].sort(), [filas]);
  const dia = diaEval(f, dias, hoy);
  const base = filtrarBaseEval(filas, f, dia);
  const visibles = filtrarEstadoEval(base, f.estado);
  const grupos = agruparEval(visibles);
  const r = resumenEval(base);
  const nombreMentor = new Map((datos?.mentores ?? []).map((x) => [x.id, x.nombre]));
  const soloLectura = (x: FilaEvaluacion) => verTodos && x.mentorId !== user.mentorId;

  const mon = monitoresEval(filas.filter((x) => dia === "todos" || x.dia === dia));
  const opDia: Opcion[] = [{ valor: "todos", texto: "Todas las fechas" }, ...dias.map((d) => ({ valor: d, texto: fechaOpcion(d, hoy) }))];
  const opEstado: Opcion[] = OPCIONES_ESTADO.map((o) => ({ valor: o.valor, texto: o.texto }));
  const opCiudad: Opcion[] = [{ valor: "", texto: "Todas las ciudades" }, ...[...new Set(filas.map((x) => x.ciudad))].sort((a, b) => a.localeCompare(b, "es")).map((c) => ({ valor: c, texto: c }))];
  const opMentor: Opcion[] = [{ valor: "", texto: "Todos los mentores" }, ...(datos?.mentores ?? []).map((x) => ({ valor: x.id, texto: x.nombre }))];
  const opMonitor: Opcion[] = [{ valor: "", texto: "Todos los monitores" }, ...mon.nombres.map((n) => ({ valor: n, texto: n })), ...(mon.hayVacios ? [{ valor: "sin", texto: "Sin monitor" }] : [])];
  const campos: CampoFiltro[] = [
    { id: "dia", etiqueta: "Fecha", opciones: opDia }, { id: "estado", etiqueta: "Estado", opciones: opEstado },
    ...(verTodos ? [{ id: "ciudad", etiqueta: "Ciudad", opciones: opCiudad }, { id: "mentor", etiqueta: "Mentor", opciones: opMentor }] : []),
    { id: "monitor", etiqueta: "Monitor", opciones: opMonitor },
  ];
  const poner = (k: keyof FiltrosEval) => (x: string) => setF((y) => ({ ...y, [k]: x }));
  const activos = (["estado", "ciudad", "mentor", "monitor"] as const).filter((k) => f[k]).length + (f.dia ? 1 : 0);
  const limpiar = () => setF({ ...FILTROS_EVAL_VACIOS, dia: "todos" });

  const titulo = verTodos ? "Evaluaciones" : `Hola, ${primerNombre(user.nombre)}`;
  const lead = verTodos ? "Todas las evaluaciones, por día y sala. Hora Colombia (COL)." : "Tus estudiantes de la jornada. Toca «Evaluar» cuando empiece cada presentación. Hora Colombia (COL).";

  const especial = (() => {
    if (carga === "cargando" && !datos) return <div className={v.pad}><Cargando /></div>;
    if (carga === "error" && !datos) return <ErrorCarga titulo="No se pudo cargar la lista" onReintentar={() => { setCarga("cargando"); void cargar(); }} />;
    if (datos && !filas.length)
      return verTodos
        ? <Vacio titulo="Todavía no hay proyectos con hora" texto="Cuando los estudiantes elijan hora, aparecerán aquí." />
        : <Vacio titulo="No tienes estudiantes asignados todavía" texto="Coordinación debe registrarte con tu nombre escrito igual que en la hoja de horarios." />;
    return null;
  })();
  const sinResultados = !grupos.length && (
    <div className={v.tarjeta}>
      <Vacio titulo="No hay estudiantes con esos filtros" texto="Prueba con otro nombre o emprendimiento, o cambia la fecha, el estado o el monitor." accion={{ texto: "Limpiar filtros", onClick: limpiar }} />
    </div>
  );
  const props = { verTodos, nombreMentor, soloLectura, onAbrir: abrir };

  return (
    <ShellVistas user={user} active="evaluaciones">
      {!abierto && <BarraDatos al={al} cargar={cargar} />}
      {abierto ? null : (
        <>
          {!especial && <div className={v.soloMovil}><BarraMovil buscar={f.q} onBuscar={poner("q")} placeholder="Participante o emprendimiento" onFiltros={() => setHoja(true)} activos={activos} /></div>}
          {especial ?? (
            <>
              {/* ---- Web ---- */}
              <div className={v.soloWeb}>
                <div className={v.cabeza}><div><h1>{titulo}</h1><p>{lead}</p></div></div>
                <Resumen r={r} />
                <div className={`${v.tarjeta} ${m.filtros}`}>
                  <Selector id="me-dia" etiqueta="Fecha" valor={dia} opciones={opDia} onCambio={poner("dia")} />
                  <Selector id="me-estado" etiqueta="Estado" valor={f.estado} opciones={opEstado} onCambio={poner("estado")} />
                  {verTodos && <Selector id="me-ciudad" etiqueta="Ciudad" valor={f.ciudad} opciones={opCiudad} onCambio={poner("ciudad")} />}
                  {verTodos && <Selector id="me-mentor" etiqueta="Mentor" valor={f.mentor} opciones={opMentor} onCambio={poner("mentor")} />}
                  <Selector id="me-monitor" etiqueta="Monitor" valor={f.monitor} opciones={opMonitor} onCambio={poner("monitor")} />
                  <div className={m.buscarAncho}><Buscador valor={f.q} onCambio={poner("q")} placeholder="Buscar por participante o emprendimiento" /></div>
                </div>
                {sinResultados || grupos.map((g) => (
                  <section key={g.dia} className={m.dia} aria-label={fechaLarga(g.dia)}>
                    <h2 className={m.diaTitulo}>{fechaLarga(g.dia)}{g.dia === hoy && <Chip tono="naranja">Hoy</Chip>}</h2>
                    {g.bloques.map((b) => <GrupoWeb key={b.clave} b={b} {...props} />)}
                  </section>
                ))}
              </div>

              {/* ---- Móvil ---- */}
              <div className={v.soloMovil}>
                <div className={l.movilCab}>
                  <div><h1>{titulo}</h1><p>{dia === "todos" ? "Todas las fechas" : fechaOpcion(dia, hoy)} · Hora COL</p></div>
                </div>
                <div className={l.movilCuerpo}>
                  <Resumen r={r} corto />
                  {sinResultados || grupos.map((g) => (
                    <section key={g.dia} aria-label={fechaLarga(g.dia)}>
                      {dia === "todos" && <h2 className={m.diaTituloMovil}>{fechaLarga(g.dia)}{g.dia === hoy && <Chip tono="naranja">Hoy</Chip>}</h2>}
                      {g.bloques.map((b) => <GrupoMovil key={b.clave} b={b} {...props} />)}
                    </section>
                  ))}
                </div>
              </div>
            </>
          )}
          {hoja && (
            <HojaFiltros campos={campos} valores={{ ...f, dia }} porDefecto={{ ...FILTROS_EVAL_VACIOS, dia: "todos" }} onCerrar={() => setHoja(false)}
              onAplicar={(x) => setF({ ...f, dia: x.dia ?? "", estado: (x.estado ?? "") as FiltrosEval["estado"], ciudad: x.ciudad ?? "", mentor: x.mentor ?? "", monitor: x.monitor ?? "" })} />
          )}
        </>
      )}
      {abierto && <EvaluarHoja id={abierto} usuario={user.usuario} onCerrar={cerrar} />}
    </ShellVistas>
  );
}

function Resumen({ r, corto }: { r: ReturnType<typeof resumenEval>; corto?: boolean }) {
  if (!r.estudiantes) return null;
  return (
    <ResumenBarra total={r.estudiantes}
      izquierda={<><b>{plural(r.estudiantes, "estudiante", "estudiantes")}</b> · {r.evaluados} {r.evaluados === 1 ? "evaluado" : "evaluados"} · {r.ausentes} {corto ? "no" : r.ausentes === 1 ? "no se presentó" : "no se presentaron"} · {plural(r.pendientes, "pendiente", "pendientes")}</>}
      derecha={corto ? undefined : <>{r.pct} % listo</>}
      partes={[{ valor: r.evaluados, tono: "ok" }, { valor: r.ausentes, tono: "bad" }]} />
  );
}

type PropsGrupo = { b: BloqueEval; verTodos: boolean; nombreMentor: Map<string, string>; soloLectura: (x: FilaEvaluacion) => boolean; onAbrir: (id: string) => void };

function AbrirSala({ enlace, chico }: { enlace: string | null; chico?: boolean }) {
  return enlace ? <a className={`${v.btn} ${v.btnNegro} ${chico ? m.btnChico : ""}`} href={enlace} target="_blank" rel="noopener noreferrer"><IcoCamara />Abrir sala</a> : null;
}

/** «Monitor a cargo · Nombre · celular» con Llamar y WhatsApp (sin texto prellenado), o «Sin monitor». */
function MonitorACargo({ b, corto }: { b: BloqueEval; corto?: boolean }) {
  const x = b.monitor;
  return (
    <div className={m.monitor}>
      {corto
        ? <div className={m.monitorCorto}><span className={v.muted}>Monitor · </span>{x ? <><b>{x.nombre}</b><br /><Telefono celular={x.celular} /></> : <b>Sin monitor</b>}</div>
        : <div className={m.monitorTxt}><span className={`${v.small} ${v.muted}`}>Monitor a cargo</span><span className={v.small}>{x ? <><b>{x.nombre}</b> · <Telefono celular={x.celular} /></> : <b>Sin monitor</b>}</span></div>}
      <span className={l.iconos}>{x && <BotonesLlamar celular={x.celular} nombre={x.nombre} />}</span>
    </div>
  );
}

function ChipsResultado({ x }: { x: FilaEvaluacion }) {
  const pareja = x.integrantes.length > 1;
  const quien = (n: string) => (pareja ? `${primerNombre(n)}: ` : "");
  return (
    <div className={m.chips}>
      {x.integrantes.map((i) => <Chip key={i.i} tono={TONO_RES[i.res]}>{quien(i.nombre)}{i.res}</Chip>)}
      {x.destacado && <Chip tono="naranja">★ Destacado</Chip>}
      {x.integrantes.filter((i) => i.res === "No se presentó").map((i) => (
        <Chip key={`m${i.i}`} tono={i.motivo ? "borde" : "mid"}>{quien(i.nombre)}{i.motivo ? `Motivo: ${i.motivo}` : "Sin motivo"}</Chip>
      ))}
      {x.borrador && x.integrantes.some((i) => i.res === "Pendiente") && <Chip tono="borde">Borrador sin guardar</Chip>}
    </div>
  );
}

function Hora({ x }: { x: FilaEvaluacion }) {
  const d = new Date(x.inicio);
  return <div className={l.horaCel}><span className={v.hora}>{horaCO(d)}</span>{esUY(x.ciudad) && <Chip tono="info">{horaUY(d)} UY</Chip>}</div>;
}

function BotonAccion({ x, solo, movil, onAbrir }: { x: FilaEvaluacion; solo: boolean; movil?: boolean; onAbrir: (id: string) => void }) {
  const a = accionFila(x, solo);
  const nombres = x.integrantes.map((i) => i.nombre).join(" y ");
  const texto = movil && a !== "Evaluar" ? `${a} evaluación` : a;
  const aria = a === "Evaluar" ? `Evaluar a ${nombres}` : `${a} evaluación de ${nombres}`;
  return (
    <button type="button" className={`${v.btn} ${m.accion} ${a === "Evaluar" ? v.btnPri : ""} ${movil ? m.accionMovil : ""}`} aria-label={aria} onClick={() => onAbrir(x.id)}>
      <IcoCheck />{texto}
    </button>
  );
}

export function GrupoWeb({ b, verTodos, nombreMentor, soloLectura, onAbrir }: PropsGrupo) {
  return (
    <section className={l.grupo} aria-label={tituloBloque(b)}>
      <div className={m.ghead}>
        <div>
          <h3 className={m.gtitulo}>{tituloBloque(b)}</h3>
          <p className={`${v.small} ${v.muted}`}>{plural(b.filas.length, "proyecto", "proyectos")}{verTodos && <> · Mentor: <b className={m.tinta}>{nombreMentor.get(b.mentorId) ?? b.mentorId}</b></>}</p>
        </div>
        <MonitorACargo b={b} />
        <span className={l.gacc}><AbrirSala enlace={b.enlace} /></span>
      </div>
      <div className={`${l.thead} ${m.cols}`} aria-hidden="true"><span /><span>Hora</span><span>Participantes y proyecto</span><span>Resultado</span></div>
      {b.filas.map((x) => (
        <div key={x.id} className={`${l.fila} ${m.cols} ${FONDO[estadoFila(x.integrantes)]}`}>
          <div><BotonAccion x={x} solo={soloLectura(x)} onAbrir={onAbrir} /></div>
          <Hora x={x} />
          <div className={m.celda}>
            <p className={m.nombres}>{x.integrantes.map((i) => i.nombre).join(" y ")}</p>
            <p className={`${v.small} ${v.muted}`}>{lugar(x)}{x.integrantes.length > 1 ? " · En pareja" : ""}</p>
          </div>
          <ChipsResultado x={x} />
        </div>
      ))}
    </section>
  );
}

export function GrupoMovil({ b, verTodos, nombreMentor, soloLectura, onAbrir }: PropsGrupo) {
  return (
    <section className={l.grupoMovil} aria-label={tituloBloque(b)}>
      <div className={m.gheadMovil}>
        <div className={m.gheadMovilFila}>
          <div className={m.celda}>
            <h3 className={m.gtituloMovil}>{tituloBloque(b)}</h3>
            <p className={`${v.small} ${v.muted}`}>{plural(b.filas.length, "proyecto", "proyectos")}{verTodos ? ` · ${nombreMentor.get(b.mentorId) ?? b.mentorId}` : ""}</p>
          </div>
          <AbrirSala enlace={b.enlace} chico />
        </div>
        <MonitorACargo b={b} corto />
      </div>
      <div className={l.tarjetas}>
        {b.filas.map((x) => (
          <article key={x.id} className={`${l.tarjeta} ${m.tarjeta} ${FONDO[estadoFila(x.integrantes)]}`}>
            <Hora x={x} />
            <div>
              <p className={m.nombresMovil}>{x.integrantes.map((i) => i.nombre).join(" y ")}</p>
              <p className={`${v.small} ${v.muted}`}>{lugar(x)}{x.integrantes.length > 1 ? " · En pareja" : ""}</p>
            </div>
            <ChipsResultado x={x} />
            <BotonAccion x={x} solo={soloLectura(x)} movil onAbrir={onAbrir} />
          </article>
        ))}
      </div>
    </section>
  );
}

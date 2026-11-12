"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { CIUDADES } from "@/lib/ciudades";
import { diaCOL } from "@/lib/edicion";
import { puede } from "@/lib/permisos";
import { estadoFila, primerNombre } from "@/lib/evaluacion/criterios";
import type { FilaSala, SalaMonitor } from "@/lib/evaluacion/monitor";
import type { MonitorRef, VistaMisProyectos } from "@/lib/misProyectos";
import { rangoHoras } from "@/lib/vistas/bloques";
import { plural } from "@/lib/vistas/formato";
import {
  agruparBloques, comoPersona, desdeMisProyectos, diaAplicado, escribirFiltros, estadoAsistencia, filtrarBase, filtrarEstado,
  FILTROS_VACIOS, leerFiltros, resumen, TEXTO_ASIS, unirLecturas, type BloqueLista, type EstadoAsis, type FilaLista, type Filtros,
} from "@/lib/vistas/listaProyectos";
import { fechaLarga } from "../comun";
import { BotonesLlamar, Buscador, Chip, ResumenBarra, Selector, Telefono, type Opcion, type Tono } from "./Basicos";
import { BarraMovil, HojaFiltros, type CampoFiltro } from "./Dialogos";
import { Cargando, ErrorCarga, Vacio } from "./Estados";
import { IcoCamara } from "./Iconos";
import ShellVistas from "./ShellVistas";
import l from "./Lista.module.css";
import v from "./Vistas.module.css";

// Fase 6 · Entrega B · «Mis proyectos» (fusiona «Mis salas» y «Mis proyectos»; prototipos 01/02 sin reloj).
// Monitor: une las dos lecturas que ya existen (GET /api/evaluacion/salas y GET /api/monitor/mis-proyectos) y cada
// fila tiene «Gestionar», que lleva a /monitor/proyectos/[id]. Coordinación y admin: solo la segunda lectura, con el
// filtro «Monitor» y sin «Gestionar» ni asistencia, como hoy. Los filtros viven en la URL. Nada se escribe aquí.

export const CLAVE_VOLVER = "pfjc-mis-proyectos-url";
const ESTADOS: Opcion[] = [
  { valor: "", texto: "Todos los estados" }, { valor: "pendientes", texto: "Pendientes" }, { valor: "presentes", texto: "Se presentaron" },
  { valor: "ausentes", texto: "No se presentaron" }, { valor: "sinMotivo", texto: "Inasistencias sin motivo registrado" },
];
const TONO_ASIS: Record<EstadoAsis, Tono> = { evaluado: "ok", presente: "ok", ausente: "bad", pendiente: "idle" };
const esUY = (ciudad: string) => CIUDADES.find((c) => c.nombre === ciudad)?.pais === "UY";
const FONDO = { presente: l.presente, ausente: l.ausente, pendiente: "" } as const;

type Datos = { todos: boolean; filas: FilaLista[]; dias: string[]; monitores: MonitorRef[]; diaServidor: string | null };

export default function MisProyectosVista({ user }: { user: SessionUser }) {
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  const [listoUrl, setListoUrl] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [hoja, setHoja] = useState(false);
  // Quien es monitor (también como rol adicional) ve sus salas con «Gestionar»; coordinación y admin, todos sin él.
  const todosRol = !puede(user, "monitorear_salas");

  // Filtros: se leen de la URL al abrir y se escriben en ella al cambiar (para volver desde el detalle).
  useEffect(() => { setF(leerFiltros(window.location.search)); setListoUrl(true); }, []);
  useEffect(() => {
    if (!listoUrl) return;
    const url = `${window.location.pathname}${escribirFiltros(f)}`;
    window.history.replaceState(null, "", url);
    try { sessionStorage.setItem(CLAVE_VOLVER, url); } catch { /* sin almacenamiento */ }
  }, [f, listoUrl]);

  const cargar = useCallback(async (dia: string) => {
    try {
      const pedir = async (u: string) => {
        const r = await fetch(u, { cache: "no-store" });
        if (r.status === 401) { window.location.assign("/login"); throw new Error("sesion"); }
        if (!r.ok) throw new Error();
        return r.json();
      };
      if (todosRol) {
        const mis: VistaMisProyectos = await pedir(`/api/monitor/mis-proyectos${dia ? `?dia=${encodeURIComponent(dia)}` : ""}`);
        setDatos({ todos: true, filas: desdeMisProyectos(mis.proyectos), dias: mis.dias, monitores: mis.monitores, diaServidor: mis.dia });
      } else {
        const [salas, mis]: [{ salas: SalaMonitor[]; filas: FilaSala[] }, VistaMisProyectos] =
          await Promise.all([pedir("/api/evaluacion/salas"), pedir("/api/monitor/mis-proyectos?dia=todos")]);
        const filas = unirLecturas(salas.filas, salas.salas, mis.proyectos);
        setDatos({ todos: false, filas, dias: [...new Set(filas.map((x) => x.dia))].sort(), monitores: [], diaServidor: null });
      }
      setCarga("listo");
    } catch {
      setCarga((x) => (x === "listo" ? x : "error"));
    }
  }, [todosRol]);

  // Coordinación y admin cargan solo el día elegido (como hoy); el monitor carga sus salas de todos los días.
  const diaPedido = todosRol ? f.dia : "";
  useEffect(() => { if (listoUrl) void cargar(diaPedido); }, [cargar, diaPedido, listoUrl]);
  useEffect(() => {
    if (!listoUrl || hoja) return;
    const t = setInterval(() => void cargar(diaPedido), 60_000);
    return () => clearInterval(t);
  }, [cargar, diaPedido, listoUrl, hoja]);

  const hoy = diaCOL(new Date());
  const dias = datos?.dias ?? [];
  const dia = datos?.todos ? (f.dia || datos.diaServidor || "todos") : diaAplicado(f, dias, hoy);
  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const base = filtrarBase(filas, f, dia);
  const visibles = datos?.todos ? base : filtrarEstado(base, f.estado);
  const bloques = agruparBloques(visibles);
  const r = resumen(base);
  const verTodos = dia === "todos";

  const opDia: Opcion[] = [{ valor: "todos", texto: "Todos los días" }, ...dias.map((d) => ({ valor: d, texto: `${d === hoy ? "Hoy, " : ""}${d === hoy ? fechaLarga(d).toLowerCase() : fechaLarga(d)}` }))];
  const opCiudad: Opcion[] = [{ valor: "", texto: "Todas las ciudades" }, ...[...new Set(filas.map((x) => x.ciudad))].sort((a, b) => a.localeCompare(b, "es")).map((c) => ({ valor: c, texto: c }))];
  const opSala: Opcion[] = [{ valor: "", texto: "Todas las salas" }, ...[...new Set(filas.flatMap((x) => (x.sala === null ? [] : [x.sala])))].sort((a, b) => a - b).map((s) => ({ valor: String(s), texto: `Sala ${s}` }))];
  const opMon: Opcion[] = [{ valor: "", texto: "Todos los monitores" }, { valor: "sin", texto: "Sin monitor" }, ...(datos?.monitores ?? []).map((m) => ({ valor: m.usuario, texto: m.nombre }))];
  const campos: CampoFiltro[] = [
    { id: "dia", etiqueta: "Día", opciones: opDia }, { id: "ciudad", etiqueta: "Ciudad", opciones: opCiudad }, { id: "sala", etiqueta: "Sala", opciones: opSala },
    datos?.todos ? { id: "monitor", etiqueta: "Monitor", opciones: opMon } : { id: "estado", etiqueta: "Estado", opciones: ESTADOS },
  ];
  const poner = (k: keyof Filtros) => (x: string) => setF((y) => ({ ...y, [k]: x }));
  const activos = (["ciudad", "sala", "estado", "monitor"] as const).filter((k) => f[k]).length + (f.dia ? 1 : 0);
  const limpiar = () => setF(FILTROS_VACIOS);
  const texto = datos?.todos
    ? "Todos los proyectos con hora, con su sala, integrantes y mentor. Hora Colombia (COL)."
    : "Tus salas y sus proyectos, de cualquier ciudad. Toca Gestionar para ver los datos y marcar asistencia.";

  const especial = (() => {
    if (carga === "cargando" && !datos) return <div className={v.pad}><Cargando /></div>;
    if (carga === "error" && !datos) return <ErrorCarga titulo="No pudimos cargar tus proyectos" onReintentar={() => { setCarga("cargando"); void cargar(diaPedido); }} />;
    if (datos && !datos.dias.length)
      return datos.todos
        ? <Vacio titulo="Todavía no hay proyectos con hora" texto="Aparecerán aquí cuando los estudiantes elijan su hora." />
        : <Vacio titulo="Aún no tienes salas asignadas" texto="Cuando coordinación te asigne salas, aquí verás sus proyectos de cualquier ciudad. Si crees que es un error, escríbele a coordinación." accion={{ texto: "Ir a Mi ciudad", href: "/monitor/ciudad" }} />;
    return null;
  })();

  const lista = !bloques.length
    ? <div className={v.tarjeta}><Vacio titulo="No hay proyectos con esos filtros" texto="Prueba con otro nombre de proyecto o de integrante, o cambia el día, la ciudad, la sala o el estado." accion={{ texto: "Limpiar filtros", onClick: limpiar }} /></div>
    : null;

  return (
    <ShellVistas user={user} active="proyectos">
      {!especial && <div className={v.soloMovil}><BarraMovil buscar={f.q} onBuscar={poner("q")} placeholder="Proyecto o integrante" onFiltros={() => setHoja(true)} activos={activos} /></div>}
      {especial ?? (
        <>
          {/* ---- Web ---- */}
          <div className={v.soloWeb}>
            <div className={v.cabeza}><div><h1>Hola, {primerNombre(user.nombre)}</h1><p>{texto}</p></div></div>
            {!datos?.todos && r.estudiantes > 0 && (
              <ResumenBarra total={r.estudiantes}
                izquierda={<><b>{plural(r.proyectos, "proyecto", "proyectos")}</b> · {plural(r.estudiantes, "estudiante", "estudiantes")}: {r.presentes} se {r.presentes === 1 ? "presentó" : "presentaron"} · {r.ausentes} no se {r.ausentes === 1 ? "presentó" : "presentaron"} · {plural(r.pendientes, "pendiente", "pendientes")}</>}
                derecha={<>{r.pct} % con asistencia</>}
                partes={[{ valor: r.presentes, tono: "ok" }, { valor: r.ausentes, tono: "bad" }]} />
            )}
            <div className={`${v.tarjeta} ${v.filtros}`}>
              <Selector id="mp-dia" etiqueta="Día" valor={dia} opciones={opDia} onCambio={poner("dia")} />
              <Selector id="mp-ciudad" etiqueta="Ciudad" valor={f.ciudad} opciones={opCiudad} onCambio={poner("ciudad")} />
              <Selector id="mp-sala" etiqueta="Sala" valor={f.sala} opciones={opSala} onCambio={poner("sala")} />
              {datos?.todos
                ? <Selector id="mp-mon" etiqueta="Monitor" valor={f.monitor} opciones={opMon} onCambio={poner("monitor")} />
                : <Selector id="mp-estado" etiqueta="Estado" valor={f.estado} opciones={ESTADOS} onCambio={poner("estado")} />}
              <div style={{ flexBasis: "100%", height: 0 }} />
              <Buscador valor={f.q} onCambio={poner("q")} placeholder="Buscar por proyecto o integrante" />
            </div>
            {lista ?? bloques.map((b) => <GrupoWeb key={b.clave} b={b} todos={!!datos?.todos} verDia={verTodos} />)}
          </div>

          {/* ---- Móvil ---- */}
          <div className={v.soloMovil}>
            <div className={l.movilCab}>
              <div><h1>Hola, {primerNombre(user.nombre)}</h1><p>{verTodos ? "Todos los días" : fechaLarga(dia)} · Hora COL</p></div>
            </div>
            <div className={l.movilCuerpo}>
              {!datos?.todos && r.estudiantes > 0 && (
                <ResumenBarra total={r.estudiantes}
                  izquierda={<><b>{plural(r.proyectos, "proyecto", "proyectos")}</b> · {r.presentes} se {r.presentes === 1 ? "presentó" : "presentaron"} · {r.ausentes} no · {plural(r.pendientes, "pendiente", "pendientes")}</>}
                  partes={[{ valor: r.presentes, tono: "ok" }, { valor: r.ausentes, tono: "bad" }]} />
              )}
              {lista ?? bloques.map((b) => <GrupoMovil key={b.clave} b={b} todos={!!datos?.todos} verDia={verTodos} />)}
            </div>
          </div>
        </>
      )}
      {hoja && (
        <HojaFiltros campos={campos} valores={{ ...f, dia }} porDefecto={{ ...FILTROS_VACIOS }} onCerrar={() => setHoja(false)}
          onAplicar={(x) => setF({ ...f, dia: x.dia ?? "", ciudad: x.ciudad ?? "", sala: x.sala ?? "", estado: (x.estado ?? "") as Filtros["estado"], monitor: x.monitor ?? "" })} />
      )}
    </ShellVistas>
  );
}

const tituloBloque = (b: BloqueLista, verDia: boolean) =>
  `${verDia ? `${fechaLarga(b.dia)} · ` : ""}${b.sala !== null ? `Sala ${b.sala}` : "Sala por asignar"} · ${rangoHoras(b.desde, b.hasta)}`;

function AbrirSala({ enlace }: { enlace: string | null }) {
  return enlace ? <a className={`${v.btn} ${v.btnPri}`} href={enlace} target="_blank" rel="noopener noreferrer"><IcoCamara />Abrir sala</a> : null;
}

function Mentor({ b }: { b: BloqueLista }) {
  return (
    <span className={l.gmentor}>
      <span>Mentor · <b>{b.mentor.nombre}</b> · <Telefono celular={b.mentor.celular} /></span>
      <BotonesLlamar celular={b.mentor.celular} nombre={b.mentor.nombre} />
    </span>
  );
}

function GrupoWeb({ b, todos, verDia }: { b: BloqueLista; todos: boolean; verDia: boolean }) {
  const cols = todos ? l.sinGestion : l.conGestion;
  return (
    <section className={l.grupo} aria-label={tituloBloque(b, verDia)}>
      <div className={l.ghead}>
        <h2>{tituloBloque(b, verDia)}</h2>
        <Chip tono="borde">{plural(b.filas.length, "proyecto", "proyectos")}</Chip>
        <Mentor b={b} />
        {todos && <span className={l.sub}>Monitor · {b.monitor?.nombre ?? "Por asignar"}</span>}
        <span className={l.gacc}><AbrirSala enlace={b.enlace} /></span>
      </div>
      <div className={`${l.thead} ${cols}`} aria-hidden="true">
        {!todos && <span>Acción</span>}<span>Hora</span><span>Proyecto e integrantes</span>{!todos && <span>Asistencia</span>}
      </div>
      {b.filas.map((x) => <FilaWeb key={x.id} x={x} todos={todos} cols={cols} />)}
    </section>
  );
}

function Lugar({ x }: { x: FilaLista }) {
  return <div className={l.sub}>{[x.ciudad, esUY(x.ciudad) ? "Uruguay" : null, x.ruta ? `Ruta ${x.ruta.toLowerCase()}` : null].filter(Boolean).join(" · ")}</div>;
}

function Hora({ x }: { x: FilaLista }) {
  return <div className={l.horaCel}><span className={v.hora}>{x.horaTxt}</span>{x.horaUY && <Chip tono="info">{x.horaUY} UY</Chip>}</div>;
}

function Chips({ x }: { x: FilaLista }) {
  const pareja = x.integrantes.length > 1;
  const quien = (n: string) => (pareja ? `${primerNombre(n)}: ` : "");
  return (
    <div className={l.chips}>
      {x.integrantes.map((i, k) => { const e = estadoAsistencia(i); return <Chip key={k} tono={TONO_ASIS[e]}>{quien(i.nombre)}{TEXTO_ASIS[e]}</Chip>; })}
      {x.integrantes.filter((i) => estadoAsistencia(i) === "ausente").map((i, k) => (
        <Chip key={`m${k}`} tono={i.motivo ? "borde" : "mid"}>{quien(i.nombre)}{i.motivo ? `Motivo: ${i.motivo}` : "Sin motivo"}</Chip>
      ))}
      {x.destacado && <Chip tono="naranja">Destacado</Chip>}
      {x.sugerencia && <Chip tono="mid">Cambio sugerido</Chip>}
    </div>
  );
}

const fondo = (x: FilaLista, todos: boolean) => (todos ? "" : FONDO[estadoFila(x.integrantes.map(comoPersona))]);

function FilaWeb({ x, todos, cols }: { x: FilaLista; todos: boolean; cols: string }) {
  return (
    <div className={`${l.fila} ${cols} ${fondo(x, todos)}`}>
      {!todos && <div><a className={`${v.btn} ${l.gestionar}`} href={`/monitor/proyectos/${x.id}`} aria-label={`Gestionar ${x.proyecto}`}>Gestionar ›</a></div>}
      <Hora x={x} />
      <div className={l.celdaProy}>
        <div className={l.subcols}>
          <div><div className={l.proy}>{x.proyecto}{x.integrantes.length > 1 && <Chip tono="borde">En pareja</Chip>}</div><Lugar x={x} /></div>
          <div className={l.ints}>
            {x.integrantes.map((i, k) => (
              <div key={k} className={l.int}><span>{i.nombre} <span className={v.muted}>· <Telefono celular={i.celular} /></span></span><BotonesLlamar celular={i.celular} nombre={i.nombre} /></div>
            ))}
          </div>
        </div>
      </div>
      {!todos && <Chips x={x} />}
    </div>
  );
}

function GrupoMovil({ b, todos, verDia }: { b: BloqueLista; todos: boolean; verDia: boolean }) {
  return (
    <section className={l.grupoMovil} aria-label={tituloBloque(b, verDia)}>
      <div className={l.gheadMovil}>
        <div>
          <h2>{tituloBloque(b, verDia)}</h2>
          <div className={l.sub}>{plural(b.filas.length, "proyecto", "proyectos")}{todos ? ` · Monitor: ${b.monitor?.nombre ?? "Por asignar"}` : ""}</div>
          <div className={l.sub}>Mentor · <b>{b.mentor.nombre}</b></div>
          <div className={l.sub}><Telefono celular={b.mentor.celular} /></div>
        </div>
        <div className={l.gaccMovil}><AbrirSala enlace={b.enlace} /><BotonesLlamar celular={b.mentor.celular} nombre={b.mentor.nombre} /></div>
      </div>
      <div className={l.tarjetas}>
        {b.filas.map((x) => (
          <article key={x.id} className={`${l.tarjeta} ${fondo(x, todos)}`}>
            <div className={l.tarjetaHora}><span className={v.hora}>{x.horaTxt}</span>{x.horaUY && <Chip tono="info">{x.horaUY} UY</Chip>}</div>
            <div className={l.proy}>{x.proyecto}</div>
            <Lugar x={x} />
            {x.integrantes.length > 1 && <Chip tono="borde">En pareja</Chip>}
            {todos
              ? x.integrantes.map((i, k) => <div key={k} className={l.int}><span>{i.nombre} · <Telefono celular={i.celular} /></span><BotonesLlamar celular={i.celular} nombre={i.nombre} /></div>)
              : <><Chips x={x} /><a className={`${v.btn} ${l.gestionar}`} href={`/monitor/proyectos/${x.id}`} aria-label={`Gestionar ${x.proyecto}`}>Gestionar ›</a></>}
          </article>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { coincide, plural, porcentaje } from "@/lib/vistas/formato";
import { chipsExtra, contarEstudiantes, filtrarPorEstado, ordenar, type FiltroEstado } from "@/lib/vistas/conteoCiudad";
import type { FilaMiCiudad, VistaMiCiudad } from "@/lib/vistas/miCiudad";
import { fechaLarga } from "../comun";
import { BotonesLlamar, Buscador, Chip, ChipEstado, ResumenBarra, Selector, TarjetasFiltro, Telefono, type Opcion } from "./Basicos";
import { BarraMovil, HojaFiltros, type CampoFiltro } from "./Dialogos";
import { Cargando, ErrorCarga, Vacio } from "./Estados";
import ShellVistas from "./ShellVistas";
import m from "./MiCiudad.module.css";
import v from "./Vistas.module.css";

// Fase 6 · «Mi ciudad» (monitor, solo lectura; prototipos 03/04): los proyectos con hora de su ciudad y SOLO el
// estado (Evaluado, Pendiente, No se presentó). Los proyectos sin hora no aparecen (siguen en el Panel). Ninguna
// acción escribe: solo Llamar y WhatsApp. Se refresca cada minuto.

type Orden = "pendientes" | "hora";
const POR_DEFECTO = { estado: "todos", dia: "", sala: "", orden: "pendientes" };
const fmtCorto = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" });
/** 'YYYY-MM-DD' → "Jue 12". */
const diaCorto = (dia: string) => { const t = fmtCorto.format(new Date(dia + "T12:00:00Z")).replace(/[.,]/g, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const salaTxt = (s: number | null) => (s === null ? "Sala por asignar" : `Sala ${s}`);

export default function MiCiudadPanel({ user }: { user: SessionUser }) {
  const [datos, setDatos] = useState<VistaMiCiudad | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [ciudad, setCiudad] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>(POR_DEFECTO);
  const [q, setQ] = useState("");
  const [hoja, setHoja] = useState(false);

  const cargar = useCallback(async (c: string | null) => {
    try {
      const res = await fetch(`/api/monitor/mi-ciudad${c ? `?ciudad=${encodeURIComponent(c)}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setCarga("listo");
    } catch {
      setCarga((x) => (x === "listo" ? x : "error"));
    }
  }, []);
  useEffect(() => { void cargar(ciudad); }, [cargar, ciudad]);
  useEffect(() => {
    if (hoja) return;
    const t = setInterval(() => void cargar(ciudad), 60_000);
    return () => clearInterval(t);
  }, [cargar, ciudad, hoja]);

  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const dias = useMemo(() => [...new Set(filas.map((x) => x.dia))].sort(), [filas]);
  const salas = useMemo(() => [...new Set(filas.flatMap((x) => (x.sala === null ? [] : [x.sala])))].sort((a, b) => a - b), [filas]);

  // Día, sala y búsqueda definen el conjunto; las tarjetas cuentan sobre él y el estado filtra la lista.
  const base = filas.filter((x) => (!f.dia || x.dia === f.dia) && (!f.sala || String(x.sala) === f.sala)
    && coincide([x.proyecto, ...x.integrantes.map((i) => i.nombre)], q));
  // Opción B: las tarjetas y la barra cuentan ESTUDIANTES (una pareja suma 2); el filtro lista los proyectos con al
  // menos un integrante en ese estado (una pareja mixta sale en dos filtros).
  const n = contarEstudiantes(base);
  const lista = ordenar(filtrarPorEstado(base, f.estado as FiltroEstado), f.orden as Orden);

  const opDia: Opcion[] = [{ valor: "", texto: "Todos los días" }, ...dias.map((d) => ({ valor: d, texto: fechaLarga(d) }))];
  const opSala: Opcion[] = [{ valor: "", texto: "Todas las salas" }, ...salas.map((s) => ({ valor: String(s), texto: `Sala ${s}` }))];
  const opOrden: Opcion[] = [{ valor: "pendientes", texto: "Pendientes primero" }, { valor: "hora", texto: "Por fecha y hora" }];
  const opEstado: Opcion[] = [{ valor: "todos", texto: "Todos" }, { valor: "pendiente", texto: "Pendientes" }, { valor: "evaluado", texto: "Evaluados" }, { valor: "ausente", texto: "No se presentó" }];
  const ciudades = datos?.ciudades ?? [];
  const opCiudad: Opcion[] = ciudades.map((c) => ({ valor: c, texto: c }));
  const campos: CampoFiltro[] = [
    ...(ciudades.length > 1 ? [{ id: "ciudad", etiqueta: "Ciudad", opciones: opCiudad }] : []),
    { id: "estado", etiqueta: "Estado", opciones: opEstado }, { id: "dia", etiqueta: "Día", opciones: opDia },
    { id: "sala", etiqueta: "Sala", opciones: opSala }, { id: "orden", etiqueta: "Ordenar", opciones: opOrden },
  ];
  const activos = (["estado", "dia", "sala", "orden"] as const).filter((k) => f[k] !== POR_DEFECTO[k]).length;
  const limpiar = () => { setF(POR_DEFECTO); setQ(""); };
  const cambiarCiudad = (c: string) => { if (c !== datos?.ciudad) { setF(POR_DEFECTO); setCiudad(c); } };

  const total = n.total;
  const resumenTxt = `${plural(n.proyectos, "proyecto", "proyectos")} · ${plural(n.total, "estudiante", "estudiantes")}`;
  const cuerpo = () => {
    if (carga === "cargando") return <div className={v.pad}><Cargando /></div>;
    if (carga === "error") return <ErrorCarga titulo="No pudimos cargar los proyectos de tu ciudad" onReintentar={() => { setCarga("cargando"); void cargar(ciudad); }} />;
    if (!datos?.ciudad)
      return <Vacio titulo="No tienes una ciudad asignada" texto="Cuando coordinación te asigne una ciudad, aquí verás todos sus proyectos y cuáles ya están evaluados. Si crees que es un error, escríbele a coordinación." accion={{ texto: "Ir a Mis proyectos", href: "/monitor/proyectos" }} />;
    return null;
  };
  const especial = cuerpo();

  return (
    <ShellVistas user={user} active="ciudad">
      {datos?.ciudad && carga === "listo" && (
        <div className={v.soloMovil}><BarraMovil buscar={q} onBuscar={setQ} placeholder="Proyecto o integrante" onFiltros={() => setHoja(true)} activos={activos} /></div>
      )}
      {especial ?? (
        <div className={m.contenido}>
          {/* Cabecera */}
          <div className={`${v.cabeza} ${v.soloWeb}`}>
            <div><h1>{datos!.ciudad}</h1><p className={m.conteo}>{resumenTxt}</p><p>Todos los proyectos de tu ciudad, de todos los días. Aquí solo ves el estado, nunca la nota.</p></div>
            {ciudades.length > 1 && <div className={m.selCiudad}><Selector id="mc-ciudad" etiqueta="Ciudad" valor={datos!.ciudad!} opciones={opCiudad} onCambio={cambiarCiudad} /></div>}
          </div>
          <div className={`${m.movilCab} ${v.soloMovil} ${v.pad}`}>
            <h1>{datos!.ciudad}</h1>
            <p className={m.conteo}>{resumenTxt}</p>
            <p>{f.dia ? fechaLarga(f.dia) : "Todos los días"} · {f.orden === "pendientes" ? "Pendientes primero" : "Por fecha y hora"}</p>
          </div>

          <div className={m.envoltura}>
            <TarjetasFiltro<FiltroEstado> etiqueta="Filtrar por estado" unidad={["estudiante", "estudiantes"]} valor={f.estado as FiltroEstado} onCambio={(e) => setF((x) => ({ ...x, estado: e }))}
              opciones={[{ id: "todos", texto: "Total", n: total }, { id: "evaluado", texto: "Evaluados", n: n.evaluado }, { id: "pendiente", texto: "Pendientes", n: n.pendiente }, { id: "ausente", texto: "No se presentó", n: n.ausente }]} />
            <ResumenBarra total={total}
              izquierda={<><b>{n.evaluado} de {total} estudiantes evaluados</b> · {porcentaje(n.evaluado, total)} %</>}
              derecha={<span className={v.soloWeb}>{n.ausente} {n.ausente === 1 ? "no se presentó" : "no se presentaron"} · {plural(n.pendiente, "pendiente", "pendientes")}</span>}
              partes={[{ valor: n.evaluado, tono: "ok" }, { valor: n.ausente, tono: "bad" }]} />

            <div className={`${v.tarjeta} ${v.filtros} ${v.soloWeb}`}>
              <Selector id="mc-dia" etiqueta="Día" valor={f.dia} opciones={opDia} onCambio={(x) => setF((y) => ({ ...y, dia: x }))} />
              <Selector id="mc-sala" etiqueta="Sala" valor={f.sala} opciones={opSala} onCambio={(x) => setF((y) => ({ ...y, sala: x }))} />
              <Selector id="mc-orden" etiqueta="Ordenar" valor={f.orden} opciones={opOrden} onCambio={(x) => setF((y) => ({ ...y, orden: x }))} />
              <Buscador valor={q} onCambio={setQ} placeholder="Buscar por proyecto o integrante" />
            </div>

            {!lista.length ? (
              <div className={v.tarjeta}>
                <Vacio titulo="No hay proyectos con esos filtros" texto="Prueba con otro nombre de proyecto o de integrante, o cambia el estado, el día o la sala." accion={{ texto: "Limpiar filtros", onClick: limpiar }} />
              </div>
            ) : (
              <>
                <div className={`${m.tabla} ${v.soloWeb}`} role="table" aria-label={`Proyectos de ${datos!.ciudad}`}>
                  <div className={m.thead} role="row">
                    <span role="columnheader">Proyecto e integrantes</span><span role="columnheader">Día, hora y sala</span>
                    <span role="columnheader">Mentor</span><span role="columnheader">Estado</span>
                  </div>
                  {lista.map((x) => <FilaWeb key={x.id} x={x} />)}
                </div>
                <div className={v.soloMovil}><div className={m.tarjetas}>{lista.map((x) => <TarjetaMovil key={x.id} x={x} />)}</div></div>
              </>
            )}
          </div>
        </div>
      )}
      {hoja && datos?.ciudad && (
        <HojaFiltros campos={campos} valores={{ ...f, ciudad: datos.ciudad }} porDefecto={{ ...POR_DEFECTO, ciudad: datos.ciudad }} onCerrar={() => setHoja(false)}
          onAplicar={({ ciudad: c, ...resto }) => { setF({ ...POR_DEFECTO, ...resto }); if (c && c !== datos.ciudad) cambiarCiudad(c); }} />
      )}
    </ShellVistas>
  );
}

function Integrante({ i }: { i: FilaMiCiudad["integrantes"][number] }) {
  return (
    <div className={m.int}>
      <span className={m.intNombre}>{i.nombre} <span className={v.muted}>· <Telefono celular={i.celular} /></span></span>
      <BotonesLlamar celular={i.celular} nombre={i.nombre} />
    </div>
  );
}

function PorPersona({ x }: { x: FilaMiCiudad }) {
  if (x.integrantes.length < 2) return null;
  return <div className={m.porPersona}>{x.integrantes.map((i) => `${primerNombre(i.nombre)}: ${i.estado === "evaluado" ? "Evaluado" : i.estado === "ausente" ? "No se presentó" : "Pendiente"}`).join(" · ")}</div>;
}

/** Pareja con estados distintos: «1 ausente» y/o «1 pendiente» (solo estados; nunca nota, resultado ni motivo). */
function Extras({ x }: { x: FilaMiCiudad }) {
  return <>{chipsExtra(x).map((t) => <Chip key={t} tono={t.includes("ausente") ? "bad" : "borde"}>{t}</Chip>)}</>;
}

function FilaWeb({ x }: { x: FilaMiCiudad }) {
  return (
    <div className={m.fila} role="row">
      <div role="cell">
        <div className={m.proy}>{x.proyecto}{x.integrantes.length > 1 && <Chip tono="borde">En pareja</Chip>}</div>
        {x.integrantes.map((i, k) => <Integrante key={k} i={i} />)}
      </div>
      <div role="cell" className={m.cuando}><b>{x.hora}</b><span>{fechaLarga(x.dia)}</span><span>{salaTxt(x.sala)}</span></div>
      <div role="cell" className={m.mentor}>{x.mentor}</div>
      <div role="cell" className={m.estado}><span className={m.chips}><ChipEstado estado={x.estado} /><Extras x={x} /></span><PorPersona x={x} /></div>
    </div>
  );
}

function TarjetaMovil({ x }: { x: FilaMiCiudad }) {
  return (
    <article className={m.tarjeta}>
      <div className={m.tarjetaCab}>
        <div>
          <div className={m.proy}>{x.proyecto}{x.integrantes.length > 1 && <Chip tono="borde">En pareja</Chip>}</div>
          <div className={m.meta}><b>{x.hora}</b> · {diaCorto(x.dia)} · {salaTxt(x.sala)}</div>
          <div className={m.meta}>Mentor · {x.mentor}</div>
        </div>
        <span className={m.chipsMovil}><ChipEstado estado={x.estado} /><Extras x={x} /></span>
      </div>
      <PorPersona x={x} />
      <div className={m.ints}>{x.integrantes.map((i, k) => <IntegranteMovil key={k} i={i} />)}</div>
    </article>
  );
}

function IntegranteMovil({ i }: { i: FilaMiCiudad["integrantes"][number] }) {
  return (
    <div className={m.int}>
      <span className={m.intNombre}><b>{i.nombre}</b><Telefono celular={i.celular} /></span>
      <BotonesLlamar celular={i.celular} nombre={i.nombre} />
    </div>
  );
}

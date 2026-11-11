"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { diaCOL } from "@/lib/edicion";
import { primerNombre } from "@/lib/evaluacion/criterios";
import type { Contacto, MiProyecto, VistaMisProyectos } from "@/lib/misProyectos";
import BotonesContacto from "./BotonesContacto";
import EvalShell from "./EvalShell";
import s from "./Evaluacion.module.css";
import { fechaLarga } from "./comun";

// Mis proyectos (solo lectura): lista filtrable de los proyectos del monitor (sus salas) o de todos (coordinación y
// admin, con filtro por monitor). Tabla en pantalla ancha y tarjetas en el celular. Sin documento ni correo.

const SIN = "Sin registrar";

export default function MisProyectosPanel({ user }: { user: SessionUser }) {
  const [datos, setDatos] = useState<VistaMisProyectos | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [dia, setDia] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [sala, setSala] = useState("");
  const [monitor, setMonitor] = useState("");
  const [q, setQ] = useState("");
  const [qAplicada, setQAplicada] = useState("");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQAplicada(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctl = new AbortController();
    const p = new URLSearchParams();
    for (const [k, v] of [["dia", dia], ["ciudad", ciudad], ["sala", sala], ["monitor", monitor], ["q", qAplicada]] as const) if (v) p.set(k, v);
    fetch(`/api/monitor/mis-proyectos?${p}`, { cache: "no-store", signal: ctl.signal })
      .then(async (res) => {
        if (res.status === 401) return window.location.assign("/login");
        if (!res.ok) throw new Error();
        setDatos(await res.json());
        setCarga("listo");
      })
      .catch(() => { if (!ctl.signal.aborted) setCarga("error"); });
    return () => ctl.abort();
  }, [dia, ciudad, sala, monitor, qAplicada, intento]);

  const hoy = diaCOL(new Date());
  const diaSel = dia || datos?.dia || "";
  const lista = datos?.proyectos ?? [];

  return (
    <EvalShell user={user} active="proyectos">
      <div className={s.hello}>
        <div>
          <h1>Hola, {primerNombre(user.nombre)}</h1>
          <p>{datos?.todos ? "Todos los proyectos con hora, con su sala, integrantes y mentor." : "Los proyectos de tus salas, de cualquier ciudad."}</p>
        </div>
      </div>

      {carga === "cargando" && !datos && <div className={s.skel}>{[1, 2, 3, 4].map((i) => <i key={i} />)}</div>}
      {carga === "error" && (
        <div className={`${s.lista} ${s.vacio}`}><h2>No se pudo cargar la lista</h2><p>Revisa tu conexión.</p><button type="button" className="ev-btn" onClick={() => { setCarga("cargando"); setIntento((n) => n + 1); }}>Reintentar</button></div>
      )}
      {carga !== "error" && datos && !datos.dias.length && (
        <div className={`${s.lista} ${s.vacio}`}>
          <h2>{datos.todos ? "Todavía no hay proyectos con hora" : "No tienes proyectos asignados todavía"}</h2>
          <p>{datos.todos ? "Aparecerán aquí cuando los estudiantes elijan su hora." : "Administración te asigna las salas en el plan de salas. Cuando lo haga, aparecerán aquí."}</p>
        </div>
      )}
      {carga !== "error" && datos && datos.dias.length > 0 && (
        <>
          <div className={s.filtros}>
            <select className="ev-campo" aria-label="Filtrar por día" value={diaSel} onChange={(e) => setDia(e.target.value)}>
              <option value="todos">Todos los días</option>
              {datos.dias.map((d) => <option key={d} value={d}>{d === hoy ? "Hoy, " : ""}{fechaLarga(d)}</option>)}
            </select>
            <select className="ev-campo" aria-label="Filtrar por ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
              <option value="">Todas las ciudades</option>
              {datos.ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="ev-campo" aria-label="Filtrar por sala" value={sala} onChange={(e) => setSala(e.target.value)}>
              <option value="">Todas las salas</option>
              {datos.salas.map((n) => <option key={n} value={String(n)}>Sala {n}</option>)}
            </select>
            {datos.todos && (
              <select className="ev-campo" aria-label="Filtrar por monitor" value={monitor} onChange={(e) => setMonitor(e.target.value)}>
                <option value="">Todos los monitores</option>
                <option value="sin">Sin monitor</option>
                {datos.monitores.map((m) => <option key={m.usuario} value={m.usuario}>{m.nombre}</option>)}
              </select>
            )}
            <input type="search" className="ev-campo" placeholder="Buscar por proyecto o integrante" aria-label="Buscar por proyecto o integrante" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <p className={s.contador} aria-live="polite">{lista.length} {lista.length === 1 ? "proyecto" : "proyectos"}</p>

          {!lista.length ? (
            <div className={`${s.lista} ${s.vacio}`}><p>No hay proyectos con esos filtros.</p></div>
          ) : (
            <>
              <div className={s.tablaProy}>
                <table>
                  <thead>
                    <tr><th scope="col">Día y hora</th><th scope="col">Sala</th><th scope="col">Proyecto</th><th scope="col">Integrantes</th><th scope="col">Mentor</th>{datos.todos && <th scope="col">Monitor</th>}</tr>
                  </thead>
                  <tbody>
                    {lista.map((p) => (
                      <tr key={p.id}>
                        <td><Hora p={p} /></td>
                        <td><Sala p={p} /></td>
                        <td><div className={s.nombre}>{p.proyecto}</div><div className={s.sub}>{p.ciudad}</div></td>
                        <td>{p.integrantes.map((x, i) => <Persona key={i} x={x} />)}</td>
                        <td><Persona x={p.mentor} /></td>
                        {datos.todos && <td>{p.monitor?.nombre ?? "Por asignar"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={s.tarjetasProy}>
                {lista.map((p) => (
                  <article key={p.id} className={s.tarjetaProy}>
                    <div className={s.tarjetaHead}><Hora p={p} /><Sala p={p} /></div>
                    <div className={s.nombre}>{p.proyecto}</div>
                    <div className={s.sub}>{p.ciudad}{datos.todos ? ` · Monitor: ${p.monitor?.nombre ?? "Por asignar"}` : ""}</div>
                    <div className={s.etiquetaProy}>Integrantes</div>
                    {p.integrantes.map((x, i) => <Persona key={i} x={x} />)}
                    <div className={s.etiquetaProy}>Mentor</div>
                    <Persona x={p.mentor} />
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </EvalShell>
  );
}

function Hora({ p }: { p: MiProyecto }) {
  return (
    <div>
      <div className={s.hora}>{p.horaCOL}</div>
      <div className={s.sub}>{fechaLarga(p.dia)}{p.horaUY ? ` · ${p.horaUY} UY` : ""}</div>
    </div>
  );
}

function Sala({ p }: { p: MiProyecto }) {
  return (
    <div className={s.salaProy}>
      <span>{p.sala !== null ? `Sala ${p.sala}` : "Sala por asignar"}</span>
      {p.enlace && <a className={`ev-btn ev-btn-navy ${s.abrirSala}`} href={p.enlace} target="_blank" rel="noopener noreferrer">Abrir sala</a>}
    </div>
  );
}

function Persona({ x }: { x: Contacto }) {
  return (
    <div className={s.personaProy}>
      <div><b>{x.nombre}</b> · {x.celular ?? <span className={s.sinCelProy}>{SIN}</span>}</div>
      {x.celular && <div className={s.telefono}><BotonesContacto celular={x.celular} /></div>}
    </div>
  );
}

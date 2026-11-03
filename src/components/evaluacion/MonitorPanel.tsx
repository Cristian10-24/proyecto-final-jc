"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { diaCOL, horaCOL } from "@/lib/edicion";
import { estadoFila, estadoPersona, primerNombre } from "@/lib/evaluacion/criterios";
import type { FilaSala, IntegranteSala, MiSugerencia, SalaMonitor } from "@/lib/evaluacion/monitor";
import EvalShell from "./EvalShell";
import MonitorHoja, { EstadoSugerencia } from "./MonitorHoja";
import s from "./Evaluacion.module.css";
import { claseResultado, fechaLarga, horaTxt } from "./comun";

// Mis salas (monitor en las presentaciones): por día y hora, cada sala con su mentor y "Abrir sala", y los
// estudiantes de esa sala (de cualquier ciudad). Mismo tema, lista y fondo por estado que la vista del mentor.
// Se refresca cada minuto mientras no haya una ficha abierta.

type Datos = { salas: SalaMonitor[]; filas: FilaSala[]; sugerencias: MiSugerencia[] };
type Estado = "" | "pendientes" | "presentes" | "ausentes" | "sinMotivo";
const ESTADOS: [Estado, string][] = [["", "Todos los estados"], ["pendientes", "Pendientes"], ["presentes", "Se presentaron"], ["ausentes", "No se presentaron"], ["sinMotivo", "Inasistencias sin motivo registrado"]];
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const persona = (x: IntegranteSala) => ({ res: x.res, presente: x.asistencia === "si", ausente: x.asistencia === "no" });
const claveSala = (dia: string, hora: number, mentorId: string) => `${dia}|${hora}|${mentorId}`;

export default function MonitorPanel({ user }: { user: SessionUser }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [fecha, setFecha] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<Estado>("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/evaluacion/salas", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setCarga("listo");
    } catch {
      setCarga((c) => (c === "listo" ? c : "error"));
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    if (abierto) return;
    const t = setInterval(() => void cargar(), 60_000);
    return () => clearInterval(t);
  }, [cargar, abierto]);

  const salas = useMemo(() => datos?.salas ?? [], [datos]);
  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const hoy = diaCOL(new Date());
  const dias = useMemo(() => [...new Set(salas.map((x) => x.dia))].sort(), [salas]);
  const diaSel = fecha ?? (dias.includes(hoy) ? hoy : "");

  const personas = filas.filter((f) => !diaSel || f.dia === diaSel).flatMap((f) => f.integrantes.map((x) => estadoPersona(persona(x))));
  const presentes = personas.filter((x) => x === "presente").length, ausentes = personas.filter((x) => x === "ausente").length;

  const filtrando = !!q.trim() || !!estado;
  const visibles = filas.filter((f) => {
    if (diaSel && f.dia !== diaSel) return false;
    if (q && !sinTildes([...f.integrantes.map((x) => x.nombre), f.proyecto, f.codigo, f.ciudad].join(" ")).includes(sinTildes(q.trim()))) return false;
    const e = f.integrantes.map((x) => estadoPersona(persona(x)));
    if (estado === "pendientes") return e.includes("pendiente");
    if (estado === "presentes") return e.includes("presente");
    if (estado === "ausentes") return e.includes("ausente");
    if (estado === "sinMotivo") return f.integrantes.some((x) => estadoPersona(persona(x)) === "ausente" && !x.motivo);
    return true;
  });
  const porSala = new Map<string, FilaSala[]>();
  for (const f of visibles) {
    const k = claveSala(f.dia, horaCOL(new Date(f.inicio)), f.mentorId);
    porSala.set(k, [...(porSala.get(k) ?? []), f]);
  }
  // Por día y hora. Las salas sin estudiantes solo se ven con un día elegido y sin filtros (si no, la lista se llena de vacías).
  const grupos: { dia: string; salas: { sala: SalaMonitor; filas: FilaSala[] }[] }[] = [];
  for (const x of salas) {
    if (diaSel && x.dia !== diaSel) continue;
    const fs = porSala.get(claveSala(x.dia, x.hora, x.mentorId)) ?? [];
    if ((filtrando || !diaSel) && !fs.length) continue;
    let g = grupos.at(-1);
    if (!g || g.dia !== x.dia) grupos.push((g = { dia: x.dia, salas: [] }));
    g.salas.push({ sala: x, filas: fs });
  }

  return (
    <EvalShell user={user} active="salas">
      <div className={s.hello}>
        <div><h1>Hola, {primerNombre(user.nombre)}</h1><p>Tus salas de las presentaciones, con estudiantes de cualquier ciudad.</p></div>
      </div>

      {carga === "cargando" && <div className={s.skel}>{[1, 2, 3, 4].map((i) => <i key={i} />)}</div>}
      {carga === "error" && (
        <div className={`${s.lista} ${s.vacio}`}><h2>No se pudo cargar la lista</h2><p>Revisa tu conexión.</p><button type="button" className="ev-btn" onClick={() => { setCarga("cargando"); void cargar(); }}>Reintentar</button></div>
      )}
      {carga === "listo" && datos && !salas.length && (
        <div className={`${s.lista} ${s.vacio}`}>
          <h2>No tienes salas asignadas todavía</h2>
          <p>Administración te asigna las salas en el plan de salas. Cuando lo haga, aparecerán aquí.</p>
        </div>
      )}
      {carga === "listo" && datos && salas.length > 0 && (
        <>
          {personas.length > 0 && (
            <>
              <div className={s.avanceTxt}>
                <span>{presentes} se presentaron · {ausentes ? `${ausentes} no se presentaron · ` : ""}{personas.length - presentes - ausentes} pendientes de {personas.length}</span>
                <span>{Math.round(((presentes + ausentes) / personas.length) * 100)}%</span>
              </div>
              <div className={s.progreso}><i style={{ transform: `scaleX(${(presentes + ausentes) / personas.length})` }} /></div>
            </>
          )}

          <div className={s.filtros}>
            <select className="ev-campo" aria-label="Filtrar por fecha" value={diaSel} onChange={(e) => setFecha(e.target.value)}>
              <option value="">Todas las fechas</option>
              {dias.map((d) => <option key={d} value={d}>{d === hoy ? "Hoy, " : ""}{fechaLarga(d)}</option>)}
            </select>
            <input type="search" className="ev-campo" placeholder="Buscar por nombre, código, emprendimiento o ciudad" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="ev-campo" aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
              {ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>

          <div className={s.lista}>
            {!grupos.length && <div className={s.vacio}><p>{filtrando ? "No hay estudiantes con ese filtro." : diaSel ? "No tienes salas ese día." : "Tus salas todavía no tienen estudiantes."}</p></div>}
            {grupos.map((g) => (
              <div key={g.dia}>
                <div className={`${s.dia} ${g.dia === hoy ? s.diaHoy : ""}`}>{g.dia === hoy ? "Hoy, " : ""}{fechaLarga(g.dia)}</div>
                {g.salas.map(({ sala, filas: fs }) => (
                  <div key={`${sala.dia}|${sala.hora}|${sala.sala}`}>
                    <div className={s.horaSala}>
                      <b>{horaTxt(sala.inicio, "")}</b>
                      <span>Sala {sala.sala} · {sala.mentor}</span>
                      {sala.enlace && <a className={`ev-btn ev-btn-navy ${s.abrirSala}`} href={sala.enlace} target="_blank" rel="noopener noreferrer">Abrir sala</a>}
                    </div>
                    {!fs.length && <div className={s.salaVacia}>Sin estudiantes en esta hora.</div>}
                    {fs.map((f) => <Item key={f.id} f={f} onAbrir={() => setAbierto(f.id)} />)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {carga === "listo" && datos && datos.sugerencias.length > 0 && (
        <section className={s.sugerencias} aria-labelledby="mis-sug">
          <h2 id="mis-sug">Tus sugerencias de cambio</h2>
          <div className={s.lista}>
            {datos.sugerencias.map((x) => (
              <div key={x.creadoEn} className={s.sugItem}>
                <div className={s.nombre}>{x.integrantes.join(" y ")}</div>
                <div className={s.sub}>{x.proyecto} · hora al sugerir: {fechaLarga(x.anterior.slice(0, 10))}, {x.anterior.slice(11)}</div>
                <EstadoSugerencia x={x} />
              </div>
            ))}
          </div>
        </section>
      )}

      {abierto && <MonitorHoja id={abierto} onCerrar={(cambio) => { setAbierto(null); if (cambio) void cargar(); }} />}
    </EvalShell>
  );
}

const FONDO = { presente: s.filaPresente, ausente: s.filaAusente, pendiente: "" } as const;

function Item({ f, onAbrir }: { f: FilaSala; onAbrir: () => void }) {
  const pareja = f.integrantes.length > 1;
  const quien = (x: { nombre: string }) => (pareja ? `${primerNombre(x.nombre)}: ` : "");
  const uy = horaTxt(f.inicio, f.ciudad);
  const sub = [f.proyecto, f.ruta ? `Ruta ${f.ruta.toLowerCase()}` : null, f.ciudad, pareja ? "En pareja" : null].filter(Boolean).join(" · ");
  return (
    <button type="button" className={`${s.item} ${FONDO[estadoFila(f.integrantes.map(persona))]}`} onClick={onAbrir}>
      <span className={s.hora}>{horaTxt(f.inicio, "")}</span>
      <span>
        <div className={s.nombre}>{f.integrantes.map((x) => x.nombre).join(" y ")}</div>
        <div className={s.sub}>{sub}{uy.includes(" · ") ? ` · ${uy.split(" · ")[1]}` : ""}</div>
      </span>
      <span className={s.tags}>
        {f.integrantes.map((x) => <span key={x.i} className={claseResultado(x.res)}>{quien(x)}{x.res}</span>)}
        {f.integrantes.filter((x) => x.asistencia === "si" && x.res === "Pendiente").map((x) => <span key={`p${x.i}`} className="ev-chip ev-c-mail">{quien(x)}Presente</span>)}
        {f.integrantes.filter((x) => x.asistencia === "no" && x.res !== "No se presentó").map((x) => <span key={`a${x.i}`} className="ev-chip ev-c-NoSePresento">{quien(x)}Ausente</span>)}
        {f.integrantes.filter((x) => estadoPersona(persona(x)) === "ausente").map((x) => (
          <span key={`m${x.i}`} className={`ev-chip ${x.motivo ? "ev-c-mail" : "ev-c-Incompleto"}`}>{quien(x)}{x.motivo ? `Motivo: ${x.motivo}` : "Sin motivo"}</span>
        ))}
        {f.destacado && <span className="ev-chip ev-c-star">Destacado</span>}
        {f.sugerencia && <span className="ev-chip ev-c-Incompleto">Cambio sugerido</span>}
      </span>
    </button>
  );
}

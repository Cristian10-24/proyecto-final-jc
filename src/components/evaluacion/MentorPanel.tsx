"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { diaCOL } from "@/lib/edicion";
import { estadoFila, primerNombre } from "@/lib/evaluacion/criterios";
import type { FilaEvaluacion } from "@/lib/evaluacion/datos";
import { puede } from "@/lib/permisos";
import EvalShell from "./EvalShell";
import EvaluarHoja from "./EvaluarHoja";
import s from "./Evaluacion.module.css";
import { claseResultado, fechaLarga, horaTxt } from "./comun";

/** En Uruguay también la hora local: " · 10:15 a. m. UY". */
const horaUYde = (f: FilaEvaluacion) => { const t = horaTxt(f.inicio, f.ciudad); return t.includes(" · ") ? ` · ${t.split(" · ")[1]}` : ""; };

// Mis evaluaciones (mentor) igual al prototipo: avance, filtros por fecha, búsqueda y estado, y la lista
// por día y hora con la SALA y su enlace. Coordinación y admin eligen el mentor y ven en solo lectura.
// Se refresca cada minuto; el refresco nunca toca la evaluación abierta.

type Datos = { filas: FilaEvaluacion[]; mentores?: { id: string; nombre: string }[] };
type Estado = "" | "pendientes" | "hechos" | "noShow" | "gestionar";
const ESTADOS: [Estado, string][] = [["", "Todos los estados"], ["pendientes", "Pendientes"], ["hechos", "Ya evaluados"], ["noShow", "No se presentaron"], ["gestionar", "Inasistencias sin motivo registrado"]];
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function MentorPanel({ user }: { user: SessionUser }) {
  const verTodos = puede(user.rol, "ver_evaluaciones");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [mentor, setMentor] = useState("");
  const [fecha, setFecha] = useState<string | null>(null); // null = aún sin elegir (se usa hoy si hay)
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<Estado>("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/evaluacion/proyectos${mentor ? `?mentor=${encodeURIComponent(mentor)}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setCarga("listo");
    } catch {
      setCarga((c) => (c === "listo" ? c : "error"));
    }
  }, [mentor]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    if (abierto) return;
    const t = setInterval(() => void cargar(), 60_000);
    return () => clearInterval(t);
  }, [cargar, abierto]);

  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const hoy = diaCOL(new Date());
  const dias = useMemo(() => [...new Set(filas.map((f) => f.dia))].sort(), [filas]);
  const diaSel = fecha ?? (dias.includes(hoy) ? hoy : "");

  // Avance por persona (como el prototipo): evaluados, no se presentaron y pendientes.
  const personas = filas.flatMap((f) => f.integrantes);
  const noShow = personas.filter((x) => x.res === "No se presentó").length;
  const hechos = personas.filter((x) => x.res !== "Pendiente").length;

  const visibles = filas.filter((f) => {
    if (diaSel && f.dia !== diaSel) return false;
    if (q && !sinTildes([...f.integrantes.map((x) => x.nombre), f.proyecto, f.codigo].join(" ")).includes(sinTildes(q.trim()))) return false;
    const r = f.integrantes.map((x) => x.res);
    if (estado === "pendientes") return r.includes("Pendiente");
    if (estado === "hechos") return r.some((x) => x !== "Pendiente" && x !== "No se presentó");
    if (estado === "noShow" || estado === "gestionar") return r.includes("No se presentó"); // el motivo lo registra el monitor (Paso 12)
    return true;
  });

  // Por día y, dentro del día, por hora (cada hora con su sala y enlace cuando se ve un solo mentor).
  const unMentor = !verTodos || !!mentor;
  const grupos: { dia: string; horas: { clave: string; filas: FilaEvaluacion[] }[] }[] = [];
  for (const f of visibles) {
    let g = grupos.at(-1);
    if (!g || g.dia !== f.dia) grupos.push((g = { dia: f.dia, horas: [] }));
    const clave = unMentor ? f.inicio.slice(0, 13) : f.dia;
    let hh = g.horas.at(-1);
    if (!hh || hh.clave !== clave) g.horas.push((hh = { clave, filas: [] }));
    hh.filas.push(f);
  }

  const nombreMentor = new Map((datos?.mentores ?? []).map((m) => [m.id, m.nombre]));
  const titulo = verTodos ? (mentor ? nombreMentor.get(mentor) ?? "Evaluaciones" : "Todos los estudiantes") : `Hola, ${primerNombre(user.nombre)}`;
  const lead = verTodos ? "Solo lectura: la evaluación la hace el mentor." : "Estos son tus estudiantes de la jornada.";
  return (
    <EvalShell user={user} active="evaluaciones">
      <div className={s.hello}>
        <div><h1>{titulo}</h1><p>{lead}</p></div>
        {verTodos && datos && (
          <select className={`ev-campo ${s.quien}`} aria-label="Mentor" value={mentor} onChange={(e) => setMentor(e.target.value)}>
            <option value="">Todos los mentores</option>
            {(datos.mentores ?? []).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        )}
      </div>

      {carga === "cargando" && <div className={s.skel}>{[1, 2, 3, 4].map((i) => <i key={i} />)}</div>}
      {carga === "error" && (
        <div className={`${s.lista} ${s.vacio}`}><h2>No se pudo cargar la lista</h2><p>Revisa tu conexión.</p><button type="button" className="ev-btn" onClick={() => { setCarga("cargando"); void cargar(); }}>Reintentar</button></div>
      )}
      {carga === "listo" && datos && !filas.length && (
        <div className={`${s.lista} ${s.vacio}`}>
          <h2>{verTodos ? "Todavía no hay proyectos con hora" : "No tienes estudiantes asignados todavía"}</h2>
          <p>{verTodos ? "Cuando los estudiantes elijan hora, aparecerán aquí." : "Coordinación debe registrarte con tu nombre escrito igual que en la hoja de horarios."}</p>
        </div>
      )}
      {carga === "listo" && datos && filas.length > 0 && (
        <>
          <div className={s.avanceTxt}>
            <span>{hechos - noShow} evaluados · {noShow ? `${noShow} no se presentaron · ` : ""}{personas.length - hechos} pendientes de {personas.length}</span>
            <span>{Math.round((hechos / personas.length) * 100)}%</span>
          </div>
          <div className={s.progreso}><i style={{ transform: `scaleX(${hechos / personas.length})` }} /></div>

          <div className={s.filtros}>
            <select className="ev-campo" aria-label="Filtrar por fecha" value={diaSel} onChange={(e) => setFecha(e.target.value)}>
              <option value="">Todas las fechas</option>
              {dias.map((d) => <option key={d} value={d}>{d === hoy ? "Hoy, " : ""}{fechaLarga(d)}</option>)}
            </select>
            <input type="search" className="ev-campo" placeholder="Buscar por nombre, código o emprendimiento" aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="ev-campo" aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
              {ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>

          <div className={s.lista}>
            {!visibles.length && <div className={s.vacio}><p>No hay estudiantes con ese filtro.</p></div>}
            {grupos.map((g) => (
              <div key={g.dia}>
                <div className={`${s.dia} ${g.dia === hoy ? s.diaHoy : ""}`}>{g.dia === hoy ? "Hoy, " : ""}{fechaLarga(g.dia)}</div>
                {g.horas.map((hh) => {
                  const f0 = hh.filas[0]!;
                  return (
                    <div key={hh.clave}>
                      {unMentor && (
                        <div className={s.horaSala}>
                          <b>{horaTxt(f0.inicio, "")}</b>
                          <span>{f0.sala ? `Sala ${f0.sala}` : "Sala por asignar"}</span>
                          {f0.enlace && <a className={`ev-btn ev-btn-navy ${s.abrirSala}`} href={f0.enlace} target="_blank" rel="noopener noreferrer">Abrir sala</a>}
                        </div>
                      )}
                      {hh.filas.map((f) => <Item key={f.id} f={f} mentor={unMentor ? null : nombreMentor.get(f.mentorId) ?? f.mentorId} onAbrir={() => setAbierto(f.id)} />)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {abierto && <EvaluarHoja id={abierto} usuario={user.usuario} onCerrar={(cambio) => { setAbierto(null); if (cambio) void cargar(); }} />}
    </EvalShell>
  );
}

const FONDO = { presente: s.filaPresente, ausente: s.filaAusente, pendiente: "" } as const;

/** `mentor`: su nombre cuando la lista mezcla mentores (ahí cada fila dice también su sala). */
function Item({ f, mentor, onAbrir }: { f: FilaEvaluacion; mentor: string | null; onAbrir: () => void }) {
  const pareja = f.integrantes.length > 1;
  const quien = (x: { nombre: string }) => (pareja ? `${primerNombre(x.nombre)}: ` : "");
  const sub = [f.proyecto, f.ruta ? `Ruta ${f.ruta.toLowerCase()}` : null, f.ciudad, pareja ? "En pareja" : null, mentor, mentor !== null ? (f.sala ? `Sala ${f.sala}` : "Sala por asignar") : null].filter(Boolean).join(" · ");
  return (
    <button type="button" className={`${s.item} ${FONDO[estadoFila(f.integrantes)]}`} onClick={onAbrir}>
      <span className={s.hora}>{horaTxt(f.inicio, "")}</span>
      <span>
        <div className={s.nombre}>{f.integrantes.map((x) => x.nombre).join(" y ")}</div>
        <div className={s.sub}>{sub}{horaUYde(f)}</div>
      </span>
      <span className={s.tags}>
        {f.integrantes.map((x) => <span key={x.i} className={claseResultado(x.res)}>{quien(x)}{x.res}</span>)}
        {f.destacado && <span className="ev-chip ev-c-star">Destacado</span>}
        {f.integrantes.filter((x) => x.res === "No se presentó").map((x) => <span key={`m${x.i}`} className="ev-chip ev-c-Incompleto">{quien(x)}Sin motivo</span>)}
        {f.borrador && f.integrantes.some((x) => x.res === "Pendiente") && <span className="ev-chip ev-c-mail">Borrador sin guardar</span>}
      </span>
    </button>
  );
}

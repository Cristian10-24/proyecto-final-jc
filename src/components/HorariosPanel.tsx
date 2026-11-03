"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { horaCO } from "@/lib/ciudades";
import { diaCOL } from "@/lib/edicion";
import AppShell from "./AppShell";
import s from "./HorariosPanel.module.css";

// Administración · Horarios (Paso 5). Diseño: docs/DISENO.md (5 · Administrador). Horas siempre en hora COL.

type Integrante = { nombre: string; documento: string };
type Proyecto = {
  id: string; codigo: string; nombre: string; ciudad: string; grupo?: string;
  integrantes: Integrante[]; monitor: string | null; hora: null | { inicio: string; mentor: string };
};
type Monitor = { usuario: string; nombre: string; ciudades: string[] };
type Cambio = { accion: string; anterior?: string; nuevo?: string; motivo?: string; actor: { rol: string; usuario?: string }; fecha: string };
type Bloque = { inicio: string; libres: number; deSuCiudad: boolean; otras: string[] };
type Grupo = { grupo: string; ciudades: string[]; libres: number; ocupados: number };
type Estado = "" | "con_hora" | "sin_hora" | "sin_monitor";

const ESTADOS: { v: Estado; t: string }[] = [
  { v: "", t: "Todos" }, { v: "con_hora", t: "Con hora" }, { v: "sin_hora", t: "Sin hora" }, { v: "sin_monitor", t: "Monitor por asignar" },
];
const ACCION: Record<string, string> = {
  reservar: "Eligió hora", cambiar_hora: "Cambio de hora", liberar: "Hora liberada",
  asignar_monitor: "Monitor asignado", importar: "Importación", reetiquetar: "Asientos reetiquetados",
};
const ROL: Record<string, string> = { admin: "Admin", coordinador: "Coordinación", monitor: "Monitor", estudiante: "Estudiante", sistema: "Sistema" };

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const fmtDiaISO = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });
const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const limpia = (t: string) => cap(t.replace(/[.,]/g, ""));
/** 'YYYY-MM-DD' → "Jue 12 nov". */
const etiquetaDia = (dia: string) => limpia(fmtDia.format(new Date(dia + "T12:00:00Z")));
/** ISO → "Jue 12 nov · 9:15 a. m." (hora COL). */
const etiquetaHora = (iso: string) => { const d = new Date(iso); return `${limpia(fmtDiaISO.format(d))} · ${horaCO(d)}`; };

class SinSesion extends Error {}
async function api<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, body === undefined
    ? { cache: "no-store" }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) { window.location.assign("/login"); throw new SinSesion(); }
  const data = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, data };
}
const ERROR_RED = "Sin conexión. Revisa tu internet e inténtalo otra vez.";

export default function HorariosPanel({ user }: { user: SessionUser }) {
  const [q, setQ] = useState("");
  const [qFinal, setQFinal] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [estado, setEstado] = useState<Estado>("");
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [monitores, setMonitores] = useState<Monitor[]>([]);
  const [ciudades, setCiudades] = useState<string[]>([]);
  const [dias, setDias] = useState<string[]>([]);
  const [sel, setSel] = useState<Proyecto | null>(null);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState("");
  const pedido = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  useEffect(() => { const t = setTimeout(() => setQFinal(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  const cargar = useCallback(async () => {
    const n = ++pedido.current;
    setCarga("cargando");
    const p = new URLSearchParams({ q: qFinal, ciudad, estado });
    try {
      const r = await api<{ proyectos: Proyecto[]; monitores: Monitor[]; ciudades: string[] }>(`/api/admin/proyectos?${p}`);
      if (n !== pedido.current) return;
      if (!r.ok || !r.data) return setCarga("error");
      setProyectos(r.data.proyectos);
      setMonitores(r.data.monitores);
      setCiudades(r.data.ciudades);
      setCarga("listo");
    } catch (e) {
      if (!(e instanceof SinSesion) && n === pedido.current) setCarga("error");
    }
  }, [qFinal, ciudad, estado]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Los días de la edición salen de la ruta de asientos (devuelve `dias` para cualquier día).
  useEffect(() => {
    api<{ dias: string[] }>(`/api/admin/asientos?dia=${diaCOL(new Date())}`)
      .then((r) => { if (r.ok && r.data) setDias(r.data.dias); })
      .catch(() => null);
  }, []);

  const nombreMonitor = useCallback((u: string | null) => (u ? monitores.find((m) => m.usuario === u)?.nombre ?? u : null), [monitores]);

  /** Tras una acción: toast, recargar la lista, la fila abierta y su historial. */
  const trasAccion = useCallback(async (msg: string) => {
    avisar(msg);
    void cargar();
    setVersion((v) => v + 1);
    const actual = sel;
    if (!actual) return;
    try {
      const r = await api<{ proyectos: Proyecto[] }>(`/api/admin/proyectos?${new URLSearchParams({ q: actual.codigo })}`);
      const p = r.data?.proyectos.find((x) => x.id === actual.id);
      if (p) setSel(p);
    } catch { /* la lista ya se recarga */ }
  }, [avisar, cargar, sel]);

  const limpiar = () => { setQ(""); setQFinal(""); setCiudad(""); setEstado(""); };

  return (
    <AppShell user={user} active="horarios">
      <div className={s.kicker}>Administración</div>
      <h1 className={s.title}>Horarios</h1>
      <p className={s.lead}>Busca un proyecto para ver su historial, liberar o cambiar su hora y asignarle monitor. Todas las horas están en hora COL.</p>

      <section className={s.card}>
        <div className={s.filtros}>
          <input className={`input ${s.buscar}`} type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, código o documento" aria-label="Buscar proyecto" />
          <select className={`input ${s.select}`} value={ciudad} onChange={(e) => setCiudad(e.target.value)} aria-label="Ciudad">
            <option value="">Todas las ciudades</option>
            {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className={s.segmento} role="group" aria-label="Estado">
            {ESTADOS.map((e) => (
              <button key={e.v} type="button" className={`${s.segBtn} ${estado === e.v ? s.segOn : ""}`} aria-pressed={estado === e.v} onClick={() => setEstado(e.v)}>{e.t}</button>
            ))}
          </div>
        </div>

        {carga === "cargando" && proyectos.length === 0 && <Skeleton />}
        {carga === "error" && (
          <div className={s.vacio}>
            <b>No pudimos cargar los proyectos</b>
            <span>Revisa tu conexión e intenta otra vez.</span>
            <button type="button" className="btn btn-dark" onClick={() => void cargar()}>Intentar de nuevo</button>
          </div>
        )}
        {carga !== "error" && !(carga === "cargando" && proyectos.length === 0) && (
          proyectos.length === 0 ? (
            <div className={s.vacio}>
              <b>No hay proyectos con ese filtro.</b>
              <button type="button" className="btn btn-ghost" onClick={limpiar}>Limpiar filtros</button>
            </div>
          ) : (
            <div className={`${s.tablaWrap} ${carga === "cargando" ? s.recargando : ""}`}>
              <table className={s.tabla}>
                <thead><tr><th>Proyecto</th><th>Integrantes</th><th>Ciudad</th><th>Hora COL</th><th>Mentor</th><th>Monitor</th></tr></thead>
                <tbody>
                  {proyectos.map((p) => (
                    <tr key={p.id} className={s.fila} tabIndex={0} onClick={() => setSel(p)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(p); } }}>
                      <td><div className={s.pNombre}>{p.nombre}</div><div className={s.codigo}>{p.codigo}</div></td>
                      <td>{p.integrantes.map((i) => <div key={i.documento}>{i.nombre}</div>)}</td>
                      <td>{p.ciudad}{p.grupo && <div className={s.sub}>{p.grupo}</div>}</td>
                      <td>{p.hora ? <span className={s.nowrap}>{etiquetaHora(p.hora.inicio)}</span> : <Chip tono="amarillo">Sin hora</Chip>}</td>
                      <td>{p.hora?.mentor ?? <span className={s.sub}>—</span>}</td>
                      <td>{p.monitor ? nombreMonitor(p.monitor) : <Chip tono="neutro">Por asignar</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      <Asientos dias={dias} ciudades={ciudades} avisar={avisar} />

      {sel && (
        <Detalle key={sel.id} p={sel} version={version} dias={dias} monitores={monitores} nombreMonitor={nombreMonitor}
          onCerrar={() => setSel(null)} onHecho={trasAccion} />
      )}

      {toast && <div className={s.toast} role="status">{toast}</div>}
    </AppShell>
  );
}

function Chip({ tono, children }: { tono: "amarillo" | "neutro" | "verde"; children: React.ReactNode }) {
  return <span className={`${s.chip} ${s[`chip_${tono}`]}`}><i />{children}</span>;
}

function Skeleton() {
  return (
    <div className={s.skel} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className={s.skelFila} />)}
    </div>
  );
}

/* ---------------------------------------------------------------- Detalle */

function Detalle({ p, version, dias, monitores, nombreMonitor, onCerrar, onHecho }: {
  p: Proyecto; version: number; dias: string[]; monitores: Monitor[];
  nombreMonitor: (u: string | null) => string | null; onCerrar: () => void; onHecho: (msg: string) => Promise<void>;
}) {
  const [hist, setHist] = useState<{ estado: "cargando" | "error" | "listo"; items: Cambio[] }>({ estado: "cargando", items: [] });
  const [modo, setModo] = useState<"ver" | "liberar" | "cambiar">("ver");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState("");

  const cargarHist = useCallback(async () => {
    setHist((h) => ({ ...h, estado: "cargando" }));
    try {
      const r = await api<{ historial: Cambio[] }>(`/api/admin/proyectos/${p.id}`);
      setHist(r.ok && r.data ? { estado: "listo", items: r.data.historial } : { estado: "error", items: [] });
    } catch (e) { if (!(e instanceof SinSesion)) setHist({ estado: "error", items: [] }); }
  }, [p.id]);

  useEffect(() => { void cargarHist(); }, [cargarHist, version]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCerrar]);

  async function enviar(body: Record<string, unknown>, msg: string): Promise<{ error?: string } | null> {
    setOcupado(true); setError("");
    try {
      const r = await api<{ ok: boolean; error?: string; mensaje?: string }>(`/api/admin/proyectos/${p.id}`, body);
      setOcupado(false);
      if (r.ok) { setModo("ver"); setMotivo(""); await onHecho(msg); return null; }
      if (r.status === 404) setError("Este proyecto ya no existe. Cierra y recarga la lista.");
      else setError(r.data?.mensaje ?? "No se pudo guardar. Inténtalo otra vez.");
      return { error: r.data?.error };
    } catch (e) {
      setOcupado(false);
      if (!(e instanceof SinSesion)) setError(ERROR_RED);
      return { error: "red" };
    }
  }

  const ordenados = useMemo(() => {
    const suyos = monitores.filter((m) => m.ciudades.includes(p.ciudad));
    return { suyos, otros: monitores.filter((m) => !m.ciudades.includes(p.ciudad)) };
  }, [monitores, p.ciudad]);

  return (
    <div className={s.overlay} onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="det-titulo">
        <div className={s.asa} aria-hidden />
        <div className={s.modalHead}>
          <div>
            <div className={s.kicker}>{p.ciudad}{p.grupo ? ` · ${p.grupo}` : ""} · {p.codigo}</div>
            <h2 id="det-titulo" className={s.modalTitle}>{p.nombre}</h2>
          </div>
          <button type="button" className={s.cerrar} onClick={onCerrar} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className={s.datos}>
          <Dato k="Hora">{p.hora ? etiquetaHora(p.hora.inicio) + " COL" : <Chip tono="amarillo">Sin hora</Chip>}</Dato>
          <Dato k="Mentor">{p.hora?.mentor ?? "—"}</Dato>
          <Dato k="Monitor">
            <select className={`input ${s.selectSm}`} value={p.monitor ?? ""} disabled={ocupado} aria-label="Monitor"
              onChange={(e) => { const v = e.target.value || null; void enviar({ accion: "monitor", monitor: v }, v ? "Monitor asignado" : "Monitor quitado"); }}>
              <option value="">Por asignar</option>
              {ordenados.suyos.length > 0 && <optgroup label={`De ${p.ciudad}`}>{ordenados.suyos.map((m) => <option key={m.usuario} value={m.usuario}>{m.nombre}</option>)}</optgroup>}
              {ordenados.otros.length > 0 && <optgroup label="Otras ciudades">{ordenados.otros.map((m) => <option key={m.usuario} value={m.usuario}>{m.nombre} · {m.ciudades.join(", ")}</option>)}</optgroup>}
              {p.monitor && !monitores.some((m) => m.usuario === p.monitor) && <option value={p.monitor}>{nombreMonitor(p.monitor)} (inactivo)</option>}
            </select>
          </Dato>
        </div>

        <div>
          <div className={s.seccionK}>Integrantes</div>
          <ul className={s.integrantes}>
            {p.integrantes.map((i) => <li key={i.documento}><span>{i.nombre}</span><span className={s.doc}>{i.documento}</span></li>)}
          </ul>
        </div>

        {error && <div className="note note-error">{error}</div>}

        {modo === "ver" && (
          <div className={s.acts}>
            <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => { setError(""); setModo("cambiar"); }}>{p.hora ? "Cambiar hora" : "Asignar hora"}</button>
            {p.hora && <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => { setError(""); setModo("liberar"); }}>Liberar hora</button>}
          </div>
        )}

        {modo === "liberar" && p.hora && (
          <div className={s.panel}>
            <div className={s.panelTitulo}>¿Liberar {etiquetaHora(p.hora.inicio)} COL?</div>
            <p className={s.panelTxt}>El proyecto queda sin hora y el bloque vuelve a estar libre.</p>
            <Motivo valor={motivo} onCambio={setMotivo} />
            <div className={s.acts}>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setModo("ver")}>Cancelar</button>
              <button type="button" className="btn btn-dark" disabled={ocupado} onClick={() => void enviar({ accion: "liberar", motivo: motivo.trim() }, "Hora liberada")}>
                {ocupado ? "Liberando…" : "Liberar hora"}
              </button>
            </div>
          </div>
        )}

        {modo === "cambiar" && (
          <CambiarHora p={p} dias={dias} motivo={motivo} setMotivo={setMotivo} ocupado={ocupado}
            onCancelar={() => { setModo("ver"); setError(""); }}
            onEnviar={(inicio, otraCiudad) => enviar({ accion: "cambiar", inicio, otraCiudad, motivo: motivo.trim() }, "Hora cambiada")} />
        )}

        <div>
          <div className={s.seccionK}>Historial de cambios</div>
          {hist.estado === "cargando" && hist.items.length === 0 && <div className={s.skelFila} />}
          {hist.estado === "error" && <div className="note note-info">No pudimos cargar el historial. <button type="button" className="btn-link" onClick={() => void cargarHist()}>Intentar de nuevo</button></div>}
          {hist.estado === "listo" && hist.items.length === 0 && <p className={s.panelTxt}>Sin cambios todavía.</p>}
          {hist.items.length > 0 && (
            <ol className={s.hist}>
              {hist.items.map((c, i) => {
                const f = new Date(c.fecha);
                return (
                  <li key={i}>
                    <div className={s.histHead}><b>{ACCION[c.accion] ?? c.accion}</b><span className={s.histFecha}>{limpia(fmtFecha.format(f))} · {horaCO(f)}</span></div>
                    {(c.anterior || c.nuevo) && <div>{c.anterior ?? "—"}{c.nuevo !== undefined && <> → {c.nuevo}</>}</div>}
                    {c.motivo && <div className={s.histMotivo}>Motivo: {c.motivo}</div>}
                    <div className={s.sub}>{ROL[c.actor.rol] ?? c.actor.rol}{c.actor.usuario ? ` · ${c.actor.usuario}` : ""}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

const Dato = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className={s.dato}><div className={s.seccionK}>{k}</div><div className={s.datoV}>{children}</div></div>
);

function Motivo({ valor, onCambio, opcional }: { valor: string; onCambio: (v: string) => void; opcional?: boolean }) {
  return (
    <label className={s.campo}>
      <span className="label">Motivo{opcional ? " (opcional)" : ""}</span>
      <input className={`input ${s.inputSm}`} value={valor} maxLength={300} onChange={(e) => onCambio(e.target.value)} placeholder="Ej.: lo pidió el monitor" />
    </label>
  );
}

function CambiarHora({ p, dias, motivo, setMotivo, ocupado, onCancelar, onEnviar }: {
  p: Proyecto; dias: string[]; motivo: string; setMotivo: (v: string) => void; ocupado: boolean;
  onCancelar: () => void; onEnviar: (inicio: string, otraCiudad: boolean) => Promise<{ error?: string } | null>;
}) {
  const [dia, setDia] = useState(() => (p.hora ? diaCOL(new Date(p.hora.inicio)) : ""));
  const [datos, setDatos] = useState<{ estado: "inicial" | "cargando" | "error" | "listo"; tiene: boolean; bloques: Bloque[] }>({ estado: "inicial", tiene: true, bloques: [] });
  const [elegido, setElegido] = useState<Bloque | null>(null);
  const [noCabe, setNoCabe] = useState(false);

  const cargar = useCallback(async () => {
    if (!dia) return;
    setDatos((d) => ({ ...d, estado: "cargando" }));
    try {
      const r = await api<{ ciudadTieneElDia: boolean; bloques: Bloque[] }>(`/api/admin/proyectos/${p.id}/bloques?dia=${dia}`);
      setDatos(r.ok && r.data ? { estado: "listo", tiene: r.data.ciudadTieneElDia, bloques: r.data.bloques } : { estado: "error", tiene: true, bloques: [] });
    } catch (e) { if (!(e instanceof SinSesion)) setDatos({ estado: "error", tiene: true, bloques: [] }); }
  }, [p.id, dia]);

  useEffect(() => { setElegido(null); void cargar(); }, [cargar]);

  const porHora = useMemo(() => {
    const m = new Map<string, Bloque[]>();
    for (const b of datos.bloques) {
      const d = new Date(b.inicio);
      const k = horaCO(new Date(Math.floor(d.getTime() / 3600_000) * 3600_000));
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return [...m.entries()];
  }, [datos.bloques]);

  async function mover(b: Bloque) {
    setNoCabe(false);
    const r = await onEnviar(b.inicio, !b.deSuCiudad);
    if (r?.error === "sin_cupo") { setNoCabe(true); setElegido(null); void cargar(); }
  }

  const esLaActual = (b: Bloque) => p.hora?.inicio === b.inicio;

  return (
    <div className={s.panel}>
      <div className={s.panelTitulo}>{p.hora ? "Cambiar hora" : "Asignar hora"}</div>
      <div className={s.seccionK}>Día</div>
      <div className={s.dias}>
        {dias.length === 0 && <span className={s.sub}>No hay días cargados. Importa mentores y cupos.</span>}
        {dias.map((d) => (
          <button key={d} type="button" className={`${s.opcion} ${d === dia ? s.opcionOn : ""}`} aria-pressed={d === dia} onClick={() => { setDia(d); setNoCabe(false); }}>{etiquetaDia(d)}</button>
        ))}
      </div>

      {dia && datos.estado !== "inicial" && !datos.tiene && (
        <div className="note note-warn">Esta ciudad no presenta ese día.</div>
      )}

      {noCabe && <div className="note note-error"><b>No cabe.</b>&nbsp;Ese bloque se llenó. Elige otro.</div>}

      {dia && datos.estado === "cargando" && datos.bloques.length === 0 && <div className={s.skelFila} />}
      {dia && datos.estado === "error" && <div className="note note-error">No pudimos cargar los bloques. <button type="button" className="btn-link" onClick={() => void cargar()}>Intentar de nuevo</button></div>}
      {dia && datos.estado === "listo" && datos.bloques.length === 0 && <p className={s.panelTxt}>No quedan bloques libres ese día.</p>}

      {porHora.length > 0 && (
        <div className={`${s.horas} ${datos.estado === "cargando" ? s.recargando : ""}`}>
          {porHora.map(([h, bs]) => (
            <div key={h} className={s.horaFila}>
              <div className={s.horaK}>{h}</div>
              <div className={s.bloques}>
                {bs.map((b) => (
                  <button key={b.inicio} type="button" disabled={esLaActual(b)}
                    className={`${s.bloque} ${elegido?.inicio === b.inicio ? s.opcionOn : ""} ${b.deSuCiudad ? "" : s.bloqueOtra}`}
                    onClick={() => { setElegido(b); setNoCabe(false); }}>
                    <b>{horaCO(new Date(b.inicio))}</b>
                    <span>{esLaActual(b) ? "Hora actual" : b.deSuCiudad ? `${b.libres} ${b.libres === 1 ? "libre" : "libres"}` : `de ${b.otras.join(", ")}`}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Motivo valor={motivo} onCambio={setMotivo} opcional />

      {elegido && !elegido.deSuCiudad ? (
        <>
          <div className="note note-warn">A las {etiquetaHora(elegido.inicio)} COL no quedan asientos de {p.ciudad}: este asiento era de {elegido.otras.join(", ")}. Quedará anotado en el historial.</div>
          <div className={s.acts}>
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setElegido(null)}>Cancelar</button>
            <button type="button" className="btn btn-dark" disabled={ocupado} onClick={() => void mover(elegido)}>{ocupado ? "Moviendo…" : "Mover de todas formas"}</button>
          </div>
        </>
      ) : (
        <div className={s.acts}>
          <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!elegido || ocupado} onClick={() => elegido && void mover(elegido)}>
            {ocupado ? "Guardando…" : elegido ? `${p.hora ? "Cambiar a" : "Asignar"} ${horaCO(new Date(elegido.inicio))}` : "Elige un bloque"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Asientos */

function Asientos({ dias, ciudades, avisar }: { dias: string[]; ciudades: string[]; avisar: (t: string) => void }) {
  const [dia, setDia] = useState("");
  const [datos, setDatos] = useState<{ estado: "cargando" | "error" | "listo"; grupos: Grupo[]; explicitas: string[] }>({ estado: "cargando", grupos: [], explicitas: [] });
  const [desde, setDesde] = useState("");
  const [hacia, setHacia] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  const diaActivo = dia || dias[0] || "";

  const cargar = useCallback(async () => {
    if (!diaActivo) return;
    setDatos((d) => ({ ...d, estado: "cargando" }));
    try {
      const r = await api<{ grupos: Grupo[]; explicitas: string[] }>(`/api/admin/asientos?dia=${diaActivo}`);
      setDatos(r.ok && r.data ? { estado: "listo", grupos: r.data.grupos, explicitas: r.data.explicitas } : { estado: "error", grupos: [], explicitas: [] });
    } catch (e) { if (!(e instanceof SinSesion)) setDatos({ estado: "error", grupos: [], explicitas: [] }); }
  }, [diaActivo]);

  useEffect(() => { void cargar(); }, [cargar]);

  const origen = datos.grupos.find((g) => g.grupo === desde && g.libres > 0) ?? null;
  const n = Number(cantidad);
  const cantidadOk = origen !== null && Number.isInteger(n) && n >= 1 && n <= origen.libres;
  const listo = cantidadOk && hacia.length > 0;

  function cambiarDia(d: string) { setDia(d); setDesde(""); setCantidad(""); setConfirmar(false); setError(""); }
  const alternar = (c: string) => { setHacia((h) => (h.includes(c) ? h.filter((x) => x !== c) : [...h, c])); setConfirmar(false); };

  async function reetiquetar() {
    if (!origen || !listo) return;
    setOcupado(true); setError("");
    try {
      const r = await api<{ ok: boolean; cambiados?: number; mensaje?: string }>("/api/admin/asientos", { dia: diaActivo, desde: origen.grupo, hacia, cantidad: n });
      setOcupado(false);
      if (r.ok && r.data?.ok) {
        const c = r.data.cambiados ?? n;
        avisar(`${c} ${c === 1 ? "asiento reetiquetado" : "asientos reetiquetados"}`);
        setConfirmar(false); setDesde(""); setCantidad(""); setHacia([]);
        void cargar();
      } else {
        setError(r.data?.mensaje ?? "No se pudo reetiquetar. Inténtalo otra vez.");
        setConfirmar(false);
        void cargar();
      }
    } catch (e) {
      setOcupado(false);
      if (!(e instanceof SinSesion)) setError(ERROR_RED);
    }
  }

  return (
    <section className={`${s.card} ${s.asientos}`}>
      <div className={s.cardHead}>
        <div>
          <h2 className={s.cardTitle}>Reetiquetar asientos libres</h2>
          <p className={s.desc}>Pasa asientos libres de un grupo de ciudades a otras ciudades el mismo día. Las horas ya reservadas no se tocan.</p>
        </div>
        <select className={`input ${s.select}`} value={diaActivo} onChange={(e) => cambiarDia(e.target.value)} aria-label="Día" disabled={dias.length === 0}>
          {dias.length === 0 && <option value="">Sin días</option>}
          {dias.map((d) => <option key={d} value={d}>{etiquetaDia(d)}</option>)}
        </select>
      </div>

      {dias.length === 0 ? (
        <div className="note note-info">Todavía no hay días cargados. Importa mentores y cupos primero.</div>
      ) : datos.estado === "cargando" && datos.grupos.length === 0 ? <Skeleton /> : datos.estado === "error" ? (
        <div className={s.vacio}>
          <b>No pudimos cargar los asientos</b>
          <button type="button" className="btn btn-dark" onClick={() => void cargar()}>Intentar de nuevo</button>
        </div>
      ) : datos.grupos.length === 0 ? (
        <div className="note note-info">Ese día no tiene asientos.</div>
      ) : (
        <div className={s.asientosGrid}>
          <table className={`${s.tabla} ${datos.estado === "cargando" ? s.recargando : ""}`}>
            <thead><tr><th>Grupo de ciudades</th><th className={s.num}>Libres</th><th className={s.num}>Ocupados</th></tr></thead>
            <tbody>
              {datos.grupos.map((g) => (
                <tr key={g.grupo}><td>{g.grupo}</td><td className={s.num}>{g.libres}</td><td className={s.num}>{g.ocupados}</td></tr>
              ))}
            </tbody>
          </table>

          <div className={s.form}>
            <label className={s.campo}>
              <span className="label">Desde</span>
              <select className={`input ${s.inputSm}`} value={origen ? desde : ""} onChange={(e) => { setDesde(e.target.value); setCantidad(""); setConfirmar(false); }}>
                <option value="">Elige un grupo con libres…</option>
                {datos.grupos.filter((g) => g.libres > 0).map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo} · {g.libres} libres</option>)}
              </select>
            </label>

            <div className={s.campo}>
              <span className="label">Hacia</span>
              <div className={s.chips}>
                {ciudades.map((c) => (
                  <button key={c} type="button" className={`${s.ciudad} ${hacia.includes(c) ? s.ciudadOn : ""}`} aria-pressed={hacia.includes(c)} onClick={() => alternar(c)}>
                    {hacia.includes(c) && <span aria-hidden>✓</span>}{c}
                  </button>
                ))}
              </div>
            </div>

            <label className={s.campo}>
              <span className="label">Cantidad</span>
              <div className={s.cantidad}>
                <input className={`input ${s.inputSm} ${cantidad && !cantidadOk ? "is-error" : ""}`} type="number" inputMode="numeric" min={1} max={origen?.libres}
                  value={cantidad} disabled={!origen} onChange={(e) => { setCantidad(e.target.value); setConfirmar(false); }} />
                <button type="button" className="btn btn-soft" disabled={!origen} onClick={() => origen && setCantidad(String(origen.libres))}>Todos</button>
              </div>
              {origen && <span className={s.sub}>Máximo {origen.libres}.</span>}
              {cantidad && origen && !cantidadOk && <span className="msg-error">Escribe un número entre 1 y {origen.libres}.</span>}
            </label>

            {error && <div className="note note-error">{error}</div>}

            {confirmar && origen ? (
              <div className={s.panel}>
                <div className={s.panelTxt}>
                  ¿Pasar <b>{n}</b> {n === 1 ? "asiento libre" : "asientos libres"} de <b>{origen.grupo}</b> a <b>{hacia.join(", ")}</b> el {etiquetaDia(diaActivo)}?
                </div>
                <div className={s.acts}>
                  <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setConfirmar(false)}>Cancelar</button>
                  <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void reetiquetar()}>{ocupado ? "Reetiquetando…" : "Sí, reetiquetar"}</button>
                </div>
              </div>
            ) : (
              <div className={s.acts}>
                <button type="button" className="btn btn-dark" disabled={!listo} onClick={() => setConfirmar(true)}>Reetiquetar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

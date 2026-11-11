"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { TipoCitacion } from "@/lib/citaciones/contenido";
import type { EstadoGoogle } from "@/lib/citaciones/google";
import type { EstadoFila, EventoVista, Fila, Resultado } from "@/lib/citaciones/registro";
import AppShell from "./AppShell";
import s from "./CitacionesPanel.module.css";

// Fase 5 · Paso 29 · Citaciones por Google Calendar (solo admin): por día y pestaña (Participantes, Mentores,
// Monitores), el estado de cada fila, vista previa, citar / actualizar, cancelar, marcar como citado, «Citar todos los
// pendientes» (el navegador envía lotes de 10 y muestra el avance) y el texto «Ten en cuenta». Horas en hora COL.

type DiaInfo = { dia: string; proyectos: number };
type Datos = { estado: EstadoGoogle; dias: DiaInfo[]; tenEnCuenta: string; dia?: string; tipo?: TipoCitacion; filas?: Fila[]; pendientes?: string[] };
type Previa = { nombre: string; detalle: string; avisos: string[]; bloqueo?: string; eventos: EventoVista[]; prueba: string | null };
type Msg = { tipo: "ok" | "error" | "info"; texto: string; lista?: string[] };
type Confirmar =
  | { que: "pendientes"; claves: string[]; nombres: string[] }
  | { que: "marcar_todos"; nombres: string[] }
  | { que: "cancelar"; fila: Fila };

const LOTE = 10;
const TABS: { tipo: TipoCitacion; label: string }[] = [
  { tipo: "participante", label: "Participantes" },
  { tipo: "mentor", label: "Mentores" },
  { tipo: "monitor", label: "Monitores" },
];
const ESTADO: Record<EstadoFila, { txt: string; cls: "ok" | "warn" | "bad" | "neutro" }> = {
  sin_citar: { txt: "Sin citar", cls: "neutro" },
  citado: { txt: "Citado", cls: "ok" },
  externo: { txt: "Citado por fuera", cls: "ok" },
  desactualizado: { txt: "Desactualizado", cls: "warn" },
  error: { txt: "Error", cls: "bad" },
  enviando: { txt: "Enviando…", cls: "warn" },
  no_se_puede: { txt: "No se puede citar", cls: "bad" },
  sobra: { txt: "Ya no va este día", cls: "warn" },
};

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtHora = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
const fmtSoloHora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).replace(/\./g, "");
const etiquetaDia = (d: string) => cap(fmtDia.format(new Date(d + "T12:00:00Z")));
const fecha = (iso: string) => cap(fmtHora.format(new Date(iso)).replace(/\s+/g, " "));
const hoyCol = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

async function api<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) window.location.assign("/login");
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

type RespAccion = { resultados?: Resultado[]; mensaje?: string };

/** Resume los resultados de una acción en un mensaje (con la lista de fallas y avisos). */
function resumir(rs: Resultado[], hecho: string): Msg {
  const ok = rs.filter((r) => r.ok), mal = rs.filter((r) => !r.ok);
  const avisos = ok.flatMap((r) => (r.ok && r.aviso ? [`${r.nombre}: ${r.aviso}`] : []));
  const lista = [...mal.map((r) => `${r.nombre}: ${r.ok ? "" : r.mensaje}`), ...avisos];
  if (!mal.length) return { tipo: "ok", texto: `${ok.length} ${hecho}.`, ...(lista.length ? { lista } : {}) };
  return { tipo: ok.length ? "info" : "error", texto: `${ok.length} ${hecho}, ${mal.length} sin hacer.`, lista };
}

export default function CitacionesPanel({ user }: { user: SessionUser }) {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [dia, setDia] = useState("");
  const [tipo, setTipo] = useState<TipoCitacion>("participante");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [previa, setPrevia] = useState<Previa | "cargando" | null>(null);
  const [texto, setTexto] = useState("");
  const [msgTexto, setMsgTexto] = useState<Msg | null>(null);

  const cargar = useCallback(async (diaSel: string, tipoSel: TipoCitacion) => {
    const q = diaSel ? `?dia=${diaSel}&tipo=${tipoSel}` : "";
    const r = await api<Datos>(`/api/admin/citaciones${q}`).catch(() => null);
    if (!r?.ok || !r.data) return setError(true);
    setError(false);
    setD(r.data);
    if (!diaSel && r.data.dias.length) {
      const hoy = hoyCol();
      setDia((r.data.dias.find((x) => x.dia >= hoy) ?? r.data.dias[r.data.dias.length - 1]!).dia);
    }
  }, []);
  useEffect(() => { void cargar(dia, tipo); }, [cargar, dia, tipo]);
  useEffect(() => { if (d) setTexto((t) => t || d.tenEnCuenta); }, [d]);
  useEffect(() => { setMsg(null); }, [dia, tipo]);

  const estado = d?.estado;
  const prueba = estado?.correoPrueba ?? null;
  const conectado = !!estado?.conectado && !estado.error;
  const filas = d?.dia === dia && d.tipo === tipo ? d.filas ?? [] : null;
  const pendientes = new Set(d?.pendientes ?? []);
  const marcables = (filas ?? []).filter((f) => puedeMarcar(f));

  function puedeMarcar(f: Fila) {
    return !prueba && !estado?.error && !f.conEventos && ["sin_citar", "desactualizado", "error", "no_se_puede"].includes(f.estado);
  }
  function puedeCancelar(f: Fila) {
    if (!conectado || f.estado === "enviando" || !(f.conEventos || f.externo)) return false;
    // En modo prueba solo se cancela lo enviado en prueba; nunca lo citado de verdad.
    return prueba ? !!f.prueba && f.conEventos : true;
  }

  async function accion(cuerpo: Record<string, unknown>): Promise<Resultado[] | null> {
    const r = await api<RespAccion>("/api/admin/citaciones/acciones", { tipo, dia, ...cuerpo }).catch(() => null);
    if (!r?.data) { setMsg({ tipo: "error", texto: "Sin conexión. Recarga y revisa el estado antes de reintentar." }); return null; }
    if (!r.ok || !r.data.resultados) { setMsg({ tipo: "error", texto: r.data.mensaje ?? "No se pudo hacer." }); return null; }
    return r.data.resultados;
  }

  async function una(f: Fila, que: "citar" | "cancelar" | "marcar") {
    setOcupado(f.clave); setMsg(null);
    const rs = await accion({ accion: que, claves: [f.clave] });
    setOcupado(null);
    if (rs) setMsg(resumir(rs, que === "citar" ? "citada(s)" : que === "cancelar" ? "cancelada(s)" : "marcada(s) como citada(s)"));
    await cargar(dia, tipo);
  }

  async function citarPendientes(claves: string[]) {
    setConfirmar(null); setMsg(null); setOcupado("lote");
    const todos: Resultado[] = [];
    setAvance({ hechos: 0, total: claves.length });
    for (let i = 0; i < claves.length; i += LOTE) {
      const lote = claves.slice(i, i + LOTE);
      const rs = await accion({ accion: "citar", claves: lote });
      // Sin respuesta (red o tiempo): se detiene; lo enviado queda registrado y «Citar pendientes» retoma.
      if (!rs) break;
      todos.push(...rs);
      setAvance({ hechos: Math.min(i + LOTE, claves.length), total: claves.length });
    }
    setAvance(null); setOcupado(null);
    if (todos.length) setMsg(resumir(todos, "citada(s)"));
    await cargar(dia, tipo);
  }

  async function marcarTodos() {
    setConfirmar(null); setMsg(null); setOcupado("lote");
    const rs = await accion({ accion: "marcar_todos" });
    setOcupado(null);
    if (rs) setMsg(resumir(rs, "marcada(s) como citada(s) sin evento"));
    await cargar(dia, tipo);
  }

  async function verPrevia(f: Fila) {
    setPrevia("cargando");
    const r = await api<Previa & { mensaje?: string }>(`/api/admin/citaciones/previa?dia=${dia}&tipo=${tipo}&clave=${encodeURIComponent(f.clave)}`).catch(() => null);
    if (!r?.ok || !r.data) { setPrevia(null); setMsg({ tipo: "error", texto: r?.data?.mensaje ?? "No se pudo cargar la vista previa." }); return; }
    setPrevia(r.data);
  }

  async function guardarTexto() {
    setOcupado("texto"); setMsgTexto(null);
    const r = await api<{ ok?: boolean; texto?: string; mensaje?: string }>("/api/admin/citaciones/texto", { texto }).catch(() => null);
    setOcupado(null);
    if (r?.ok && r.data?.texto) { setTexto(r.data.texto); setMsgTexto({ tipo: "ok", texto: "Guardado. Se usa en las próximas citaciones; lo ya enviado no cambia (no queda «Desactualizado»)." }); await cargar(dia, tipo); }
    else setMsgTexto({ tipo: "error", texto: r?.data?.mensaje ?? "No se pudo guardar." });
  }

  const nombresDe = (claves: string[]) => claves.map((k) => filas?.find((f) => f.clave === k)?.nombre ?? k);

  return (
    <AppShell user={user} active="citaciones">
      {prueba && <div className={s.prueba} role="status">MODO PRUEBA: todas las invitaciones van a {prueba}</div>}
      <div className={s.kicker}>Citaciones por Google Calendar</div>
      <h1 className={s.title}>Citar presentaciones</h1>
      <p className={s.lead}>Cada fila es una invitación de calendario: participantes (un evento por proyecto), mentores y monitores (un evento por franja). Si algo cambia después de citar, la fila queda «Desactualizada» y dice qué cambió.</p>

      {estado && !estado.conectado && !estado.error && <div className={`note note-warn ${s.aviso}`}>Google Calendar no está conectado: no se envía nada. Puedes revisar las vistas previas y marcar como citado lo que enviaste por fuera.</div>}
      {estado?.error && <div className={`note note-error ${s.aviso}`}>{estado.error}</div>}
      {error && <div className="note note-error">No pudimos cargar las citaciones. <button type="button" className="btn-link" onClick={() => void cargar(dia, tipo)}>Intentar de nuevo</button></div>}
      {!d && !error && <div className={s.skel} />}

      {d && !d.dias.length && <div className="note note-info">Todavía no hay proyectos con hora elegida.</div>}

      {d && d.dias.length > 0 && (
        <>
          <div className={s.dias} role="group" aria-label="Día">
            {d.dias.map((x) => (
              <button key={x.dia} type="button" className={`${s.dia} ${x.dia === dia ? s.diaOn : ""}`} aria-pressed={x.dia === dia} onClick={() => setDia(x.dia)} disabled={!!ocupado}>
                <b>{etiquetaDia(x.dia)}</b><span>{x.proyectos} proyecto{x.proyectos === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>

          <section className={s.card}>
            <div className={s.cardHead}>
              <div className={s.tabs} role="tablist" aria-label="Quién">
                {TABS.map((t) => (
                  <button key={t.tipo} type="button" role="tab" aria-selected={t.tipo === tipo} className={`${s.tab} ${t.tipo === tipo ? s.tabOn : ""}`} onClick={() => setTipo(t.tipo)} disabled={!!ocupado}>{t.label}</button>
                ))}
              </div>
              <div className={s.acts}>
                <button type="button" className="btn btn-primary" disabled={!conectado || !!ocupado || !pendientes.size} onClick={() => setConfirmar({ que: "pendientes", claves: [...pendientes], nombres: nombresDe([...pendientes]) })}>
                  Citar todos los pendientes de este día ({pendientes.size})
                </button>
                {!prueba && (
                  <button type="button" className="btn btn-ghost" disabled={!!estado?.error || !!ocupado || !marcables.length} onClick={() => setConfirmar({ que: "marcar_todos", nombres: marcables.map((f) => f.nombre) })}>
                    Marcar todos como citados (sin evento)
                  </button>
                )}
              </div>
            </div>

            {avance && (
              <div role="status" aria-live="polite">
                <div className={s.sub}>Enviando {avance.hechos} de {avance.total}… no cierres esta página.</div>
                <div className={s.barra}><i style={{ transform: `scaleX(${avance.hechos / Math.max(1, avance.total)})` }} /></div>
              </div>
            )}
            {msg && (
              <div className={`note ${msg.tipo === "ok" ? "note-info" : msg.tipo === "error" ? "note-error" : "note-warn"}`} role="status">
                {msg.texto}
                {msg.lista && <ul className={s.nombres}>{msg.lista.map((t, i) => <li key={i}>{t}</li>)}</ul>}
              </div>
            )}

            {!filas && <div className={s.skel} />}
            {filas && !filas.length && <div className={s.sub}>No hay nada que citar este día en esta pestaña.</div>}
            {filas && filas.length > 0 && (
              <div className={s.lista}>
                {filas.map((f) => {
                  const e = ESTADO[f.estado];
                  const citable = conectado && pendientes.has(f.clave);
                  const verbo = f.estado === "desactualizado" ? "Actualizar" : f.estado === "error" ? "Reintentar" : "Citar";
                  const aqui = ocupado === f.clave;
                  return (
                    <div key={f.clave} className={s.fila}>
                      <div className={s.info}>
                        <div className={s.chips}>
                          <span className={s.nombre}>{f.nombre}</span>
                          <span className={`${s.chip} ${s[e.cls]}`}>{e.txt}</span>
                          {f.prueba && <span className={`${s.chip} ${s.warn}`}>{f.soloPrueba ? "Solo en prueba" : "Prueba"}</span>}
                        </div>
                        <div className={s.detalle}>{f.detalle}</div>
                        {f.bloqueo && <div className={s.malo}>{f.bloqueo}</div>}
                        {f.error && f.estado === "error" && <div className={s.malo}>{f.error}</div>}
                        {f.cambios.length > 0 && <div className={s.nota}>Cambió: {f.cambios.join(" · ")}</div>}
                        {f.avisos.map((a, i) => <div key={i} className={s.nota}>{a}</div>)}
                        {f.citadoEn && <div className={s.detalle}>{f.externo ? "Marcado" : "Citado"} {fecha(f.citadoEn)}{f.citadoPor ? ` por ${f.citadoPor}` : ""}</div>}
                        {f.canceladoEn && <div className={s.detalle}>Cancelado {fecha(f.canceladoEn)}</div>}
                      </div>
                      <div className={s.filaActs}>
                        {f.estado !== "sobra" && <button type="button" className={s.mini} onClick={() => void verPrevia(f)} disabled={!!ocupado}>Vista previa</button>}
                        {citable && <button type="button" className={`${s.mini} ${s.miniFuerte}`} onClick={() => void una(f, "citar")} disabled={!!ocupado}>{aqui ? "Enviando…" : verbo}</button>}
                        {puedeMarcar(f) && <button type="button" className={s.mini} onClick={() => void una(f, "marcar")} disabled={!!ocupado}>Marcar como citado</button>}
                        {puedeCancelar(f) && <button type="button" className={`${s.mini} ${s.miniPeligro}`} onClick={() => setConfirmar({ que: "cancelar", fila: f })} disabled={!!ocupado}>Cancelar</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {d && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.cardT}>«Ten en cuenta» de los participantes</h2>
            <span className={s.sub}>Una recomendación por línea</span>
          </div>
          <textarea className={s.texto} value={texto} onChange={(e) => { setTexto(e.target.value); setMsgTexto(null); }} maxLength={4000} aria-label="Texto «Ten en cuenta»" />
          {msgTexto && <div className={`note ${msgTexto.tipo === "ok" ? "note-info" : "note-error"}`} role="status">{msgTexto.texto}</div>}
          <div className={s.acts}>
            <button type="button" className="btn btn-dark" onClick={() => void guardarTexto()} disabled={!!ocupado || !texto.trim() || texto === d.tenEnCuenta}>{ocupado === "texto" ? "Guardando…" : "Guardar texto"}</button>
            {texto !== d.tenEnCuenta && <button type="button" className="btn btn-ghost" onClick={() => { setTexto(d.tenEnCuenta); setMsgTexto(null); }} disabled={!!ocupado}>Deshacer cambios</button>}
          </div>
        </section>
      )}

      {confirmar && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="cit-confirmar">
          <div className={s.modal}>
            {confirmar.que === "pendientes" && (
              <>
                <div id="cit-confirmar" className={s.modalT}>¿Citar {confirmar.claves.length} pendiente{confirmar.claves.length === 1 ? "" : "s"} del {etiquetaDia(dia)}?</div>
                <div className={s.sub}>{TABS.find((t) => t.tipo === tipo)!.label}. Se envían en lotes de {LOTE}; si una falla, queda en Error y se sigue con las demás.{prueba ? ` Modo prueba: todo va solo a ${prueba}.` : " Les llega la invitación por correo."}</div>
                <ul className={s.nombres}>{confirmar.nombres.map((n, i) => <li key={i}>{n}</li>)}</ul>
                <div className={s.acts}>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(null)}>No, volver</button>
                  <button type="button" className="btn btn-primary" onClick={() => void citarPendientes(confirmar.claves)}>Sí, citar {confirmar.claves.length}</button>
                </div>
              </>
            )}
            {confirmar.que === "marcar_todos" && (
              <>
                <div id="cit-confirmar" className={s.modalT}>¿Marcar {confirmar.nombres.length} como citado{confirmar.nombres.length === 1 ? "" : "s"} sin evento?</div>
                <div className={s.sub}>Solo se registra que ya los citaste por fuera (no se envía nada). Si luego cambia algo, quedan «Desactualizados».</div>
                <ul className={s.nombres}>{confirmar.nombres.map((n, i) => <li key={i}>{n}</li>)}</ul>
                <div className={s.acts}>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(null)}>No, volver</button>
                  <button type="button" className="btn btn-dark" onClick={() => void marcarTodos()}>Sí, marcar</button>
                </div>
              </>
            )}
            {confirmar.que === "cancelar" && (
              <>
                <div id="cit-confirmar" className={s.modalT}>¿Cancelar la citación de {confirmar.fila.nombre}?</div>
                <div className={s.sub}>{confirmar.fila.conEventos ? "Se borran sus eventos en Google Calendar y a los invitados les llega el aviso de cancelación." : "Estaba marcada como citada por fuera: solo se desmarca aquí; si debe cancelarse, hazlo a mano en Google Calendar."}</div>
                <div className={s.acts}>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(null)}>No, volver</button>
                  <button type="button" className="btn btn-primary" onClick={() => { const f = confirmar.fila; setConfirmar(null); void una(f, "cancelar"); }}>Sí, cancelar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {previa && (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="cit-previa" onClick={(e) => { if (e.target === e.currentTarget) setPrevia(null); }}>
          <div className={s.modal}>
            {previa === "cargando" ? <div id="cit-previa" className={s.sub}>Cargando vista previa…</div> : (
              <>
                <div id="cit-previa" className={s.modalT}>Vista previa · {previa.nombre}</div>
                {previa.prueba && <div className="note note-warn">Modo prueba: el único invitado es {previa.prueba}.</div>}
                {previa.bloqueo && <div className="note note-error">{previa.bloqueo}</div>}
                {previa.avisos.map((a, i) => <div key={i} className="note note-warn">{a}</div>)}
                {previa.eventos.map((ev, i) => (
                  <div key={i} className={s.evento}>
                    <b>{ev.titulo}</b>
                    <div className={s.sub}>{fecha(ev.inicio)} – {fmtSoloHora.format(new Date(ev.fin))}{ev.ubicacion ? ` · ${ev.ubicacion}` : ""}</div>
                    <div className={s.sub}>Invitados: {ev.invitados.length ? ev.invitados.map((x) => `${x.nombre} <${x.correo}>`).join(", ") : "ninguno"}</div>
                    <pre>{ev.descripcion}</pre>
                  </div>
                ))}
                <div className={s.acts}><button type="button" className="btn btn-ghost" onClick={() => setPrevia(null)}>Cerrar</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

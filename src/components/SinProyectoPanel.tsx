"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { FilaMarcado, FilaParticipante, PreviaSinProyecto } from "@/lib/sinProyecto";
import AppShell from "./AppShell";
import { useVentana } from "./useVentana";
import s from "./HorariosPanel.module.css";

// Paso 21 · «Sin proyecto» (solo admin): participantes sin proyecto (cargar por Excel o uno por uno, convertir en
// proyecto, quitar uno cargado por error) y la lista de proyectos marcados «Sin proyecto» (se marcan en Horarios).

type Monitor = { usuario: string; nombre: string; ciudades: string[] };
type Datos = { participantes: FilaParticipante[]; marcados: FilaMarcado[]; monitores: Monitor[]; ciudades: string[] };
type Ventana = { tipo: "agregar" } | { tipo: "convertir"; p: FilaParticipante } | { tipo: "quitar"; p: FilaParticipante };
type Respuesta = { ok?: boolean; error?: string; mensaje?: string; campo?: string; codigo?: string };

class SinSesion extends Error {}
async function api<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, body === undefined
    ? { cache: "no-store" }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) { window.location.assign("/login"); throw new SinSesion(); }
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
}
const ERROR_RED = "Sin conexión. Revisa tu internet e inténtalo otra vez.";
const fmtFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
const fecha = (iso: string) => fmtFecha.format(new Date(iso)).replace(/\./g, "");

function Chip({ tono, children }: { tono: "amarillo" | "neutro" | "verde"; children: React.ReactNode }) {
  return <span className={`${s.chip} ${s[`chip_${tono}`]}`}><i />{children}</span>;
}

export default function SinProyectoPanel({ user }: { user: SessionUser }) {
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((t: string) => {
    setToast(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await api<Datos>("/api/admin/sin-proyecto");
      if (!r.ok || !r.data) return setCarga("error");
      setDatos(r.data);
      setCarga("listo");
    } catch (e) { if (!(e instanceof SinSesion)) setCarga("error"); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const hecho = useCallback(async (msg: string) => { setVentana(null); avisar(msg); await cargar(); }, [avisar, cargar]);
  const nombreMonitor = (u: string | null) => (u ? datos?.monitores.find((m) => m.usuario === u)?.nombre ?? u : null);
  const pendientes = datos?.participantes.filter((p) => !p.convertido) ?? [];
  const convertidos = datos?.participantes.filter((p) => p.convertido) ?? [];

  return (
    <AppShell user={user} active="sinProyecto">
      <div className={s.kicker}>Administración</div>
      <h1 className={s.title}>Sin proyecto</h1>
      <p className={s.lead}>Participantes que todavía no tienen proyecto y proyectos marcados «Sin proyecto». No cuentan en el seguimiento y en el portal ven «No tienes un proyecto inscrito. Escríbele a tu monitor.».</p>
      <div className={s.acts}><button type="button" className="btn btn-primary" onClick={() => setVentana({ tipo: "agregar" })}>Agregar participante</button></div>

      <CargaExcel onHecho={(msg) => { avisar(msg); void cargar(); }} />

      {carga === "cargando" && !datos && <section className={s.card}><div className={s.skel}><div className={s.skelFila} /><div className={s.skelFila} /></div></section>}
      {carga === "error" && (
        <section className={s.card}>
          <div className={s.vacio}><b>No pudimos cargar la lista</b><span>Revisa tu conexión e intenta otra vez.</span>
            <button type="button" className="btn btn-dark" onClick={() => void cargar()}>Intentar de nuevo</button></div>
        </section>
      )}

      {datos && (
        <>
          <section className={s.card}>
            <div className={s.cardHead}><h2 className={s.cardTitle}>Participantes sin proyecto</h2><Chip tono={pendientes.length ? "amarillo" : "verde"}>{pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"}</Chip></div>
            {datos.participantes.length === 0 ? (
              <div className={s.vacio}><b>Todavía no hay participantes sin proyecto.</b><span>Agrégalos uno por uno o carga un Excel.</span></div>
            ) : (
              <div className={s.tablaWrap}>
                <table className={s.tabla}>
                  <thead><tr><th>Participante</th><th>Ciudad</th><th>Monitor</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {[...pendientes, ...convertidos].map((p) => (
                      <tr key={p.id}>
                        <td><div className={s.pNombre}>{p.nombre}</div><div className={s.codigo}>{p.documento}</div></td>
                        <td>{p.ciudad}</td>
                        <td>{nombreMonitor(p.monitor) ?? <Chip tono="neutro">Por asignar</Chip>}</td>
                        <td>{p.convertido ? <Chip tono="verde">Proyecto {p.convertido.codigo}</Chip> : <Chip tono="amarillo">Sin proyecto · desde {fecha(p.creadoEn)}</Chip>}</td>
                        <td>
                          {!p.convertido && (
                            <div className={s.acts}>
                              <button type="button" className="btn btn-dark" onClick={() => setVentana({ tipo: "convertir", p })}>Convertir en proyecto</button>
                              <button type="button" className="btn btn-ghost" onClick={() => setVentana({ tipo: "quitar", p })}>Quitar</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={s.card}>
            <div className={s.cardHead}><h2 className={s.cardTitle}>Proyectos marcados «Sin proyecto»</h2><Chip tono="neutro">{datos.marcados.length}</Chip></div>
            <p className={s.desc}>Se marcan y desmarcan en <a href="/admin/horarios">Horarios</a> (filtro «Sin proyecto»), solo si el proyecto no tiene hora.</p>
            {datos.marcados.length === 0 ? (
              <div className={s.vacio}><b>Ningún proyecto marcado.</b></div>
            ) : (
              <div className={s.tablaWrap}>
                <table className={s.tabla}>
                  <thead><tr><th>Proyecto</th><th>Integrantes</th><th>Ciudad</th><th>Desde</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {datos.marcados.map((p) => (
                      <tr key={p.id}>
                        <td><div className={s.pNombre}>{p.nombre}</div><div className={s.codigo}>{p.codigo}</div></td>
                        <td>{p.integrantes.map((n) => <div key={n}>{n}</div>)}</td>
                        <td>{p.ciudad}</td>
                        <td className={s.nowrap}>{fecha(p.desde)}</td>
                        <td>{p.motivo ?? <span className={s.sub}>—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {ventana?.tipo === "agregar" && datos && <Agregar datos={datos} onCerrar={() => setVentana(null)} onHecho={hecho} />}
      {ventana?.tipo === "convertir" && <Convertir p={ventana.p} onCerrar={() => setVentana(null)} onHecho={hecho} />}
      {ventana?.tipo === "quitar" && <Quitar p={ventana.p} onCerrar={() => setVentana(null)} onHecho={hecho} />}
      {toast && <div className={s.toast} role="status">{toast}</div>}
    </AppShell>
  );
}

function Modal({ titulo, kicker, v, children }: { titulo: string; kicker: string; v: ReturnType<typeof useVentana>; children: React.ReactNode }) {
  return (
    <div className={s.overlay}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="sp-titulo" {...v.dialogo}>
        {v.confirmacion}
        <div className={s.asa} aria-hidden />
        <div className={s.modalHead}>
          <div><div className={s.kicker}>{kicker}</div><h2 id="sp-titulo" className={s.modalTitle}>{titulo}</h2></div>
          <button type="button" className={s.cerrar} onClick={v.cerrar} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Envía y devuelve null si salió bien; si no, el mensaje para mostrar. */
async function enviar(body: unknown): Promise<{ ok: true; data: Respuesta | null } | { ok: false; mensaje: string; campo?: string }> {
  try {
    const r = await api<Respuesta>("/api/admin/sin-proyecto", body);
    if (r.ok) return { ok: true, data: r.data };
    return { ok: false, mensaje: r.data?.mensaje ?? "No se pudo guardar. Inténtalo otra vez.", ...(r.data?.campo ? { campo: r.data.campo } : {}) };
  } catch (e) {
    if (e instanceof SinSesion) throw e;
    return { ok: false, mensaje: ERROR_RED };
  }
}

function Agregar({ datos, onCerrar, onHecho }: { datos: Datos; onCerrar: () => void; onHecho: (msg: string) => Promise<void> }) {
  const [f, setF] = useState({ nombre: "", documento: "", ciudad: "", celular: "", correo: "", monitor: "auto" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const v = useVentana(onCerrar, { bloqueado: ocupado });
  const deCiudad = datos.monitores.filter((m) => m.ciudades.includes(f.ciudad));
  const campo = (k: "nombre" | "documento" | "celular" | "correo", etq: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={s.campo}><span className="label">{etq}</span>
      <input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></label>
  );
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setError("");
    const r = await enviar({
      accion: "agregar",
      participante: {
        nombre: f.nombre, documento: f.documento, ciudad: f.ciudad,
        ...(f.celular.trim() ? { celular: f.celular } : {}), ...(f.correo.trim() ? { correo: f.correo } : {}),
        ...(f.monitor === "auto" ? {} : { monitor: f.monitor === "" ? null : f.monitor }),
      },
    }).catch(() => null);
    setOcupado(false);
    if (!r) return;
    if (!r.ok) return setError(r.mensaje);
    v.limpiar();
    await onHecho("Participante agregado a «Sin proyecto»");
  }
  return (
    <Modal titulo="Agregar participante" kicker="Sin proyecto" v={v}>
      <form className={s.form} onSubmit={(e) => void guardar(e)}>
        {campo("nombre", "Nombre completo", { required: true, maxLength: 120, autoComplete: "off" })}
        {campo("documento", "Documento (sin puntos)", { required: true, maxLength: 30, inputMode: "numeric", autoComplete: "off" })}
        <label className={s.campo}><span className="label">Ciudad</span>
          <select className="input" required value={f.ciudad} onChange={(e) => setF({ ...f, ciudad: e.target.value, monitor: "auto" })}>
            <option value="">Elige la ciudad…</option>
            {datos.ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
        {campo("celular", "Celular (opcional)", { maxLength: 30, inputMode: "tel", autoComplete: "off" })}
        {campo("correo", "Correo (opcional)", { maxLength: 120, type: "email", autoComplete: "off" })}
        <label className={s.campo}><span className="label">Monitor</span>
          <select className="input" value={f.monitor} onChange={(e) => setF({ ...f, monitor: e.target.value })}>
            <option value="auto">{deCiudad.length === 1 ? `El de la ciudad (${deCiudad[0]!.nombre})` : "El de la ciudad (si tiene uno solo)"}</option>
            <option value="">Por asignar</option>
            {datos.monitores.map((m) => <option key={m.usuario} value={m.usuario}>{m.nombre} · {m.ciudades.join(", ")}</option>)}
          </select></label>
        {error && <div className="note note-error" role="alert">{error}</div>}
        <div className={s.acts}>
          <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={v.cerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={ocupado}>{ocupado ? "Guardando…" : "Agregar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Convertir({ p, onCerrar, onHecho }: { p: FilaParticipante; onCerrar: () => void; onHecho: (msg: string) => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [ruta, setRuta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const v = useVentana(onCerrar, { bloqueado: ocupado });
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true); setError("");
    const r = await enviar({ accion: "convertir", id: p.id, nombre, ...(descripcion.trim() ? { descripcion } : {}), ...(ruta ? { ruta } : {}) }).catch(() => null);
    setOcupado(false);
    if (!r) return;
    if (!r.ok) return setError(r.mensaje);
    v.limpiar();
    await onHecho(`Proyecto ${r.data?.codigo ?? ""} creado: ${p.nombre} ya puede elegir hora`);
  }
  return (
    <Modal titulo={`Convertir a ${p.nombre} en proyecto`} kicker={`${p.ciudad} · ${p.documento}`} v={v}>
      <p className={s.panelTxt}>Se crea un proyecto individual sin hora, con su ciudad, sus datos y su monitor. Si va en pareja, después usa «Agregar integrante» en Horarios. El registro queda aquí como convertido.</p>
      <form className={s.form} onSubmit={(e) => void guardar(e)}>
        <label className={s.campo}><span className="label">Nombre del proyecto</span>
          <input className="input" required maxLength={160} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" /></label>
        <label className={s.campo}><span className="label">Descripción (opcional)</span>
          <textarea className="input" rows={3} maxLength={1000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
        <label className={s.campo}><span className="label">Ruta (opcional)</span>
          <select className="input" value={ruta} onChange={(e) => setRuta(e.target.value)}>
            <option value="">Sin ruta</option><option value="Básica">Básica</option><option value="Avanzada">Avanzada</option>
          </select></label>
        {error && <div className="note note-error" role="alert">{error}</div>}
        <div className={s.acts}>
          <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={v.cerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={ocupado || nombre.trim().length < 2}>{ocupado ? "Creando…" : "Crear proyecto"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Quitar({ p, onCerrar, onHecho }: { p: FilaParticipante; onCerrar: () => void; onHecho: (msg: string) => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const v = useVentana(onCerrar, { bloqueado: ocupado });
  async function quitar() {
    setOcupado(true); setError("");
    const r = await enviar({ accion: "quitar", id: p.id }).catch(() => null);
    setOcupado(false);
    if (!r) return;
    if (!r.ok) return setError(r.mensaje);
    await onHecho(`${p.nombre} salió de «Sin proyecto»`);
  }
  return (
    <Modal titulo={`¿Quitar a ${p.nombre}?`} kicker="Sin proyecto" v={v}>
      <p className={s.panelTxt}>Úsalo si se cargó por error. Queda anotado en el historial. Si luego tiene proyecto, créalo desde Horarios.</p>
      {error && <div className="note note-error" role="alert">{error}</div>}
      <div className={s.acts}>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={v.cerrar}>Cancelar</button>
        <button type="button" className="btn btn-dark" disabled={ocupado} onClick={() => void quitar()}>{ocupado ? "Quitando…" : "Sí, quitar"}</button>
      </div>
    </Modal>
  );
}

function CargaExcel({ onHecho }: { onHecho: (msg: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaSinProyecto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function subir(modo: "previa" | "confirmar", f = archivo) {
    if (!f) return;
    setOcupado(true); setError("");
    const fd = new FormData();
    fd.set("modo", modo); fd.set("archivo", f);
    try {
      const res = await fetch("/api/admin/sin-proyecto/importar", { method: "POST", body: fd });
      if (res.status === 401) { window.location.assign("/login"); return; }
      const d = (await res.json().catch(() => null)) as { previa?: PreviaSinProyecto; aplicado?: boolean; agregados?: number; omitidos?: { fila: number; mensaje: string }[]; mensaje?: string } | null;
      if (!res.ok || !d?.previa) { setError(d?.mensaje ?? "No se pudo leer el archivo."); return; }
      if (modo === "confirmar" && d.aplicado) {
        const om = d.omitidos?.length ?? 0;
        onHecho(`${d.agregados ?? 0} participante${d.agregados === 1 ? "" : "s"} agregado${d.agregados === 1 ? "" : "s"}${om ? ` · ${om} omitido${om === 1 ? "" : "s"}` : ""}`);
        if (om) { setPrevia({ ...d.previa, nuevos: [], errores: d.omitidos! }); return; }
        setArchivo(null); setPrevia(null);
        if (input.current) input.current.value = "";
        return;
      }
      setPrevia(d.previa);
    } catch {
      setError(ERROR_RED);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className={s.card}>
      <div className={s.cardHead}><h2 className={s.cardTitle}>Cargar por Excel</h2></div>
      <p className={s.desc}>Primera fila con los encabezados <b>Nombre, Documento y Ciudad</b>; <b>Celular, Correo y Monitor</b> son opcionales. Primero ves la vista previa; nada se guarda hasta que confirmes.</p>
      <div className={s.acts}>
        <input ref={input} type="file" accept=".xlsx" className="input" aria-label="Archivo de Excel"
          onChange={(e) => { const f = e.target.files?.[0] ?? null; setArchivo(f); setPrevia(null); if (f) void subir("previa", f); }} />
      </div>
      {ocupado && <div className={s.skelFila} />}
      {error && <div className="note note-error" role="alert">{error}</div>}
      {previa && (
        <div className={s.panel}>
          <div className={s.panelTitulo}>{previa.nuevos.length} nuevo{previa.nuevos.length === 1 ? "" : "s"} para agregar</div>
          {previa.nuevos.length > 0 && (
            <div className={s.tablaWrap}>
              <table className={s.tabla}>
                <thead><tr><th>Fila</th><th>Nombre</th><th>Documento</th><th>Ciudad</th><th>Aviso</th></tr></thead>
                <tbody>{previa.nuevos.map((n) => <tr key={n.fila}><td>{n.fila}</td><td>{n.nombre}</td><td>{n.documento}</td><td>{n.ciudad}</td><td>{n.aviso ?? (n.monitor ? "" : "Monitor por asignar")}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {previa.yaRegistrados.length > 0 && <div className="note note-info">Ya están en «Sin proyecto» (se omiten): {previa.yaRegistrados.map((x) => `fila ${x.fila} · ${x.nombre}`).join("; ")}.</div>}
          {previa.enProyecto.length > 0 && <div className="note note-warn">Ya tienen proyecto (se omiten): {previa.enProyecto.map((x) => `fila ${x.fila} · ${x.nombre} (${x.codigo})`).join("; ")}.</div>}
          {previa.errores.length > 0 && (
            <div className="note note-error">
              <b>{previa.errores.length} fila{previa.errores.length === 1 ? "" : "s"} con errores (se omiten):</b>
              <ul>{previa.errores.map((e, i) => <li key={i}>{e.fila ? `Fila ${e.fila}: ` : ""}{e.mensaje}</li>)}</ul>
            </div>
          )}
          <div className={s.acts}>
            <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => { setPrevia(null); setArchivo(null); if (input.current) input.current.value = ""; }}>Cancelar</button>
            {previa.nuevos.length > 0 && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void subir("confirmar")}>{ocupado ? "Guardando…" : `Agregar ${previa.nuevos.length}`}</button>}
          </div>
        </div>
      )}
    </section>
  );
}

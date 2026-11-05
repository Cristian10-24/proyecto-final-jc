"use client";

import { useEffect, useState } from "react";
import h from "./HorariosPanel.module.css";
import { useVentana } from "./useVentana";
import s from "./GestionProyecto.module.css";

// Gestión manual de proyectos (solo admin): crear, editar, separar pareja y agregar integrante. Lo abren Horarios
// (botón "Nuevo proyecto" y la ficha) y el Tablero (columna "Sin hora"). El servidor valida todo (como el importador).

export type ModoGestion = { modo: "crear" } | { modo: "editar" | "separar" | "agregar"; id: string };
type Monitor = { usuario: string; nombre: string; ciudades: string[] };
type Integrante = { nombre: string; documento: string; celular: string; correo: string };
type Datos = {
  id: string; codigo: string; ciudad: string; nombre: string; descripcion: string; ruta: "Básica" | "Avanzada" | null; monitor: string | null;
  integrantes: Integrante[]; hora: { inicio: string; dia: string } | null; evaluado: boolean; version: string;
};
type Respuesta = { ok: boolean; error?: string; mensaje?: string; campo?: string; codigo?: string; otro?: { codigo: string; nombre: string; ciudad: string; integrante: string; hora: string | null }; hora?: string | null };

const vacio = (): Integrante => ({ nombre: "", documento: "", celular: "", correo: "" });
const fmtHora = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

async function api<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) window.location.assign("/login");
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

export default function GestionProyecto({ abierto, ciudades: ciudadesDadas, monitores: monitoresDados, onCerrar, onHecho }: {
  abierto: ModoGestion; ciudades?: string[]; monitores?: Monitor[]; onCerrar: () => void; onHecho: (msg: string) => void | Promise<void>;
}) {
  const [d, setD] = useState<Datos | null>(null);
  const [opciones, setOpciones] = useState<{ ciudades: string[]; monitores: Monitor[] } | null>(ciudadesDadas && monitoresDados ? { ciudades: ciudadesDadas, monitores: monitoresDados } : null);
  useEffect(() => {
    if (opciones) return;
    void api<{ ciudades: string[]; monitores: Monitor[] }>("/api/admin/proyectos/opciones").then((r) => r.ok && r.data && setOpciones(r.data)).catch(() => null);
  }, [opciones]);
  const ciudades = opciones?.ciudades ?? [], monitores = opciones?.monitores ?? [];
  const [cargaError, setCargaError] = useState("");
  const id = abierto.modo === "crear" ? null : abierto.id;
  useEffect(() => {
    if (!id) return;
    void api<Datos>(`/api/admin/proyectos/${id}/gestion`).then((r) => (r.ok && r.data ? setD(r.data) : setCargaError("No se pudo abrir el proyecto. Cierra y recarga la lista.")))
      .catch(() => setCargaError("Sin conexión. Revisa tu internet e inténtalo otra vez."));
  }, [id]);
  const v = useVentana(onCerrar);

  const titulo = { crear: "Nuevo proyecto", editar: "Editar proyecto", separar: "Separar pareja", agregar: "Agregar integrante" }[abierto.modo];
  return (
    <div className={h.overlay}>
      <div className={h.modal} role="dialog" aria-modal="true" aria-labelledby="gp-titulo" {...v.dialogo}>
        {v.confirmacion}
        <div className={h.asa} aria-hidden />
        <div className={h.modalHead}>
          <div>
            {d && <div className={h.kicker}>{d.ciudad} · {d.codigo}</div>}
            <h2 id="gp-titulo" className={h.modalTitle}>{titulo}{d ? `: ${d.nombre}` : ""}</h2>
          </div>
          <button type="button" className={h.cerrar} onClick={v.cerrar} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {cargaError && <div className="note note-error">{cargaError}</div>}
        {abierto.modo === "crear" && <Formulario ciudades={ciudades} monitores={monitores} onCerrar={v.cerrar} onHecho={onHecho} />}
        {abierto.modo === "editar" && d && <Formulario datos={d} ciudades={ciudades} monitores={monitores} onCerrar={v.cerrar} onHecho={onHecho} />}
        {abierto.modo === "separar" && d && <Separar d={d} onCerrar={v.cerrar} onHecho={onHecho} />}
        {abierto.modo === "agregar" && d && <Agregar d={d} onCerrar={v.cerrar} onHecho={onHecho} />}
        {id && !d && !cargaError && <div className={s.cargando}>Cargando…</div>}
      </div>
    </div>
  );
}

/** Error del servidor junto a su campo (con el diseño de la app, no la burbuja del navegador). */
type ErrorCampo = { campo: string; mensaje: string } | null;
function MensajeCampo({ id, error, campo }: { id: string; error: ErrorCampo; campo: string }) {
  return error?.campo === campo ? <span id={id} className={s.errorCampo} role="alert">{error.mensaje}</span> : null;
}
const conError = (error: ErrorCampo, campo: string, id: string) => (error?.campo === campo ? { "aria-invalid": true, "aria-describedby": id } : {});

function CamposIntegrante({ n, v, onCambio, soloLecturaDocumento, error = null }: { n: number; v: Integrante; onCambio: (x: Integrante) => void; soloLecturaDocumento?: boolean; error?: ErrorCampo }) {
  // Correo y celular sin validación nativa (type="text"): la hace el servidor, que respeta lo que ya estaba guardado.
  const campo = (k: keyof Integrante, etq: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => {
    const c = `integrante${n}.${k}`, id = `err-${c.replace(".", "-")}`;
    return (
      <label className={h.campo}><span className="label">{etq}</span>
        <input className="input" type="text" value={v[k]} onChange={(e) => onCambio({ ...v, [k]: e.target.value })} {...conError(error, c, id)} {...extra} />
        <MensajeCampo id={id} error={error} campo={c} /></label>
    );
  };
  return (
    <fieldset className={s.grupo}>
      <legend className={h.seccionK}>Integrante {n}</legend>
      <div className={s.rejilla}>
        {campo("nombre", "Nombre completo", { autoComplete: "off", maxLength: 120 })}
        {campo("documento", "Documento (sin puntos)", { inputMode: "text", autoComplete: "off", maxLength: 30, readOnly: soloLecturaDocumento })}
        {campo("celular", "Celular (opcional)", { inputMode: "tel", autoComplete: "off", maxLength: 30 })}
        {campo("correo", "Correo (opcional)", { inputMode: "email", autoComplete: "off", autoCapitalize: "none", spellCheck: false, maxLength: 120 })}
      </div>
    </fieldset>
  );
}

function Formulario({ datos, ciudades, monitores, onCerrar, onHecho }: { datos?: Datos; ciudades: string[]; monitores: Monitor[]; onCerrar: () => void; onHecho: (msg: string) => void | Promise<void> }) {
  const crear = !datos;
  const [ciudad, setCiudad] = useState(datos?.ciudad ?? "");
  const [pareja, setPareja] = useState((datos?.integrantes.length ?? 1) > 1);
  const [nombre, setNombre] = useState(datos?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(datos?.descripcion ?? "");
  const [ruta, setRuta] = useState<string>(datos?.ruta ?? "");
  // Crear: "" = el monitor de la ciudad (si tiene uno solo). Editar: "" = por asignar.
  const [monitor, setMonitor] = useState<string>(datos ? datos.monitor ?? "" : "");
  const [ints, setInts] = useState<Integrante[]>(datos?.integrantes.map((i) => ({ ...i })) ?? [vacio(), vacio()]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [errorCampo, setErrorCampo] = useState<ErrorCampo>(null);
  const [confirmarCiudad, setConfirmarCiudad] = useState("");

  const lista = (pareja ? ints.slice(0, 2) : ints.slice(0, 1)).map((i) => ({ nombre: i.nombre, documento: i.documento, ...(i.celular.trim() ? { celular: i.celular } : {}), ...(i.correo.trim() ? { correo: i.correo } : {}) }));
  const listo = ciudad && nombre.trim() && lista.every((i) => i.nombre.trim() && i.documento.trim());
  const deCiudad = monitores.filter((m) => m.ciudades.includes(ciudad)), otros = monitores.filter((m) => !m.ciudades.includes(ciudad));

  async function guardar(confirmar = false) {
    setOcupado(true); setError(""); setErrorCampo(null);
    const proyecto = {
      ciudad, nombre, ...(descripcion.trim() ? { descripcion } : {}), ruta: ruta ? ruta : null,
      ...(crear ? (monitor === "__nadie" ? { monitor: null } : monitor ? { monitor } : {}) : { monitor: monitor || null }),
      integrantes: lista,
    };
    const r = await (crear ? api<Respuesta>("/api/admin/proyectos", proyecto)
      : api<Respuesta>(`/api/admin/proyectos/${datos!.id}/gestion`, { accion: "editar", proyecto, version: datos!.version, ...(confirmar ? { confirmarCiudad: true } : {}) })).catch(() => null);
    setOcupado(false);
    if (!r?.data) return setError("Sin conexión. Revisa tu internet e inténtalo otra vez.");
    if (r.data.ok) return void onHecho(crear ? `Proyecto ${r.data.codigo} creado: queda sin hora` : "Proyecto actualizado");
    if (r.data.error === "confirmar_ciudad") return setConfirmarCiudad(r.data.mensaje ?? "");
    // Lo escrito se conserva; el error va junto a su campo si el servidor dice cuál es.
    if (r.data.campo) return setErrorCampo({ campo: r.data.campo, mensaje: r.data.mensaje ?? "Revisa este dato." });
    setError(r.data.mensaje ?? "No se pudo guardar.");
  }

  return (
    <form className={s.form} noValidate onSubmit={(e) => { e.preventDefault(); if (listo && !ocupado) void guardar(); }}>
      {!crear && datos.hora && <div className="note note-info">Tiene hora el {fmtHora.format(new Date(datos.hora.inicio))} COL. Editar no la mueve.</div>}
      <div className={s.rejilla}>
        <label className={h.campo}><span className="label">Ciudad</span>
          <select className="input" value={ciudad} onChange={(e) => { setCiudad(e.target.value); setConfirmarCiudad(""); }} {...conError(errorCampo, "ciudad", "err-ciudad")}>
            <option value="">Elige la ciudad</option>
            {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select><MensajeCampo id="err-ciudad" error={errorCampo} campo="ciudad" /></label>
        {crear && (
          <div className={h.campo}><span className="label">Modalidad</span>
            <div className={s.seg} role="group" aria-label="Modalidad">
              <button type="button" className={!pareja ? s.segOn : ""} aria-pressed={!pareja} onClick={() => setPareja(false)}>Individual</button>
              <button type="button" className={pareja ? s.segOn : ""} aria-pressed={pareja} onClick={() => setPareja(true)}>En pareja</button>
            </div></div>
        )}
        <label className={`${h.campo} ${s.ancho}`}><span className="label">Nombre del proyecto</span>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={160} {...conError(errorCampo, "nombre", "err-nombre")} />
          <MensajeCampo id="err-nombre" error={errorCampo} campo="nombre" /></label>
        <label className={`${h.campo} ${s.ancho}`}><span className="label">Descripción (opcional)</span>
          <textarea className={`input ${s.area}`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={1000} rows={3} /></label>
        <label className={h.campo}><span className="label">Ruta</span>
          <select className="input" value={ruta} onChange={(e) => setRuta(e.target.value)}>
            <option value="">Sin ruta</option><option value="Básica">Básica</option><option value="Avanzada">Avanzada</option>
          </select></label>
        <label className={h.campo}><span className="label">Monitor de seguimiento</span>
          <select className="input" value={monitor} onChange={(e) => setMonitor(e.target.value)}>
            {crear ? <><option value="">El de la ciudad (si tiene uno solo)</option><option value="__nadie">Por asignar</option></> : <option value="">Por asignar</option>}
            {deCiudad.length > 0 && <optgroup label={`De ${ciudad}`}>{deCiudad.map((m) => <option key={m.usuario} value={m.usuario}>{m.nombre}</option>)}</optgroup>}
            {otros.length > 0 && <optgroup label="Otras ciudades">{otros.map((m) => <option key={m.usuario} value={m.usuario}>{m.nombre} · {m.ciudades.join(", ")}</option>)}</optgroup>}
          </select><MensajeCampo id="err-monitor" error={errorCampo} campo="monitor" /></label>
      </div>
      <CamposIntegrante n={1} v={ints[0]!} onCambio={(x) => setInts((a) => [x, a[1] ?? vacio()])} error={errorCampo} />
      {pareja && <CamposIntegrante n={2} v={ints[1] ?? vacio()} onCambio={(x) => setInts((a) => [a[0]!, x])} error={errorCampo} />}
      {!crear && <p className={s.ayuda}>Para cambiar cuántos integrantes tiene, usa «Separar pareja» o «Agregar integrante» en la ficha.</p>}
      {error && <div className="note note-error">{error}</div>}
      {confirmarCiudad && (
        <div className="note note-warn">{confirmarCiudad}
          <div className={h.acts}><button type="button" className="btn btn-dark" disabled={ocupado} onClick={() => void guardar(true)}>Cambiar la ciudad igual</button></div>
        </div>
      )}
      <div className={h.acts}>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={!listo || ocupado}>{ocupado ? "Guardando…" : crear ? "Crear proyecto" : "Guardar cambios"}</button>
      </div>
    </form>
  );
}

function Separar({ d, onCerrar, onHecho }: { d: Datos; onCerrar: () => void; onHecho: (msg: string) => void | Promise<void> }) {
  const [queda, setQueda] = useState<0 | 1>(0);
  const [nombreNuevo, setNombreNuevo] = useState(d.nombre);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  if (d.integrantes.length !== 2) return <div className="note note-info">Este proyecto ya es individual.</div>;
  if (d.evaluado) return <div className="note note-error">Tiene evaluación guardada: anúlala primero (ficha → «Anular evaluación»).</div>;
  const sale = d.integrantes[1 - queda]!;
  async function separar() {
    setOcupado(true); setError("");
    const r = await api<Respuesta>(`/api/admin/proyectos/${d.id}/gestion`, { accion: "separar", queda, nombreNuevo, version: d.version }).catch(() => null);
    setOcupado(false);
    if (!r?.data) return setError("Sin conexión. Revisa tu internet e inténtalo otra vez.");
    if (r.data.ok) return void onHecho(`Pareja separada: ${sale.nombre} queda en ${r.data.codigo ?? "un proyecto nuevo"}, sin hora`);
    setError(r.data.mensaje ?? "No se pudo separar.");
  }
  return (
    <div className={s.form}>
      <div className={h.campo}><span className="label">¿Quién se queda con el proyecto{d.hora ? ", su hora y su sala" : ""}?</span>
        <div className={s.opciones}>
          {d.integrantes.map((i, k) => (
            <label key={i.documento} className={`${s.opcion} ${queda === k ? s.opcionOn : ""}`}>
              <input type="radio" name="queda" checked={queda === k} onChange={() => setQueda(k as 0 | 1)} /> {i.nombre}
            </label>
          ))}
        </div></div>
      <label className={h.campo}><span className="label">Nombre del proyecto nuevo de {sale.nombre}</span>
        <input className="input" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} maxLength={160} /></label>
      <div className="note note-info">{sale.nombre} queda en un proyecto individual nuevo, sin hora, con la misma ciudad, ruta y monitor. Entra al portal con su documento y elige su propia hora.{d.hora ? ` La hora del ${fmtHora.format(new Date(d.hora.inicio))} sigue con ${d.integrantes[queda]!.nombre}.` : ""}</div>
      {error && <div className="note note-error">{error}</div>}
      <div className={h.acts}>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void separar()}>{ocupado ? "Separando…" : "Separar pareja"}</button>
      </div>
    </div>
  );
}

type Busqueda =
  | { estado: "nuevo"; documento: string }
  | { estado: "mismo" }
  | { estado: "existe"; documento: string; otraCiudad: boolean; horaEste: string | null; accion: "unir" | "separar_primero" | "anular_primero";
    otro: { id: string; codigo: string; nombre: string; ciudad: string; integrante: string; pareja: boolean; hora: string | null; evaluado: boolean } };

// Primero el documento: si ya está en otro proyecto, se muestra ese registro (sin volver a escribir sus datos) y se
// une con la misma transacción de siempre; si no existe, se piden los datos del integrante nuevo.
function Agregar({ d, onCerrar, onHecho }: { d: Datos; onCerrar: () => void; onHecho: (msg: string) => void | Promise<void> }) {
  const [documento, setDocumento] = useState("");
  const [b, setB] = useState<Busqueda | null>(null);
  const [v, setV] = useState<Integrante>(vacio());
  const [conservar, setConservar] = useState<"este" | "otro">("este");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [errorCampo, setErrorCampo] = useState<ErrorCampo>(null);
  if (d.integrantes.length !== 1) return <div className="note note-info">Este proyecto ya es en pareja.</div>;

  async function buscar() {
    if (!documento.trim() || ocupado) return;
    setOcupado(true); setError(""); setErrorCampo(null); setB(null);
    const r = await api<Busqueda & { mensaje?: string }>(`/api/admin/proyectos/${d.id}/gestion?${new URLSearchParams({ documento: documento.trim() })}`).catch(() => null);
    setOcupado(false);
    if (!r?.data) return setError("Sin conexión. Revisa tu internet e inténtalo otra vez.");
    if (!r.ok) return setErrorCampo({ campo: "buscar", mensaje: r.data.mensaje ?? "Revisa el documento." });
    setB(r.data);
    if (r.data.estado === "nuevo") setV({ ...vacio(), documento: r.data.documento });
    if (r.data.estado === "existe") setConservar(r.data.otro.hora && !r.data.horaEste ? "otro" : "este");
  }

  async function guardar() {
    if (!b || b.estado === "mismo") return;
    setOcupado(true); setError(""); setErrorCampo(null);
    const unir = b.estado === "existe";
    const integrante = unir ? { documento: b.documento }
      : { nombre: v.nombre, documento: b.documento, ...(v.celular.trim() ? { celular: v.celular } : {}), ...(v.correo.trim() ? { correo: v.correo } : {}) };
    const r = await api<Respuesta>(`/api/admin/proyectos/${d.id}/gestion`, { accion: "agregar", integrante, version: d.version, ...(unir ? { unir: true, ...(b.otro.hora ? { conservar } : {}) } : {}) }).catch(() => null);
    setOcupado(false);
    if (!r?.data) return setError("Sin conexión. Revisa tu internet e inténtalo otra vez.");
    if (r.data.ok) return void onHecho(unir ? `Proyectos unidos: ${b.otro.codigo} se eliminó` : "Integrante agregado: ahora es en pareja");
    if (r.data.campo && !unir) return setErrorCampo({ campo: r.data.campo, mensaje: r.data.mensaje ?? "Revisa este dato." });
    setError(r.data.mensaje ?? "No se pudo guardar.");
  }

  const fichaDe = (o: { id: string; codigo: string }) => `/admin/horarios?${new URLSearchParams({ q: o.codigo, abrir: o.id })}`;
  return (
    <div className={s.form}>
      <form className={s.buscar} noValidate onSubmit={(e) => { e.preventDefault(); void buscar(); }}>
        <label className={h.campo}><span className="label">Documento del integrante 2 (sin puntos)</span>
          <input className="input" type="text" value={documento} onChange={(e) => { setDocumento(e.target.value); setB(null); }} autoComplete="off" maxLength={30} autoFocus {...conError(errorCampo, "buscar", "err-buscar")} />
          <MensajeCampo id="err-buscar" error={errorCampo} campo="buscar" /></label>
        <button type="submit" className="btn btn-dark" disabled={!documento.trim() || ocupado}>{ocupado && !b ? "Buscando…" : "Buscar"}</button>
      </form>

      {b?.estado === "mismo" && <div className="note note-info">Ese documento ya es del integrante de este proyecto.</div>}

      {b?.estado === "existe" && (
        <div className={s.ficha}>
          <div className={h.seccionK}>Ya está en otro proyecto</div>
          <dl className={s.datos}>
            <div><dt>Nombre</dt><dd>{b.otro.integrante}</dd></div>
            <div><dt>Ciudad</dt><dd>{b.otro.ciudad}</dd></div>
            <div><dt>Proyecto</dt><dd>{b.otro.codigo} · {b.otro.nombre}</dd></div>
            <div><dt>Modalidad</dt><dd>{b.otro.pareja ? "En pareja" : "Individual"}</dd></div>
            <div><dt>Hora</dt><dd>{b.otro.hora ?? "Sin hora"}</dd></div>
            <div><dt>Evaluación</dt><dd>{b.otro.evaluado ? "Guardada" : "No"}</dd></div>
          </dl>
          {b.accion === "separar_primero" && <div className="note note-warn">Primero separa esa pareja. <a href={fichaDe(b.otro)}>Abrir la ficha de {b.otro.codigo}</a></div>}
          {b.accion === "anular_primero" && <div className="note note-warn">Primero anula la evaluación{b.otro.evaluado ? <> de {b.otro.codigo}. <a href={fichaDe(b.otro)}>Abrir su ficha</a></> : " de este proyecto."}</div>}
          {b.accion === "unir" && (
            <>
              {b.otraCiudad && <div className="note note-warn">Es de {b.otro.ciudad} y este proyecto es de {d.ciudad}: al unirlos, queda en {d.ciudad}.</div>}
              {b.otro.hora ? (
                <div className={h.campo}><span className="label">¿Qué hora se conserva? La otra se libera.</span>
                  <div className={s.opciones}>
                    <label className={`${s.opcion} ${conservar === "este" ? s.opcionOn : ""}`}><input type="radio" name="conservar" checked={conservar === "este"} onChange={() => setConservar("este")} /> La de este proyecto: {b.horaEste ?? "sin hora"}</label>
                    <label className={`${s.opcion} ${conservar === "otro" ? s.opcionOn : ""}`}><input type="radio" name="conservar" checked={conservar === "otro"} onChange={() => setConservar("otro")} /> La de {b.otro.codigo}: {b.otro.hora}</label>
                  </div></div>
              ) : b.horaEste && <div className="note note-info">Se conserva la hora de este proyecto ({b.horaEste}).</div>}
              <div className="note note-info">Al unir, {b.otro.integrante} pasa a este proyecto con sus datos y {b.otro.codigo} se elimina.</div>
            </>
          )}
        </div>
      )}

      {b?.estado === "nuevo" && (
        <>
          <div className="note note-info">Ese documento no está en ningún proyecto: completa los datos del integrante nuevo.</div>
          <CamposIntegrante n={2} v={v} onCambio={(x) => setV({ ...x, documento: b.documento })} soloLecturaDocumento error={errorCampo} />
        </>
      )}

      {error && <div className="note note-error">{error}</div>}
      <div className={h.acts}>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={onCerrar}>Cancelar</button>
        {b?.estado === "existe" && b.accion === "unir" && <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Uniendo…" : "Unir a este proyecto"}</button>}
        {b?.estado === "nuevo" && <button type="button" className="btn btn-primary" disabled={!v.nombre.trim() || ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Agregar integrante"}</button>}
      </div>
    </div>
  );
}

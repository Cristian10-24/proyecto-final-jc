"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CIUDADES, horaCO, horaUY } from "@/lib/ciudades";
import { calc, faltantes, ITEMS_A, MIN_B, primerNombre, TEMAS_B, type Borrador, type Formulario, type PartesB, type Resultado, type ValorA } from "@/lib/evaluacion/criterios";
import type { DetalleEvaluacion, ResultadoIntegrante } from "@/lib/evaluacion/datos";
import { diaCOL } from "@/lib/edicion";
import { fechaLarga, pct, uno } from "./comun";
import { BotonesLlamar, Telefono } from "./vistas/Basicos";
import { IcoCamara, IcoFlecha, IcoReiniciar, IcoVolver } from "./vistas/Iconos";
import e from "./vistas/Evaluar.module.css";
import vs from "./vistas/Vistas.module.css";

// Pantalla de evaluar (prototipos 03 y 05, docs/DISENO-VISTAS-MENTORES.md): cronómetro de 15 min, Parte A común,
// Parte B por integrante, cierre común y "No se presentó" por integrante. El borrador se guarda solo en el servidor
// mientras se califica; solo si la sesión venció o no hay conexión queda también en este navegador (con fecha y
// usuario, y se borra al guardar o al cerrar sesión). No cuenta hasta "Guardar evaluación".
// Vistas del mentor: solo cambió el marcado (pantalla completa dentro de /mentor, sin ventana); la lógica, las
// llamadas, el borrador, el aviso al salir y el cronómetro son los de siempre.

const TOTAL = 900;
const LV = [0, 1, 2, 3, 4] as const;
const VACIO: Formulario = { a: {}, b: [], destacado: false, fortaleza: "", mejora: "", percepcion: "" };
const claveLocal = (id: string) => `pfjc-borrador-${id}`;

type Confirmar = { texto: string; si: string; no: string | null; ok: (v: boolean) => void };
type Respuesta = { ok?: boolean; error?: string; faltan?: string[]; resultados?: ResultadoIntegrante[] } | null;

async function post(id: string, body: unknown): Promise<{ status: number; data: Respuesta }> {
  const res = await fetch(`/api/evaluacion/proyectos/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

type Local = { usuario: string; en: number; datos: Borrador };
/** Copia local, solo si es de este usuario y más nueva que lo guardado en el servidor. */
function leerLocal(id: string, usuario: string, guardadoEn: string | null): Local | null {
  try {
    const v = JSON.parse(localStorage.getItem(claveLocal(id)) ?? "null") as Local | null;
    return v && v.usuario === usuario && v.en > (guardadoEn ? Date.parse(guardadoEn) : 0) ? v : null;
  } catch { return null; }
}
function escribirLocal(id: string, usuario: string, f: Formulario | null) {
  try { if (f) localStorage.setItem(claveLocal(id), JSON.stringify({ usuario, en: Date.now(), datos: f } satisfies Local)); else localStorage.removeItem(claveLocal(id)); } catch { /* sin almacenamiento */ }
}

type Reloj = { inicio: number | null; pausa: number | null };
const claveReloj = (id: string) => `pfjc-reloj-${id}`;
function leerReloj(id: string): Reloj {
  try {
    const v = JSON.parse(localStorage.getItem(claveReloj(id)) ?? "null") as Reloj | null;
    return v && (v.inicio === null || typeof v.inicio === "number") ? { inicio: v.inicio, pausa: typeof v.pausa === "number" ? v.pausa : null } : { inicio: null, pausa: null };
  } catch { return { inicio: null, pausa: null }; }
}
function escribirReloj(id: string, r: Reloj) {
  try { if (r.inicio === null) localStorage.removeItem(claveReloj(id)); else localStorage.setItem(claveReloj(id), JSON.stringify(r)); } catch { /* sin almacenamiento */ }
}

function Seg<T extends string | number>({ opciones, valor, onPick, nivel, disabled, etiqueta }: {
  opciones: readonly (readonly [T, string])[]; valor: T | undefined; onPick: (v: T | undefined) => void; nivel?: boolean; disabled?: boolean; etiqueta: string;
}) {
  return (
    <div className={`${e.seg} ${nivel ? e.segNivel : ""}`} role="group" aria-label={etiqueta}>
      {opciones.map(([v, t]) => (
        <button key={String(v)} type="button" data-v={v} aria-pressed={valor === v} disabled={disabled}
          onClick={() => onPick(valor === v ? undefined : v)}>{t}</button>
      ))}
    </div>
  );
}

/** Lo guardado, armado como formulario con una Parte B por integrante (igual que siempre al abrir). */
export const baseDe = (data: DetalleEvaluacion): Formulario => ({ ...data.guardado, b: Array.from({ length: data.integrantes.length }, (_, i) => data.guardado.b[i] ?? {}) });

/** `inicial`: solo para las pruebas de render (sin navegador); en la app siempre se carga con GET, como antes. */
export default function EvaluarHoja({ id, usuario, onCerrar, inicial }: { id: string; usuario: string; onCerrar: (cambio: boolean) => void; inicial?: DetalleEvaluacion }) {
  const [d, setD] = useState<DetalleEvaluacion | null>(inicial ?? null);
  const [error, setError] = useState("");
  const [f, setF] = useState<Formulario>(() => (inicial ? baseDe(inicial) : VACIO));
  const [ns, setNs] = useState<boolean[]>(() => inicial?.integrantes.map((x) => x.noPresento) ?? []);
  const [sucio, setSucio] = useState(false);
  const [recuperado, setRecuperado] = useState(false);
  const [borradorEn, setBorradorEn] = useState<Date | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [toast, setToast] = useState("");
  /** Solo para mostrar «Guardada el …» (dato que ya llegaba: `guardadoEn`); no participa en ninguna decisión. */
  const [guardadaEn, setGuardadaEn] = useState<string | null>(inicial?.guardadoEn ?? null);
  const cambio = useRef(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = (t: string) => { setToast(t); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2600); };
  const preguntar = (texto: string, si: string, no: string | null = "Cancelar") => new Promise<boolean>((ok) => setConfirmar({ texto, si, no, ok }));

  // ---- carga ----
  useEffect(() => {
    let vivo = true;
    (async () => {
      const res = await fetch(`/api/evaluacion/proyectos/${id}`, { cache: "no-store" }).catch(() => null);
      if (!vivo) return;
      if (res?.status === 401) return window.location.assign("/login");
      const data = res?.ok ? ((await res.json()) as DetalleEvaluacion) : null;
      if (!data) return setError(res?.status === 403 ? "Este proyecto ya no está asignado a ti." : "No se pudo abrir la evaluación. Revisa tu conexión e inténtalo otra vez.");
      const n = data.integrantes.length;
      const base = baseDe(data);
      const local = data.editable ? leerLocal(id, usuario, data.guardadoEn) : null;
      // La copia local (lo escrito sin conexión) gana si es más nueva que el borrador del servidor.
      const borr = local && (!data.borradorEn || local.en > Date.parse(data.borradorEn)) ? local.datos : data.borrador;
      setD(data);
      setNs(data.integrantes.map((x) => x.noPresento));
      setF(borr ? { ...base, ...borr, b: borr.b?.length === n ? borr.b : base.b } : base);
      setRecuperado(!!borr);
      setGuardadaEn(data.guardadoEn);
      setSucio(!!borr);
    })();
    return () => { vivo = false; };
  }, [id, usuario]);

  const editable = !!d?.editable && !sesionVencida;
  const pareja = (d?.integrantes.length ?? 0) > 1;
  const omitido = (i: number) => !!ns[i] && !Object.keys(f.b[i] ?? {}).length;

  // ---- borrador automático (2 s después del último cambio) ----
  useEffect(() => {
    if (!sucio || !d?.editable) return;
    const t = setTimeout(async () => {
      const r = await post(id, { accion: "borrador", formulario: f }).catch(() => null);
      if (!r || r.status === 401) escribirLocal(id, usuario, f); // sin conexión o sesión vencida: que no se pierda
      if (r?.status === 401) setSesionVencida(true);
      else if (r?.data?.ok) setBorradorEn(new Date());
    }, 2000);
    return () => clearTimeout(t);
  }, [f, sucio, d, id, usuario]);

  // Aviso del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return;
    const fn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [sucio]);

  const cerrar = useCallback(async () => {
    if (sucio && editable && !(await preguntar("Tienes cambios sin guardar. ¿Salir de todas formas?", "Salir sin guardar"))) return;
    onCerrar(cambio.current);
  }, [sucio, editable, onCerrar]);

  useEffect(() => {
    // Escape = «Volver» (como antes). Si otra pieza ya lo usó (p. ej. cerrar una ayuda «?»), no hace nada más.
    const fn = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !ev.defaultPrevented && !confirmar) void cerrar(); };
    document.addEventListener("keydown", fn);
    return () => { document.removeEventListener("keydown", fn); };
  }, [cerrar, confirmar]);

  // ---- cronómetro (no bloquea nada) ----
  // Uno por proyecto, guardado en este navegador como hora de inicio (no como conteo): sigue corriendo al volver
  // a la lista, abrir otro proyecto o recargar. Solo se detiene con "Pausar".
  const [reloj, setRelojEstado] = useState<Reloj>(() => leerReloj(id));
  const [ahora, setAhora] = useState(() => Date.now());
  const setReloj = (r: Reloj) => { setRelojEstado(r); escribirReloj(id, r); };
  const corriendo = reloj.inicio !== null && reloj.pausa === null;
  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(t);
  }, [corriendo]);
  const seg = reloj.inicio === null ? 0 : Math.floor(((reloj.pausa ?? ahora) - reloj.inicio) / 1000);
  const quedan = Math.max(0, TOTAL - seg);
  // Textos del prototipo 03; los minutos de cada parte son los de siempre (A hasta el 6, B hasta el 12, cierre hasta el 15).
  const marcha = `${corriendo ? "Corriendo" : "En pausa"} · min ${Math.floor(Math.min(seg, TOTAL) / 60)} de 15`;
  const [fase, faseTxt] = reloj.inicio === null ? ["Listo para empezar", "Inicia cuando el estudiante empiece"]
    : seg < 360 ? ["Parte A · ¿Funciona?", marcha] : seg < 720 ? ["Parte B · ¿Lo entiende?", marcha]
    : seg < TOTAL ? ["Cierre", marcha] : ["Tiempo cumplido", "Guarda la evaluación"];
  function botonReloj() {
    const t = Date.now();
    setAhora(t);
    if (reloj.inicio === null) setReloj({ inicio: t, pausa: null });
    else if (reloj.pausa === null) setReloj({ ...reloj, pausa: t });
    else setReloj({ inicio: reloj.inicio + (t - reloj.pausa), pausa: null });
  }
  async function reiniciarReloj() {
    if (await preguntar("¿Reiniciar el cronómetro de este proyecto? Vuelve a 15:00 sin iniciar.", "Reiniciar")) setReloj({ inicio: null, pausa: null });
  }

  // ---- edición ----
  const cambiar = (nuevo: Formulario) => { setF(nuevo); setSucio(true); };
  const ponerA = (k: (typeof ITEMS_A)[number][0], v: ValorA | undefined) => { const a = { ...f.a }; if (v) a[k] = v; else delete a[k]; cambiar({ ...f, a }); };
  const ponerB = (i: number, k: (typeof TEMAS_B)[number][0], v: number | undefined) => {
    const b = f.b.map((x, j): PartesB => { if (j !== i) return x; const y = { ...x }; if (v === undefined) delete y[k]; else y[k] = v; return y; });
    cambiar({ ...f, b });
  };
  const resultado = (i: number) => (omitido(i) ? calc({ noPresento: true }, d?.criterios) : calc({ a: f.a, b: f.b[i] }, d?.criterios));

  function aplicarResultados(r: ResultadoIntegrante[] | undefined) {
    if (!r || !d) return;
    setD({ ...d, integrantes: d.integrantes.map((x, i) => ({ ...x, ...r[i]! })) });
    cambio.current = true;
  }
  const errorTxt = (e?: string) => e === "otro_mentor" ? "Este proyecto ya no está asignado a ti." : e === "solo_lectura" ? "Solo el mentor del proyecto puede guardar." : "No se pudo guardar. Intenta de nuevo.";

  async function guardar() {
    if (!d) return;
    const faltan = faltantes(f.a, d.integrantes.map((x, i) => ({ nombre: x.nombre, b: f.b[i] ?? {}, omitir: omitido(i) })));
    if (faltan.length) { await preguntar("Para guardar, completa:\n" + faltan.join("\n"), "Entendido", null); return; }
    setOcupado(true);
    const r = await post(id, { accion: "guardar", formulario: f }).catch(() => null);
    setOcupado(false);
    if (!r || r.status === 401) escribirLocal(id, usuario, f);
    if (r?.status === 401) { setSesionVencida(true); return; }
    if (!r?.data?.ok) return avisar(r?.data?.faltan ? "Faltan datos para guardar." : errorTxt(r?.data?.error));
    escribirLocal(id, usuario, null);
    setSucio(false); setRecuperado(false); setBorradorEn(null); setGuardadaEn(new Date().toISOString());
    setNs(ns.map((x, i) => x && omitido(i)));
    aplicarResultados(r.data.resultados);
    avisar(pareja ? "Evaluación de la pareja guardada" : "Evaluación guardada");
  }

  async function noSePresento(i: number) {
    if (!d) return;
    const x = d.integrantes[i]!, calificado = d.integrantes[i]!.res !== "Pendiente" || !!Object.keys(f.b[i] ?? {}).length;
    if (!(await preguntar(calificado ? `${x.nombre} ya tiene calificaciones. ¿Marcarlo como «No se presentó» de todas formas?` : `¿Marcar a ${x.nombre} como «No se presentó»?`, "Sí, no se presentó"))) return;
    const r = await post(id, { accion: "no_presento", i }).catch(() => null);
    if (r?.status === 401) return setSesionVencida(true);
    if (!r?.data?.ok) return avisar(errorTxt(r?.data?.error));
    const nuevoNs = ns.map((v, j) => (j === i ? true : v));
    setNs(nuevoNs);
    setF({ ...f, b: f.b.map((b, j) => (j === i ? {} : b)) });
    aplicarResultados(r.data.resultados);
    avisar(`${primerNombre(x.nombre)}: no se presentó`);
    if (nuevoNs.every(Boolean)) onCerrar(true);
  }

  async function deshacer(i: number) {
    const r = await post(id, { accion: "presente", i }).catch(() => null);
    if (r?.status === 401) return setSesionVencida(true);
    if (!r?.data?.ok) return avisar("No se pudo deshacer");
    setNs(ns.map((v, j) => (j === i ? false : v)));
    aplicarResultados(r.data.resultados);
    avisar("Listo, ya puedes calificarlo");
  }

  // ---- vista (prototipos 03 y 05) ----
  const nombres = d?.integrantes.map((x) => x.nombre).join(" y ") ?? "";
  const hoy = diaCOL(new Date());
  const inicio = d ? new Date(d.inicio) : null;
  const uy = !!d && CIUDADES.find((c) => c.nombre === d.ciudad)?.pais === "UY";
  const hora = inicio ? horaCO(inicio) : "";
  const horaUy = inicio && uy ? `${horaUY(inicio)} UY` : null;
  const ruta = d?.ruta ? `Ruta ${d.ruta.toLowerCase()}` : null;
  const faltanA = ITEMS_A.filter(([k]) => !f.a[k]).length;
  const temasB = (i: number) => TEMAS_B.filter(([k]) => typeof f.b[i]?.[k] === "number").length;
  const textoGuardar = ocupado ? "Guardando…" : pareja ? "Guardar evaluación de la pareja" : "Guardar evaluación";
  const estadoBorrador = sucio ? (borradorEn ? `Borrador guardado (${borradorEn.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}). Aún no cuenta: falta «Guardar evaluación».` : "Cambios sin guardar.") : null;
  const guardadaTxt = guardadaEn && !sucio ? `Guardada el ${fechaLarga(diaCOL(new Date(guardadaEn))).toLowerCase()} a las ${horaCO(new Date(guardadaEn))}` : null;
  const claseRes = (r: Resultado) => e[`r_${r === "No se presentó" ? "NoSePresento" : r}`];

  // La barra del cronómetro va pegada bajo la cabecera de la app (fija en web; en el celular la cabecera no es fija).
  const [arriba, setArriba] = useState(0);
  useLayoutEffect(() => {
    const cab = document.querySelector<HTMLElement>(".tema-evaluacion > header");
    if (!cab) return;
    const medir = () => setArriba(getComputedStyle(cab).position === "sticky" ? cab.offsetHeight : 0);
    medir();
    const o = new ResizeObserver(medir);
    o.observe(cab);
    window.addEventListener("resize", medir);
    return () => { o.disconnect(); window.removeEventListener("resize", medir); };
  }, []);
  // Celular: con el teclado abierto, la barra inferior sube con él (visualViewport) y no queda tapada.
  const [teclado, setTeclado] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const medir = () => setTeclado(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => { vv.removeEventListener("resize", medir); vv.removeEventListener("scroll", medir); };
  }, []);
  // Es una pantalla (no una ventana): abre arriba; al volver, la lista recupera su posición.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className={e.pantalla} aria-label={nombres || "Evaluación"}>
      <div className={e.barra} style={{ top: arriba }}>
        <div className={e.barraIn}>
          <button type="button" className={`${vs.btn} ${e.volver}`} onClick={() => void cerrar()} aria-label="Volver a Mis evaluaciones"><IcoVolver /><span className={e.volverTxt}>Volver</span></button>
          <div className={e.quien}>
            <h1>{nombres || "Cargando…"}</h1>
            {d && <p className={e.meta}><span className={e.horaBarra}>{hora}</span> (COL){horaUy && <> · {horaUy}</>}{ruta && <> · {ruta}</>}</p>}
          </div>
          {d && editable && (
            <div className={e.reloj}>
              <div className={e.anillo} role="timer" aria-label={`Quedan ${Math.floor(quedan / 60)} minutos y ${quedan % 60} segundos`} style={{ "--p": `${Math.min(1, seg / TOTAL)}turn` } as React.CSSProperties}>
                <span>{String(Math.floor(quedan / 60)).padStart(2, "0")}:{String(quedan % 60).padStart(2, "0")}</span>
              </div>
              <div className={e.fase}><b>{fase}</b><span>{faseTxt}</span></div>
              <button type="button" className={`${vs.btn} ${e.btnReloj} ${corriendo ? "" : vs.btnNegro}`} onClick={botonReloj}>{reloj.inicio === null ? "Iniciar" : corriendo ? "Pausar" : "Reanudar"}</button>
              {reloj.inicio !== null && (
                <button type="button" className={`${vs.btn} ${e.btnReloj} ${e.reiniciar}`} onClick={() => void reiniciarReloj()} aria-label="Reiniciar cronómetro">
                  <IcoReiniciar /><span className={e.reiniciarTxt}>Reiniciar</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className={e.cuerpo}><div className={`${vs.aviso} ${vs.avisoErr}`} role="alert">{error}</div></div>}
      {!d && !error && <div className={e.cuerpo}><div className={vs.skelLista} aria-busy="true">{[1, 2, 3].map((i) => <i key={i} className={vs.skel} style={{ height: 96 }} />)}</div></div>}

      {d && (
        <div className={`${e.cuerpo} ${e.grid}`}>
          <div className={e.col}>
            {sesionVencida && (
              <div className={`${vs.aviso} ${vs.avisoErr}`} role="alert">
                <span>Tu sesión venció. Lo que llevas quedó guardado como borrador en este navegador.{" "}
                <a href="/login">Vuelve a entrar</a> y abre otra vez a {pareja ? "esta pareja" : "este estudiante"} para seguir.</span>
              </div>
            )}
            {!d.editable && <div className={vs.aviso}>Solo lectura: la evaluación la hace el mentor del proyecto.</div>}
            {d.editable && d.dia !== hoy && (
              <div className={`${vs.aviso} ${vs.avisoWarn}`}>
                <span>{pareja ? "Este proyecto" : "Este estudiante"} está programado para el {fechaLarga(d.dia).toLowerCase()} a las {hora} COL{horaUy && ` · ${horaUy}`}, no para hoy. Verifica que sea la persona correcta antes de calificar.</span>
              </div>
            )}
            {recuperado && editable && <div className={vs.aviso}>Recuperamos lo que llevabas sin guardar. Revisa y pulsa «Guardar evaluación».</div>}
            {d.integrantes.map((x, i) => ns[i] && (
              <div key={i} className={`${vs.aviso} ${e.banner}`}>
                <span>{x.nombre} está marcado como «No se presentó».</span>
                {editable && <button type="button" className={`${vs.btn} ${e.btnChico}`} onClick={() => void deshacer(i)}>Deshacer</button>}
              </div>
            ))}

            <div className={e.dos}>
              <section className={`${vs.tarjeta} ${e.tarjeta} ${vs.soloWeb}`} aria-labelledby="ev-t-proy">
                <div><p className={`${vs.small} ${vs.muted}`}>Proyecto</p><h2 id="ev-t-proy" className={e.tProyecto}>{d.proyecto}</h2></div>
                {d.descripcion && <p>{d.descripcion}</p>}
                <DatosProyecto d={d} hora={hora} horaUy={horaUy} ruta={ruta} uy={uy} />
              </section>
              <details className={`${vs.tarjeta} ${e.plegable} ${vs.soloMovil}`}>
                <summary><span>Proyecto · {d.proyecto}</span><span className={e.rot} aria-hidden="true"><IcoFlecha /></span></summary>
                <div className={e.plegableCuerpo}>
                  {d.descripcion && <p className={vs.small}>{d.descripcion}</p>}
                  <DatosProyecto d={d} hora={hora} horaUy={horaUy} ruta={ruta} uy={uy} />
                </div>
              </details>
              <section className={`${vs.tarjeta} ${e.tarjeta}`} aria-labelledby="ev-t-mon">
                <h2 id="ev-t-mon" className={e.tMonitor}>Monitor a cargo</h2>
                <div className={e.persona}>
                  <div className={e.personaTxt}>
                    {d.monitorBloque
                      ? <><p className={e.b}>{d.monitorBloque.nombre}</p><p className={`${vs.small} ${vs.muted}`}><Telefono celular={d.monitorBloque.celular} /></p></>
                      : <p className={e.b}>Sin monitor</p>}
                  </div>
                  <span className={e.iconos}>{d.monitorBloque && <BotonesLlamar celular={d.monitorBloque.celular} nombre={d.monitorBloque.nombre} />}</span>
                </div>
                <p className={`${vs.small} ${vs.muted} ${vs.soloWeb}`}>Escríbele si el estudiante no entra a la sala o hay problemas de conexión.</p>
                {d.enlace && <dl className={`${e.dl} ${e.dlEnlace} ${vs.soloWeb}`}><dt>Enlace</dt><dd><a href={d.enlace} target="_blank" rel="noopener noreferrer" className={e.enlace}>{d.enlace.replace(/^https:\/\//, "")}</a></dd></dl>}
                {d.enlace && <a className={`${vs.btn} ${vs.btnPri} ${e.abrirSala}`} href={d.enlace} target="_blank" rel="noopener noreferrer"><IcoCamara />Abrir sala</a>}
              </section>
            </div>

            {d.integrantes.some((x) => x.monitor) && (
              <section className={`${vs.tarjeta} ${e.tarjeta}`}>
                <h2 className={e.tMonitor}>Lo que anotó el monitor</h2>
                {d.integrantes.filter((x) => x.monitor).map((x) => (
                  <p key={x.i}>
                    {pareja && <b>{primerNombre(x.nombre)}: </b>}
                    {[x.monitor!.motivo ? `Motivo de inasistencia: ${x.monitor!.motivo}` : null, x.monitor!.observacion].filter(Boolean).join(" · ")}
                  </p>
                ))}
              </section>
            )}

            <section className={`${vs.tarjeta} ${e.parte}`} aria-labelledby="ev-t-a">
              <h2 id="ev-t-a" className={e.tParte}>Parte A · ¿Funciona?</h2>
              <p className={e.pista}>{pareja ? "Minutos 0 a 6. Recorren juntos la app publicada. Esta parte cuenta igual para los dos." : "Minutos 0 a 6. El estudiante recorre su app publicada; tú marcas mientras observas."}</p>
              {ITEMS_A.map(([k, t, desc]) => (
                <div key={k} className={e.item}>
                  <div className={e.itemTxt}><p className={e.b}>{t}</p><p className={`${vs.small} ${vs.muted}`}>{desc}</p></div>
                  <Seg etiqueta={t} opciones={[["si", "Sí"], ["parcial", "Parcial"], ["no", "No"]] as const} valor={f.a[k]} disabled={!editable} onPick={(val) => ponerA(k, val)} />
                </div>
              ))}
            </section>

            <section className={`${vs.tarjeta} ${e.parte}`} aria-labelledby="ev-t-b">
              <h2 id="ev-t-b" className={e.tParte}>Parte B · ¿Lo entiende?</h2>
              <p className={e.pista}>{pareja ? "Minutos 6 a 12. Reparte las preguntas entre los dos y califica a cada uno: el conocimiento es individual. Si los dos saben lo mismo, márcales el mismo nivel. Califica mínimo 2 temas por persona." : "Minutos 6 a 12. Pide que te muestre el código. Califica mínimo 2 temas; los que no preguntes déjalos sin marcar."}</p>
              {TEMAS_B.map(([k, t, pregunta]) => (
                <div key={k} className={`${e.item} ${pareja ? e.itemPareja : ""}`}>
                  <div className={e.itemTxt}><p className={e.b}>{t}</p><p className={`${vs.small} ${vs.muted} ${e.pregunta}`}>{pregunta}</p></div>
                  <div className={e.porPersona}>
                    {d.integrantes.map((x, i) => (
                      <div key={i} className={e.persona2}>
                        {pareja && <span className={e.quienNombre}>{primerNombre(x.nombre)}</span>}
                        {omitido(i) ? <span className={`${vs.small} ${vs.muted}`}>No se presentó</span> : (
                          <Seg nivel etiqueta={`${t}${pareja ? ` · ${x.nombre}` : ""}`} opciones={LV.map((n) => [n, String(n)] as const)} valor={f.b[i]?.[k]} disabled={!editable} onPick={(val) => ponerB(i, k, val)} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className={`${e.leyenda} ${vs.soloWeb}`}>0 No conoce · 1 Conoce · 2 Comprende (explica la idea con ayuda) · 3 Practica (lo muestra y explica solo) · 4 Domina (podría modificarlo en vivo)</p>
              <p className={`${e.leyenda} ${vs.soloMovil}`}>0 No conoce · 1 Conoce · 2 Comprende · 3 Practica · 4 Domina</p>
            </section>

            <section className={`${vs.tarjeta} ${e.parte} ${e.cierre}`} aria-labelledby="ev-t-c">
              <div>
                <h2 id="ev-t-c" className={e.tParte}>Cierre</h2>
                <p className={e.pista}>Minutos 12 a 15. Retroalimentación para el estudiante (en pareja, aplica para ambos). Coordinación la usará para el mensaje final.</p>
              </div>
              <div className={e.cierreDos}>
                {([["fortaleza", "Lo que hizo muy bien", "Ej.: su catálogo es claro y explicó con seguridad cómo llegan los datos."],
                  ["mejora", "Qué puede mejorar", "Ej.: terminar de conectar el formulario con la base de datos."]] as const).map(([k, label, ph]) => (
                  <label key={k} className={e.campo} htmlFor={`c-${k}`}>
                    <span>{label}</span>
                    <textarea className={e.texto} id={`c-${k}`} placeholder={ph} maxLength={2000} value={f[k]} disabled={!editable} onChange={(ev) => cambiar({ ...f, [k]: ev.target.value })} />
                  </label>
                ))}
              </div>
              <label className={e.campo} htmlFor="c-percepcion">
                <span>Percepción del mentor</span>
                <textarea className={`${e.texto} ${e.textoCorto}`} id="c-percepcion" placeholder="Un mensaje personal para el estudiante." maxLength={2000} value={f.percepcion} disabled={!editable} onChange={(ev) => cambiar({ ...f, percepcion: ev.target.value })} />
              </label>
            </section>
          </div>

          <aside className={e.lado} style={{ top: arriba + 112 }}>
            {d.integrantes.map((x, i) => {
              const c = resultado(i);
              const sinB = !omitido(i) && temasB(i) < MIN_B;
              return (
                <section key={i} className={`${vs.tarjeta} ${e.resultado}`} aria-label={pareja ? `Resultado de ${x.nombre}` : "Resultado"}>
                  <p className={`${vs.small} ${vs.muted}`}>{pareja ? `Resultado de ${primerNombre(x.nombre)}` : "Resultado"}</p>
                  <p className={`${e.big} ${claseRes(c.res)}`}>{c.res}</p>
                  <div className={e.medidor}><span>Funciona (A)</span><b>{pct(c.a)}</b></div>
                  <div className={e.medidor}><span>Nivel promedio (B)</span><b>{c.nb ? `${uno(c.b)} (${c.nb} temas)` : "—"}</b></div>
                  {c.res !== "No se presentó" && faltanA > 0 && <p className={e.faltan}>Faltan {faltanA} de 7 criterios de la Parte A.</p>}
                  {c.res !== "No se presentó" && sinB && <p className={e.faltan}>Califica mínimo {MIN_B} temas de la Parte B{pareja ? ` (${primerNombre(x.nombre)})` : ""}.</p>}
                </section>
              );
            })}
            <section className={`${vs.tarjeta} ${e.asistencia}`} aria-label="Asistencia">
              <p className={`${vs.small} ${vs.muted}`}>¿Se presentó?</p>
              {d.integrantes.map((x, i) => (
                <div key={i} className={e.asisFila}>
                  <div className={e.asisLinea}>
                    <span className={`${vs.small} ${e.b}`}>{x.nombre.trim().split(/\s+/).slice(0, 2).join(" ")}</span>
                    <div className={`${e.seg} ${e.segAsis}`} role="group" aria-label={`¿${x.nombre} se presentó?`}>
                      <button type="button" data-v="si" aria-pressed={!ns[i]} disabled={!editable} onClick={() => { if (ns[i]) void deshacer(i); }}>Sí</button>
                      <button type="button" data-v="no" aria-pressed={!!ns[i]} disabled={!editable} onClick={() => { if (!ns[i]) void noSePresento(i); }}>No</button>
                    </div>
                  </div>
                  {x.monitor?.motivo && <p className={`${vs.small} ${vs.muted}`}>Motivo de inasistencia: {x.monitor.motivo}</p>}
                </div>
              ))}
            </section>
            <label className={`${vs.tarjeta} ${e.destacado}`}>
              <input type="checkbox" checked={f.destacado} disabled={!editable} onChange={(ev) => cambiar({ ...f, destacado: ev.target.checked })} />
              <span className={`${vs.small} ${e.b}`}>Nominar como proyecto destacado</span>
            </label>
            {editable && (
              <div className={`${e.guardarWeb} ${vs.soloWeb}`}>
                <button type="button" className={`${vs.btn} ${vs.btnPri} ${e.guardar}`} disabled={ocupado} onClick={() => void guardar()}>{textoGuardar}</button>
                {estadoBorrador && <p className={e.estado} aria-live="polite">{estadoBorrador}</p>}
              </div>
            )}
            {guardadaTxt && <p className={e.estado}>{guardadaTxt}{editable ? " Puedes corregirla y volver a guardar." : ""}</p>}
          </aside>
        </div>
      )}

      {d && (
        <div className={`${e.barraAbajo} ${vs.soloMovil}`} style={{ bottom: teclado }}>
          {editable && estadoBorrador && <p className={e.estadoMovil} aria-live="polite">{estadoBorrador}</p>}
          <div className={e.barraAbajoIn}>
            <div className={e.barraRes}>
              {pareja
                ? <p className={e.resPareja}>{d.integrantes.map((x, i) => { const r = resultado(i).res as Resultado; return <span key={i} className={claseRes(r)}>{primerNombre(x.nombre)}: {r}</span>; })}</p>
                : <p className={`${e.resUno} ${claseRes(resultado(0).res as Resultado)}`}>{resultado(0).res}</p>}
              <p className={e.resLinea}>
                A {pct(resultado(0).a ?? (pareja ? resultado(1).a : null))} · B {d.integrantes.map((_, i) => { const c = resultado(i); return c.nb ? uno(c.b) : "—"; }).join(" / ")}
                {faltanA > 0 && !ns.every(Boolean) ? ` · faltan ${faltanA} de A` : ""}
              </p>
            </div>
            {editable && <button type="button" className={`${vs.btn} ${vs.btnPri} ${e.guardarMovil}`} disabled={ocupado} aria-label="Guardar evaluación" onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar"}</button>}
          </div>
        </div>
      )}

      {confirmar && (
        <div className={e.confirmar} role="alertdialog" aria-modal="true">
          <div className={e.confirmarBox}>
            <p>{confirmar.texto}</p>
            <div className={e.confirmarActs}>
              {confirmar.no && <button type="button" className={vs.btn} onClick={() => { confirmar.ok(false); setConfirmar(null); }}>{confirmar.no}</button>}
              <button type="button" className={`${vs.btn} ${vs.btnPri}`} autoFocus onClick={() => { confirmar.ok(true); setConfirmar(null); }}>{confirmar.si}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={e.toast} role="status">{toast}</div>}
    </div>
  );
}

function DatosProyecto({ d, hora, horaUy, ruta, uy }: { d: DetalleEvaluacion; hora: string; horaUy: string | null; ruta: string | null; uy: boolean }) {
  return (
    <dl className={e.dl}>
      <dt>Día</dt><dd>{fechaLarga(d.dia)}</dd>
      <dt>Hora</dt><dd>{hora} (COL) · 15 minutos{horaUy && ` · ${horaUy}`}</dd>
      <dt>Sala</dt><dd>{d.sala !== undefined ? `Sala ${d.sala}` : "Por asignar"}</dd>
      <dt>Ciudad</dt><dd>{uy ? `${d.ciudad} · Uruguay` : d.ciudad}</dd>
      {ruta && <><dt>Ruta</dt><dd>{ruta}</dd></>}
      <dt>Integrantes</dt>
      <dd>{d.integrantes.map((x) => <span key={x.i} className={e.integrante}>{x.nombre} <span className={vs.muted}>· Doc. {x.documento}</span></span>)}</dd>
    </dl>
  );
}

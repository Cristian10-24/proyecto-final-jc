"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calc, faltantes, ITEMS_A, MIN_B, primerNombre, TEMAS_B, type Borrador, type Formulario, type PartesB, type Resultado, type ValorA } from "@/lib/evaluacion/criterios";
import type { DetalleEvaluacion, ResultadoIntegrante } from "@/lib/evaluacion/datos";
import { diaCOL } from "@/lib/edicion";
import s from "./Evaluacion.module.css";
import { claseGrande, fechaLarga, horaTxt, pct, uno } from "./comun";

// Pantalla de evaluar (igual al prototipo): cronómetro de 15 min, Parte A común, Parte B por integrante,
// cierre común y "No se presentó" por integrante. El borrador se guarda solo en el servidor mientras se
// califica; solo si la sesión venció o no hay conexión queda también en este navegador (con fecha y usuario,
// y se borra al guardar o al cerrar sesión). No cuenta hasta "Guardar evaluación".

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
function leerLocal(id: string, usuario: string, guardadoEn: string | null): Borrador | null {
  try {
    const v = JSON.parse(localStorage.getItem(claveLocal(id)) ?? "null") as Local | null;
    return v && v.usuario === usuario && v.en > (guardadoEn ? Date.parse(guardadoEn) : 0) ? v.datos : null;
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
    <div className={`${s.seg} ${nivel ? s.segNivel : ""}`} role="group" aria-label={etiqueta}>
      {opciones.map(([v, t]) => (
        <button key={String(v)} type="button" data-v={v} aria-pressed={valor === v} disabled={disabled}
          onClick={() => onPick(valor === v ? undefined : v)}>{t}</button>
      ))}
    </div>
  );
}

export default function EvaluarHoja({ id, usuario, onCerrar }: { id: string; usuario: string; onCerrar: (cambio: boolean) => void }) {
  const [d, setD] = useState<DetalleEvaluacion | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState<Formulario>(VACIO);
  const [ns, setNs] = useState<boolean[]>([]);
  const [sucio, setSucio] = useState(false);
  const [recuperado, setRecuperado] = useState(false);
  const [borradorEn, setBorradorEn] = useState<Date | null>(null);
  const [sesionVencida, setSesionVencida] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [toast, setToast] = useState("");
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
      const base = { ...data.guardado, b: Array.from({ length: n }, (_, i) => data.guardado.b[i] ?? {}) };
      const local = data.editable ? leerLocal(id, usuario, data.guardadoEn) : null;
      const borr = data.borrador ?? local;
      setD(data);
      setNs(data.integrantes.map((x) => x.noPresento));
      setF(borr ? { ...base, ...borr, b: borr.b?.length === n ? borr.b : base.b } : base);
      setRecuperado(!!borr);
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
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !confirmar) void cerrar(); };
    document.addEventListener("keydown", fn);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", fn); document.body.style.overflow = ""; };
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
  const [fase, faseTxt] = reloj.inicio === null ? ["Listo para empezar", "Inicia cuando el estudiante empiece"]
    : seg < 360 ? ["Demo", "Parte A · hasta el minuto 6"] : seg < 720 ? ["Preguntas", "Parte B · hasta el minuto 12"]
    : seg < TOTAL ? ["Cierre", "Escribe fortaleza y mejora"] : ["Tiempo cumplido", "Guarda la evaluación"];
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
    setSucio(false); setRecuperado(false); setBorradorEn(null);
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

  // ---- vista ----
  const nombres = d?.integrantes.map((x) => x.nombre).join(" y ") ?? "";
  const hoy = diaCOL(new Date());
  return (
    <div className={s.hoja} role="dialog" aria-modal="true" aria-label={nombres || "Evaluación"}>
      <div className={s.hojaHead}>
        <div className={s.hojaHeadIn}>
          <button type="button" className={`ev-btn ${s.volver}`} onClick={() => void cerrar()}>Volver</button>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <h2>{nombres || "Cargando…"}</h2>
            {d && (
              <>
                <div className={s.meta}>{[`${fechaLarga(d.dia)}, ${horaTxt(d.inicio, d.ciudad)}`, d.proyecto, d.ciudad, d.ruta ? `Ruta ${d.ruta.toLowerCase()}` : null, pareja ? "Proyecto en pareja" : null].filter(Boolean).join(" · ")}</div>
                <div className={s.meta}>{d.integrantes.map((x) => `${pareja ? `${primerNombre(x.nombre)}: ` : ""}Doc. ${x.documento}`).join("   ·   ")}</div>
              </>
            )}
          </div>
          {editable && (
            <div className={s.reloj}>
              <div className={s.anillo} style={{ "--p": Math.min(1, seg / TOTAL) } as React.CSSProperties}>
                <span>{String(Math.floor(quedan / 60)).padStart(2, "0")}:{String(quedan % 60).padStart(2, "0")}</span>
              </div>
              <div className={s.fase}><b>{fase}</b>{faseTxt}</div>
              <button type="button" className="ev-btn" onClick={botonReloj}>{reloj.inicio === null ? "Iniciar" : corriendo ? "Pausar" : "Reanudar"}</button>
              {reloj.inicio !== null && <button type="button" className={`ev-btn ${s.reiniciar}`} onClick={() => void reiniciarReloj()}>Reiniciar</button>}
            </div>
          )}
        </div>
      </div>

      {error && <div className={s.hojaBody}><div className="ev-aviso ev-aviso-error" role="alert">{error}</div></div>}
      {!d && !error && <div className={s.hojaBody}><div className={s.skel}>{[1, 2, 3].map((i) => <i key={i} />)}</div></div>}

      {d && (
        <div className={s.hojaBody}>
          <div className={s.col}>
            {sesionVencida && (
              <div className="ev-aviso ev-aviso-error" role="alert">
                Tu sesión venció. Lo que llevas quedó guardado como borrador en este navegador.{" "}
                <a href="/login">Vuelve a entrar</a> y abre otra vez a {pareja ? "esta pareja" : "este estudiante"} para seguir.
              </div>
            )}
            {!d.editable && <div className="ev-aviso">Solo lectura: la evaluación la hace el mentor del proyecto.</div>}
            {d.editable && d.dia !== hoy && (
              <div className="ev-aviso ev-aviso-warn">
                {pareja ? "Este proyecto" : "Este estudiante"} está programado para el {fechaLarga(d.dia).toLowerCase()} a las {horaTxt(d.inicio, d.ciudad)}, no para hoy. Verifica que sea la persona correcta antes de calificar.
              </div>
            )}
            {recuperado && editable && <div className="ev-aviso">Recuperamos lo que llevabas sin guardar. Revisa y pulsa «Guardar evaluación».</div>}
            {d.integrantes.map((x, i) => ns[i] && (
              <div key={i} className={`ev-aviso ${s.banner}`}>
                <span>{x.nombre} está marcado como «No se presentó».</span>
                {editable && <button type="button" className="ev-btn" onClick={() => void deshacer(i)}>Deshacer</button>}
              </div>
            ))}
            {d.descripcion && (
              <section className={`ev-tarjeta ${s.parte}`}>
                <div className="ev-small ev-muted">Sobre el proyecto</div>
                <p className={s.desc}>{d.descripcion}</p>
              </section>
            )}
            {d.integrantes.some((x) => x.monitor) && (
              <section className={`ev-tarjeta ${s.parte}`}>
                <div className="ev-small ev-muted">Lo que anotó el monitor</div>
                {d.integrantes.filter((x) => x.monitor).map((x) => (
                  <p key={x.i} className={s.desc}>
                    {pareja && <b>{primerNombre(x.nombre)}: </b>}
                    {[x.monitor!.motivo ? `Motivo de inasistencia: ${x.monitor!.motivo}` : null, x.monitor!.observacion].filter(Boolean).join(" · ")}
                  </p>
                ))}
              </section>
            )}

            <section className={`ev-tarjeta ${s.parte}`}>
              <div>
                <h3>Parte A · ¿Funciona?</h3>
                <p className={s.pista}>{pareja ? "Minutos 0 a 6. Recorren juntos la app publicada. Esta parte cuenta igual para los dos." : "Minutos 0 a 6. El estudiante recorre su app publicada; tú marcas mientras observas."}</p>
              </div>
              <div>
                {ITEMS_A.map(([k, t, desc]) => (
                  <div key={k} className={s.q}>
                    <div><div className={s.qT}>{t}</div><div className={s.qD}>{desc}</div></div>
                    <Seg etiqueta={t} opciones={[["si", "Sí"], ["parcial", "Parcial"], ["no", "No"]] as const} valor={f.a[k]} disabled={!editable} onPick={(v) => ponerA(k, v)} />
                  </div>
                ))}
              </div>
            </section>

            <section className={`ev-tarjeta ${s.parte}`}>
              <div>
                <h3>Parte B · ¿Lo entiende?</h3>
                <p className={s.pista}>{pareja ? "Minutos 6 a 12. Reparte las preguntas entre los dos y califica a cada uno: el conocimiento es individual. Si los dos saben lo mismo, márcales el mismo nivel. Califica mínimo 2 temas por persona." : "Minutos 6 a 12. Pide que te muestre el código. Califica mínimo 2 temas; los que no preguntes déjalos sin marcar."}</p>
              </div>
              <div>
                {TEMAS_B.map(([k, t, pregunta]) => (
                  <div key={k} className={s.qb}>
                    <div className={s.qT}>{t}</div>
                    <div className={`${s.qD} ${s.qPregunta}`}>{pregunta}</div>
                    {d.integrantes.map((x, i) => (
                      <div key={i} className={`${s.quienFila} ${pareja ? "" : s.quienSolo}`}>
                        {pareja && <span className={s.quienNombre}>{primerNombre(x.nombre)}</span>}
                        {omitido(i) ? <span className="ev-small ev-muted">No se presentó</span> : (
                          <Seg nivel etiqueta={`${t}${pareja ? ` · ${x.nombre}` : ""}`} opciones={LV.map((n) => [n, String(n)] as const)} valor={f.b[i]?.[k]} disabled={!editable} onPick={(v) => ponerB(i, k, v)} />
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <p className={s.leyenda}>0 No conoce · 1 Conoce · 2 Comprende (explica la idea con ayuda) · 3 Practica (lo muestra y explica solo) · 4 Domina (podría modificarlo en vivo)</p>
              </div>
            </section>

            <section className={`ev-tarjeta ${s.parte}`}>
              <div>
                <h3>Cierre</h3>
                <p className={s.pista}>Minutos 12 a 15. Retroalimentación para el estudiante (en pareja, aplica para ambos). Coordinación la usará para el mensaje final.</p>
              </div>
              {([["fortaleza", "Lo que hizo muy bien", "Ej.: su catálogo es claro y explicó con seguridad cómo llegan los datos."],
                ["mejora", "Qué puede mejorar", "Ej.: terminar de conectar el formulario con la base de datos."],
                ["percepcion", "Percepción del mentor", "Un mensaje personal para el estudiante."]] as const).map(([k, label, ph]) => (
                <div key={k} className={s.campo}>
                  <label htmlFor={`c-${k}`}>{label}</label>
                  <textarea className="ev-campo" id={`c-${k}`} placeholder={ph} maxLength={2000} value={f[k]} disabled={!editable} onChange={(e) => cambiar({ ...f, [k]: e.target.value })} />
                </div>
              ))}
            </section>
          </div>

          <aside className={s.lado}>
            {d.integrantes.map((x, i) => {
              const c = resultado(i);
              return (
                <div key={i} className={`ev-tarjeta ${s.score}`}>
                  <span className="ev-small ev-muted">{pareja ? `Resultado de ${primerNombre(x.nombre)}` : "Resultado"}</span>
                  <span className={`${s.big} ${claseGrande(c.res as Resultado)}`}>{c.res}</span>
                  <div className={s.medidor}><span>Funciona (A)</span><b>{pct(c.a)}</b></div>
                  <div className={s.medidor}><span>Nivel promedio (B)</span><b>{c.nb ? `${uno(c.b)} (${c.nb} temas)` : "—"}</b></div>
                  {c.res === "Incompleto" && <span className={s.faltan}>Faltan datos: marca los 7 puntos de la Parte A y mínimo {MIN_B} temas de la Parte B.</span>}
                </div>
              );
            })}
            <div className="ev-tarjeta">
              <label className={s.toggle}>
                <input type="checkbox" checked={f.destacado} disabled={!editable} onChange={(e) => cambiar({ ...f, destacado: e.target.checked })} />
                Nominar como proyecto destacado
              </label>
            </div>
            {editable && (
              <>
                <button type="button" className="ev-btn ev-btn-primario" disabled={ocupado} onClick={() => void guardar()}>
                  {ocupado ? "Guardando…" : pareja ? "Guardar evaluación de la pareja" : "Guardar evaluación"}
                </button>
                {d.integrantes.map((x, i) => !ns[i] && (
                  <button key={i} type="button" className="ev-btn" onClick={() => void noSePresento(i)}>
                    {pareja ? `${primerNombre(x.nombre)} no se presentó` : "No se presentó"}
                  </button>
                ))}
                {sucio && <div className={s.guardado} aria-live="polite">{borradorEn ? `Borrador guardado (${borradorEn.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}). Aún no cuenta: falta «Guardar evaluación».` : "Cambios sin guardar."}</div>}
              </>
            )}
          </aside>
        </div>
      )}

      {confirmar && (
        <div className={s.confirmar} role="alertdialog" aria-modal="true">
          <div className={s.confirmarBox}>
            <p>{confirmar.texto}</p>
            <div className={s.confirmarActs}>
              {confirmar.no && <button type="button" className="ev-btn" onClick={() => { confirmar.ok(false); setConfirmar(null); }}>{confirmar.no}</button>}
              <button type="button" className="ev-btn ev-btn-primario" autoFocus onClick={() => { confirmar.ok(true); setConfirmar(null); }}>{confirmar.si}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={s.toast} role="status">{toast}</div>}
    </div>
  );
}

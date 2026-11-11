"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { diaCOL } from "@/lib/edicion";
import { MOTIVOS_INASISTENCIA, primerNombre, type MotivoInasistencia } from "@/lib/evaluacion/criterios";
import type { Asistencia, CupoLibre, DetalleSala, VistaSugerencia } from "@/lib/evaluacion/monitor";
import BotonesContacto from "./BotonesContacto";
import s from "./Evaluacion.module.css";
import { claseResultado, fechaLarga, horaTxt } from "./comun";

// Ficha del proyecto para el monitor de la sala (como el panel del monitor del prototipo): por integrante, contacto
// con "Llamar" y "WhatsApp", si se presentó, motivo de inasistencia y observación; reprogramar a un cupo libre de su
// ciudad o, fuera de eso, sugerir el cambio a administración. No toca la evaluación del mentor.

type Nota = { asistencia: Asistencia | null; motivo: MotivoInasistencia | null; observacion: string };
type Confirmar = { texto: string; si: string; no: string | null; ok: (v: boolean) => void };
type Respuesta = { ok?: boolean; error?: string; inicio?: string; mentor?: string; sigueEnTusSalas?: boolean } | null;

const MENSAJE: Record<string, string> = {
  otra_sala: "Este proyecto ya no está en tus salas.",
  no_existe: "Este proyecto ya no existe.",
  sin_hora: "Este proyecto ya no tiene hora.",
  sin_cupo: "Ese cupo ya no está libre. Elige otro.",
  tope: "La ciudad del estudiante ya llegó a su tope ese día. Elige otro día o sugiere un cambio especial.",
  ya_evaluado: "Ya tiene una evaluación guardada: no se puede reprogramar.",
  cambio: "La hora del proyecto cambió mientras tanto. Ciérralo y vuelve a abrirlo.",
  ya_sugerido: "Ya hay una sugerencia pendiente para este proyecto.",
  datos_invalidos: "Revisa los datos: el motivo y la sugerencia necesitan al menos 3 letras.",
};

async function post(id: string, body: unknown): Promise<{ status: number; data: Respuesta }> {
  const res = await fetch(`/api/evaluacion/salas/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const igual = (a: Nota, b: Nota) => a.asistencia === b.asistencia && a.motivo === b.motivo && a.observacion.trim() === b.observacion.trim();

export default function MonitorHoja({ id, onCerrar }: { id: string; onCerrar: (cambio: boolean) => void }) {
  const [d, setD] = useState<DetalleSala | null>(null);
  const [error, setError] = useState("");
  const [notas, setNotas] = useState<Nota[]>([]);
  const [guardadas, setGuardadas] = useState<Nota[]>([]);
  const [cupos, setCupos] = useState<CupoLibre[] | null>(null);
  const [cuposFallo, setCuposFallo] = useState(false);
  const [diaCupo, setDiaCupo] = useState("");
  const [cupo, setCupo] = useState("");
  const [motivoCambio, setMotivoCambio] = useState("");
  const [detalle, setDetalle] = useState("");
  const [motivoSug, setMotivoSug] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [toast, setToast] = useState("");
  const cambio = useRef(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = (t: string) => { setToast(t); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2600); };
  const preguntar = (texto: string, si: string, no: string | null = "Cancelar") => new Promise<boolean>((ok) => setConfirmar({ texto, si, no, ok }));
  const fallo = async (r: { status: number; data: Respuesta } | null) => {
    if (r?.status === 401) return window.location.assign("/login");
    await preguntar((r?.data?.error && MENSAJE[r.data.error]) || "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.", "Entendido", null);
  };

  const cargarCupos = useCallback(async () => {
    const res = await fetch(`/api/evaluacion/salas/${id}/cupos`, { cache: "no-store" }).catch(() => null);
    const data = res?.ok ? ((await res.json()) as { cupos: CupoLibre[] }) : null;
    // Si falla la red, no es lo mismo que "no hay cupos": se ofrece reintentar en vez de empujar a sugerir un cambio.
    setCuposFallo(!data);
    if (!data) return;
    const lista = data.cupos;
    setCupos(lista);
    const primero = lista[0] ? diaCOL(new Date(lista[0].inicio)) : "";
    setDiaCupo(primero);
    setCupo(lista.find((c) => diaCOL(new Date(c.inicio)) === primero)?.id ?? "");
  }, [id]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const res = await fetch(`/api/evaluacion/salas/${id}`, { cache: "no-store" }).catch(() => null);
      if (!vivo) return;
      if (res?.status === 401) return window.location.assign("/login");
      const data = res?.ok ? ((await res.json()) as DetalleSala) : null;
      if (!data) return setError(res?.status === 403 ? MENSAJE.otra_sala! : "No se pudo abrir el proyecto. Revisa tu conexión e inténtalo otra vez.");
      const n = data.integrantes.map((x) => ({ asistencia: x.asistencia, motivo: x.motivo ?? null, observacion: x.observacion }));
      setD(data); setNotas(n); setGuardadas(n);
      if (!data.evaluado) void cargarCupos();
    })();
    return () => { vivo = false; };
  }, [id, cargarCupos]);

  const sucio = notas.some((x, i) => !igual(x, guardadas[i]!));
  const cerrar = useCallback(async () => {
    if (sucio && !(await preguntar("Tienes observaciones sin guardar. ¿Salir de todas formas?", "Salir sin guardar"))) return;
    onCerrar(cambio.current);
  }, [sucio, onCerrar]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape" && !confirmar) void cerrar(); };
    document.addEventListener("keydown", fn);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", fn); document.body.style.overflow = ""; };
  }, [cerrar, confirmar]);

  const setNota = (i: number, n: Partial<Nota>) => setNotas((v) => v.map((x, k) => (k === i ? { ...x, ...n } : x)));

  async function guardarNota(i: number) {
    const n = notas[i]!;
    setOcupado(true);
    const r = await post(id, { accion: "anotar", i, ...n, motivo: n.asistencia === "si" ? null : n.motivo }).catch(() => null);
    setOcupado(false);
    if (!r?.data?.ok) return fallo(r);
    cambio.current = true;
    setGuardadas((v) => v.map((x, k) => (k === i ? { ...n, motivo: n.asistencia === "si" ? null : n.motivo } : x)));
    avisar("Observación guardada");
  }

  async function reprogramarCupo() {
    const c = cupos?.find((x) => x.id === cupo);
    if (!c) return preguntar("Elige un día y un cupo libre.", "Entendido", null);
    if (motivoCambio.trim().length < 3) return preguntar("Escribe el motivo del cambio para que quede registrado.", "Entendido", null);
    const nombres = d!.integrantes.map((x) => x.nombre).join(" y ");
    if (!(await preguntar(`¿Reprogramar a ${nombres} para el ${fechaLarga(diaCOL(new Date(c.inicio))).toLowerCase()} a las ${horaTxt(c.inicio, "")} con ${c.mentor}?`, "Sí, reprogramar"))) return;
    setOcupado(true);
    const r = await post(id, { accion: "reprogramar", asiento: c.id, motivo: motivoCambio }).catch(() => null);
    setOcupado(false);
    if (!r?.data?.ok) { await fallo(r); if (r?.data?.error === "sin_cupo") void cargarCupos(); return; }
    cambio.current = true;
    if (!r.data.sigueEnTusSalas) await preguntar(`Horario actualizado. Quedó en una sala de otro monitor (con ${r.data.mentor}), así que ya no aparecerá en tu lista.`, "Entendido", null);
    onCerrar(true);
  }

  async function sugerir() {
    if (detalle.trim().length < 3 || motivoSug.trim().length < 3) return preguntar("Escribe qué cambio sugieres y el motivo.", "Entendido", null);
    setOcupado(true);
    const r = await post(id, { accion: "sugerir", detalle, motivo: motivoSug }).catch(() => null);
    setOcupado(false);
    if (!r?.data?.ok) return fallo(r);
    cambio.current = true;
    setD((x) => x && { ...x, sugerencia: { detalle: detalle.trim(), motivo: motivoSug.trim(), creadoEn: new Date().toISOString(), estado: "pendiente" } });
    setDetalle(""); setMotivoSug("");
    avisar("Sugerencia enviada a administración");
  }

  const pareja = (d?.integrantes.length ?? 0) > 1;
  const diasCupo = [...new Set((cupos ?? []).map((c) => diaCOL(new Date(c.inicio))))];
  const meta = d ? [`${fechaLarga(d.dia)}, ${horaTxt(d.inicio, d.ciudad)}`, d.proyecto, d.ciudad, d.ruta ? `Ruta ${d.ruta.toLowerCase()}` : null, pareja ? "Proyecto en pareja" : null, `Mentor: ${d.mentor}`, d.sala ? `Sala ${d.sala}` : null].filter(Boolean).join(" · ") : "";

  return (
    <div className={s.hoja} role="dialog" aria-modal="true" aria-labelledby="m-nombre">
      <div className={s.hojaHead}>
        <div className={s.hojaHeadIn}>
          <button type="button" className={`ev-btn ${s.volver}`} onClick={() => void cerrar()}>Volver</button>
          <div className={s.hojaTitulo}>
            <h2 id="m-nombre">{d ? d.integrantes.map((x) => x.nombre).join(" y ") : "Cargando…"}</h2>
            {d && <div className={s.meta}>{meta}</div>}
          </div>
          {d?.enlace && <a className={`ev-btn ev-btn-primario ${s.abrirHoja}`} href={d.enlace} target="_blank" rel="noopener noreferrer">Abrir sala</a>}
        </div>
      </div>

      <div className={`${s.hojaBody} ${s.hojaUna}`}>
        <div className={s.col}>
          {error && <div className="ev-aviso ev-aviso-error">{error}</div>}
          {d?.descripcion && (
            <section className={`ev-tarjeta ${s.parte}`}>
              <div className="ev-small ev-muted">Sobre el proyecto</div>
              <p className={s.desc}>{d.descripcion}</p>
            </section>
          )}

          {d?.integrantes.map((x, i) => {
            const n = notas[i]!, sinGuardar = !igual(n, guardadas[i]!);
            return (
              <section key={x.i} className={`ev-tarjeta ${s.parte}`}>
                <div className={s.personaHead}><h3>{x.nombre}</h3><span className={claseResultado(x.res)}>{x.res}</span></div>
                <div className={s.contacto}>
                  <div className="ev-small ev-muted">{[`Doc. ${x.documento}`, x.correo].filter(Boolean).join(" · ")}</div>
                  {x.celular ? (
                    <div className={s.telefono}>
                      <span>Cel. {x.celular}</span>
                      <BotonesContacto celular={x.celular} />
                    </div>
                  ) : <div className={`ev-small ${s.sinCel}`}>Sin celular cargado.</div>}
                </div>
                {x.retro && <p className={`ev-small ${s.retro}`}>Retroalimentación del mentor: {x.retro}</p>}
                <div className={s.campo}>
                  <span className={s.etiqueta} id={`asis-${i}`}>¿Se presentó?</span>
                  <div className={s.seg} role="group" aria-labelledby={`asis-${i}`}>
                    {([["si", "Sí"], ["no", "No"]] as const).map(([v, t]) => (
                      <button key={v} type="button" data-v={v} aria-pressed={n.asistencia === v} onClick={() => setNota(i, { asistencia: n.asistencia === v ? null : v })}>{t}</button>
                    ))}
                  </div>
                </div>
                {n.asistencia !== "si" && (
                  <div className={s.campo}>
                    <label htmlFor={`motivo-${i}`}>Motivo de inasistencia (si no se presentó)</label>
                    <select id={`motivo-${i}`} className="ev-campo" value={n.motivo ?? ""} onChange={(e) => setNota(i, { motivo: (e.target.value || null) as MotivoInasistencia | null })}>
                      <option value="">— Sin motivo —</option>
                      {MOTIVOS_INASISTENCIA.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                <div className={s.campo}>
                  <label htmlFor={`obs-${i}`}>Observación del monitor</label>
                  <textarea id={`obs-${i}`} className="ev-campo" maxLength={1000} placeholder="Ej.: avisó que estaba enfermo; se reprograma para el jueves." value={n.observacion} onChange={(e) => setNota(i, { observacion: e.target.value })} />
                </div>
                <button type="button" className="ev-btn ev-btn-primario" disabled={ocupado || !sinGuardar} onClick={() => void guardarNota(i)}>
                  {pareja ? `Guardar observación de ${primerNombre(x.nombre)}` : "Guardar observación"}
                </button>
              </section>
            );
          })}

          {d && (
            <section className={`ev-tarjeta ${s.parte}`}>
              <h3>Reprogramar</h3>
              <p className={s.pista}>Elige un cupo libre de {d.ciudad} en sus días habilitados. {pareja ? "Los estudiantes quedan" : "El estudiante queda"} con el mentor de ese cupo, que {pareja ? "los" : "lo"} verá en su lista, y el cupo anterior queda libre. Si estaba marcado «No se presentó», vuelve a quedar pendiente. El cambio queda registrado con tu nombre.</p>
              {d.evaluado ? <div className="ev-aviso">{MENSAJE.ya_evaluado}</div>
                : cuposFallo ? <div className="ev-aviso ev-aviso-error">No se pudieron cargar los cupos libres. <button type="button" className="btn-link" onClick={() => void cargarCupos()}>Reintentar</button></div>
                : cupos === null ? <div className="ev-aviso">Buscando cupos libres…</div>
                : !cupos.length ? <div className="ev-aviso ev-aviso-warn">No hay cupos libres de {d.ciudad} en sus días habilitados. Si hace falta otro día u otra ciudad, sugiere el cambio aquí abajo.</div>
                : (
                  <>
                    <div className={s.dosCampos}>
                      <div className={s.campo}>
                        <label htmlFor="cupo-dia">Día</label>
                        <select id="cupo-dia" className="ev-campo" value={diaCupo} onChange={(e) => { setDiaCupo(e.target.value); setCupo(cupos.find((c) => diaCOL(new Date(c.inicio)) === e.target.value)?.id ?? ""); }}>
                          {diasCupo.map((x) => <option key={x} value={x}>{fechaLarga(x)} ({cupos.filter((c) => diaCOL(new Date(c.inicio)) === x).length} libres)</option>)}
                        </select>
                      </div>
                      <div className={s.campo}>
                        <label htmlFor="cupo-hora">Cupo libre (hora · mentor)</label>
                        <select id="cupo-hora" className="ev-campo" value={cupo} onChange={(e) => setCupo(e.target.value)}>
                          {cupos.filter((c) => diaCOL(new Date(c.inicio)) === diaCupo).map((c) => <option key={c.id} value={c.id}>{horaTxt(c.inicio, "")} · {c.mentor}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className={s.campo}>
                      <label htmlFor="motivo-cambio">Motivo del cambio</label>
                      <input id="motivo-cambio" className="ev-campo" maxLength={300} placeholder="Ej.: cita médica el día asignado" value={motivoCambio} onChange={(e) => setMotivoCambio(e.target.value)} />
                    </div>
                    <button type="button" className="ev-btn ev-btn-navy" disabled={ocupado} onClick={() => void reprogramarCupo()}>Reprogramar en este cupo</button>
                  </>
                )}
            </section>
          )}

          {d && (
            <section className={`ev-tarjeta ${s.parte}`}>
              <h3>Sugerir un cambio especial</h3>
              <p className={s.pista}>Para otro día, otra ciudad o una fecha después de la clausura de {d.ciudad}. Administración lo aprueba o lo rechaza; mientras tanto la hora no cambia.</p>
              {d.sugerencia && <EstadoSugerencia x={d.sugerencia} />}
              {d.sugerencia?.estado !== "pendiente" && (
                <>
                  <div className={s.campo}>
                    <label htmlFor="sug-detalle">Qué cambio sugieres</label>
                    <input id="sug-detalle" className="ev-campo" maxLength={300} placeholder="Ej.: pasarlo al lunes 16 con Cartagena" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
                  </div>
                  <div className={s.campo}>
                    <label htmlFor="sug-motivo">Motivo</label>
                    <input id="sug-motivo" className="ev-campo" maxLength={300} placeholder="Ej.: viaja esa semana por trabajo" value={motivoSug} onChange={(e) => setMotivoSug(e.target.value)} />
                  </div>
                  <button type="button" className="ev-btn" disabled={ocupado} onClick={() => void sugerir()}>Enviar sugerencia</button>
                </>
              )}
            </section>
          )}
        </div>
      </div>

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

/** Estado de una sugerencia del monitor: pendiente, aprobada (con la hora nueva) o rechazada (con el motivo). */
/** Texto con punto final (sin duplicarlo: "8:00 a. m." o un texto que ya termina en punto). */
const conPunto = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

export function EstadoSugerencia({ x }: { x: VistaSugerencia }) {
  if (x.deOtro) return <div className="ev-aviso ev-aviso-warn">Otro monitor ya sugirió un cambio para este proyecto; está pendiente de administración.</div>;
  const nuevo = x.nuevo?.split(" · ")[0];
  if (x.estado === "aprobado")
    return <div className={`ev-aviso ${s.sugOk}`}>Aprobada: {conPunto(x.detalle)}{nuevo ? ` Nueva hora: ${fechaLarga(nuevo.slice(0, 10))}, ${conPunto(nuevo.slice(11))}` : ""}</div>;
  if (x.estado === "rechazado")
    return <div className="ev-aviso ev-aviso-error">Rechazada: {conPunto(x.detalle)}{x.respuesta ? ` Motivo de administración: ${conPunto(x.respuesta)}` : ""} Puedes sugerir otro cambio.</div>;
  return <div className="ev-aviso ev-aviso-warn">Sugerencia enviada: {conPunto(x.detalle)} Motivo: {conPunto(x.motivo)} Pendiente de administración.</div>;
}

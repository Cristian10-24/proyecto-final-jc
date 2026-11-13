"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { CIUDADES, horaCO, horaUY } from "@/lib/ciudades";
import { diaCOL } from "@/lib/edicion";
import { estadoFila, MOTIVOS_INASISTENCIA, primerNombre, type MotivoInasistencia } from "@/lib/evaluacion/criterios";
import type { CupoLibre, DetalleSala, MiSugerencia, VistaSugerencia } from "@/lib/evaluacion/monitor";
import type { VistaMisProyectos } from "@/lib/misProyectos";
import {
  cuerpoAnotar, cuerpoReprogramar, cuerpoSugerir, faltaMotivo, mismaNota, urlCupos, urlFicha, urlSalas, urlVolver, type Nota,
} from "@/lib/vistas/fichaLlamadas";
import { claseResultado, fechaLarga } from "../comun";
import { BotonesLlamar, Chip, Telefono, type Tono } from "./Basicos";
import { useDialogo } from "./Dialogos";
import { Cargando, ErrorCarga, Vacio } from "./Estados";
import { IcoCamara } from "./Iconos";
import { CLAVE_VOLVER } from "./MisProyectosVista";
import ShellVistas from "./ShellVistas";
import d from "./Detalle.module.css";
import v from "./Vistas.module.css";

// Fase 6 · Entrega B · Paso 3 · Página de detalle /monitor/proyectos/[id]: reemplaza la ficha en ventana (MonitorHoja)
// con el MISMO contenido y las MISMAS llamadas (src/lib/vistas/fichaLlamadas.ts, fijadas por
// tests/fichaLlamadas.db.test.ts), más el enlace de la sesión con «Abrir sala» y «Copiar enlace». Sin reloj.
// Solo el monitor de esa sala la abre (la ruta responde 403 a los demás). No se refresca sola con cambios sin guardar
// y avisa antes de salir con cambios sin guardar.

type Confirmar = { texto: string; si: string; no: string | null; ok: (v: boolean) => void };
type Respuesta = { ok?: boolean; error?: string; inicio?: string; mentor?: string; sigueEnTusSalas?: boolean } | null;

const MENSAJE: Record<string, string> = {
  otra_sala: "Este proyecto ya no está en tus salas.",
  no_existe: "Este proyecto ya no existe.",
  sin_hora: "Este proyecto ya no tiene hora.",
  sin_cupo: "Ese cupo ya no está libre. Elige otro.",
  tope: "La ciudad del estudiante ya llegó a su tope ese día. Elige otro día o sugiere un cambio especial.",
  ya_evaluado: "Ya tiene una evaluación guardada: no se puede reprogramar.",
  cambio: "La hora del proyecto cambió mientras tanto. Vuelve a abrirlo.",
  ya_sugerido: "Ya hay una sugerencia pendiente para este proyecto.",
  datos_invalidos: "Revisa los datos: el motivo y la sugerencia necesitan al menos 3 letras.",
};
const esUY = (ciudad: string) => CIUDADES.find((c) => c.nombre === ciudad)?.pais === "UY";
const horaLarga = (iso: string) => horaCO(new Date(iso));
const ASIS: Record<"presente" | "ausente" | "pendiente", [string, Tono]> = { presente: ["Se presentó", "ok"], ausente: ["No se presentó", "bad"], pendiente: ["Pendiente", "idle"] };

async function post(id: string, body: unknown): Promise<{ status: number; data: Respuesta }> {
  const res = await fetch(urlFicha(id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const volverUrl = () => { try { return urlVolver(sessionStorage.getItem(CLAVE_VOLVER)); } catch { return "/monitor/proyectos"; } };

export default function DetalleProyecto({ user, id }: { user: SessionUser; id: string }) {
  const [det, setDet] = useState<DetalleSala | null>(null);
  const [estado, setEstado] = useState<"cargando" | "error" | "sinAcceso" | "listo">("cargando");
  const [mensajeAcceso, setMensajeAcceso] = useState("No tienes acceso a este proyecto.");
  const [notas, setNotas] = useState<Nota[]>([]);
  const [guardadas, setGuardadas] = useState<Nota[]>([]);
  const [mentorCel, setMentorCel] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<MiSugerencia[]>([]);
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
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = (t: string) => { setToast(t); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2600); };
  const preguntar = (texto: string, si: string, no: string | null = "Cancelar") => new Promise<boolean>((ok) => setConfirmar({ texto, si, no, ok }));
  const fallo = async (r: { status: number; data: Respuesta } | null) => {
    if (r?.status === 401) return window.location.assign("/login");
    await preguntar((r?.data?.error && MENSAJE[r.data.error]) || "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.", "Entendido", null);
  };

  const cargarCupos = useCallback(async () => {
    const res = await fetch(urlCupos(id), { cache: "no-store" }).catch(() => null);
    const data = res?.ok ? ((await res.json()) as { cupos: CupoLibre[] }) : null;
    setCuposFallo(!data);
    if (!data) return;
    setCupos(data.cupos);
    const primero = data.cupos[0] ? diaCOL(new Date(data.cupos[0].inicio)) : "";
    setDiaCupo(primero);
    setCupo(data.cupos.find((c) => diaCOL(new Date(c.inicio)) === primero)?.id ?? "");
  }, [id]);

  /** Lee la ficha. `notasTambien`: reemplaza lo escrito (solo si no hay cambios sin guardar). */
  const cargar = useCallback(async (notasTambien: boolean) => {
    const res = await fetch(urlFicha(id), { cache: "no-store" }).catch(() => null);
    if (res?.status === 401) return window.location.assign("/login");
    if (res && (res.status === 403 || res.status === 404)) {
      const e = (await res.json().catch(() => null)) as { error?: string } | null;
      setMensajeAcceso(e?.error && e.error !== "otra_sala" && MENSAJE[e.error] ? MENSAJE[e.error]! : "No tienes acceso a este proyecto.");
      return setEstado("sinAcceso");
    }
    if (!res?.ok) return setEstado((x) => (x === "listo" ? x : "error"));
    const data = (await res.json()) as DetalleSala;
    setDet(data);
    if (notasTambien) {
      const n = data.integrantes.map((x) => ({ asistencia: x.asistencia, motivo: x.motivo ?? null, observacion: x.observacion }));
      setNotas(n); setGuardadas(n);
    }
    setEstado("listo");
    // Lecturas que ya existían: el celular del mentor (Mis proyectos) y «Tus sugerencias de cambio» (Mis salas).
    void fetch(`/api/monitor/mis-proyectos?dia=${data.dia}`, { cache: "no-store" }).then(async (r) => {
      if (r.ok) setMentorCel(((await r.json()) as VistaMisProyectos).proyectos.find((p) => p.id === id)?.mentor.celular ?? null);
    }).catch(() => null);
    void fetch(urlSalas, { cache: "no-store" }).then(async (r) => { if (r.ok) setSugerencias((await r.json()).sugerencias ?? []); }).catch(() => null);
    if (!data.evaluado) void cargarCupos(); else setCupos([]);
  }, [id, cargarCupos]);

  useEffect(() => { void cargar(true); }, [cargar]);

  const sucio = notas.some((x, i) => guardadas[i] && !mismaNota(x, guardadas[i]!)) || !!motivoCambio.trim() || !!detalle.trim() || !!motivoSug.trim();
  // Refresco cada minuto solo si no hay nada escrito sin guardar (no pisa lo que se está escribiendo).
  useEffect(() => {
    if (sucio || estado !== "listo") return;
    const t = setInterval(() => void cargar(true), 60_000);
    return () => clearInterval(t);
  }, [sucio, estado, cargar]);
  // Aviso del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return;
    const fn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [sucio]);

  async function volver(e?: React.MouseEvent) {
    e?.preventDefault();
    if (sucio && !(await preguntar("Tienes cambios sin guardar. ¿Salir de todas formas?", "Salir sin guardar"))) return;
    window.location.assign(volverUrl());
  }

  const setNota = (i: number, n: Partial<Nota>) => setNotas((x) => x.map((y, k) => (k === i ? { ...y, ...n } : y)));

  async function guardarNota(i: number) {
    const n = notas[i]!;
    setOcupado(true);
    const r = await post(id, cuerpoAnotar(i, n)).catch(() => null);
    setOcupado(false);
    if (!r?.data?.ok) return fallo(r);
    setGuardadas((x) => x.map((y, k) => (k === i ? { ...n, motivo: n.asistencia === "si" ? null : n.motivo } : y)));
    setNotas((x) => x.map((y, k) => (k === i ? { ...n, motivo: n.asistencia === "si" ? null : n.motivo } : y)));
    avisar("Guardado");
    void cargar(false);
  }

  async function reprogramarCupo() {
    const c = cupos?.find((x) => x.id === cupo);
    if (!c) return preguntar("Elige un día y un cupo libre.", "Entendido", null);
    if (motivoCambio.trim().length < 3) return preguntar("Escribe el motivo del cambio para que quede registrado.", "Entendido", null);
    const nombres = det!.integrantes.map((x) => x.nombre).join(" y ");
    if (!(await preguntar(`¿Reprogramar a ${nombres} para el ${fechaLarga(diaCOL(new Date(c.inicio))).toLowerCase()} a las ${horaLarga(c.inicio)} con ${c.mentor}?`, "Sí, reprogramar"))) return;
    setOcupado(true);
    const r = await post(id, cuerpoReprogramar(c.id, motivoCambio)).catch(() => null);
    setOcupado(false);
    if (!r?.data?.ok) { await fallo(r); if (r?.data?.error === "sin_cupo") void cargarCupos(); return; }
    setMotivoCambio("");
    if (!r.data.sigueEnTusSalas) {
      await preguntar(`Horario actualizado. Quedó en una sala de otro monitor (con ${r.data.mentor}), así que ya no aparecerá en tu lista.`, "Volver a Mis proyectos", null);
      return window.location.assign(volverUrl());
    }
    avisar("Horario actualizado");
    void cargar(false);
  }

  async function sugerir() {
    if (detalle.trim().length < 3 || motivoSug.trim().length < 3) return preguntar("Escribe qué cambio sugieres y el motivo.", "Entendido", null);
    setOcupado(true);
    const r = await post(id, cuerpoSugerir(detalle, motivoSug)).catch(() => null);
    setOcupado(false);
    if (!r?.data?.ok) return fallo(r);
    setDetalle(""); setMotivoSug("");
    avisar("Sugerencia enviada a administración");
    void cargar(false);
  }

  async function copiar(enlace: string) {
    try { await navigator.clipboard.writeText(enlace); avisar("Enlace copiado"); }
    catch { await preguntar(`No se pudo copiar. El enlace es: ${enlace}`, "Entendido", null); }
  }

  const volverBoton = <a className={`${v.btn} ${d.volver}`} href="/monitor/proyectos" onClick={(e) => void volver(e)}>← Volver a Mis proyectos</a>;

  let cuerpo: React.ReactNode;
  if (estado === "cargando") cuerpo = <div className={v.pad}><Cargando /></div>;
  else if (estado === "error") cuerpo = <ErrorCarga titulo="No pudimos abrir el proyecto" onReintentar={() => { setEstado("cargando"); void cargar(true); }} />;
  else if (estado === "sinAcceso" || !det) cuerpo = <Vacio titulo={mensajeAcceso} texto="Solo el monitor de la sala de este proyecto puede abrirlo." accion={{ texto: "Volver a Mis proyectos", href: "/monitor/proyectos" }} />;
  else cuerpo = contenido();

  function contenido() {
    const x = det!;
    const pareja = x.integrantes.length > 1;
    const [txt, tono] = ASIS[estadoFila(x.integrantes.map((i) => ({ res: i.res, presente: i.asistencia === "si", ausente: i.asistencia === "no" })))];
    const diasCupo = [...new Set((cupos ?? []).map((c) => diaCOL(new Date(c.inicio))))];
    return (
      <div className={d.pagina}>
        <div className={d.top}>
          {volverBoton}
          <h1>{x.proyecto}</h1>
          <div className={d.chips}>
            <Chip tono="borde">{x.ciudad}{esUY(x.ciudad) ? " · Uruguay" : ""}</Chip>
            {x.ruta && <Chip tono="borde">Ruta {x.ruta.toLowerCase()}</Chip>}
            {pareja && <Chip tono="borde">En pareja</Chip>}
            <Chip tono={tono}>{txt}</Chip>
          </div>
        </div>

        <div className={d.grid}>
          <div className={d.izq}>
            <section className={`${d.card} ${d.o1}`} aria-labelledby="t-sesion">
              <h2 id="t-sesion">Sesión</h2>
              {x.enlace && <div className={v.soloMovil}><a className={`${v.btn} ${v.btnPri}`} href={x.enlace} target="_blank" rel="noopener noreferrer"><IcoCamara />Abrir sala</a></div>}
              <dl className={d.dl}>
                <dt>Día</dt><dd>{fechaLarga(x.dia)}</dd>
                <dt>Hora</dt><dd>{horaLarga(x.inicio)} (COL) · 15 minutos{esUY(x.ciudad) && <span>{horaUY(new Date(x.inicio))} (hora Uruguay)</span>}</dd>
                <dt>Sala</dt><dd>{x.sala ? `Sala ${x.sala}` : "Sala por asignar"}</dd>
                <dt>Enlace de la sesión</dt>
                <dd>{x.enlace ? <span className={d.enlace}>{x.enlace}</span> : <span>Sin enlace registrado</span>}</dd>
              </dl>
              {x.enlace && (
                <div className={d.acciones}>
                  <a className={`${v.btn} ${v.btnPri} ${v.soloWeb}`} href={x.enlace} target="_blank" rel="noopener noreferrer"><IcoCamara />Abrir sala</a>
                  <button type="button" className={v.btn} onClick={() => void copiar(x.enlace!)}>Copiar enlace</button>
                </div>
              )}
            </section>
            <section className={`${d.card} ${d.o3}`} aria-labelledby="t-mentor">
              <h2 id="t-mentor">Mentor</h2>
              <div className={d.linea}><b>{x.mentor}</b><Telefono celular={mentorCel} /><BotonesLlamar celular={mentorCel} nombre={x.mentor} /></div>
            </section>
            <section className={`${d.card} ${d.o4}`} aria-labelledby="t-sobre">
              <h2 id="t-sobre">Sobre el proyecto</h2>
              {x.descripcion ? <p className={d.desc}>{x.descripcion}</p> : <p className={d.pista}>Sin descripción.</p>}
              <dl className={d.dl}>
                <dt>Ciudad</dt><dd>{x.ciudad}</dd>
                {x.ruta && <><dt>Ruta</dt><dd>Ruta {x.ruta.toLowerCase()}</dd></>}
                <dt>Integrantes</dt><dd>{x.integrantes.map((i) => i.nombre).join(" y ")}</dd>
              </dl>
            </section>
          </div>

          <div className={d.centro}>
            {x.integrantes.map((p, i) => {
              const n = notas[i]!, sinGuardar = guardadas[i] ? !mismaNota(n, guardadas[i]!) : false;
              return (
                <section key={p.i} className={`${d.card} ${d.o2}`} aria-labelledby={`t-int-${i}`}>
                  <div className={d.personaHead}><h3 id={`t-int-${i}`}>{p.nombre}</h3><span className={claseResultado(p.res)}>{p.res}</span></div>
                  <div className={d.contacto}>
                    <div className={v.muted}>{[`Doc. ${p.documento}`, p.correo].filter(Boolean).join(" · ")}</div>
                    <div className={d.linea}><span>Cel. <Telefono celular={p.celular} /></span><BotonesLlamar celular={p.celular} nombre={p.nombre} /></div>
                  </div>
                  {p.retro && <p className={d.retro}>Retroalimentación del mentor: {p.retro}</p>}
                  <div className={d.campo}>
                    <span className={d.etiqueta} id={`asis-${i}`}>¿Se presentó?</span>
                    <div className={d.sino} role="group" aria-labelledby={`asis-${i}`}>
                      {([["si", "Sí"], ["no", "No"]] as const).map(([val, t]) => (
                        <button key={val} type="button" data-v={val} aria-pressed={n.asistencia === val} onClick={() => setNota(i, { asistencia: n.asistencia === val ? null : val })}>{t}</button>
                      ))}
                    </div>
                  </div>
                  {n.asistencia !== "si" && (
                    <div className={d.campo}>
                      <label htmlFor={`motivo-${i}`}>Motivo de inasistencia (si no se presentó)</label>
                      <select id={`motivo-${i}`} className={d.control} value={n.motivo ?? ""} onChange={(e) => setNota(i, { motivo: (e.target.value || null) as MotivoInasistencia | null })}>
                        <option value="">— Sin motivo —</option>
                        {MOTIVOS_INASISTENCIA.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      {faltaMotivo(n) && <div className={`${v.aviso} ${v.avisoWarn}`} role="status">Falta registrar el motivo de la inasistencia.</div>}
                    </div>
                  )}
                  <div className={d.campo}>
                    <label htmlFor={`obs-${i}`}>Observación del monitor</label>
                    <textarea id={`obs-${i}`} className={d.control} maxLength={1000} placeholder="Ej.: avisó que estaba enfermo; se reprograma para el jueves." value={n.observacion} onChange={(e) => setNota(i, { observacion: e.target.value })} />
                  </div>
                  <button type="button" className={`${v.btn} ${v.btnPri} ${d.btn}`} disabled={ocupado || !sinGuardar} onClick={() => void guardarNota(i)}>
                    {pareja ? `Guardar observación de ${primerNombre(p.nombre)}` : "Guardar observación"}
                  </button>
                </section>
              );
            })}
          </div>

          <div className={d.der}>
            <section className={`${d.card} ${d.o5}`} aria-labelledby="t-reprog">
              <h2 id="t-reprog">Reprogramar</h2>
              <p className={d.pista}>Elige un cupo libre de {x.ciudad} en sus días habilitados. {pareja ? "Los estudiantes quedan" : "El estudiante queda"} con el mentor de ese cupo, que {pareja ? "los" : "lo"} verá en su lista, y el cupo anterior queda libre. Si estaba marcado «No se presentó», vuelve a quedar pendiente. El cambio queda registrado con tu nombre.</p>
              {x.evaluado ? <div className={v.aviso}>{MENSAJE.ya_evaluado}</div>
                : cuposFallo ? <div className={`${v.aviso} ${v.avisoErr}`}>No se pudieron cargar los cupos libres. <button type="button" className={v.btn} onClick={() => void cargarCupos()}>Reintentar</button></div>
                : cupos === null ? <div className={v.aviso}>Buscando cupos libres…</div>
                : !cupos.length ? <div className={`${v.aviso} ${v.avisoWarn}`}>No hay cupos libres de {x.ciudad} en sus días habilitados. Si hace falta otro día u otra ciudad, sugiere el cambio aquí abajo.</div>
                : (
                  <>
                    <div className={d.dos}>
                      <div className={d.campo}>
                        <label htmlFor="cupo-dia">Día</label>
                        <select id="cupo-dia" className={d.control} value={diaCupo} onChange={(e) => { setDiaCupo(e.target.value); setCupo(cupos.find((c) => diaCOL(new Date(c.inicio)) === e.target.value)?.id ?? ""); }}>
                          {diasCupo.map((dd) => <option key={dd} value={dd}>{fechaLarga(dd)} ({cupos.filter((c) => diaCOL(new Date(c.inicio)) === dd).length} libres)</option>)}
                        </select>
                      </div>
                      <div className={d.campo}>
                        <label htmlFor="cupo-hora">Cupo libre (hora · mentor)</label>
                        <select id="cupo-hora" className={d.control} value={cupo} onChange={(e) => setCupo(e.target.value)}>
                          {cupos.filter((c) => diaCOL(new Date(c.inicio)) === diaCupo).map((c) => <option key={c.id} value={c.id}>{horaLarga(c.inicio)} · {c.mentor}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className={d.campo}>
                      <label htmlFor="motivo-cambio">Motivo del cambio</label>
                      <input id="motivo-cambio" className={d.control} maxLength={300} placeholder="Ej.: cita médica el día asignado" value={motivoCambio} onChange={(e) => setMotivoCambio(e.target.value)} />
                    </div>
                    <button type="button" className={`${v.btn} ${v.btnNegro} ${d.btn}`} disabled={ocupado} onClick={() => void reprogramarCupo()}>Reprogramar en este cupo</button>
                  </>
                )}
            </section>
            <section className={`${d.card} ${d.o6}`} aria-labelledby="t-sug">
              <h2 id="t-sug">Sugerir un cambio especial</h2>
              <p className={d.pista}>Para otro día, otra ciudad o una fecha después de la clausura de {x.ciudad}. Administración lo aprueba o lo rechaza; mientras tanto la hora no cambia.</p>
              {x.sugerencia && <EstadoSugerencia x={x.sugerencia} />}
              {x.sugerencia?.estado !== "pendiente" && (
                <>
                  <div className={d.campo}>
                    <label htmlFor="sug-detalle">Qué cambio sugieres</label>
                    <input id="sug-detalle" className={d.control} maxLength={300} placeholder="Ej.: pasarlo al lunes 16 con Cartagena" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
                  </div>
                  <div className={d.campo}>
                    <label htmlFor="sug-motivo">Motivo</label>
                    <input id="sug-motivo" className={d.control} maxLength={300} placeholder="Ej.: viaja esa semana por trabajo" value={motivoSug} onChange={(e) => setMotivoSug(e.target.value)} />
                  </div>
                  <button type="button" className={`${v.btn} ${d.btn}`} disabled={ocupado} onClick={() => void sugerir()}>Enviar sugerencia</button>
                </>
              )}
            </section>
            {sugerencias.length > 0 && (
              <section className={`${d.card} ${d.o7}`} aria-labelledby="t-tus">
                <h2 id="t-tus">Tus sugerencias de cambio</h2>
                <div className={d.sugs}>
                  {sugerencias.map((s) => (
                    <div key={s.creadoEn} className={d.sug}>
                      <b>{s.integrantes.join(" y ")}</b>
                      <span className={d.pista}>{s.proyecto} · hora al sugerir: {fechaLarga(s.anterior.slice(0, 10))}, {s.anterior.slice(11)}</span>
                      <EstadoSugerencia x={s} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ShellVistas user={user} active="proyectos">
      {cuerpo}
      {confirmar && <ConfirmarDialogo c={confirmar} cerrar={() => setConfirmar(null)} />}
      {toast && <div className={d.toast} role="status">{toast}</div>}
    </ShellVistas>
  );
}

function ConfirmarDialogo({ c, cerrar }: { c: Confirmar; cerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const responder = (x: boolean) => { c.ok(x); cerrar(); };
  useDialogo(ref, () => responder(false));
  return (
    <>
      <div className={v.velo} aria-hidden="true" />
      <div ref={ref} className={d.confirmarBox} role="alertdialog" aria-modal="true">
        <p>{c.texto}</p>
        <div className={d.confirmarActs}>
          {c.no && <button type="button" className={v.btn} onClick={() => responder(false)}>{c.no}</button>}
          <button type="button" className={`${v.btn} ${v.btnPri}`} onClick={() => responder(true)}>{c.si}</button>
        </div>
      </div>
    </>
  );
}

/** Texto con punto final (sin duplicarlo). */
const conPunto = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/** Estado de una sugerencia del monitor: pendiente, aprobada (con la hora nueva) o rechazada (con el motivo). Igual que en la ficha. */
export function EstadoSugerencia({ x }: { x: VistaSugerencia }) {
  if (x.deOtro) return <div className={`${v.aviso} ${v.avisoWarn}`}>Otro monitor ya sugirió un cambio para este proyecto; está pendiente de administración.</div>;
  const nuevo = x.nuevo?.split(" · ")[0];
  if (x.estado === "aprobado")
    return <div className={`${v.aviso} ${d.sugOk}`}>Aprobada: {conPunto(x.detalle)}{nuevo ? ` Nueva hora: ${fechaLarga(nuevo.slice(0, 10))}, ${conPunto(nuevo.slice(11))}` : ""}</div>;
  if (x.estado === "rechazado")
    return <div className={`${v.aviso} ${v.avisoErr}`}>Rechazada: {conPunto(x.detalle)}{x.respuesta ? ` Motivo de administración: ${conPunto(x.respuesta)}` : ""} Puedes sugerir otro cambio.</div>;
  return <div className={`${v.aviso} ${v.avisoWarn}`}>Sugerencia enviada: {conPunto(x.detalle)} Motivo: {conPunto(x.motivo)} Pendiente de administración.</div>;
}

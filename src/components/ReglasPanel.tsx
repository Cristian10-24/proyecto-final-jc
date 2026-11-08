"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { EstadoModo } from "@/lib/modoCupos";
import type { CierreCiudad, PlanDia } from "@/lib/reglasCupos";
import AppShell from "./AppShell";
import s from "./ReglasPanel.module.css";

// Editor de reglas de cupos (Paso 17, como "Reglas de cupos por ciudad" del prototipo del admin): por día, ciudades
// habilitadas con mínimo (cupos reservados), máximo, sobrante y apertura; vista previa del reparto por hora antes de
// aplicar (solo se reetiquetan asientos libres). Abajo, el cierre de inscripciones por ciudad. Horas en hora COL.

type Regla = { ciudad: string; minimo: number | null; maximo: number | null; sobrante: boolean; abre: string | null };
type Dia = { dia: string; capacidad: number; ocupados: number; ciudades: Regla[]; editadoEn?: string; editadoPor?: string };
type Datos = { dias: Dia[]; ciudades: string[]; clausuras: Record<string, string>; cierre: { horasAntes: number; ciudades: CierreCiudad[] } };

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtFecha = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).replace(/\./g, "");
const etiquetaDia = (d: string) => cap(fmtDia.format(new Date(d + "T12:00:00Z")));
const fecha = (iso: string | null) => { if (!iso) return "—"; const t = fmtFecha.format(new Date(iso)).replace(/\s+/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
/** ISO UTC ↔ valor de <input type="datetime-local"> en hora de Colombia (UTC−5). */
const aLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 16) : "");
const deLocal = (v: string) => (v ? new Date(`${v}:00-05:00`).toISOString() : null);
const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));

async function api<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) window.location.assign("/login");
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

export default function ReglasPanel({ user }: { user: SessionUser }) {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [dia, setDia] = useState("");
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [plan, setPlan] = useState<PlanDia | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState(false);

  const cargar = useCallback(async () => {
    const r = await api<Datos>("/api/admin/reglas").catch(() => null);
    if (!r?.ok || !r.data) return setError(true);
    setD(r.data);
    setError(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const actual = d?.dias.find((x) => x.dia === dia);
  useEffect(() => { if (d && !dia && d.dias[0]) setDia(d.dias[0].dia); }, [d, dia]);
  // Solo al cambiar de día (o al llegar los datos): recargar tras «Aplicar» o «Guardar cierre» no borra lo que se está
  // editando ni el mensaje y la vista previa.
  const diaCargado = actual?.dia;
  useEffect(() => {
    setReglas(actual?.ciudades.map((x) => ({ ...x })) ?? []); setPlan(null); setMsg(null);
  }, [diaCargado]); // eslint-disable-line react-hooks/exhaustive-deps

  const suma = reglas.reduce((a, r) => a + (r.minimo ?? 0), 0);
  const exceso = actual ? suma - actual.capacidad : 0;
  const disponibles = useMemo(() => (d?.ciudades ?? []).filter((c) => !reglas.some((r) => r.ciudad === c)), [d, reglas]);
  const cambiar = (i: number, cambio: Partial<Regla>) => { setReglas((rs) => rs.map((r, k) => (k === i ? { ...r, ...cambio } : cambio.sobrante ? { ...r, sobrante: false } : r))); setPlan(null); setMsg(null); };

  async function enviar(accion: "previa" | "aplicar") {
    setOcupado(true); setMsg(null);
    const r = await api<{ plan?: PlanDia; ok?: boolean; errores?: string[]; mensaje?: string }>("/api/admin/reglas", { accion, dia, ciudades: reglas }).catch(() => null);
    setOcupado(false);
    if (!r?.data) return setMsg({ tipo: "error", texto: "Sin conexión. Inténtalo otra vez." });
    if (accion === "previa") {
      if (r.data.plan) setPlan(r.data.plan);
      else setMsg({ tipo: "error", texto: r.data.mensaje ?? "Revisa los datos." });
      return;
    }
    if (r.ok && r.data.ok) { setMsg({ tipo: "ok", texto: "Reglas aplicadas. Solo se reetiquetaron asientos libres." }); setPlan(r.data.plan ?? null); await cargar(); }
    else setMsg({ tipo: "error", texto: r.data.errores?.join(" ") ?? r.data.mensaje ?? "No se pudo aplicar." });
  }

  const etiquetas = useMemo(() => [...new Set((plan?.porHora ?? []).flatMap((h) => Object.keys(h.libres)))].sort(), [plan]);

  return (
    <AppShell user={user} active="reglas">
      <div className={s.kicker}>Reglas de cupos por ciudad</div>
      <h1 className={s.title}>Quién puede usar cada día</h1>
      <p className={s.lead}>Edita las ciudades de cada día y revisa el reparto antes de aplicar. Al aplicar solo cambian los asientos libres: nadie que ya eligió hora se mueve. Lo editado aquí manda hasta la próxima importación de la hoja Cupos.</p>

      {error && <div className="note note-error">No pudimos cargar las reglas. <button type="button" className="btn-link" onClick={() => void cargar()}>Intentar de nuevo</button></div>}
      {!d && !error && <div className={s.skel} />}

      {d && (
        <>
          <ModoLlegada />
          <div className={s.dias} role="group" aria-label="Día">
            {d.dias.map((x) => (
              <button key={x.dia} type="button" className={`${s.dia} ${x.dia === dia ? s.diaOn : ""}`} aria-pressed={x.dia === dia} onClick={() => setDia(x.dia)}>
                <b>{etiquetaDia(x.dia)}</b><span>{x.ocupados}/{x.capacidad}</span>{x.editadoEn && <i title="Editado en pantalla">●</i>}
              </button>
            ))}
          </div>

          {actual && (
            <section className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.cardT}>{etiquetaDia(actual.dia)} · {actual.capacidad} cupos</h2>
                <span className={s.sub}>{actual.ocupados} ya reservados · se conservan</span>
              </div>
              {actual.editadoEn && <div className="note note-info">Editado en pantalla {fecha(actual.editadoEn)} por {actual.editadoPor}: manda hasta la próxima importación de la hoja Cupos.</div>}

              <div className={s.tablaWrap}>
                <table className={s.tabla}>
                  <thead><tr><th>Ciudad</th><th>Cupos reservados (mínimo)</th><th>Máximo del día</th><th>Sobrante</th><th>Abre (hora COL)</th><th /></tr></thead>
                  <tbody>
                    {reglas.map((r, i) => {
                      const tarde = r.ciudad !== "Todas" && d.clausuras[r.ciudad] && actual.dia >= d.clausuras[r.ciudad]!;
                      return (
                        <tr key={r.ciudad}>
                          <td><b>{r.ciudad}</b>{tarde && <div className={s.malo}>Su clausura es el {d.clausuras[r.ciudad]}</div>}</td>
                          <td><input className={`input ${s.num}`} type="number" min={0} value={r.minimo ?? ""} placeholder={r.sobrante ? "0" : ""} onChange={(e) => cambiar(i, { minimo: num(e.target.value) })} aria-label={`Cupos reservados de ${r.ciudad}`} /></td>
                          <td><input className={`input ${s.num}`} type="number" min={0} value={r.maximo ?? ""} placeholder={r.sobrante ? "Todo lo que sobre" : "Igual al mínimo"} onChange={(e) => cambiar(i, { maximo: num(e.target.value) })} aria-label={`Máximo de ${r.ciudad}`} /></td>
                          <td><input type="radio" name="sobrante" checked={r.sobrante} onChange={() => cambiar(i, { sobrante: true })} aria-label={`El sobrante va para ${r.ciudad}`} /></td>
                          <td><input className={`input ${s.fecha}`} type="datetime-local" value={aLocal(r.abre)} onChange={(e) => cambiar(i, { abre: deLocal(e.target.value) })} aria-label={`Apertura de ${r.ciudad}`} /></td>
                          <td><button type="button" className="btn-link" onClick={() => { setReglas((rs) => rs.filter((_, k) => k !== i)); setPlan(null); }}>Quitar</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={s.fila}>
                <select className={`input ${s.sel}`} value="" onChange={(e) => { if (e.target.value) { setReglas((rs) => [...rs, { ciudad: e.target.value, minimo: 0, maximo: null, sobrante: false, abre: null }]); setPlan(null); } }} aria-label="Agregar ciudad">
                  <option value="">+ Agregar ciudad</option>
                  {disponibles.map((c) => <option key={c} value={c}>{c}{c !== "Todas" && d.clausuras[c] && actual.dia >= d.clausuras[c]! ? " (ya pasó su clausura)" : ""}</option>)}
                </select>
                <span className={exceso > 0 ? s.malo : s.sub}>Reservados: {suma} de {actual.capacidad}</span>
              </div>
              {exceso > 0 && <div className="note note-error">La suma de reservados ({suma}) supera la capacidad del día ({actual.capacidad}). Baja {exceso} cupos para poder aplicar.</div>}

              <div className={s.acts}>
                <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => { setReglas(actual.ciudades.map((x) => ({ ...x }))); setPlan(null); setMsg(null); }}>Deshacer cambios</button>
                <button type="button" className="btn btn-dark" disabled={ocupado || exceso > 0} onClick={() => void enviar("previa")}>{ocupado ? "Calculando…" : "Vista previa"}</button>
                <button type="button" className="btn btn-primary" disabled={ocupado || !plan || plan.errores.length > 0} onClick={() => setConfirmar(true)}>Aplicar</button>
              </div>
              {msg && <div className={`note ${msg.tipo === "ok" ? "note-info" : "note-error"}`} role="status">{msg.texto}</div>}

              {plan && (
                <div className={s.previa}>
                  {plan.errores.map((e) => <div key={e} className="note note-error">{e}</div>)}
                  {plan.avisos.map((e) => <div key={e} className="note note-warn">{e}</div>)}
                  {!plan.errores.length && (
                    <>
                      <div className={s.resumen}>
                        {plan.grupos.map((g) => <span key={g.etiqueta} className={s.chip}><b>{g.etiqueta}</b> {g.cuota} cupos · {g.reservados} reservados · {g.libres} libres</span>)}
                        <span className={s.sub}>{plan.cambios} asientos libres cambian de ciudad</span>
                      </div>
                      <div className={s.tablaWrap}>
                        <table className={s.tabla}>
                          <thead><tr><th>Hora COL</th><th>Asientos</th><th>Reservados</th>{etiquetas.map((e) => <th key={e}>Libres · {e}</th>)}</tr></thead>
                          <tbody>{plan.porHora.map((h) => <tr key={h.hora}><td>{h.hora}</td><td>{h.total}</td><td>{h.ocupados}</td>{etiquetas.map((e) => <td key={e}>{h.libres[e] ?? 0}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          <Cierre datos={d.cierre} onGuardado={() => void cargar()} />
        </>
      )}

      {confirmar && actual && (
        <div className={s.overlay} role="alertdialog" aria-modal="true" aria-labelledby="ap-t">
          <div className={s.modal}>
            <div id="ap-t" className={s.modalT}>¿Aplicar las reglas del {etiquetaDia(actual.dia)}?</div>
            <p className={s.sub}>{plan?.cambios ?? 0} asientos libres cambian de ciudad. Las {actual.ocupados} reservas se conservan. Queda en el historial.</p>
            <div className={s.acts}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" autoFocus onClick={() => { setConfirmar(false); void enviar("aplicar"); }}>Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/** Fase 4 · Interruptor del modo orden de llegada, con el tope, lo que lleva y lo que puede tomar cada ciudad por día. */
function ModoLlegada() {
  const [m, setM] = useState<EstadoModo | null>(null);
  const [error, setError] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const cargar = useCallback(async () => {
    const r = await api<EstadoModo>("/api/admin/reglas/modo").catch(() => null);
    if (!r?.ok || !r.data) return setError(true);
    setM(r.data); setError(false);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function cambiar() {
    if (!m) return;
    setConfirmar(false); setOcupado(true); setMsg("");
    const r = await api<EstadoModo & { ok?: boolean }>("/api/admin/reglas/modo", { ordenLlegada: !m.ordenLlegada }).catch(() => null);
    setOcupado(false);
    if (r?.ok && r.data) { setM(r.data); setMsg(r.data.ordenLlegada ? "Modo orden de llegada activado." : "Modo orden de llegada desactivado: cada ciudad vuelve a sus asientos."); }
    else setMsg("No se pudo cambiar. Inténtalo otra vez.");
  }

  if (error) return <div className="note note-error">No pudimos cargar el modo orden de llegada. <button type="button" className="btn-link" onClick={() => void cargar()}>Intentar de nuevo</button></div>;
  if (!m) return null;
  const tope = (t: number | null) => (t === null ? "Sin tope" : t);
  return (
    <section className={s.card} aria-labelledby="modo-t">
      <div className={s.cardHead}>
        <h2 id="modo-t" className={s.cardT}>Modo orden de llegada</h2>
        <span className={s.chip}><b>{m.ordenLlegada ? "Activado" : "Desactivado"}</b>{m.actualizadoEn && ` · ${fecha(m.actualizadoEn)} por ${m.actualizadoPor}`}</span>
      </div>
      <p className={s.sub}>Activado, cualquier asiento libre de un día lo puede tomar cualquier ciudad habilitada ese día, sin importar de qué ciudad era el asiento. El límite es el tope de cada ciudad en el día: su «Máximo del día» o, si no tiene, sus «Cupos reservados». La ciudad de sobrante y las que presentan por «Todas» no tienen tope. Se respetan los días por ciudad, la apertura y el cierre. Los asientos y las reservas no cambian: desactivarlo vuelve a como estaba.</p>
      <div className={s.tablaWrap}>
        <table className={s.tabla}>
          <thead><tr><th>Día</th><th>Ciudad</th><th>Tope</th><th>Lleva</th><th>Libres que puede tomar</th></tr></thead>
          <tbody>
            {m.dias.flatMap((x) => x.ciudades.map((c, i) => (
              <tr key={`${x.dia}|${c.ciudad}`}>
                <td>{i === 0 && <><b>{etiquetaDia(x.dia)}</b><div className={s.sub}>{x.libres} libres desde ahora</div></>}</td>
                <td><b>{c.ciudad}</b>{!c.habilitada && <div className={s.malo}>No presenta este día (reservas movidas a mano)</div>}</td>
                <td>{c.habilitada ? tope(c.tope) : "—"}</td>
                <td>{c.lleva}</td>
                <td>{c.habilitada ? <>{c.puedeTomar}{c.tope !== null && c.lleva >= c.tope && <div className={s.malo}>Llegó al tope</div>}</> : "—"}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className={s.acts}>
        {msg && <span className={s.sub} role="status">{msg}</span>}
        <button type="button" className="btn-link" onClick={() => void cargar()}>Actualizar</button>
        <button type="button" className={`btn ${m.ordenLlegada ? "btn-ghost" : "btn-primary"}`} disabled={ocupado} onClick={() => setConfirmar(true)}>
          {ocupado ? "Guardando…" : m.ordenLlegada ? "Desactivar" : "Activar modo orden de llegada"}
        </button>
      </div>
      {confirmar && (
        <div className={s.overlay} role="alertdialog" aria-modal="true" aria-labelledby="modo-c">
          <div className={s.modal}>
            <div id="modo-c" className={s.modalT}>{m.ordenLlegada ? "¿Desactivar el modo orden de llegada?" : "¿Activar el modo orden de llegada?"}</div>
            <p className={s.sub}>{m.ordenLlegada
              ? "Cada ciudad vuelve a ver solo los asientos de su etiqueta. Las reservas hechas se conservan. Queda en el historial."
              : "Desde ya, los estudiantes ven todas las horas libres de sus días habilitados hasta llegar al tope de su ciudad. No se mueve ninguna reserva. Queda en el historial."}</p>
            <div className={s.acts}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" autoFocus onClick={() => void cambiar()}>{m.ordenLlegada ? "Desactivar" : "Activar"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Cierre({ datos, onGuardado }: { datos: Datos["cierre"]; onGuardado: () => void }) {
  const [horas, setHoras] = useState(String(datos.horasAntes));
  const [manual, setManual] = useState<Record<string, string | null>>(() => Object.fromEntries(datos.ciudades.map((c) => [c.ciudad, c.manual])));
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function guardar() {
    const h = Number(horas);
    if (!Number.isInteger(h) || h < 0) return setMsg("Escribe un número entero de horas.");
    setOcupado(true);
    const r = await api<{ ok?: boolean; mensaje?: string }>("/api/admin/reglas/cierre", { horasAntes: h, porCiudad: manual }).catch(() => null);
    setOcupado(false);
    setMsg(r?.ok ? "Cierre guardado." : r?.data?.mensaje ?? "No se pudo guardar.");
    if (r?.ok) onGuardado();
  }
  return (
    <section className={s.card} aria-labelledby="cierre-t">
      <h2 id="cierre-t" className={s.cardT}>Cierre de inscripciones por ciudad</h2>
      <p className={s.sub}>Desde el cierre, quien no tiene hora ve «Las inscripciones ya cerraron» con la fecha; quien ya tiene hora sigue viendo su boleto. Por defecto, cierra unas horas antes del primer bloque de su primer día; puedes fijar una fecha a mano por ciudad.</p>
      <label className={s.horas}>Cerrar <input className={`input ${s.num}`} type="number" min={0} value={horas} onChange={(e) => setHoras(e.target.value)} /> horas antes del primer bloque de cada ciudad</label>
      <div className={s.tablaWrap}>
        <table className={s.tabla}>
          <thead><tr><th>Ciudad</th><th>Primer bloque</th><th>Cierre automático</th><th>Cierre a mano (hora COL)</th><th>Cierra</th></tr></thead>
          <tbody>
            {datos.ciudades.map((c) => (
              <tr key={c.ciudad}>
                <td><b>{c.ciudad}</b></td>
                <td>{fecha(c.primerBloque)}</td>
                <td>{c.sinAutomatico ? <span className={s.malo}>Abre después: fíjalo a mano</span> : c.primerBloque ? fecha(new Date(new Date(c.primerBloque).getTime() - (Number(horas) || 0) * 3600_000).toISOString()) : "—"}</td>
                <td><input className={`input ${s.fecha}`} type="datetime-local" value={aLocal(manual[c.ciudad] ?? null)} onChange={(e) => setManual((m) => ({ ...m, [c.ciudad]: deLocal(e.target.value) }))} aria-label={`Cierre a mano de ${c.ciudad}`} />
                  {manual[c.ciudad] && <button type="button" className="btn-link" onClick={() => setManual((m) => ({ ...m, [c.ciudad]: null }))}>Quitar</button>}</td>
                <td><b>{manual[c.ciudad] ? fecha(manual[c.ciudad]!) : c.sinAutomatico ? "Sin cierre" : fecha(c.primerBloque ? new Date(new Date(c.primerBloque).getTime() - (Number(horas) || 0) * 3600_000).toISOString() : null)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.acts}>
        {msg && <span className={s.sub} role="status">{msg}</span>}
        <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar cierre"}</button>
      </div>
    </section>
  );
}

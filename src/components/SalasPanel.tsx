"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { FilaPlan, VistaPlan } from "@/lib/planSalas";
import AppShell from "./AppShell";
import s from "./HorariosPanel.module.css";

// Administración · Salas (Paso 9): plan de salas por día y hora con su monitor. Mismos estilos que Horarios.

type Filtro = "" | "sin_monitor";
const ORIGEN: Record<string, string> = { importado: "De la hoja Monitores", automatico: "Automático", admin: "Cambio manual" };
const ERROR_MONITOR: Record<string, string> = {
  ocupado: "Ese monitor ya tiene otra sala a esa hora.", monitor_invalido: "Ese monitor ya no está activo.", no_existe: "Esa sala ya no existe: recarga la página.",
};

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const etiquetaDia = (dia: string) => { const t = fmtDia.format(new Date(dia + "T12:00:00Z")).replace(/[.,]/g, ""); return t.charAt(0).toUpperCase() + t.slice(1); };

async function post(body: unknown) {
  const res = await fetch("/api/admin/salas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) window.location.assign("/login");
  return { ok: res.ok, data: (await res.json().catch(() => null)) as { error?: string; sala?: number } | null };
}

export default function SalasPanel({ user }: { user: SessionUser }) {
  const [vista, setVista] = useState<VistaPlan | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [dia, setDia] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("");
  const [guardando, setGuardando] = useState("");
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/salas", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setVista(await res.json());
      setCarga("listo");
    } catch {
      setCarga((c) => (c === "listo" ? c : "error")); // un refresco fallido no borra la tabla
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const dias = useMemo(() => [...new Set(vista?.filas.map((f) => f.dia) ?? [])], [vista]);
  const diaActual = dias.includes(dia) ? dia : dias[0] ?? "";
  const delDia = (vista?.filas ?? []).filter((f) => f.dia === diaActual);
  const filas = filtro === "sin_monitor" ? delDia.filter((f) => !f.monitor) : delDia;
  const sinMonitorTotal = (vista?.filas ?? []).filter((f) => !f.monitor).length;
  // Sala de cada monitor en cada hora del día, para marcar quién ya está ocupado.
  const salaDe = useMemo(() => new Map(delDia.filter((f) => f.monitor).map((f) => [`${f.hora}|${f.monitor!.usuario}`, f.sala])), [delDia]);

  async function cambiar(f: FilaPlan, monitor: string | null) {
    setGuardando(f.id);
    setAviso(null);
    try {
      const r = await post({ accion: "monitor", id: f.id, monitor });
      if (!r.ok) setAviso({ tono: "error", texto: (r.data?.error && ERROR_MONITOR[r.data.error]) ?? "No se pudo cambiar el monitor." });
      else setAviso({ tono: "ok", texto: `Sala ${f.sala} · ${f.horaTxt}: ${monitor ? vista?.monitores.find((m) => m.usuario === monitor)?.nombre : "sin monitor"}.` });
      await cargar();
    } catch {
      setAviso({ tono: "error", texto: "Sin conexión. Revisa tu internet e inténtalo otra vez." });
    }
    setGuardando("");
  }

  async function recalcular() {
    setGuardando("recalcular");
    setAviso(null);
    const r = await post({ accion: "recalcular" }).catch(() => null);
    const n = (r?.data as { avisos?: unknown[] } | null)?.avisos?.length ?? 0;
    setAviso(r?.ok ? { tono: "ok", texto: `Plan recalculado con los horarios actuales.${n ? ` ${n} ${n === 1 ? "fila" : "filas"} de la hoja Monitores ya no aplican (cambiaron los horarios).` : ""}` } : { tono: "error", texto: "No se pudo recalcular: revisa el libro de salas y monitores en Importar." });
    await cargar();
    setGuardando("");
  }

  return (
    <AppShell user={user} active="salas">
      <div className={s.kicker}>Administración</div>
      <h1 className={s.title}>Salas</h1>
      <p className={s.lead}>Sala y monitor de cada mentor en cada hora. Puedes cambiar el monitor de una sala; el cambio queda en el historial.</p>

      <section className={s.card}>
        {carga === "cargando" && <div className={s.skel}>{[1, 2, 3, 4].map((i) => <div key={i} className={s.skelFila} />)}</div>}
        {carga === "error" && (
          <div className={s.vacio}><b>No se pudo cargar el plan de salas</b><button type="button" className="btn btn-ghost" onClick={() => { setCarga("cargando"); void cargar(); }}>Reintentar</button></div>
        )}
        {carga === "listo" && vista && !vista.filas.length && (
          <div className={s.vacio}><b>Todavía no hay plan de salas</b>Importa el libro de salas y monitores (después de mentores y disponibilidad).<a className="btn btn-ghost" href="/admin/importar">Ir a Importar</a></div>
        )}
        {carga === "listo" && vista && vista.filas.length > 0 && (
          <>
            <div className={s.cardHead}>
              <div>
                <h2 className={s.cardTitle}>Plan de salas</h2>
                <p className={s.desc}>{sinMonitorTotal ? `${sinMonitorTotal} ${sinMonitorTotal === 1 ? "sala sin monitor" : "salas sin monitor"} en total.` : "Todas las salas tienen monitor."}</p>
              </div>
              <a className="btn btn-ghost" href="/api/admin/salas/excel">Descargar plan de salas</a>
            </div>

            {vista.desactualizado && (
              <div className="note note-warn">
                Los horarios de los mentores cambiaron después de armar este plan.{" "}
                <button type="button" className="btn btn-dark" disabled={!!guardando} onClick={recalcular}>{guardando === "recalcular" ? "Recalculando…" : "Recalcular plan"}</button>
              </div>
            )}
            {aviso && <div className={`note ${aviso.tono === "ok" ? "note-info" : "note-error"}`} role="status">{aviso.texto}</div>}

            <div className={s.filtros}>
              <div className={s.segmento} role="group" aria-label="Día">
                {dias.map((d) => {
                  const n = (vista.filas ?? []).filter((f) => f.dia === d && !f.monitor).length;
                  return <button key={d} type="button" className={`${s.segBtn} ${d === diaActual ? s.segOn : ""}`} aria-pressed={d === diaActual} onClick={() => setDia(d)}>{etiquetaDia(d)}{n ? ` · ${n} sin monitor` : ""}</button>;
                })}
              </div>
              <div className={s.segmento} role="group" aria-label="Filtro">
                {([["", "Todas"], ["sin_monitor", "Sin monitor"]] as const).map(([v, t]) => (
                  <button key={v} type="button" className={`${s.segBtn} ${filtro === v ? s.segOn : ""}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>
                ))}
              </div>
            </div>

            <div className={s.tablaWrap}>
              <table className={s.tabla}>
                <thead><tr><th>Hora</th><th className={s.num}>Sala</th><th>Mentor</th><th>Monitor</th><th>Enlace</th></tr></thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id}>
                      <td className={s.nowrap}>{f.horaTxt}</td>
                      <td className={s.num}>{f.sala}</td>
                      <td className={s.pNombre}>{f.mentor}</td>
                      <td>
                        <select className={`input ${s.select}`} aria-label={`Monitor de la sala ${f.sala} a las ${f.horaTxt}`} value={f.monitor?.usuario ?? ""}
                          disabled={!!guardando} onChange={(ev) => void cambiar(f, ev.target.value || null)}>
                          <option value="">— Sin monitor —</option>
                          {vista.monitores.map((m) => {
                            const otra = salaDe.get(`${f.hora}|${m.usuario}`);
                            const ocupado = otra !== undefined && otra !== f.sala;
                            return <option key={m.usuario} value={m.usuario} disabled={ocupado}>{m.nombre}{ocupado ? ` (en sala ${otra})` : ""}</option>;
                          })}
                        </select>
                        <div className={s.sub}>
                          {f.monitor ? ORIGEN[f.origen ?? ""] ?? "" : <span className={`${s.chip} ${s.chip_amarillo}`}><i />Sin monitor</span>}
                        </div>
                      </td>
                      <td>{f.enlace ? <a href={f.enlace} target="_blank" rel="noopener noreferrer">Abrir sala</a> : "—"}</td>
                    </tr>
                  ))}
                  {!filas.length && <tr><td colSpan={5} className={s.sub}>No hay salas sin monitor este día.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

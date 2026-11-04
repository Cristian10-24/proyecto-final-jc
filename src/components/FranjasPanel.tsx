"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { DatosFranjas, HoraFranja } from "@/lib/franjas";
import AppShell from "./AppShell";
import s from "./FranjasPanel.module.css";

// Franjas y mentores (Paso 17b, prototipo 5b): por día y hora, los mentores como fichas con "×" y "+ Agregar mentor",
// la capacidad (1 mentor = 4 por hora), ocupados, libres y libres por ciudad. Se refresca cada 30 s. Coordinación
// solo mira. En celular, cada hora es una tarjeta. Horas en hora de Colombia.

type Resultado = { ok: boolean; aviso?: string; mensaje?: string; proyectos?: { codigo: string; nombre: string; hora: string }[] };

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).replace(/\./g, "");
const etiquetaDia = (d: string) => cap(fmtDia.format(new Date(d + "T12:00:00Z")));

async function api<T>(url: string, body?: unknown): Promise<{ ok: boolean; data: T | null }> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) window.location.assign("/login");
  return { ok: res.ok, data: (await res.json().catch(() => null)) as T | null };
}

export default function FranjasPanel({ user, puedeEditar }: { user: SessionUser; puedeEditar: boolean }) {
  const [d, setD] = useState<DatosFranjas | null>(null);
  const [dia, setDia] = useState("");
  const [error, setError] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string; proyectos?: Resultado["proyectos"] } | null>(null);

  const cargar = useCallback(async (dd: string) => {
    const r = await api<DatosFranjas>(`/api/admin/franjas${dd ? `?dia=${encodeURIComponent(dd)}` : ""}`).catch(() => null);
    if (!r?.ok || !r.data) return setError(true);
    setD(r.data);
    setError(false);
  }, []);
  useEffect(() => {
    void cargar(dia);
    const t = setInterval(() => { if (document.visibilityState === "visible") void cargar(dia); }, 30_000);
    return () => clearInterval(t);
  }, [cargar, dia]);

  async function cambiar(accion: "agregar" | "quitar", h: HoraFranja, mentorId: string, nombre: string) {
    if (!d || !mentorId) return;
    setOcupado(true); setMsg(null);
    const r = await api<Resultado>("/api/admin/franjas", { accion, dia: d.dia, hora: h.hora, mentorId }).catch(() => null);
    setOcupado(false);
    if (!r?.data) return setMsg({ tipo: "error", texto: "Sin conexión. Inténtalo otra vez." });
    if (r.data.ok) setMsg({ tipo: "ok", texto: `${accion === "agregar" ? "Agregado" : "Quitado"}: ${nombre} (${h.etiqueta}).${r.data.aviso ? ` ${r.data.aviso}` : ""}` });
    else setMsg({ tipo: "error", texto: r.data.mensaje ?? "No se pudo guardar.", proyectos: r.data.proyectos });
    await cargar(d.dia);
  }

  const capacidad = (h: HoraFranja) => (h.mentores.length ? `${h.mentores.length} × 4 = ${h.total}` : "No se ofrece");

  return (
    <AppShell user={user} active="franjas">
      <div className={s.kicker}>Franjas y mentores · hora COL</div>
      <h1 className={s.title}>Quién atiende cada hora</h1>
      <p className={s.lead}>Cada mentor atiende 4 presentaciones por hora; una hora sin mentores no se ofrece. {puedeEditar
        ? "Al agregar un mentor se crean sus cupos con las reglas del día y se recalcula el plan de salas; solo puedes quitarlo si sus cupos de esa hora están libres."
        : "Solo el administrador puede cambiar los mentores."} Lo editado aquí manda hasta la próxima importación de la hoja Horarios.</p>

      {error && <div className="note note-error">No pudimos cargar las franjas. <button type="button" className="btn-link" onClick={() => void cargar(dia)}>Intentar de nuevo</button></div>}
      {!d && !error && <div className={s.skel} />}
      {d && !d.dias.length && <div className="note note-info">Aún no hay horarios: importa el libro de Mentores y disponibilidad.</div>}

      {d && d.dias.length > 0 && (
        <>
          <div className={s.dias} role="group" aria-label="Día">
            {d.dias.map((x) => (
              <button key={x} type="button" className={`${s.dia} ${x === d.dia ? s.diaOn : ""}`} aria-pressed={x === d.dia} onClick={() => { setDia(x); setMsg(null); }}>
                {etiquetaDia(x)}
              </button>
            ))}
          </div>

          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardT}>{etiquetaDia(d.dia)}</h2>
              <div className={s.totales}>
                <span><b>{d.totales.total}</b> cupos</span>
                <span><b>{d.totales.ocupados}</b> ocupados</span>
                <span><b className={s.libre}>{d.totales.libres}</b> libres</span>
              </div>
            </div>
            {d.editadas > 0 && <div className="note note-info">Este día tiene {d.editadas} cambio{d.editadas === 1 ? "" : "s"} de mentores hecho{d.editadas === 1 ? "" : "s"} aquí: mandan hasta la próxima importación de la hoja Horarios.</div>}
            {msg && (
              <div className={`note ${msg.tipo === "ok" ? "note-info" : "note-error"}`} role="status">
                {msg.texto}
                {msg.proyectos && msg.proyectos.length > 0 && <ul className={s.mover}>{msg.proyectos.map((p) => <li key={p.codigo}><b>{p.hora}</b> · {p.codigo} · {p.nombre}</li>)}</ul>}
              </div>
            )}

            <div className={s.lista}>
              <div className={`${s.fila} ${s.cabeza}`} aria-hidden="true"><span>Hora</span><span>Mentores</span><span>Capacidad</span><span>Ocupación</span><span>Libres por ciudad</span></div>
              {d.horas.map((h) => {
                const otros = d.mentores.filter((m) => !h.mentores.some((x) => x.id === m.id));
                return (
                  <div key={h.hora} className={`${s.fila} ${h.mentores.length ? "" : s.vacia}`}>
                    <span className={s.hora}>{h.etiqueta}</span>
                    <div className={s.chips}>
                      {h.mentores.map((m) => (
                        <span key={m.id} className={`${s.chip} ${puedeEditar ? s.chipX : ""}`} title={m.ocupados ? `${m.ocupados} de 4 ocupados` : "Sus 4 cupos están libres"}>
                          {m.nombre}{m.ocupados > 0 && <em>{m.ocupados}/4</em>}
                          {puedeEditar && <button type="button" disabled={ocupado} aria-label={`Quitar a ${m.nombre} de ${h.etiqueta}`} onClick={() => void cambiar("quitar", h, m.id, m.nombre)}>×</button>}
                        </span>
                      ))}
                      {puedeEditar && otros.length > 0 && (
                        <select className={s.agregar} value="" disabled={ocupado} aria-label={`Agregar mentor a ${h.etiqueta}`}
                          onChange={(e) => { const m = otros.find((x) => x.id === e.target.value); if (m) void cambiar("agregar", h, m.id, m.nombre); }}>
                          <option value="">+ Agregar mentor</option>
                          {otros.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                      )}
                    </div>
                    <span className={s.capa}>{capacidad(h)}</span>
                    <span className={s.ocup}>{h.total ? <>{h.ocupados} de {h.total} · <b className={h.libres ? s.libre : s.lleno}>{h.libres} libre{h.libres === 1 ? "" : "s"}</b></> : "—"}</span>
                    <div className={s.ciudades}>{h.libresPorCiudad.map((c) => <span key={c.etiqueta} className={s.ciudad}>{c.etiqueta} <b>{c.n}</b></span>)}</div>
                  </div>
                );
              })}
            </div>
            {d.salas !== null && <p className={s.sub}>Plan de salas: {d.salas} salas, un mentor por sala y hora.</p>}
          </section>
        </>
      )}
    </AppShell>
  );
}

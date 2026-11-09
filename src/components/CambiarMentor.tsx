"use client";

import { useCallback, useEffect, useState } from "react";
import { horaCO } from "@/lib/ciudades";
import { etiquetaCarga, type MentoresLibres } from "@/lib/cambioMentorTexto";
import s from "./CambiarMentor.module.css";

// Paso 25 · «Cambiar mentor (mismo bloque)», el mismo en las fichas de Horarios y del Tablero. Lista solo los mentores
// con asiento libre en ese bloque exacto, con su carga. El cambio es POST /api/admin/proyectos/[id] con `mismoBloque`
// (cambiarHora en su transacción): el estudiante nunca cambia de día ni de hora.

type Listo = Extract<MentoresLibres, { ok: true }>;
type Estado = { fase: "cargando" | "error" | "sin_hora" } | { fase: "listo"; d: Listo };

export default function CambiarMentor({ proyectoId, motivoBase, conMotivo, bloqueado, onHecho, onCancelar, onOcupado }: {
  proyectoId: string;
  /** Motivo que queda en el historial si no se escribe otro. */
  motivoBase: string;
  conMotivo?: boolean;
  bloqueado?: boolean;
  onHecho: (msg: string) => void;
  onCancelar?: () => void;
  onOcupado?: (v: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [asiento, setAsiento] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [pideConfirmar, setPideConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setEstado({ fase: "cargando" });
    try {
      const r = await fetch(`/api/admin/proyectos/${proyectoId}/mentores`, { cache: "no-store" });
      if (r.status === 401) return window.location.assign("/login");
      const d = (await r.json().catch(() => null)) as MentoresLibres | null;
      if (d?.ok) { setEstado({ fase: "listo", d }); setAsiento((a) => (d.opciones.some((o) => o.asiento === a) ? a : "")); }
      else setEstado({ fase: r.status === 409 ? "sin_hora" : "error" });
    } catch { setEstado({ fase: "error" }); }
  }, [proyectoId]);
  useEffect(() => { void cargar(); }, [cargar]);

  const ocupar = (v: boolean) => { setEnviando(v); onOcupado?.(v); };

  async function cambiar(d: Listo) {
    ocupar(true); setError("");
    try {
      const r = await fetch(`/api/admin/proyectos/${proyectoId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ accion: "cambiar", inicio: d.inicio, asiento, otraCiudad: true, mismoBloque: true, confirmarEnCurso: confirmo, motivo: motivo.trim() || motivoBase }),
      });
      if (r.status === 401) return window.location.assign("/login");
      const x = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; mensaje?: string } | null;
      ocupar(false);
      if (r.ok && x?.ok) return onHecho("Mentor cambiado");
      if (x?.error === "en_curso") { setPideConfirmar(true); setError(""); return; }
      setError(x?.error === "sin_cupo" ? "Ese mentor ya no tiene el asiento libre a esta hora (lo acaba de tomar otro proyecto). Elige otro." : x?.mensaje ?? "No se pudo guardar. Inténtalo otra vez.");
      setAsiento("");
      await cargar();
    } catch {
      ocupar(false);
      setError("Sin conexión. Revisa tu internet e inténtalo otra vez.");
    }
  }

  const d = estado.fase === "listo" ? estado.d : null;
  const elegido = d?.opciones.find((o) => o.asiento === asiento);
  const enCurso = !!d && (d.enCurso || pideConfirmar);
  const ocupado = enviando || !!bloqueado;

  return (
    <div className={s.caja}>
      <span className="label">Cambiar mentor (mismo bloque)</span>
      {estado.fase === "cargando" && <div className={s.skel} aria-busy="true" />}
      {estado.fase === "error" && <div className="note note-info">No pudimos cargar los mentores. <button type="button" className="btn-link" onClick={() => void cargar()}>Intentar de nuevo</button></div>}
      {estado.fase === "sin_hora" && <div className="note note-info">Este proyecto ya no tiene hora.</div>}
      {d && <p className={s.sub}>Misma hora: {horaCO(new Date(d.inicio))} COL. Hoy con {d.mentor}; solo cambia el mentor y su sala.</p>}
      {d?.bloqueo && <div className="note note-info">Ya tiene evaluación, asistencia, notas del monitor o borrador del mentor: no se le cambia el mentor.</div>}
      {d && !d.bloqueo && (
        <>
          {d.opciones.length === 0 ? <div className="note note-info">No hay otro mentor libre a esta hora</div> : (
            <select className="input" value={asiento} disabled={ocupado} onChange={(e) => { setAsiento(e.target.value); setError(""); }} aria-label="Mentor con asiento libre">
              <option value="">Elige un mentor con asiento libre</option>
              {d.opciones.map((o) => <option key={o.asiento} value={o.asiento}>{etiquetaCarga(o)}{o.deSuCiudad ? "" : ` · asiento de ${o.ciudades.join(" + ") || "sin ciudad"}`}</option>)}
            </select>
          )}
          {elegido && !elegido.deSuCiudad && <div className="note note-warn">Ese asiento es de {elegido.ciudades.join(" + ") || "ninguna ciudad"}, no de la ciudad del proyecto. Quedará en el historial.</div>}
          {enCurso && (
            <label className={s.check}>
              <input type="checkbox" checked={confirmo} disabled={ocupado} onChange={(e) => setConfirmo(e.target.checked)} />
              <span>La presentación está por empezar (menos de 30 min) o en curso. Confirmo el cambio de mentor y sala; quedará en el historial.</span>
            </label>
          )}
          {conMotivo && d.opciones.length > 0 && (
            <label className={s.campo}>
              <span className="label">Motivo (opcional)</span>
              <input className="input" value={motivo} maxLength={300} disabled={ocupado} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: juntar los proyectos del mentor" />
            </label>
          )}
        </>
      )}
      {error && <div className="note note-error" role="alert">{error}</div>}
      <div className={s.acts}>
        {onCancelar && <button type="button" className="btn btn-ghost" disabled={enviando} onClick={onCancelar}>Cancelar</button>}
        {d && !d.bloqueo && d.opciones.length > 0 && (
          <button type="button" className="btn btn-primary" disabled={ocupado || !asiento || (enCurso && !confirmo)} onClick={() => void cambiar(d)}>
            {enviando ? "Cambiando…" : "Cambiar mentor"}
          </button>
        )}
      </div>
    </div>
  );
}

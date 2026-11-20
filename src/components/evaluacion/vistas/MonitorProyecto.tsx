"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProyectoMonitor, VistaMonitorProyecto } from "@/lib/monitorProyecto";
import { Chip, Selector } from "./Basicos";
import m from "./Monitores.module.css";
import v from "./Vistas.module.css";

// Monitor por proyecto (solo administración): en el panel del bloque de «Monitores», junto a cada proyecto,
// «Monitor: [nombre] · Cambiar». Cambiar abre el selector de monitores activos, el motivo (opcional) y Confirmar;
// «Quitar excepción» vuelve al monitor del bloque. Solo cambia el monitor (ni sala, ni enlace, ni mentor, ni reserva).

/** Datos del admin para el día (se piden solo si es admin y hay panel abierto). */
export function useMonitorProyecto(dia: string, admin: boolean) {
  const [datos, setDatos] = useState<VistaMonitorProyecto | null>(null);
  const cargar = useCallback(async () => {
    if (!admin) return;
    try {
      const r = await fetch(`/api/admin/monitor-proyecto?dia=${encodeURIComponent(dia)}`, { cache: "no-store" });
      if (r.ok) setDatos(await r.json());
    } catch { /* sin conexión: se ve sin «Cambiar» */ }
  }, [admin, dia]);
  useEffect(() => { void cargar(); }, [cargar]);
  return { datos, recargar: cargar };
}

type Props = {
  /** Monitor que se ve hoy para este proyecto (nombre) y si viene de una excepción. */
  nombre: string | null; manual: boolean;
  /** Solo admin: datos del proyecto en la ruta del admin y los monitores activos. */
  admin?: { p: ProyectoMonitor; monitores: VistaMonitorProyecto["monitores"]; onCambio: () => void };
};

export function MonitorDeProyecto({ nombre, manual, admin }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState("");
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "error" | "aviso"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const abrir = () => {
    setElegido(admin?.p.excepcion?.monitor.usuario ?? "");
    setMotivo(admin?.p.excepcion?.motivo ?? "");
    setAviso(null);
    setAbierto(true);
  };
  const enviar = async (cuerpo: Record<string, unknown>) => {
    if (!admin) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/admin/monitor-proyecto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, proyectoId: admin.p.id }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setAbierto(false); setAviso(null); admin.onCambio(); return; }
      setAviso({ tipo: j.error === "aviso" ? "aviso" : "error", texto: j.mensaje ?? "No se pudo guardar. Intenta de nuevo." });
    } catch {
      setAviso({ tipo: "error", texto: "Sin conexión. Intenta de nuevo." });
    } finally {
      setEnviando(false);
    }
  };
  const asignar = (confirmar: boolean) => elegido && enviar({ accion: "asignar", monitor: elegido, ...(motivo.trim() ? { motivo: motivo.trim() } : {}), ...(confirmar ? { confirmar: true } : {}) });

  const opciones = [{ valor: "", texto: "Elige un monitor" }, ...(admin?.monitores ?? [])
    .filter((x) => x.usuario !== admin?.p.bloque?.usuario)
    .map((x) => ({ valor: x.usuario, texto: x.nombre }))];

  return (
    <div className={m.monProy}>
      <span className={v.small}>
        Monitor: <b>{nombre ?? "Sin monitor"}</b>
        {manual && <> <Chip tono="borde">Asignado a mano</Chip></>}
        {admin && !abierto && <> · <button type="button" className={m.enlaceBtn} onClick={abrir} aria-label={`Cambiar el monitor de ${admin.p.nombre}`}>Cambiar</button></>}
      </span>
      {admin && abierto && (
        <div className={m.monProyForm}>
          {admin.p.bloque && <span className={`${v.small} ${v.muted}`}>Monitor del bloque: {admin.p.bloque.nombre}. Solo cambia el monitor de este proyecto.</span>}
          <Selector id={`mon-${admin.p.id}`} etiqueta="Monitor de este proyecto" valor={elegido} opciones={opciones} onCambio={(x) => { setElegido(x); setAviso(null); }} />
          <div className={v.campo}>
            <label className={v.lbl} htmlFor={`motivo-${admin.p.id}`}>Motivo (opcional)</label>
            <input id={`motivo-${admin.p.id}`} className={v.control} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          {aviso && <div className={`${v.aviso} ${aviso.tipo === "aviso" ? v.avisoWarn : v.avisoErr}`} role="alert">{aviso.texto}</div>}
          <div className={m.monProyAcc}>
            {aviso?.tipo === "aviso"
              ? <button type="button" className={`${v.btn} ${v.btnPri}`} disabled={enviando} onClick={() => void asignar(true)}>Guardar igual</button>
              : <button type="button" className={`${v.btn} ${v.btnPri}`} disabled={enviando || !elegido} onClick={() => void asignar(false)}>Confirmar</button>}
            <button type="button" className={v.btn} disabled={enviando} onClick={() => setAbierto(false)}>Cancelar</button>
            {admin.p.excepcion && <button type="button" className={v.btn} disabled={enviando} onClick={() => void enviar({ accion: "quitar" })}>Quitar excepción</button>}
          </div>
        </div>
      )}
    </div>
  );
}

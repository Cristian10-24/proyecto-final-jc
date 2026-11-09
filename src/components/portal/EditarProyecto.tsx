"use client";

import { useState } from "react";
import s from "./Portal.module.css";

// Paso 23 · Formulario del portal para cambiar el nombre y la descripción del proyecto. Lo valida el servidor; aquí
// solo los largos (contadores). `onGuardar` devuelve el error de un campo, o null si se guardó.

const NOMBRE_MAX = 120, DESCRIPCION_MAX = 600;
export type ErrorEdicion = { mensaje: string; campo?: "nombre" | "descripcion" } | null;

export default function EditarProyecto({ nombre, descripcion, onGuardar, onCancelar }: {
  nombre: string; descripcion: string;
  onGuardar: (nombre: string, descripcion: string) => Promise<ErrorEdicion>;
  onCancelar: () => void;
}) {
  const [n, setN] = useState(nombre);
  const [d, setD] = useState(descripcion);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorEdicion>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError(await onGuardar(n, d));
    setOcupado(false);
  }

  return (
    <form className={`${s.tarjeta} ${s.tarjetaProyecto}`} onSubmit={(e) => void guardar(e)} aria-label="Editar tu proyecto" noValidate>
      <div className={s.campo}>
        <label className="label" htmlFor="ep-nombre">Nombre del proyecto</label>
        <input id="ep-nombre" className={`input ${error?.campo === "nombre" ? "is-error" : ""}`} value={n} maxLength={NOMBRE_MAX}
          onChange={(e) => setN(e.target.value)} autoComplete="off" aria-invalid={error?.campo === "nombre" || undefined} aria-describedby="ep-nombre-c" />
        <span id="ep-nombre-c" className={s.ayuda}>{n.length} / {NOMBRE_MAX}</span>
      </div>
      <div className={s.campo}>
        <label className="label" htmlFor="ep-desc">Descripción (opcional)</label>
        <textarea id="ep-desc" className={`input ${error?.campo === "descripcion" ? "is-error" : ""}`} rows={4} value={d} maxLength={DESCRIPCION_MAX}
          onChange={(e) => setD(e.target.value)} aria-invalid={error?.campo === "descripcion" || undefined} aria-describedby="ep-desc-c" />
        <span id="ep-desc-c" className={s.ayuda}>{d.length} / {DESCRIPCION_MAX}</span>
      </div>
      {error && <div className="note note-error" role="alert">{error.mensaje}</div>}
      <button type="submit" className="btn btn-primary" disabled={ocupado || n.trim().length < 3}>{ocupado ? "Guardando…" : "Guardar cambios"}</button>
      <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={onCancelar}>Cancelar</button>
    </form>
  );
}

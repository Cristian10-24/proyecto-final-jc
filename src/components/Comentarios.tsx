"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComentarioVista } from "@/lib/comentarios";
import { ROL_TXT } from "@/lib/permisos";
import s from "./Comentarios.module.css";

// Paso 22 · Comentarios de seguimiento de un proyecto. El monitor escribe y edita o borra los suyos; coordinación y
// admin solo leen (el servidor decide `puedeEscribir`). Texto plano: React lo escapa.

const MAX = 1000;
const fmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
const fecha = (iso: string) => fmt.format(new Date(iso)).replace(/\./g, "");
type Datos = { comentarios: ComentarioVista[]; puedeEscribir: boolean };

/** `onCambio(n)`: cuántos quedan, para actualizar el indicador de la lista. */
export default function Comentarios({ proyectoId, onCambio }: { proyectoId: string; onCambio?: (n: number) => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const url = `/api/monitor/proyectos/${proyectoId}/comentarios`;
  // En una ref: una función nueva en cada render del padre no debe volver a cargar.
  const avisar = useRef(onCambio);
  avisar.current = onCambio;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) { window.location.assign("/login"); return; }
      const d = (await res.json().catch(() => null)) as Datos | null;
      if (!res.ok || !d) { setError("No pudimos cargar los comentarios."); return; }
      setDatos(d); setError("");
      avisar.current?.(d.comentarios.length);
    } catch { setError("Sin conexión. Revisa tu internet."); }
  }, [url]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function enviar(body: Record<string, unknown>): Promise<boolean> {
    setOcupado(true); setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { window.location.assign("/login"); return false; }
      const d = (await res.json().catch(() => null)) as { mensaje?: string } | null;
      if (!res.ok) { setError(d?.mensaje ?? "No se pudo guardar. Inténtalo otra vez."); return false; }
      await cargar();
      return true;
    } catch { setError("Sin conexión. Revisa tu internet e inténtalo otra vez."); return false; }
    finally { setOcupado(false); }
  }

  if (!datos) return <div className={s.caja}>{error ? <p className={s.vacio}>{error} <button type="button" className="btn-link" onClick={() => void cargar()}>Intentar de nuevo</button></p> : <div className={s.skel} />}</div>;

  return (
    <div className={s.caja}>
      {datos.comentarios.length === 0 ? <p className={s.vacio}>Sin comentarios todavía.</p> : (
        <ol className={s.lista}>
          {datos.comentarios.map((c) => (
            <li key={c.id} className={s.item}>
              <div className={s.cabeza}>
                <b>{c.autorNombre}</b><span className={s.meta}>{ROL_TXT[c.rol]} · {fecha(c.creadoEn)}{c.editadoEn ? " · editado" : ""}</span>
              </div>
              {editando?.id === c.id ? (
                <div className={s.form}>
                  <textarea className="input" rows={3} maxLength={MAX} value={editando.texto} aria-label="Editar comentario"
                    onChange={(e) => setEditando({ id: c.id, texto: e.target.value })} />
                  <div className={s.acts}>
                    <span className={s.contador}>{editando.texto.length} / {MAX}</span>
                    <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setEditando(null)}>Cancelar</button>
                    <button type="button" className="btn btn-dark" disabled={ocupado || !editando.texto.trim()}
                      onClick={() => void enviar({ accion: "editar", comentario: c.id, texto: editando.texto }).then((ok) => ok && setEditando(null))}>Guardar</button>
                  </div>
                </div>
              ) : <p className={s.texto}>{c.texto}</p>}
              {c.tuyo && datos.puedeEscribir && editando?.id !== c.id && (
                borrando === c.id ? (
                  <div className={s.acts}>
                    <span className={s.meta}>¿Borrar este comentario?</span>
                    <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setBorrando(null)}>No</button>
                    <button type="button" className="btn btn-dark" disabled={ocupado} onClick={() => void enviar({ accion: "borrar", comentario: c.id }).then(() => setBorrando(null))}>Sí, borrar</button>
                  </div>
                ) : (
                  <div className={s.acts}>
                    <button type="button" className="btn-link" onClick={() => { setBorrando(null); setEditando({ id: c.id, texto: c.texto }); }}>Editar</button>
                    <button type="button" className="btn-link" onClick={() => { setEditando(null); setBorrando(c.id); }}>Borrar</button>
                  </div>
                )
              )}
            </li>
          ))}
        </ol>
      )}
      {error && <div className="note note-error" role="alert">{error}</div>}
      {datos.puedeEscribir && (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); void enviar({ accion: "crear", texto }).then((ok) => ok && setTexto("")); }}>
          <label className={s.label}><span className="label">Nuevo comentario</span>
            <textarea className="input" rows={3} maxLength={MAX} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej.: llamé a la familia; confirman que presenta el jueves." /></label>
          <div className={s.acts}>
            <span className={s.contador}>{texto.length} / {MAX}</span>
            <button type="submit" className="btn btn-primary" disabled={ocupado || !texto.trim()}>{ocupado ? "Guardando…" : "Agregar comentario"}</button>
          </div>
        </form>
      )}
    </div>
  );
}

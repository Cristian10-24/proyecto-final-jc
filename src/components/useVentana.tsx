"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./useVentana.module.css";

/**
 * Ventanas emergentes del admin: un clic fuera NO cierra (no se pierde lo escrito). Se cierra con la X, "Cancelar" o
 * Esc; si ya se escribió o eligió algo, pregunta "¿Descartar los cambios?" con un diálogo propio (no el confirm del
 * navegador). Mientras haya cambios, cerrar la pestaña o recargar muestra el aviso del navegador (beforeunload). Uso:
 *   const v = useVentana(onCerrar, { activo, bloqueado });
 *   <div className={s.modal} {...v.dialogo}> … <button onClick={v.cerrar}>Cancelar</button> … {v.confirmacion}</div>
 * `v.limpiar()` tras guardar (lo que había ya no es un cambio pendiente).
 */
export function useVentana(onCerrar: () => void, opciones: { activo?: boolean; bloqueado?: boolean } = {}) {
  const { activo = true, bloqueado = false } = opciones;
  const sucio = useRef(false);
  const [hayCambios, setHayCambios] = useState(false); // solo para el aviso al cerrar la pestaña
  const [preguntando, setPreguntando] = useState(false);
  const volverA = useRef<HTMLElement | null>(null);
  const ultimoCampo = useRef<HTMLElement | null>(null);

  const limpiar = useCallback(() => { sucio.current = false; setHayCambios(false); }, []);
  useEffect(() => { if (!activo) { limpiar(); setPreguntando(false); } }, [activo, limpiar]);

  const cerrar = useCallback(() => {
    if (bloqueado) return;
    if (sucio.current) {
      volverA.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPreguntando(true);
      return;
    }
    onCerrar();
  }, [bloqueado, onCerrar]);

  const seguir = useCallback(() => {
    setPreguntando(false);
    // El foco vuelve al formulario: al último campo usado (o, si no hubo, a donde estaba).
    setTimeout(() => (ultimoCampo.current?.isConnected ? ultimoCampo.current : volverA.current)?.focus(), 0);
  }, []);
  const descartar = useCallback(() => { setPreguntando(false); limpiar(); onCerrar(); }, [limpiar, onCerrar]);

  // Esc: con la pregunta abierta = "Seguir editando"; si no, cerrar (que pregunta si hay cambios).
  useEffect(() => {
    if (!activo) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (preguntando) seguir(); else cerrar();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [activo, preguntando, seguir, cerrar]);

  // Aviso del navegador al cerrar la pestaña o recargar, solo mientras haya cambios sin guardar.
  useEffect(() => {
    if (!activo || !hayCambios) return;
    const fn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [activo, hayCambios]);

  const marcar = useCallback(() => {
    if (sucio.current) return;
    sucio.current = true;
    setHayCambios(true);
  }, []);
  // Último campo del formulario con foco: ahí vuelve el foco con "Seguir editando" (no a la X que se tocó para cerrar).
  const recordar = useCallback((e: React.FocusEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) ultimoCampo.current = e.target;
  }, []);

  const confirmacion = preguntando ? <Descartar onSeguir={seguir} onDescartar={descartar} /> : null;
  return { cerrar, limpiar, dialogo: { onInput: marcar, onChange: marcar, onFocus: recordar }, confirmacion };
}

/** "¿Descartar los cambios?": alertdialog con el foco atrapado; "Seguir editando" es el principal y tiene el foco. */
function Descartar({ onSeguir, onDescartar }: { onSeguir: () => void; onDescartar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const principal = useRef<HTMLButtonElement>(null);
  useEffect(() => { principal.current?.focus(); }, []);
  function atrapar(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const botones = [...(caja.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    e.preventDefault();
    botones[(i + (e.shiftKey ? botones.length - 1 : 1)) % botones.length]?.focus();
  }
  return (
    <div className={s.fondo} onMouseDown={(e) => { if (e.target === e.currentTarget) onSeguir(); }}
      onInput={(e) => e.stopPropagation()} onChange={(e) => e.stopPropagation()}>
      <div ref={caja} className={s.caja} role="alertdialog" aria-modal="true" aria-labelledby="descartar-t" aria-describedby="descartar-d" onKeyDown={atrapar}>
        <h2 id="descartar-t" className={s.titulo}>¿Descartar los cambios?</h2>
        <p id="descartar-d" className={s.texto}>Lo que escribiste se perderá.</p>
        <div className={s.botones}>
          <button type="button" className="btn btn-ghost" onClick={onDescartar}>Descartar</button>
          <button ref={principal} type="button" className="btn btn-primary" onClick={onSeguir}>Seguir editando</button>
        </div>
      </div>
    </div>
  );
}

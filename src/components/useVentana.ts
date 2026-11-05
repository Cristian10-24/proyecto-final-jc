"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Ventanas emergentes del admin: un clic fuera NO cierra (no se pierde lo escrito). Se cierra con la X, "Cancelar" o
 * Esc; si ya se escribió o eligió algo, pregunta "¿Descartar los cambios?". Uso:
 *   const v = useVentana(onCerrar, { activo, bloqueado });
 *   <div className={s.modal} {...v.dialogo}> … <button onClick={v.cerrar}>Cancelar</button>
 * `v.limpiar()` tras guardar (lo que había ya no es un cambio pendiente).
 */
export function useVentana(onCerrar: () => void, opciones: { activo?: boolean; bloqueado?: boolean } = {}) {
  const { activo = true, bloqueado = false } = opciones;
  const sucio = useRef(false);
  useEffect(() => { if (!activo) sucio.current = false; }, [activo]);

  const cerrar = useCallback(() => {
    if (bloqueado) return;
    if (sucio.current && !window.confirm("¿Descartar los cambios?")) return;
    sucio.current = false;
    onCerrar();
  }, [bloqueado, onCerrar]);

  useEffect(() => {
    if (!activo) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); cerrar(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [activo, cerrar]);

  const marcar = useCallback(() => { sucio.current = true; }, []);
  const limpiar = useCallback(() => { sucio.current = false; }, []);
  return { cerrar, limpiar, dialogo: { onInput: marcar, onChange: marcar } };
}

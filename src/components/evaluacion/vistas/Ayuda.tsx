"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AYUDAS } from "@/lib/evaluacion/ayudas";
import type { ItemA, TemaB } from "@/lib/evaluacion/criterios";
import type { Ruta } from "@/lib/types";
import { IcoCerrar } from "./Iconos";
import a from "./Ayuda.module.css";

// Ayuda «?» de cada criterio (Parte A) y tema (Parte B). Solo muestra texto: no recibe ni cambia nada del formulario,
// del cronómetro ni del borrador (no tiene acceso a ellos). Una sola abierta a la vez (estado propio, fuera de React).
// Web: ventana flotante junto al botón; móvil (< 900 px): hoja inferior. Cierra con la X, Escape o un clic fuera, y el
// foco vuelve al botón. El refresco de la lista no la cierra (la lista está detenida mientras se evalúa).

let abierta: string | null = null;
const oyentes = new Set<() => void>();
const avisar = () => { for (const o of oyentes) o(); };
/** Abre la ayuda de `clave` y cierra cualquier otra. */
export function abrirAyuda(clave: string) { abierta = clave; avisar(); }
/** Cierra la ayuda abierta (o solo `clave`, si es la abierta). */
export function cerrarAyuda(clave?: string) { if (clave === undefined || abierta === clave) { abierta = null; avisar(); } }
export const ayudaAbierta = () => abierta;
const suscribir = (o: () => void) => { oyentes.add(o); return () => { oyentes.delete(o); }; };

const NOMBRE_RUTA: Record<Ruta, string> = { Básica: "Ruta básica", Avanzada: "Ruta avanzada" };

export function AyudaCriterio({ clave, titulo, ruta }: { clave: ItemA | TemaB; titulo: string; ruta?: Ruta }) {
  const abiertaAhora = useSyncExternalStore(suscribir, ayudaAbierta, ayudaAbierta) === clave;
  const [otra, setOtra] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const ayuda = AYUDAS[clave];

  const cerrar = (volverFoco = true) => {
    cerrarAyuda(clave);
    if (volverFoco) boton.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!abiertaAhora) { setOtra(false); return; }
    panel.current?.focus({ preventScroll: true });
    // Escape: se atiende antes que el Escape de la pantalla (que sería «Volver») y se marca como usado.
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      cerrar();
    };
    const fuera = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (t && (panel.current?.contains(t) || boton.current?.contains(t))) return;
      cerrar(false);
      boton.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", tecla, true);
    document.addEventListener("pointerdown", fuera, true);
    return () => { document.removeEventListener("keydown", tecla, true); document.removeEventListener("pointerdown", fuera, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abiertaAhora]);

  const bloque = (r: Ruta, propia: boolean) => (
    <div className={`${a.bloque} ${propia ? a.propia : ""}`}>
      <p className={a.etiqueta}>{propia ? `Para este proyecto · ${NOMBRE_RUTA[r]}` : NOMBRE_RUTA[r]}</p>
      <p>{r === "Básica" ? ayuda.basica : ayuda.avanzada}</p>
    </div>
  );
  const otraRuta: Ruta | null = ruta ? (ruta === "Básica" ? "Avanzada" : "Básica") : null;

  return (
    <span className={a.envoltura}>
      <button ref={boton} type="button" className={a.boton} aria-label={`Qué se evalúa en «${titulo}»`} aria-expanded={abiertaAhora} aria-controls={abiertaAhora ? id : undefined}
        onClick={() => (abiertaAhora ? cerrar() : abrirAyuda(clave))}>
        <span className={a.circulo} aria-hidden="true">?</span>
      </button>
      {abiertaAhora && (
        <>
          <span className={a.velo} aria-hidden="true" />
          <div ref={panel} id={id} className={a.panel} role="dialog" aria-modal="false" aria-labelledby={`${id}-t`} tabIndex={-1}>
            <div className={a.asa} aria-hidden="true" />
            <div className={a.cabeza}>
              <h3 id={`${id}-t`}>{titulo}</h3>
              <button type="button" className={a.cerrar} aria-label="Cerrar ayuda" onClick={() => cerrar()}><IcoCerrar size={18} /></button>
            </div>
            <div className={a.bloque}>
              <p className={a.etiqueta}>Qué se evalúa principalmente</p>
              <p>{ayuda.principal}</p>
            </div>
            {ruta ? (
              <>
                {bloque(ruta, true)}
                <button type="button" className={a.enlace} aria-expanded={otra} onClick={() => setOtra((x) => !x)}>{otra ? "Ocultar la otra ruta" : "Ver la otra ruta"}</button>
                {otra && otraRuta && bloque(otraRuta, false)}
              </>
            ) : (
              <>{bloque("Básica", false)}{bloque("Avanzada", false)}</>
            )}
          </div>
        </>
      )}
    </span>
  );
}

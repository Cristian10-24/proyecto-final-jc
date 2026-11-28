"use client";

import { useEffect, useRef, useState } from "react";
import s from "./postEvento.module.css";

// Modo post-evento en el navegador. El servidor marca <html data-evento="cerrado"> con EVENTO_CERRADO=1
// (src/app/layout.tsx). Entonces ninguna pantalla se actualiza sola: en vez del refresco automático hay un botón
// «Actualizar» y el texto «Datos al [fecha y hora]». Sin la marca, todo igual que antes.

export const CABECERA_DATOS_AL = "x-datos-al";

export function esEventoCerrado(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.evento === "cerrado";
}

/** true en modo post-evento (se lee al montar, para no chocar con la hidratación). */
export function useEventoCerrado(): boolean {
  const [c, setC] = useState(false);
  useEffect(() => setC(esEventoCerrado()), []);
  return c;
}

/** setInterval(fn, ms) como antes, salvo en modo post-evento (no hay refresco automático). */
export function useRefresco(fn: () => void, ms: number, activo = true) {
  const f = useRef(fn);
  useEffect(() => { f.current = fn; }, [fn]);
  useEffect(() => {
    if (!activo || esEventoCerrado()) return;
    const t = setInterval(() => f.current(), ms);
    return () => clearInterval(t);
  }, [ms, activo]);
}

/** Hora de los datos: la que manda el servidor (puede venir de la caché) o, si no, la de ahora. */
export function horaDatos(res: Response): number {
  const t = Date.parse(res.headers.get(CABECERA_DATOS_AL) ?? "");
  return Number.isNaN(t) ? Date.now() : t;
}

/** «27 nov 2026, 3:45 p. m.» (hora de Colombia). */
export function datosAlTxt(ms: number): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);
}

/** Descarta la caché del servidor y vuelve a cargar. */
export async function actualizar(cargar: () => Promise<unknown> | void) {
  await fetch("/api/actualizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
  await cargar();
}

/** «Datos al …» + «Actualizar». Solo se muestra en modo post-evento. */
export function BarraDatos({ al, cargar, className }: { al: number | null; cargar: () => Promise<unknown> | void; className?: string }) {
  const cerrado = useEventoCerrado();
  const [ocupado, setOcupado] = useState(false);
  if (!cerrado) return null;
  return (
    <p className={`${s.barra} ${className ?? ""}`} data-post-evento="">
      <span>Las presentaciones terminaron: esta pantalla no se actualiza sola.{al ? <> <b>Datos al {datosAlTxt(al)}</b></> : null}</span>
      <button type="button" className={s.boton} disabled={ocupado} onClick={async () => { setOcupado(true); try { await actualizar(cargar); } finally { setOcupado(false); } }}>
        {ocupado ? "Actualizando…" : "Actualizar"}
      </button>
    </p>
  );
}

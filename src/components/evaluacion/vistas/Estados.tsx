"use client";

import { IcoAlerta, IcoVacio } from "./Iconos";
import v from "./Vistas.module.css";

// Fase 6 · Estados comunes de las vistas nuevas: cargando, vacío y error (prototipos: .ev-skel y .ev-vacio).

/** Esqueletos que laten mientras carga; `aria-busy` para lectores de pantalla. */
export function Cargando({ filas = 5, texto = "Cargando…" }: { filas?: number; texto?: string }) {
  return (
    <div className={v.skelLista} aria-busy="true" aria-live="polite">
      <span className={v.sr}>{texto}</span>
      {Array.from({ length: filas }, (_, i) => <i key={i} className={v.skel} style={{ height: i === 0 ? 56 : 72 }} />)}
    </div>
  );
}

type Accion = { texto: string; href?: string; onClick?: () => void };
function BotonAccion({ a }: { a: Accion }) {
  return a.href
    ? <a className={v.btn} href={a.href}>{a.texto}</a>
    : <button type="button" className={v.btn} onClick={a.onClick}>{a.texto}</button>;
}

/** Vacío: «Aún no tienes…», «No hay proyectos con esos filtros», etc. */
export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: Accion }) {
  return (
    <div className={v.vacio}>
      <span className={v.ico} aria-hidden="true"><IcoVacio /></span>
      <h2>{titulo}</h2>
      {texto && <p>{texto}</p>}
      {accion && <BotonAccion a={accion} />}
    </div>
  );
}

/** Error de carga con «Intentar de nuevo» (el texto del prototipo por defecto). */
export function ErrorCarga({ titulo, texto = "Revisa tu conexión e intenta otra vez. Los datos no se perdieron.", onReintentar }: { titulo: string; texto?: string; onReintentar: () => void }) {
  return (
    <div className={`${v.vacio} ${v.vacioErr}`} role="alert">
      <span className={v.ico} aria-hidden="true"><IcoAlerta size={26} /></span>
      <h2>{titulo}</h2>
      <p>{texto}</p>
      <button type="button" className={v.btn} onClick={onReintentar}>Intentar de nuevo</button>
    </div>
  );
}

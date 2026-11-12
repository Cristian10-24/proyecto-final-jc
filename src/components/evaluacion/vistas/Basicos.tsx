"use client";

import { digitosTelefono } from "@/lib/evaluacion/criterios";
import { formatoCelular, iniciales } from "@/lib/vistas/formato";
import { IcoBuscar, IcoFlecha, IcoTelefono, IcoWhatsApp } from "./Iconos";
import v from "./Vistas.module.css";

// Fase 6 · Piezas pequeñas de las vistas nuevas (Mi ciudad y Monitores), según docs/DISENO-VISTAS.md.
// Todo estado se dice con texto (nunca solo con color) y todo control táctil mide al menos 44 px.

export type Tono = "ok" | "bad" | "idle" | "mid" | "info" | "naranja" | "borde" | "sig";

export function Chip({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  return <span className={`${v.chip} ${v[`c_${tono}`]}`}>{children}</span>;
}

/** Estado de evaluación de Mi ciudad: solo el estado, nunca la nota. */
export type EstadoEval = "evaluado" | "pendiente" | "ausente";
export const TEXTO_ESTADO: Record<EstadoEval, string> = { evaluado: "Evaluado", pendiente: "Pendiente", ausente: "No se presentó" };
const TONO_ESTADO: Record<EstadoEval, Tono> = { evaluado: "ok", pendiente: "idle", ausente: "bad" };
export function ChipEstado({ estado, quien }: { estado: EstadoEval; quien?: string }) {
  return <Chip tono={TONO_ESTADO[estado]}>{quien ? `${quien}: ` : ""}{TEXTO_ESTADO[estado]}</Chip>;
}

/** Avatar del monitor con iniciales; `color` 1–7 (coloresMonitores) o "sin" para «Sin monitor». */
export function Avatar({ nombre, color }: { nombre: string; color: number | "sin" }) {
  return <span className={`${v.av} ${color === "sin" ? v.avSin : v[`m${color}`]}`} aria-hidden="true">{color === "sin" ? "!" : iniciales(nombre)}</span>;
}

/** Celular con formato (+57 300 411 8250) o «Sin registrar». */
export function Telefono({ celular }: { celular: string | null | undefined }) {
  const t = formatoCelular(celular);
  return t ? <span className={v.tel}>{t}</span> : <span className={v.sinReg}>Sin registrar</span>;
}

/** Botones de ícono Llamar y WhatsApp (44 px), con el nombre en la etiqueta accesible. Sin celular, nada. */
export function BotonesLlamar({ celular, nombre }: { celular: string | null | undefined; nombre: string }) {
  if (!celular?.trim()) return null;
  const d = digitosTelefono(celular);
  return (
    <span className={v.acc}>
      <a className={v.ibtn} href={`tel:+${d}`} aria-label={`Llamar a ${nombre}`} title="Llamar"><IcoTelefono /></a>
      <a className={`${v.ibtn} ${v.wa}`} href={`https://wa.me/${d}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${nombre}`} title="WhatsApp"><IcoWhatsApp /></a>
    </span>
  );
}

/** Tarjeta de avance: textos a los lados y barra por partes (verde, roja, naranja) sobre gris. */
export function ResumenBarra({ izquierda, derecha, partes, total }: {
  izquierda: React.ReactNode; derecha?: React.ReactNode; partes: { valor: number; tono: "ok" | "bad" | "or" }[]; total: number;
}) {
  return (
    <div className={`${v.tarjeta} ${v.resumen}`}>
      <div className={v.avance}><span>{izquierda}</span>{derecha !== undefined && <span>{derecha}</span>}</div>
      <div className={v.barra} aria-hidden="true">
        {total > 0 && partes.map((p, i) => p.valor > 0 && <i key={i} className={v[`b_${p.tono}`]} style={{ width: `${(p.valor / total) * 100}%` }} />)}
      </div>
    </div>
  );
}

/** Tarjetas que funcionan como filtro (Total · Evaluados · Pendientes · No se presentó). */
export function TarjetasFiltro<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: { id: T; texto: string; n: number }[]; valor: T; onCambio: (id: T) => void; etiqueta: string;
}) {
  return (
    <div className={v.tarjetasF} role="group" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.id} type="button" className={v.tarjetaF} aria-pressed={o.id === valor} onClick={() => onCambio(o.id)}>
          <span>{o.texto}</span><b>{o.n}</b>
        </button>
      ))}
    </div>
  );
}

export type Opcion = { valor: string; texto: string };

/** Select con su etiqueta visible. */
export function Selector({ id, etiqueta, valor, opciones, onCambio }: { id: string; etiqueta: string; valor: string; opciones: Opcion[]; onCambio: (v: string) => void }) {
  return (
    <div className={v.campo}>
      <label className={v.lbl} htmlFor={id}>{etiqueta}</label>
      <select id={id} className={v.control} value={valor} onChange={(e) => onCambio(e.target.value)}>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </div>
  );
}

/** Buscador con lupa; la etiqueta es accesible aunque no se vea. */
export function Buscador({ valor, onCambio, placeholder, etiqueta = placeholder }: { valor: string; onCambio: (v: string) => void; placeholder: string; etiqueta?: string }) {
  return (
    <div className={v.buscar}>
      <IcoBuscar />
      <input type="search" className={v.control} placeholder={placeholder} aria-label={etiqueta} value={valor} maxLength={80} onChange={(e) => onCambio(e.target.value)} />
    </div>
  );
}

/** Control segmentado («Ver como»: Cuadrícula · Por monitor · Por sala). */
export function Segmentado<T extends string>({ etiqueta, opciones, valor, onCambio }: { etiqueta: string; opciones: { id: T; texto: string }[]; valor: T; onCambio: (id: T) => void }) {
  return (
    <div className={v.segFila}>
      <span className={`${v.small} ${v.muted}`}>{etiqueta}</span>
      <div className={v.seg} role="group" aria-label={etiqueta}>
        {opciones.map((o) => <button key={o.id} type="button" aria-pressed={o.id === valor} onClick={() => onCambio(o.id)}>{o.texto}</button>)}
      </div>
    </div>
  );
}

/** Acordeón nativo (details/summary): accesible con teclado sin código extra. `aviso` = fondo amarillo («Sin monitor»). */
export function Acordeon({ titulo, abierto, aviso, children }: { titulo: React.ReactNode; abierto?: boolean; aviso?: boolean; children: React.ReactNode }) {
  return (
    <details className={`${v.acordeon} ${aviso ? v.acordeonAviso : ""}`} open={abierto}>
      <summary>{titulo}<span className={v.rot} aria-hidden="true"><IcoFlecha /></span></summary>
      <div className={v.acordeonBody}>{children}</div>
    </details>
  );
}

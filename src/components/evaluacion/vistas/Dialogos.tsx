"use client";

import { useEffect, useRef, useState } from "react";
import { Buscador, Selector, type Opcion } from "./Basicos";
import { IcoCerrar, IcoFiltros } from "./Iconos";
import v from "./Vistas.module.css";

// Fase 6 · Ventanas de las vistas nuevas: hoja inferior «Filtros» (móvil), panel lateral (detalle de un bloque en
// Monitores) y la barra fija del móvil con buscador y «Filtros». Las ventanas atrapan el foco, cierran con Esc, la X o
// el velo, y devuelven el foco al botón que las abrió.

const ENFOCABLES = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Foco atrapado + Esc + bloqueo del scroll de fondo, mientras la ventana está montada. */
export function useDialogo(ref: React.RefObject<HTMLElement | null>, onCerrar: () => void) {
  const cerrar = useRef(onCerrar);
  useEffect(() => { cerrar.current = onCerrar; }, [onCerrar]);
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>(ENFOCABLES)?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cerrar.current(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>(ENFOCABLES)];
      if (!f.length) return;
      const [primero, ultimo] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = scroll;
      previo?.focus?.();
    };
  }, [ref]);
}

export type CampoFiltro = { id: string; etiqueta: string; opciones: Opcion[] };

/**
 * Hoja inferior «Filtros» (móvil): los cambios quedan en borrador hasta «Aplicar». «Limpiar» vuelve a los valores
 * por defecto y los aplica.
 */
export function HojaFiltros({ campos, valores, porDefecto, onAplicar, onCerrar }: {
  campos: CampoFiltro[]; valores: Record<string, string>; porDefecto: Record<string, string>;
  onAplicar: (v: Record<string, string>) => void; onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [borrador, setBorrador] = useState(valores);
  useDialogo(ref, onCerrar);
  return (
    <>
      <div className={v.velo} onClick={onCerrar} aria-hidden="true" />
      <div ref={ref} className={v.hoja} role="dialog" aria-modal="true" aria-labelledby="hoja-filtros-titulo">
        <div className={v.asa} aria-hidden="true" />
        <div className={v.hojaHead}>
          <h2 id="hoja-filtros-titulo">Filtros</h2>
          <button type="button" className={v.ibtn} aria-label="Cerrar filtros" onClick={onCerrar}><IcoCerrar /></button>
        </div>
        <div className={v.hojaCampos}>
          {campos.map((c) => (
            <Selector key={c.id} id={`hoja-${c.id}`} etiqueta={c.etiqueta} valor={borrador[c.id] ?? ""} opciones={c.opciones}
              onCambio={(x) => setBorrador((b) => ({ ...b, [c.id]: x }))} />
          ))}
        </div>
        <div className={v.hojaAcc}>
          <button type="button" className={v.btn} onClick={() => { onAplicar(porDefecto); onCerrar(); }}>Limpiar</button>
          <button type="button" className={`${v.btn} ${v.btnNegro}`} onClick={() => { onAplicar(borrador); onCerrar(); }}>Aplicar</button>
        </div>
      </div>
    </>
  );
}

/** Barra fija del móvil: buscador y botón «Filtros» (con cuántos filtros hay activos). */
export function BarraMovil({ buscar, onBuscar, placeholder, onFiltros, activos }: {
  buscar: string; onBuscar: (x: string) => void; placeholder: string; onFiltros: () => void; activos: number;
}) {
  return (
    <div className={v.barraMovil}>
      <Buscador valor={buscar} onCambio={onBuscar} placeholder={placeholder} />
      <button type="button" className={v.btn} onClick={onFiltros} aria-haspopup="dialog">
        <IcoFiltros />Filtros{activos > 0 && <span className={v.nFiltros} aria-label={`${activos} activos`}>{activos}</span>}
      </button>
    </div>
  );
}

/** Panel lateral de detalle (Monitores: al tocar un bloque). En el celular ocupa todo el ancho. */
export function PanelLateral({ titulo, subtitulo, onCerrar, children }: { titulo: string; subtitulo?: string; onCerrar: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useDialogo(ref, onCerrar);
  return (
    <>
      <div className={v.velo} onClick={onCerrar} aria-hidden="true" />
      <aside ref={ref} className={v.lado} role="dialog" aria-modal="true" aria-labelledby="panel-lateral-titulo">
        <div className={v.ladoHead}>
          <div>
            {subtitulo && <div className={`${v.small} ${v.muted}`}>{subtitulo}</div>}
            <h2 id="panel-lateral-titulo">{titulo}</h2>
          </div>
          <button type="button" className={v.ibtn} aria-label="Cerrar" onClick={onCerrar}><IcoCerrar /></button>
        </div>
        {children}
      </aside>
    </>
  );
}

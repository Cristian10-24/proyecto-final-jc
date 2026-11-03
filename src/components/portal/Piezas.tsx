"use client";

import { useEffect, useRef, useState } from "react";
import type { Pais } from "@/lib/ciudades";
import { descargarIcs, fechaLarga, hora } from "./formato";
import type { Aviso, Integrante } from "./tipos";
import s from "./Portal.module.css";

/** Título de pantalla: recibe el foco al aparecer para que el lector de pantalla anuncie el cambio. */
export function Titulo({ children, enfocar = true, grande = false }: { children: React.ReactNode; enfocar?: boolean; grande?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (enfocar) ref.current?.focus({ preventScroll: false });
  }, [enfocar]);
  return (
    <h1 ref={ref} tabIndex={-1} className={grande ? s.display : s.h1}>
      {children}
    </h1>
  );
}

export function Kicker({ children, marca = false }: { children: React.ReactNode; marca?: boolean }) {
  return <div className={`kicker ${s.kicker} ${marca ? s.kickerMarca : ""}`}>{children}</div>;
}

function Icono({ tipo }: { tipo: Aviso["tipo"] }) {
  if (tipo === "info")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M12 3 2 20h20L12 3Z" strokeLinejoin="round" /><path d="M12 10v4M12 17v.5" strokeLinecap="round" />
    </svg>
  );
}

export function Nota({ aviso }: { aviso: Aviso }) {
  return (
    <div className={`note note-${aviso.tipo}`}>
      <Icono tipo={aviso.tipo} />
      <div>
        <strong className={s.notaTitulo}>{aviso.titulo}</strong>
        {aviso.texto && <div>{aviso.texto}</div>}
      </div>
    </div>
  );
}

/** Región aria-live siempre presente: los avisos que aparecen dentro se anuncian. */
export function ZonaAviso({ aviso }: { aviso: Aviso | null }) {
  return (
    <div aria-live="assertive" aria-atomic="true" className={aviso ? s.zonaAviso : undefined}>
      {aviso && <Nota aviso={aviso} />}
    </div>
  );
}

export function Skeleton({ filas = 3, alto = 72 }: { filas?: number; alto?: number }) {
  return (
    <div className={s.lista} aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className={s.skeleton} style={{ height: alto }} />
      ))}
    </div>
  );
}

/** Boleto de la hora confirmada (éxito y "ya tienes una hora"). */
export function Boleto({ inicio, pais, proyecto, integrantes }: { inicio: string; pais: Pais; proyecto: string; integrantes: Integrante[] }) {
  return (
    <section className={s.boleto} aria-label="Tu horario">
      <div className={s.boletoArriba}>
        <Kicker>Tu presentación</Kicker>
        <div className={s.boletoDia}>{fechaLarga(new Date(inicio))}</div>
        <div className={s.boletoHora}>{hora(inicio, pais)}</div>
        <div className={s.boletoMeta}>15 minutos · Hora COL</div>
      </div>
      <div className={s.boletoCorte} aria-hidden="true" />
      <div className={s.boletoAbajo}>
        <Kicker>Proyecto</Kicker>
        <div className={s.boletoProyecto}>{proyecto}</div>
        <Kicker>Integrantes</Kicker>
        <ul className={s.nombres}>
          {integrantes.map((i) => (
            <li key={i.documento + i.nombre}>{i.nombre}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function BotonCalendario({ inicio, proyecto }: { inicio: string; proyecto: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-dark"
      onClick={() => {
        descargarIcs(inicio, proyecto);
        setHecho(true);
      }}
    >
      {hecho ? "Agregado a tu calendario" : "Agregar a mi calendario"}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import AppShell from "./AppShell";
import s from "./ResumenPanel.module.css";

// Resumen de coordinación (Paso 6). Diseño: docs/DISENO.md (4 · Coordinación). Días en hora COL.

type Ciudad = { ciudad: string; proyectos: number; conHora: number; asientosLibres: number; dias: string[] };
type Dia = { dia: string; capacidad: number; ocupados: number };
type Resumen = { total: number; conHora: number; ciudades: Ciudad[]; dias: Dia[] };
type Descarga = "listo" | "generando" | "descargado" | "error" | "prohibido";

const ARCHIVO = "cronograma_proyecto_final_2026.xlsx";
const fmtCorto = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", timeZone: "America/Bogota" });
const fmtLargo = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });
const fecha = (dia: string) => new Date(`${dia}T12:00:00-05:00`);
const limpia = (t: string) => t.replace(/[.,]/g, "");
/** 'YYYY-MM-DD' → "jue 12". */
const diaCorto = (dia: string) => limpia(fmtCorto.format(fecha(dia)));
/** 'YYYY-MM-DD' → "Jue 12 nov". */
const diaLargo = (dia: string) => { const t = limpia(fmtLargo.format(fecha(dia))); return t.charAt(0).toUpperCase() + t.slice(1); };

const porcentaje = (n: number, de: number) => (de ? Math.round((n / de) * 100) : 0);
/** ≥85 verde, 65–84 amarillo, <65 rojo. */
const tono = (pct: number) => (pct >= 85 ? s.verde : pct >= 65 ? s.amarillo : s.rojo);

export default function ResumenPanel({ user }: { user: SessionUser }) {
  const [carga, setCarga] = useState<"cargando" | "error" | "prohibido" | "listo">("cargando");
  const [datos, setDatos] = useState<Resumen | null>(null);
  const [descarga, setDescarga] = useState<Descarga>("listo");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const puedeDescargar = puede(user, "descargar_excel");

  const cargar = useCallback(async () => {
    setCarga("cargando");
    try {
      const res = await fetch("/api/coordinacion/resumen", { cache: "no-store" });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (res.status === 403) return setCarga("prohibido");
      const data = (await res.json().catch(() => null)) as Resumen | null;
      if (!res.ok || !data) return setCarga("error");
      setDatos(data);
      setCarga("listo");
    } catch {
      setCarga("error");
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function descargar() {
    if (descarga === "generando") return;
    setDescarga("generando");
    try {
      const res = await fetch("/api/coordinacion/cronograma", { cache: "no-store" });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (res.status === 403) return setDescarga("prohibido");
      if (!res.ok) return setDescarga("error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = ARCHIVO;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDescarga("descargado");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDescarga("listo"), 4000);
    } catch {
      setDescarga("error");
    }
  }

  const pctTotal = datos ? porcentaje(datos.conHora, datos.total) : 0;

  return (
    <AppShell user={user} active="resumen">
      <div className={s.kicker}>Coordinación</div>
      <h1 className={s.title}>Resumen</h1>
      <p className={s.lead}>Avance de todas las ciudades y ocupación de cada día. Horas en hora COL.</p>

      {carga === "cargando" && (
        <div className={s.grid} aria-busy="true" aria-label="Cargando resumen">
          <section className={s.card}><div className={s.skelGrande} /><div className={s.skelFila} /></section>
          <section className={`${s.card} ${s.ancho}`}>{Array.from({ length: 5 }, (_, i) => <div key={i} className={s.skelFila} />)}</section>
        </div>
      )}

      {carga === "prohibido" && (
        <section className={s.card}><div className={s.vacio}><b>No tienes permiso</b><span>Pide acceso a coordinación.</span></div></section>
      )}

      {carga === "error" && (
        <section className={s.card}>
          <div className={s.vacio}>
            <b>No pudimos cargar el resumen</b>
            <span>Revisa tu conexión e intenta otra vez.</span>
            <button type="button" className="btn btn-dark" onClick={() => void cargar()}>Intentar de nuevo</button>
          </div>
        </section>
      )}

      {carga === "listo" && datos && datos.total === 0 && (
        <section className={s.card}>
          <div className={s.vacio}><b>Sin proyectos</b><span>Aún no hay proyectos importados.</span></div>
        </section>
      )}

      {carga === "listo" && datos && datos.total > 0 && (
        <div className={s.grid}>
          <section className={`${s.card} ${s.total}`}>
            <div className={s.kicker}>Avance total</div>
            <div className={`${s.pctGrande} ${tono(pctTotal)}`}>{pctTotal}%</div>
            <div className={s.barra}><div className={`${s.barraFill} ${tono(pctTotal)}`} style={{ width: `${pctTotal}%` }} /></div>
            <p className={s.desc}><b>{datos.conHora} de {datos.total}</b> proyectos con hora</p>
          </section>

          {puedeDescargar && (
            <section className={`${s.card} ${s.excel}`}>
              <h2 className={s.cardTitle}>Cronograma en Excel</h2>
              <p className={s.desc}>Día, hora, mentor, sala, monitor e integrantes. Una hoja por día.</p>
              {descarga === "error" ? (
                <div className={`note note-error ${s.nota}`} role="alert">
                  <b>No pudimos generar el archivo</b>
                  <span>Revisa tu conexión e intenta otra vez. Los datos no se perdieron.</span>
                  <button type="button" className="btn btn-dark" onClick={() => void descargar()}>Intentar de nuevo</button>
                </div>
              ) : descarga === "prohibido" ? (
                <div className={`note note-error ${s.nota}`} role="alert"><b>No tienes permiso</b><span>Tu rol no puede descargar el cronograma.</span></div>
              ) : (
                <button type="button" className={`btn ${descarga === "descargado" ? "btn-green" : "btn-primary"}`} disabled={descarga === "generando"}
                  aria-live="polite" onClick={() => void descargar()}>
                  {descarga === "generando" ? <><span className={s.spin} aria-hidden="true" />Generando Excel…</>
                    : descarga === "descargado" ? "Descargado ✓" : "Descargar cronograma"}
                </button>
              )}
            </section>
          )}

          <section className={`${s.card} ${s.ancho}`}>
            <h2 className={s.cardTitle}>Por ciudad</h2>
            <div className={s.tablaWrap}>
              <table className={s.tabla}>
                <thead>
                  <tr><th>Ciudad</th><th>Avance</th><th className={s.num}>Con hora</th><th className={s.num}>Asientos libres</th><th>Días</th></tr>
                </thead>
                <tbody>
                  {datos.ciudades.map((c) => {
                    const pct = porcentaje(c.conHora, c.proyectos);
                    return (
                      <tr key={c.ciudad}>
                        <td className={s.ciudad}>{c.ciudad}</td>
                        <td>
                          <div className={s.avance}>
                            <div className={s.barra}><div className={`${s.barraFill} ${tono(pct)}`} style={{ width: `${pct}%` }} /></div>
                            <span className={`${s.pct} ${tono(pct)}`}>{pct}%</span>
                          </div>
                        </td>
                        <td className={s.num}>{c.conHora} de {c.proyectos}</td>
                        <td className={s.num}>{c.asientosLibres}</td>
                        <td className={s.dias}>{c.dias.length ? c.dias.map(diaCorto).join(" · ") : <span className={s.sub}>Sin días</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${s.card} ${s.ancho}`}>
            <h2 className={s.cardTitle}>Ocupación por día</h2>
            {datos.dias.length === 0 ? (
              <p className={s.desc}>Aún no hay franjas de mentores cargadas.</p>
            ) : (
              <ul className={s.ocupacion}>
                {datos.dias.map((d) => {
                  const pct = porcentaje(d.ocupados, d.capacidad);
                  return (
                    <li key={d.dia}>
                      <span className={s.diaNombre}>{diaLargo(d.dia)}</span>
                      <div className={s.barra}><div className={`${s.barraFill} ${pct >= 100 ? s.lleno : s.ocupado}`} style={{ width: `${pct}%` }} /></div>
                      <span className={s.ocupados}>{d.ocupados} de {d.capacidad}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className={s.pie}>Capacidad = mentores en la franja × 4 proyectos por hora. Hora COL.</p>
          </section>
        </div>
      )}
    </AppShell>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { CargaMentores, HoraMentor } from "@/lib/cargaMentores";
import { horaCO } from "@/lib/ciudades";
import { puede } from "@/lib/permisos";
import AppShell from "./AppShell";
import h from "./HorariosPanel.module.css";
import s from "./CargaMentoresPanel.module.css";

// Paso 24 · Carga de los mentores (solo lectura). Las propuestas no se aplican aquí: el admin las hace a mano en el
// Tablero.

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const etiquetaDia = (d: string) => { const t = fmtDia.format(new Date(d + "T12:00:00Z")).replace(/,/g, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const hora12 = (x: number) => horaCO(new Date(Date.UTC(2026, 0, 1, x + 5)));

export default function CargaMentoresPanel({ user }: { user: SessionUser }) {
  const [dia, setDia] = useState("");
  const [d, setD] = useState<CargaMentores | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const pedido = useRef("");

  const cargar = useCallback(async () => {
    pedido.current = dia;
    setCarga("cargando");
    try {
      const res = await fetch(`/api/admin/carga-mentores${dia ? `?dia=${dia}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as CargaMentores;
      if (pedido.current !== dia) return;
      setD(data);
      if (!dia && data.dia) setDia(data.dia.dia);
      setCarga("listo");
    } catch { if (pedido.current === dia) setCarga("error"); }
  }, [dia]);
  useEffect(() => { void cargar(); }, [cargar]);

  const c = d?.dia;
  const nPropuestas = c?.resumen.reduce((n, x) => n + x.propuestas.length, 0) ?? 0;

  return (
    <AppShell user={user} active="cargaMentores">
      <div className={h.kicker}>Coordinación</div>
      <h1 className={h.title}>Carga de mentores</h1>
      <p className={h.lead}>Cuántos proyectos tiene cada mentor en cada hora. Solo lectura: las propuestas se aplican a mano en el Tablero.</p>
      <div className={h.acts}>
        {d && d.dias.length > 0 && (
          <select className={`input ${h.select}`} value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Día">
            {d.dias.map((x) => <option key={x} value={x}>{etiquetaDia(x)}</option>)}
          </select>
        )}
        {puede(user.rol, "descargar_excel") && <a className="btn btn-ghost" href="/api/admin/carga-mentores/excel">Descargar Excel (todos los días)</a>}
      </div>

      {carga === "error" && (
        <section className={h.card}><div className={h.vacio}><b>No pudimos cargar la carga de los mentores</b>
          <button type="button" className="btn btn-dark" onClick={() => void cargar()}>Intentar de nuevo</button></div></section>
      )}
      {carga === "cargando" && !c && <section className={h.card}><div className={h.skel}><div className={h.skelFila} /><div className={h.skelFila} /></div></section>}
      {d && !c && carga !== "cargando" && <section className={h.card}><div className={h.vacio}><b>Todavía no hay horarios importados.</b></div></section>}

      {c && (
        <>
          <section className={`${h.card} ${carga === "cargando" ? h.recargando : ""}`}>
            <div className={h.cardHead}><h2 className={h.cardTitle}>Por mentor y hora</h2></div>
            <p className={h.desc}><span className={`${s.celda} ${s.poca}`}>2</span> 1 o 2 proyectos en la hora · <span className={`${s.celda} ${s.suelta}`}>3</span> hora suelta (sin proyectos en la hora de antes ni la de después) · <span className={`${s.celda} ${s.bien}`}>4</span> 3 o más.</p>
            {c.mentores.length === 0 ? <div className={h.vacio}><b>Ningún mentor tiene proyectos este día.</b></div> : (
              <div className={h.tablaWrap}>
                <table className={h.tabla}>
                  <thead><tr><th>Mentor</th>{c.horas.map((x) => <th key={x} className={h.num}>{hora12(x)}</th>)}<th className={h.num}>Total</th></tr></thead>
                  <tbody>
                    {c.mentores.map((m) => (
                      <tr key={m.mentorId}>
                        <td>{m.nombre}</td>
                        {c.horas.map((x) => <td key={x} className={h.num}><Celda v={m.horas.find((y) => y.hora === x)} /></td>)}
                        <td className={h.num}><b>{m.total}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={h.card}>
            <div className={h.cardHead}><h2 className={h.cardTitle}>Propuestas para juntar proyectos</h2><span className={`${h.chip} ${h.chip_neutro}`}><i />{nPropuestas}</span></div>
            <p className={h.desc}>En cada hora, juntar los proyectos en menos mentores (cada uno con al menos 3 si alcanza). Primero otro mentor en el mismo bloque; si no hay cupo, otro bloque de la misma hora. Nunca otro día ni proyectos evaluados. No se aplican solas: muévelos en el <a href={`/admin/tablero?dia=${c.dia}`}>Tablero</a>.</p>
            {nPropuestas === 0 ? <div className={h.vacio}><b>No hay nada que juntar este día.</b></div> : (
              <div className={s.horas}>
                {c.resumen.filter((x) => x.propuestas.length).map((x) => (
                  <div key={x.hora} className={s.hora}>
                    <div className={s.horaT}><b>{hora12(x.hora)}</b> · {x.proyectos} proyectos en {x.mentoresAntes} mentores → {x.mentoresDespues}</div>
                    <ul className={s.lista}>
                      {x.propuestas.map((p) => (
                        <li key={p.proyecto.id}>
                          <b>{p.proyecto.nombre}</b> <span className={h.sub}>{p.proyecto.codigo} · {p.proyecto.ciudad}</span>
                          <div>{p.de.mentor} ({horaCO(new Date(p.de.inicio))}) → <b>{p.a.mentor}</b> ({horaCO(new Date(p.a.inicio))})</div>
                          {(p.cambiaHora || p.otraCiudad) && (
                            <div className={s.marcas}>
                              {p.cambiaHora && <span className={`${h.chip} ${h.chip_amarillo}`}><i />Cambia la hora del estudiante</span>}
                              {p.otraCiudad && <span className={`${h.chip} ${h.chip_neutro}`}><i />Asiento de otra ciudad</span>}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}

function Celda({ v }: { v?: HoraMentor }) {
  if (!v || !v.proyectos) return <span className={h.sub}>{v ? "0" : "—"}</span>;
  const titulo = `${v.proyectos} de ${v.asientos} asientos${v.poca ? " · 1 o 2 proyectos" : ""}${v.suelta ? " · hora suelta" : ""}`;
  return <span className={`${s.celda} ${v.suelta ? s.suelta : v.poca ? s.poca : s.bien}`} title={titulo} aria-label={titulo}>{v.proyectos}</span>;
}

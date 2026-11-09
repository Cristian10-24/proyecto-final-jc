"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { CargaMentores, FilaMentor, HoraMentor, HoraResumen, Indicadores, Motivo, Propuesta } from "@/lib/cargaMentores";
import { horaCO } from "@/lib/ciudades";
import { puede } from "@/lib/permisos";
import AppShell from "./AppShell";
import h from "./HorariosPanel.module.css";
import s from "./CargaMentoresPanel.module.css";

// Paso 24 · Carga de los mentores. La hora del estudiante nunca cambia: cada propuesta solo cambia el mentor (y la
// sala) en el mismo bloque. Se recalcula cada vez que se abre o se aplica algo. «Aplicar» solo para el admin.

const NOTA = "Mismo horario para el estudiante; cambia el mentor y la sala.";
const OBJ: Record<Motivo, string> = { juntar: "Juntar", huecos: "Evitar huecos", equilibrar: "Equilibrar" };
const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const etiquetaDia = (d: string) => { const t = fmtDia.format(new Date(d + "T12:00:00Z")).replace(/,/g, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const hora12 = (x: number) => horaCO(new Date(Date.UTC(2026, 0, 1, x + 5)));
type Confirmar = { titulo: string; lista: Propuesta[] } | null;

export default function CargaMentoresPanel({ user }: { user: SessionUser }) {
  const aplica = puede(user.rol, "cambiar_horario");
  const [dia, setDia] = useState("");
  const [d, setD] = useState<CargaMentores | null>(null);
  const [carga, setCarga] = useState<"cargando" | "error" | "listo">("cargando");
  const [vista, setVista] = useState<"antes" | "despues">("antes");
  const [confirmar, setConfirmar] = useState<Confirmar>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
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

  /** Aplica en orden; se detiene en el primer rechazo. Siempre recalcula al final. */
  async function aplicar(lista: Propuesta[]) {
    setOcupado(true); setAviso(null);
    let hechas = 0;
    try {
      for (const p of lista) {
        const res = await fetch("/api/admin/carga-mentores", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion: "aplicar", proyecto: p.proyecto.id, desde: p.desde, hacia: p.hacia }) });
        if (res.status === 401) return window.location.assign("/login");
        const r = (await res.json().catch(() => null)) as { ok?: boolean; mensaje?: string } | null;
        if (!res.ok || !r?.ok) {
          setAviso({ tipo: "error", texto: `${hechas ? `Se aplicaron ${hechas}. ` : ""}${p.proyecto.nombre}: ${r?.mensaje ?? "No se pudo aplicar."} Las propuestas se recalcularon.` });
          return;
        }
        hechas++;
      }
      setAviso({ tipo: "ok", texto: hechas === 1 ? "Cambio aplicado. Las propuestas se recalcularon." : `${hechas} cambios aplicados. Las propuestas se recalcularon.` });
    } catch {
      setAviso({ tipo: "error", texto: "Sin conexión. Revisa tu internet; las propuestas se recalcularon." });
    } finally {
      setOcupado(false); setConfirmar(null);
      await cargar();
    }
  }

  const c = d?.dia;
  const nPropuestas = c?.resumen.reduce((n, x) => n + x.propuestas.length, 0) ?? 0;
  const filas: FilaMentor[] = c ? (vista === "antes" ? c.antes : c.despues) : [];

  return (
    <AppShell user={user} active="cargaMentores">
      <div className={h.kicker}>Coordinación</div>
      <h1 className={h.title}>Carga de mentores</h1>
      <p className={h.lead}>Cuántos proyectos tiene cada mentor en cada hora y propuestas para repartirlos mejor. La hora del estudiante nunca cambia: solo el mentor y la sala, en el mismo bloque. Se recalcula cada vez que abres esta pantalla.</p>
      <div className={h.acts}>
        {d && d.dias.length > 0 && (
          <select className={`input ${h.select}`} value={dia} onChange={(e) => { setAviso(null); setDia(e.target.value); }} aria-label="Día">
            {d.dias.map((x) => <option key={x} value={x}>{etiquetaDia(x)}</option>)}
          </select>
        )}
        {puede(user.rol, "descargar_excel") && <a className="btn btn-ghost" href="/api/admin/carga-mentores/excel">Descargar Excel (todos los días)</a>}
      </div>
      {aviso && <div className={`note ${aviso.tipo === "ok" ? "note-info" : "note-error"}`} role="status">{aviso.texto}</div>}

      {carga === "error" && (
        <section className={h.card}><div className={h.vacio}><b>No pudimos cargar la carga de los mentores</b>
          <button type="button" className="btn btn-dark" onClick={() => void cargar()}>Intentar de nuevo</button></div></section>
      )}
      {carga === "cargando" && !c && <section className={h.card}><div className={h.skel}><div className={h.skelFila} /><div className={h.skelFila} /></div></section>}
      {d && !c && carga !== "cargando" && <section className={h.card}><div className={h.vacio}><b>Todavía no hay horarios importados.</b></div></section>}

      {c && (
        <>
          <section className={`${h.card} ${carga === "cargando" ? h.recargando : ""}`}>
            <div className={h.cardHead}><h2 className={h.cardTitle}>Antes → después</h2></div>
            <p className={h.desc}>Si se aplicaran todas las propuestas del día.</p>
            <Resumen a={c.indicadores.antes} z={c.indicadores.despues} />
          </section>

          <section className={`${h.card} ${carga === "cargando" ? h.recargando : ""}`}>
            <div className={h.cardHead}>
              <h2 className={h.cardTitle}>Por mentor y hora</h2>
              <div className={h.segmento} role="group" aria-label="Ver">
                {(["antes", "despues"] as const).map((v) => <button key={v} type="button" className={`${h.segBtn} ${vista === v ? h.segOn : ""}`} aria-pressed={vista === v} onClick={() => setVista(v)}>{v === "antes" ? "Hoy" : "Con las propuestas"}</button>)}
              </div>
            </div>
            <p className={h.desc}><span className={`${s.celda} ${s.poca}`}>2</span> 1 o 2 proyectos en la hora · <span className={`${s.celda} ${s.suelta}`}>3</span> hora suelta (sin proyectos en la hora de antes ni la de después) · <span className={`${s.celda} ${s.bien}`}>4</span> 3 o más.</p>
            {filas.length === 0 ? <div className={h.vacio}><b>Ningún mentor tiene proyectos este día.</b></div> : (
              <div className={h.tablaWrap}>
                <table className={h.tabla}>
                  <thead><tr><th>Mentor</th>{c.horas.map((x) => <th key={x} className={h.num}>{hora12(x)}</th>)}<th className={h.num}>Total</th></tr></thead>
                  <tbody>
                    {filas.map((m) => (
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
            <div className={h.cardHead}><h2 className={h.cardTitle}>Propuestas</h2><span className={`${h.chip} ${h.chip_neutro}`}><i />{nPropuestas}</span></div>
            <p className={h.desc}>En orden: juntar (cada mentor con 3 o 4 proyectos por hora), evitar horas sueltas y repartir las horas. Nunca proyectos evaluados. {NOTA} Se aplican hora por hora, en el orden indicado (mejor todas las de la hora juntas): cada vez se recalcula todo.</p>
            {nPropuestas === 0 && !c.resumen.some((x) => x.noSePuede) ? <div className={h.vacio}><b>No hay cambios que proponer este día.</b></div> : (
              <div className={s.horas}>
                {[...c.resumen.filter((x) => x.propuestas.length).sort((a, b) => a.orden! - b.orden!), ...c.resumen.filter((x) => !x.propuestas.length && x.noSePuede)].map((x) => (
                  <Hora key={x.hora} x={x} aplica={aplica && x.orden === 1} ocupado={ocupado}
                    onAplicar={(lista, titulo) => setConfirmar({ titulo, lista })} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {confirmar && (
        <div className={h.overlay}>
          <div className={h.modal} role="dialog" aria-modal="true" aria-labelledby="cm-t">
            <h2 id="cm-t" className={h.modalTitle}>{confirmar.titulo}</h2>
            <p className={h.panelTxt}>{NOTA} Queda en el historial de cada proyecto.</p>
            <ul className={s.lista}>
              {confirmar.lista.map((p) => <li key={p.proyecto.id}><b>{p.proyecto.nombre}</b> · {horaCO(new Date(p.inicio))}<div>{p.de} → <b>{p.a}</b></div></li>)}
            </ul>
            <div className={h.acts}>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={() => setConfirmar(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void aplicar(confirmar.lista)}>{ocupado ? "Aplicando…" : confirmar.lista.length === 1 ? "Sí, aplicar" : `Sí, aplicar ${confirmar.lista.length}`}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Resumen({ a, z }: { a: Indicadores; z: Indicadores }) {
  const filas: [string, number, number][] = [
    ["Mentores activos", a.mentores, z.mentores], ["Horas con 1 o 2 proyectos", a.horasPocas, z.horasPocas], ["Horas sueltas", a.horasSueltas, z.horasSueltas],
    ["Máximo de proyectos por mentor", a.maximo, z.maximo], ["Mínimo de proyectos por mentor", a.minimo, z.minimo],
  ];
  return (
    <div className={h.tablaWrap}>
      <table className={h.tabla}>
        <thead><tr><th>Indicador</th><th className={h.num}>Hoy</th><th className={h.num}>Con las propuestas</th></tr></thead>
        <tbody>{filas.map(([t, x, y]) => <tr key={t}><td>{t}</td><td className={h.num}>{x}</td><td className={h.num}><b>{y}</b></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Hora({ x, aplica, ocupado, onAplicar }: { x: HoraResumen; aplica: boolean; ocupado: boolean; onAplicar: (lista: Propuesta[], titulo: string) => void }) {
  return (
    <div className={s.hora}>
      <div className={s.horaT}>{x.orden ? <span className={`${h.chip} ${x.orden === 1 ? h.chip_verde : h.chip_neutro}`}><i />{x.orden === 1 ? "1.º · siguiente" : `${x.orden}.º`}</span> : null} <b>{hora12(x.hora)}</b> · {x.proyectos} proyectos en {x.mentoresAntes} mentores{x.propuestas.length ? ` → ${x.mentoresDespues}` : ""}</div>
      {x.orden !== null && x.orden > 1 && <div className={h.sub}>Se aplica después de las anteriores.</div>}
      {x.noSePuede && <div className="note note-info">No se puede juntar sin mover la hora.</div>}
      {x.propuestas.length > 0 && (
        <ul className={s.lista}>
          {x.propuestas.map((p) => (
            <li key={p.proyecto.id}>
              <b>{p.proyecto.nombre}</b> <span className={h.sub}>{p.proyecto.codigo} · {p.proyecto.ciudad} · {horaCO(new Date(p.inicio))}</span>
              <div>{p.de} → <b>{p.a}</b></div>
              <div className={h.sub}>{NOTA}</div>
              <div className={s.marcas}>
                <span className={`${h.chip} ${h.chip_neutro}`}><i />{OBJ[p.motivo]}</span>
                {p.otraCiudad && <span className={`${h.chip} ${h.chip_amarillo}`}><i />Asiento de otra ciudad</span>}
                {aplica && <button type="button" className="btn btn-soft" disabled={ocupado} onClick={() => onAplicar([p], `¿Pasar ${p.proyecto.nombre} a ${p.a}?`)}>Aplicar</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {aplica && x.propuestas.length > 1 && (
        <div className={h.acts}><button type="button" className="btn btn-dark" disabled={ocupado} onClick={() => onAplicar(x.propuestas, `¿Aplicar los ${x.propuestas.length} cambios de las ${hora12(x.hora)}?`)}>Aplicar las de esta hora</button></div>
      )}
    </div>
  );
}

function Celda({ v }: { v?: HoraMentor }) {
  if (!v || !v.proyectos) return <span className={h.sub}>{v ? "0" : "—"}</span>;
  const titulo = `${v.proyectos} de ${v.asientos} asientos${v.poca ? " · 1 o 2 proyectos" : ""}${v.suelta ? " · hora suelta" : ""}`;
  return <span className={`${s.celda} ${v.suelta ? s.suelta : v.poca ? s.poca : s.bien}`} title={titulo} aria-label={titulo}>{v.proyectos}</span>;
}

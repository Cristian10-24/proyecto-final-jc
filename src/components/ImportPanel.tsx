"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { PreviaMentores, PreviaProyectos } from "@/lib/importar/aplicar";
import type { ErrorFila } from "@/lib/importar/excel";
import type { PreviaSalas } from "@/lib/planSalas";
import type { ResumenPlanFijo } from "@/lib/salasFijas";
import AppShell from "./AppShell";
import s from "./ImportPanel.module.css";

type Tipo = "proyectos" | "mentores" | "salas";
type Resultado =
  | { tipo: "proyectos"; previa: PreviaProyectos; aplicado: boolean }
  | { tipo: "mentores"; previa: PreviaMentores; aplicado: boolean }
  | { tipo: "salas"; previa: PreviaSalas; aplicado: boolean };
type Estado = { archivo: File | null; cargando: boolean; error: string; resultado: Resultado | null; mapa: Record<string, string>; confirmarEnlaces: boolean };

const TITULO: Record<Tipo, { titulo: string; desc: string }> = {
  proyectos: { titulo: "Proyectos", desc: "Una fila por proyecto con su ciudad e integrantes (individual o en pareja)." },
  mentores: { titulo: "Mentores y disponibilidad", desc: "Hojas Mentores, Horarios y Cupos. Genera los asientos de 15 min por ciudad." },
  salas: { titulo: "Salas y monitores", desc: "Hojas Salas, Monitores y Disponibilidad monitores. Asigna sala a cada mentor y un monitor a cada sala. Con la hoja Plan de salas, fija la sala de cada mentor y solo cambia los días que trae." },
};

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const etiquetaDia = (dia: string) => { const t = fmtDia.format(new Date(dia + "T12:00:00Z")).replace(/[.,]/g, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const vacio: Estado = { archivo: null, cargando: false, error: "", resultado: null, mapa: {}, confirmarEnlaces: false };

export default function ImportPanel({ user }: { user: SessionUser }) {
  const [estados, setEstados] = useState<Record<Tipo, Estado>>({ proyectos: vacio, mentores: vacio, salas: vacio });
  const set = (t: Tipo, e: Partial<Estado>) => setEstados((x) => ({ ...x, [t]: { ...x[t], ...e } }));

  async function enviar(tipo: Tipo, modo: "previa" | "confirmar") {
    const archivo = estados[tipo].archivo;
    if (!archivo) return;
    set(tipo, { cargando: true, error: "" });
    const fd = new FormData();
    fd.set("tipo", tipo);
    fd.set("modo", modo);
    fd.set("archivo", archivo);
    if (tipo === "proyectos" && Object.keys(estados.proyectos.mapa).length) fd.set("mapa", JSON.stringify(estados.proyectos.mapa));
    if (tipo === "salas" && modo === "confirmar" && estados.salas.confirmarEnlaces) fd.set("confirmarEnlaces", "si");
    try {
      const res = await fetch("/api/admin/importar", { method: "POST", body: fd });
      if (res.status === 401) return window.location.assign("/login");
      const d = await res.json().catch(() => null);
      if (!res.ok) return set(tipo, { cargando: false, error: d?.mensaje ?? "No se pudo importar. Inténtalo otra vez." });
      set(tipo, { cargando: false, resultado: d });
    } catch {
      set(tipo, { cargando: false, error: "Sin conexión. Revisa tu internet e inténtalo otra vez." });
    }
  }

  return (
    <AppShell user={user} active="importar">
      <div className={s.kicker}>Administración</div>
      <h1 className={s.title}>Importar</h1>
      <p className={s.lead}>Descarga la plantilla, llénala y súbela. Primero verás una vista previa con los errores por fila; nada se guarda hasta que confirmes.</p>

      <div className={s.grid}>
        {(["proyectos", "mentores", "salas"] as const).map((tipo) => {
          const e = estados[tipo];
          const errores = e.resultado?.previa.errores ?? [];
          return (
            <section key={tipo} className={s.card}>
              <div className={s.cardHead}>
                <h2 className={s.cardTitle}>{TITULO[tipo].titulo}</h2>
                <a className={s.link} href={`/api/admin/plantillas/${tipo}`}>Descargar plantilla</a>
              </div>
              <p className={s.desc}>{TITULO[tipo].desc}</p>

              <label className={s.file}>
                <input type="file" accept=".xlsx" onChange={(ev) => set(tipo, { archivo: ev.target.files?.[0] ?? null, resultado: null, error: "", mapa: {}, confirmarEnlaces: false })} />
                <span className={s.fileMain}>{e.archivo ? e.archivo.name : "Arrastra el archivo o haz clic para elegirlo"}</span>
                <span className={s.fileSub}>{e.archivo ? "Cambiar archivo" : "Excel .xlsx · hasta 4 MB"}</span>
              </label>

              <div className={s.acts}>
                <button type="button" className="btn btn-ghost" disabled={!e.archivo || e.cargando} onClick={() => enviar(tipo, "previa")}>
                  {e.cargando ? "Revisando…" : "Revisar archivo"}
                </button>
                {e.resultado && !e.resultado.aplicado && errores.length === 0 && (
                  <button type="button" className="btn btn-primary"
                    disabled={e.cargando || (e.resultado.tipo === "salas" && !!e.resultado.previa.planFijo?.confirmarEnlaces && !e.confirmarEnlaces)}
                    onClick={() => enviar(tipo, "confirmar")}>
                    {e.resultado.tipo === "proyectos" ? `Importar ${e.resultado.previa.total} proyectos`
                      : e.resultado.tipo === "salas" ? (e.resultado.previa.planFijo ? `Aplicar plan de salas (${e.resultado.previa.planFijo.dias.length} ${e.resultado.previa.planFijo.dias.length === 1 ? "día" : "días"})` : "Importar salas y monitores")
                      : "Importar mentores y cupos"}
                  </button>
                )}
              </div>

              {e.error && <div className="note note-error">{e.error}</div>}
              {e.resultado?.aplicado && <div className={s.ok}>{e.resultado.tipo === "proyectos" ? `${e.resultado.previa.total} proyectos importados. Ya pueden elegir hora cuando abran las inscripciones.` : e.resultado.tipo === "salas" ? <>Plan de salas guardado. Revísalo en <a href="/admin/salas">Salas</a>.</> : "Mentores, cupos y asientos importados."}</div>}
              {e.resultado?.tipo === "proyectos" && e.resultado.previa.faltan.length > 0 && (
                <Mapeo p={e.resultado.previa} mapa={e.mapa} cargando={e.cargando}
                  onCambio={(campo, encabezado) => set(tipo, { mapa: { ...e.mapa, [campo]: encabezado } })}
                  onRevisar={() => enviar(tipo, "previa")} />
              )}
              {e.resultado?.tipo === "proyectos" && e.resultado.previa.faltan.length === 0 && <ResumenProyectos p={e.resultado.previa} />}
              {e.resultado?.tipo === "mentores" && <ResumenMentores p={e.resultado.previa} />}
              {e.resultado?.tipo === "salas" && e.resultado.previa.horasSala > 0 && <ResumenSalas p={e.resultado.previa} />}
              {e.resultado?.tipo === "salas" && e.resultado.previa.planFijo && (
                <ResumenPlanFijoVista p={e.resultado.previa.planFijo} confirmado={e.confirmarEnlaces} aplicado={e.resultado.aplicado}
                  onConfirmar={(v) => set(tipo, { confirmarEnlaces: v })} />
              )}
              {errores.length > 0 && <Filas titulo={`${errores.length} ${errores.length === 1 ? "error" : "errores"}: corrige el archivo y vuelve a subirlo`} filas={errores} tono="error" />}
              {e.resultado && e.resultado.previa.avisos.length > 0 && <Filas titulo="Avisos (no impiden importar)" filas={e.resultado.previa.avisos} tono="warn" />}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

function ResumenProyectos({ p }: { p: PreviaProyectos }) {
  return (
    <div className={s.resumen}>
      <div className={s.stats}>
        <Stat n={p.total} t="proyectos válidos" /><Stat n={p.nuevos} t="nuevos" /><Stat n={p.actualizados} t="se actualizan" />
      </div>
      <table className={s.tabla}>
        <thead><tr><th>Ciudad</th><th className={s.num}>Proyectos</th></tr></thead>
        <tbody>{Object.entries(p.porCiudad).sort(([a], [b]) => a.localeCompare(b, "es")).map(([c, n]) => <tr key={c}><td>{c}</td><td className={s.num}>{n}</td></tr>)}</tbody>
      </table>
      {p.monitores.porAsignar.length > 0 && (
        <div className="note note-warn">
          Monitor por asignar: {p.monitores.porAsignar.map((x) => `${x.ciudad} (${x.proyectos}, ${x.motivo})`).join(" · ")}. Se importan igual y quedan marcados para que les asignes monitor.
        </div>
      )}
      {p.fueraDelArchivo > 0 && <div className="note note-info">{p.fueraDelArchivo} proyectos de la base no están en este archivo: se conservan.</div>}
    </div>
  );
}

/** Campos obligatorios que no se reconocieron: el admin elige la columna de cada uno. */
function Mapeo({ p, mapa, cargando, onCambio, onRevisar }: {
  p: PreviaProyectos; mapa: Record<string, string>; cargando: boolean;
  onCambio: (campo: string, encabezado: string) => void; onRevisar: () => void;
}) {
  const listo = p.faltan.every((f) => mapa[f.campo]);
  return (
    <div className={s.mapeo}>
      <div className={s.filasTitulo}>Elige qué columna corresponde a cada campo</div>
      {p.faltan.map((f) => (
        <label key={f.campo} className={s.mapeoFila}>
          <span>{f.etiqueta}</span>
          <select className="input" value={mapa[f.campo] ?? ""} onChange={(ev) => onCambio(f.campo, ev.target.value)}>
            <option value="">Elegir columna…</option>
            {p.columnas.map((c) => <option key={c.indice} value={c.encabezado}>{c.encabezado}</option>)}
          </select>
        </label>
      ))}
      <button type="button" className="btn btn-dark" disabled={!listo || cargando} onClick={onRevisar}>{cargando ? "Revisando…" : "Revisar con estas columnas"}</button>
    </div>
  );
}

function ResumenMentores({ p }: { p: PreviaMentores }) {
  const total = p.dias.reduce((a, d) => a + d.asientos, 0);
  return (
    <div className={s.resumen}>
      <div className={s.stats}><Stat n={p.mentores} t="mentores" /><Stat n={p.dias.length} t="días" /><Stat n={total} t="asientos" /></div>
      <table className={s.tabla}>
        <thead><tr><th>Día</th><th className={s.num}>Asientos</th><th>Por ciudad</th></tr></thead>
        <tbody>
          {p.dias.map((d) => (
            <tr key={d.dia}>
              <td>{etiquetaDia(d.dia)}</td><td className={s.num}>{d.asientos}</td>
              <td>{Object.entries(d.porCiudad).map(([c, n]) => `${c}: ${n}`).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.reservadosQueSeConservan > 0 && <div className="note note-info">{p.reservadosQueSeConservan} horas ya reservadas se conservan tal cual.</div>}
      <table className={s.tabla}>
        <thead><tr><th>Mentor</th><th className={s.num}>Horas</th></tr></thead>
        <tbody>{p.horasPorMentor.map((m) => <tr key={m.nombre}><td>{m.nombre}</td><td className={s.num}>{m.horas}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function ResumenSalas({ p }: { p: PreviaSalas }) {
  return (
    <div className={s.resumen}>
      <div className={s.stats}><Stat n={p.salas} t="salas" /><Stat n={p.horasSala} t="horas-sala" /><Stat n={p.sinMonitor} t="sin monitor" /></div>
      <p className={s.desc}>Monitores: {p.porOrigen.importado} de la hoja Monitores · {p.porOrigen.automatico} automáticos · {p.porOrigen.admin} cambios manuales que se conservan.</p>
      <table className={s.tabla}>
        <thead><tr><th>Día</th><th className={s.num}>Horas-sala</th><th className={s.num}>Sin monitor</th></tr></thead>
        <tbody>{p.dias.map((d) => <tr key={d.dia}><td>{etiquetaDia(d.dia)}</td><td className={s.num}>{d.horasSala}</td><td className={s.num}>{d.sinMonitor}</td></tr>)}</tbody>
      </table>
      {p.cargaPorMonitor.length > 0 && (
        <table className={s.tabla}>
          <thead><tr><th>Monitor</th><th className={s.num}>Salas</th></tr></thead>
          <tbody>{p.cargaPorMonitor.map((m) => <tr key={m.nombre}><td>{m.nombre}</td><td className={s.num}>{m.salas}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  );
}

const hhmm = (h: number) => `${String(h % 12 || 12).padStart(2, "0")}:00 ${h < 12 ? "a. m." : "p. m."}`;

/** Vista previa de la hoja Plan de salas: qué días cambian, qué no, y cada cambio con su motivo. */
function ResumenPlanFijoVista({ p, confirmado, aplicado, onConfirmar }: { p: ResumenPlanFijo; confirmado: boolean; aplicado: boolean; onConfirmar: (v: boolean) => void }) {
  const tabla = (titulo: string, cab: string[], filas: (string | number)[][], vacio: string) => (
    <details className={s.resumen} open={filas.length > 0 && filas.length <= 30}>
      <summary className={s.filasTitulo}>{titulo} ({filas.length})</summary>
      {filas.length ? (
        <table className={s.tabla}>
          <thead><tr>{cab.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{filas.map((f, i) => <tr key={i}>{f.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
        </table>
      ) : <p className={s.desc}>{vacio}</p>}
    </details>
  );
  return (
    <div className={s.resumen}>
      <div className={s.stats}><Stat n={p.filasFijadas} t="filas fijadas" /><Stat n={p.cambiosSala.length} t="bloques cambian de sala" /><Stat n={p.dias.length} t="días que cambian" /></div>
      <div className="note note-info">Solo cambian: {p.dias.map(etiquetaDia).join(", ")}.</div>
      <div className="note note-info">Días sin cambios: {p.diasSinCambios.length ? p.diasSinCambios.map(etiquetaDia).join(", ") : "ninguno"}.</div>
      {tabla("Bloques que cambian de sala", ["Día", "Hora", "Mentor", "De", "A"], p.cambiosSala.map((c) => [etiquetaDia(c.dia), hhmm(c.hora), c.mentor, c.de === null ? "Nuevo" : `Sala ${c.de}`, `Sala ${c.a}`]), "Ningún bloque cambia de sala.")}
      {tabla("Mentores que cambian de sala entre horas seguidas", ["Día", "Hora", "Mentor", "De", "A"], p.cambiosEntreHoras.map((c) => [etiquetaDia(c.dia), hhmm(c.hora), c.mentor, `Sala ${c.de}`, `Sala ${c.a}`]), "Ningún mentor cambia de sala entre horas seguidas.")}
      {tabla("Salas por monitor", ["Monitor", "Salas", "Bloques"], p.salasPorMonitor.map((m) => [m.nombre, m.salas.map((x) => `Sala ${x}`).join(", ") + (m.salas.length > 1 ? " (varias)" : ""), m.bloques]), "Ningún monitor asignado.")}
      {tabla("Mentores activos sin fila (sala automática)", ["Día", "Hora", "Mentor", "Sala"], p.sinFila.map((x) => [etiquetaDia(x.dia), hhmm(x.hora), x.mentor, `Sala ${x.sala}`]), "Todos los mentores activos traen fila.")}
      {tabla("Cambios manuales de monitor que se descartan", ["Día", "Hora", "Sala", "Mentor", "Monitor"], p.descartados.map((x) => [etiquetaDia(x.dia), hhmm(x.hora), `Sala ${x.sala}`, x.mentor, x.monitor]), "No hay cambios manuales en esos días.")}
      {tabla("Enlaces que cambian", ["Sala", "Antes", "Ahora"], p.enlacesCambian.map((x) => [`Sala ${x.sala}`, x.antes ?? "Sala nueva", x.despues]), "Ningún enlace cambia.")}
      {p.confirmarEnlaces && !aplicado && (
        <label className="note note-warn">
          <input type="checkbox" checked={confirmado} onChange={(ev) => onConfirmar(ev.target.checked)} />{" "}
          Entiendo que cambia el enlace de una sala que ya existía: también cambia para el jueves 12 y el viernes 13 (y sus citaciones quedan desactualizadas).
        </label>
      )}
    </div>
  );
}

const Stat = ({ n, t }: { n: number; t: string }) => <div className={s.stat}><b>{n}</b><span>{t}</span></div>;

function Filas({ titulo, filas, tono }: { titulo: string; filas: ErrorFila[]; tono: "error" | "warn" }) {
  return (
    <div className={`${s.filas} ${tono === "error" ? s.filasError : s.filasWarn}`}>
      <div className={s.filasTitulo}>{titulo}</div>
      <ul>
        {filas.slice(0, 200).map((f, i) => (
          <li key={i}>{f.fila > 0 && <span className={s.fila}>{f.hoja} · fila {f.fila}</span>}{f.mensaje}</li>
        ))}
      </ul>
      {filas.length > 200 && <div>… y {filas.length - 200} más.</div>}
    </div>
  );
}

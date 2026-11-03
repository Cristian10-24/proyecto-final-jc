"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { PreviaMentores, PreviaProyectos } from "@/lib/importar/aplicar";
import type { ErrorFila } from "@/lib/importar/excel";
import AppShell from "./AppShell";
import s from "./ImportPanel.module.css";

type Tipo = "proyectos" | "mentores";
type Resultado =
  | { tipo: "proyectos"; previa: PreviaProyectos; aplicado: boolean }
  | { tipo: "mentores"; previa: PreviaMentores; aplicado: boolean };
type Estado = { archivo: File | null; cargando: boolean; error: string; resultado: Resultado | null };

const TITULO: Record<Tipo, { titulo: string; desc: string }> = {
  proyectos: { titulo: "Proyectos", desc: "Una fila por proyecto con su ciudad e integrantes (individual o en pareja)." },
  mentores: { titulo: "Mentores y disponibilidad", desc: "Hojas Mentores, Horarios y Cupos. Genera los asientos de 15 min por ciudad." },
};

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
const etiquetaDia = (dia: string) => fmtDia.format(new Date(dia + "T12:00:00Z"));
const vacio: Estado = { archivo: null, cargando: false, error: "", resultado: null };

export default function ImportPanel({ user }: { user: SessionUser }) {
  const [estados, setEstados] = useState<Record<Tipo, Estado>>({ proyectos: vacio, mentores: vacio });
  const set = (t: Tipo, e: Partial<Estado>) => setEstados((x) => ({ ...x, [t]: { ...x[t], ...e } }));

  async function enviar(tipo: Tipo, modo: "previa" | "confirmar") {
    const archivo = estados[tipo].archivo;
    if (!archivo) return;
    set(tipo, { cargando: true, error: "" });
    const fd = new FormData();
    fd.set("tipo", tipo);
    fd.set("modo", modo);
    fd.set("archivo", archivo);
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
        {(["proyectos", "mentores"] as const).map((tipo) => {
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
                <input type="file" accept=".xlsx" onChange={(ev) => set(tipo, { archivo: ev.target.files?.[0] ?? null, resultado: null, error: "" })} />
                <span>{e.archivo ? e.archivo.name : "Elegir archivo .xlsx"}</span>
              </label>

              <div className={s.acts}>
                <button type="button" className="btn btn-ghost" disabled={!e.archivo || e.cargando} onClick={() => enviar(tipo, "previa")}>
                  {e.cargando ? "Revisando…" : "Ver vista previa"}
                </button>
                {e.resultado && !e.resultado.aplicado && errores.length === 0 && (
                  <button type="button" className="btn btn-primary" disabled={e.cargando} onClick={() => enviar(tipo, "confirmar")}>Confirmar importación</button>
                )}
              </div>

              {e.error && <div className="note note-error">{e.error}</div>}
              {e.resultado?.aplicado && <div className={s.ok}>Importación guardada.</div>}
              {e.resultado?.tipo === "proyectos" && <ResumenProyectos p={e.resultado.previa} />}
              {e.resultado?.tipo === "mentores" && <ResumenMentores p={e.resultado.previa} />}
              {errores.length > 0 && <Filas titulo={`${errores.length} ${errores.length === 1 ? "error" : "errores"}: corrige el archivo y vuelve a subirlo`} filas={errores} tono="error" />}
              {e.resultado?.tipo === "mentores" && e.resultado.previa.avisos.length > 0 && <Filas titulo="Avisos (no impiden importar)" filas={e.resultado.previa.avisos} tono="warn" />}
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
        <thead><tr><th>Ciudad</th><th>Proyectos</th></tr></thead>
        <tbody>{Object.entries(p.porCiudad).sort(([a], [b]) => a.localeCompare(b, "es")).map(([c, n]) => <tr key={c}><td>{c}</td><td>{n}</td></tr>)}</tbody>
      </table>
      {p.fueraDelArchivo > 0 && <div className="note note-info">{p.fueraDelArchivo} proyectos de la base no están en este archivo: se conservan.</div>}
    </div>
  );
}

function ResumenMentores({ p }: { p: PreviaMentores }) {
  const total = p.dias.reduce((a, d) => a + d.asientos, 0);
  return (
    <div className={s.resumen}>
      <div className={s.stats}><Stat n={p.mentores} t="mentores" /><Stat n={p.dias.length} t="días" /><Stat n={total} t="asientos" /></div>
      <table className={s.tabla}>
        <thead><tr><th>Día</th><th>Asientos</th><th>Por ciudad</th></tr></thead>
        <tbody>
          {p.dias.map((d) => (
            <tr key={d.dia}>
              <td>{etiquetaDia(d.dia)}</td><td>{d.asientos}</td>
              <td>{Object.entries(d.porCiudad).map(([c, n]) => `${c}: ${n}`).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.reservadosQueSeConservan > 0 && <div className="note note-info">{p.reservadosQueSeConservan} horas ya reservadas se conservan tal cual.</div>}
      <table className={s.tabla}>
        <thead><tr><th>Mentor</th><th>Horas</th></tr></thead>
        <tbody>{p.horasPorMentor.map((m) => <tr key={m.nombre}><td>{m.nombre}</td><td>{m.horas}</td></tr>)}</tbody>
      </table>
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

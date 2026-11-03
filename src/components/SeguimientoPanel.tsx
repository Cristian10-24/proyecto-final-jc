"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { CIUDADES, horaCO, horaParaCiudad } from "@/lib/ciudades";
import { textoPendientes } from "@/lib/whatsapp";
import AppShell from "./AppShell";
import s from "./SeguimientoPanel.module.css";

// Seguimiento (Paso 6). Diseño: docs/DISENO.md (2 · Monitor). El monitor solo recibe sus ciudades;
// coordinación y admin, todas. Horas en hora COL (y UY para ciudades de Uruguay).

type Fila = {
  codigo: string; nombre: string; ciudad: string; grupo?: string; monitor: string | null;
  integrantes: { nombre: string; documento: string }[]; hora: string | null;
};
type Filtro = "todos" | "sin_hora" | "eligio";

const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });
/** ISO → "jue 12 nov · 4:15 p. m." (COL; para Uruguay también UY). */
function etiquetaHora(iso: string, ciudad: string): string {
  const d = new Date(iso);
  const dia = fmtDia.format(d).replace(/[.,]/g, "");
  const pais = CIUDADES.find((c) => c.nombre === ciudad)?.pais;
  return `${dia} · ${pais === "UY" ? horaParaCiudad(d, "UY") : horaCO(d)}`;
}
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function SeguimientoPanel({ user }: { user: SessionUser }) {
  const esMonitor = user.rol === "monitor";
  const [carga, setCarga] = useState<"cargando" | "error" | "prohibido" | "listo">("cargando");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [toast, setToast] = useState("");
  const [manual, setManual] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const avisar = useCallback((t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const cargar = useCallback(async () => {
    setCarga("cargando");
    try {
      const res = await fetch("/api/monitor/seguimiento", { cache: "no-store" });
      if (res.status === 401) { window.location.assign("/login"); return; }
      if (res.status === 403) return setCarga("prohibido");
      const data = (await res.json().catch(() => null)) as { proyectos: Fila[] } | null;
      if (!res.ok || !data) return setCarga("error");
      setFilas(data.proyectos);
      setCarga("listo");
    } catch {
      setCarga("error");
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const ciudades = useMemo(() => [...new Set(filas.map((f) => f.ciudad))].sort((a, b) => a.localeCompare(b, "es")), [filas]);
  const titulo = esMonitor ? (user.ciudades.length ? user.ciudades.join(" · ") : "Mis ciudades") : "Todas las ciudades";

  // Ciudad + búsqueda; los conteos de las pills salen de aquí y el filtro de estado se aplica después.
  const base = useMemo(() => {
    const t = normal(q);
    const digitos = q.replace(/\D/g, "");
    const soloDigitos = !!digitos && /^[\d\s.]+$/.test(q.trim());
    return filas.filter((f) => {
      if (ciudad && f.ciudad !== ciudad) return false;
      if (!t) return true;
      if (soloDigitos) return f.integrantes.some((i) => i.documento.replace(/\D/g, "").endsWith(digitos)) || normal(f.codigo).includes(t);
      return normal(f.nombre).includes(t) || normal(f.codigo).includes(t) || f.integrantes.some((i) => normal(i.nombre).includes(t));
    });
  }, [filas, ciudad, q]);

  const conteo = useMemo(() => ({
    todos: base.length,
    sin_hora: base.filter((f) => !f.hora).length,
    eligio: base.filter((f) => f.hora).length,
  }), [base]);

  const visibles = useMemo(() => base.filter((f) => (filtro === "todos" ? true : filtro === "eligio" ? !!f.hora : !f.hora)), [base, filtro]);

  // Avance del alcance (ciudad elegida o todas), sin la búsqueda.
  const alcance = useMemo(() => (ciudad ? filas.filter((f) => f.ciudad === ciudad) : filas), [filas, ciudad]);
  const conHora = alcance.filter((f) => f.hora).length;
  const pct = alcance.length ? Math.round((conHora / alcance.length) * 100) : 0;
  const alDia = alcance.length > 0 && conHora === alcance.length;

  async function copiar(texto: string, ok: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(texto);
      avisar(ok);
      return true;
    } catch {
      return false;
    }
  }

  async function copiarPendientes() {
    const texto = textoPendientes(visibles, window.location.origin + "/");
    if (!texto) return avisar("No hay pendientes.");
    if (!(await copiar(texto, "Copiado. Pégalo en el grupo de WhatsApp."))) setManual(texto);
  }

  async function copiarEnlace() {
    const enlace = window.location.origin + "/";
    if (!(await copiar(enlace, "Enlace copiado"))) setManual(enlace);
  }

  const limpiarBusqueda = () => setQ("");

  return (
    <AppShell user={user} active="seguimiento">
      <div className={s.kicker}>{esMonitor ? "Mi grupo" : "Seguimiento"}</div>
      <h1 className={s.title}>{titulo}</h1>
      <p className={s.lead}>Quién ya eligió la hora de su presentación y quién falta. Horas en hora COL.</p>

      {carga === "cargando" && (
        <section className={s.card} aria-busy="true" aria-label="Cargando proyectos">
          <div className={s.skelBarra} />
          <div className={s.skel}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={s.skelFila} />)}</div>
        </section>
      )}

      {carga === "prohibido" && (
        <section className={s.card}><div className={s.vacio}><b>No tienes permiso</b><span>Pide acceso a coordinación.</span></div></section>
      )}

      {carga === "error" && (
        <section className={s.card}>
          <div className={s.vacio}>
            <b>No pudimos cargar los proyectos</b>
            <span>Revisa tu conexión e intenta otra vez.</span>
            <button type="button" className="btn btn-dark" onClick={() => void cargar()}>Intentar de nuevo</button>
          </div>
        </section>
      )}

      {carga === "listo" && filas.length === 0 && (
        <section className={s.card}>
          <div className={s.vacio}>
            <b>Sin proyectos</b>
            <span>{esMonitor ? "Aún no hay proyectos importados para tus ciudades." : "Aún no hay proyectos importados."}</span>
          </div>
        </section>
      )}

      {carga === "listo" && filas.length > 0 && (
        <section className={s.card}>
          <div className={s.cabeza}>
            <div className={s.avance}>
              <div className={s.avanceTxt}><b>{conHora} de {alcance.length}</b> con hora <span className={s.pct}>{pct}%</span></div>
              <div className={s.barra} role="progressbar" aria-valuemin={0} aria-valuemax={alcance.length} aria-valuenow={conHora} aria-label="Proyectos con hora">
                <div className={s.barraFill} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className={s.acts}>
              <button type="button" className="btn btn-primary" onClick={() => void copiarPendientes()}>Copiar pendientes</button>
              <button type="button" className="btn btn-ghost" onClick={() => void copiarEnlace()}>Copiar enlace de inscripción</button>
            </div>
          </div>

          {alDia && <div className={`note ${s.alDia}`} role="status"><b>¡Tu grupo está al día!</b> Todos los proyectos ya eligieron su hora.</div>}

          <div className={s.filtros}>
            <div className={s.segmento} role="group" aria-label="Estado">
              {([["todos", "Todos"], ["sin_hora", "Sin hora"], ["eligio", "Eligió"]] as const).map(([v, t]) => (
                <button key={v} type="button" className={`${s.segBtn} ${filtro === v ? s.segOn : ""}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
                  {t} <span className={s.cuenta}>{conteo[v]}</span>
                </button>
              ))}
            </div>
            <input className={`input ${s.buscar}`} type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, proyecto o documento" aria-label="Buscar" />
            {ciudades.length > 1 && (
              <select className={`input ${s.select}`} value={ciudad} onChange={(e) => setCiudad(e.target.value)} aria-label="Ciudad">
                <option value="">Todas las ciudades</option>
                {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          {visibles.length === 0 ? (
            q.trim() ? (
              <div className={s.vacio}>
                <b>Sin resultados</b>
                <span>Prueba con otro nombre o con el número de documento.</span>
                <button type="button" className="btn btn-soft" onClick={limpiarBusqueda}>Limpiar búsqueda</button>
              </div>
            ) : filtro === "sin_hora" ? (
              <div className={s.vacio}><b>¡Tu grupo está al día!</b><span>No hay proyectos sin hora.</span></div>
            ) : (
              <div className={s.vacio}><b>Nada por aquí</b><span>Ningún proyecto ha elegido hora todavía.</span></div>
            )
          ) : (
            <div className={s.lista} role="table" aria-label="Proyectos">
              <div className={s.encabezado} role="row">
                <span role="columnheader">Integrantes</span><span role="columnheader">Proyecto</span>
                <span role="columnheader">Ciudad</span><span role="columnheader">Estado</span>
              </div>
              {visibles.map((f) => (
                <div key={f.codigo} className={s.fila} role="row">
                  <div role="cell" className={s.integrantes}>
                    {f.integrantes.map((i, k) => (
                      <div key={k}><div className={s.iNombre}>{i.nombre}</div><div className={s.doc}>{i.documento}</div></div>
                    ))}
                  </div>
                  <div role="cell" className={s.proyecto}>
                    <div className={s.pNombre}>{f.nombre}</div>
                    <div className={s.codigo}>{f.codigo}{f.grupo ? ` · ${f.grupo}` : ""}</div>
                  </div>
                  <div role="cell" className={s.ciudad}>{f.ciudad}</div>
                  <div role="cell" className={s.estado}>
                    {f.hora ? (
                      <>
                        <span className={`${s.chip} ${s.chip_verde}`}><i />Eligió</span>
                        <span className={s.hora}>{etiquetaHora(f.hora, f.ciudad)}</span>
                      </>
                    ) : (
                      <span className={`${s.chip} ${s.chip_amarillo}`}><i />Sin hora</span>
                    )}
                    {!esMonitor && f.monitor === null && <span className={`${s.chip} ${s.chip_neutro}`}><i />Monitor por asignar</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {manual !== null && (
        <div className={s.overlay} role="presentation" onClick={() => setManual(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="copiar-manual" onClick={(e) => e.stopPropagation()}>
            <div className={s.asa} />
            <div className={s.modalHead}>
              <div>
                <div className={s.kicker}>Copiar a mano</div>
                <h2 id="copiar-manual" className={s.modalTitle}>No pudimos copiar automáticamente</h2>
              </div>
              <button type="button" className={s.cerrar} onClick={() => setManual(null)} aria-label="Cerrar">✕</button>
            </div>
            <p className={s.desc}>Selecciona el texto y cópialo para pegarlo en el grupo de WhatsApp.</p>
            <textarea className={s.texto} readOnly value={manual} rows={Math.min(14, manual.split("\n").length + 1)} onFocus={(e) => e.currentTarget.select()} autoFocus />
            <button type="button" className="btn btn-dark" onClick={() => setManual(null)}>Listo</button>
          </div>
        </div>
      )}

      {toast && <div className={s.toast} role="status" aria-live="polite">{toast}</div>}
    </AppShell>
  );
}

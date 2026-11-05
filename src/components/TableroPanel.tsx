"use client";

import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { horaCO } from "@/lib/ciudades";
import { puede } from "@/lib/permisos";
import type { BloqueTablero, DatosTablero, Tarjeta } from "@/lib/tableroHorarios";
import AppShell from "./AppShell";
import GestionProyecto from "./GestionProyecto";
import { useVentana } from "./useVentana";
import s from "./TableroPanel.module.css";

// Tablero de horarios (Paso 16), como el del prototipo del admin: columnas por hora con sus 4 bloques de 15 min,
// columna "Sin hora" y tarjetas que se arrastran (mouse, táctil y teclado, con @dnd-kit/core). Mover y liberar usan
// las mismas acciones de Horarios (POST /api/admin/proyectos/[id]) y su transacción; aquí solo se advierte y confirma.
// Coordinación ve el tablero en solo lectura. En el celular, lista por hora (sin arrastre).

const COLOR: Record<string, string> = {
  Cali: "#F25C2A", Cartagena: "#3E8FD0", Barranquilla: "#1F9D6B", "Santa Marta": "#F2B630", "Bogotá D.C.": "#8E5BD0", Medellín: "#E2407A",
  Guayaquil: "#0E9AA7", Quito: "#B5651D", Colonia: "#5B7FD0", Paysandú: "#7A9E2B", Panamá: "#C04A8E",
};
const colorDe = (ciudad: string) => COLOR[ciudad] ?? "#615C6E";
const ESTADO = { presente: "Se presentó", ausente: "No se presentó", pendiente: "Pendiente" } as const;
const SIN_HORA = "sin-hora";
// Lo que oye el lector de pantalla mientras se arrastra (dnd-kit lo dice en inglés por defecto).
const nombreTarjeta = (a: { data: { current?: unknown } }) => (a.data.current as { t?: Tarjeta } | undefined)?.t?.proyecto ?? "la tarjeta";
const destino = (o: { id: string | number } | null) => (!o ? "fuera del tablero" : o.id === SIN_HORA ? "Sin hora" : `el bloque de las ${horaCO(new Date(String(o.id)))}`);
const ANUNCIOS = {
  onDragStart: ({ active }: { active: { data: { current?: unknown } } }) => `Tomaste ${nombreTarjeta(active)}.`,
  onDragOver: ({ active, over }: { active: { data: { current?: unknown } }; over: { id: string | number } | null }) => `${nombreTarjeta(active)} está sobre ${destino(over)}.`,
  onDragEnd: ({ active, over }: { active: { data: { current?: unknown } }; over: { id: string | number } | null }) => (over ? `Soltaste ${nombreTarjeta(active)} en ${destino(over)}.` : `Soltaste ${nombreTarjeta(active)} fuera del tablero: no se movió.`),
  onDragCancel: ({ active }: { active: { data: { current?: unknown } } }) => `Cancelado: ${nombreTarjeta(active)} no se movió.`,
};
const fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", timeZone: "UTC" });
const fmtLargo = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const etiquetaDia = (d: string) => cap(fmtLargo.format(new Date(d + "T12:00:00Z")).replace(",", ""));

type Confirmar = { titulo: string; avisos: string[]; si: string; ok: () => void } | null;
type Cambio = { accion: string; anterior?: string; nuevo?: string; motivo?: string; actor: { rol: string; usuario?: string }; fecha: string };

async function post(id: string, body: unknown): Promise<{ ok: boolean; status: number; data: { ok?: boolean; error?: string; mensaje?: string } | null }> {
  const res = await fetch(`/api/admin/proyectos/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 401) window.location.assign("/login");
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

export default function TableroPanel({ user }: { user: SessionUser }) {
  const mueve = puede(user.rol, "cambiar_horario");
  const [d, setD] = useState<DatosTablero | null>(null);
  const [error, setError] = useState(false);
  const [dia, setDia] = useState("");
  const [fCiudad, setFCiudad] = useState("");
  const [fRuta, setFRuta] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fSinHora, setFSinHora] = useState("");
  const [arrastrando, setArrastrando] = useState<Tarjeta | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmar>(null);
  const [alerta, setAlerta] = useState("");
  const [toast, setToast] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<Tarjeta | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Respuestas desordenadas: solo vale la del último día pedido.
  const pedido = useRef("");
  const cargar = useCallback(async () => {
    pedido.current = dia;
    try {
      const res = await fetch(`/api/admin/tablero${dia ? `?dia=${dia}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as DatosTablero;
      if (pedido.current !== dia) return;
      setD(data);
      setError(false);
      if (!dia && data.dia) setDia(data.dia);
    } catch { setError(true); }
  }, [dia]);
  useEffect(() => { void cargar(); }, [cargar]);
  // Refresco periódico, salvo mientras se arrastra o hay un diálogo abierto (no mueve nada bajo el cursor).
  const quieto = !arrastrando && !confirmar && !abierta && !ocupado;
  useEffect(() => {
    if (!quieto) return;
    const t = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(t);
  }, [cargar, quieto]);

  const avisar = (t: string) => { setToast(t); if (toastT.current) clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2800); };

  const pasa = useCallback((t: Tarjeta) => (!fCiudad || t.ciudad === fCiudad) && (!fRuta || t.ruta === fRuta) && (!fEstado || (fEstado === "evaluado" ? t.evaluado : t.estado === fEstado)), [fCiudad, fRuta, fEstado]);
  const ciudades = useMemo(() => Object.keys(d?.diasPorCiudad ?? {}).sort((a, b) => a.localeCompare(b, "es")), [d]);
  const sinHora = useMemo(() => (d?.sinHora ?? []).filter((t) => (!fSinHora || t.ciudad === fSinHora) && pasa(t)), [d, fSinHora, pasa]);
  const ocupacion = useMemo(() => (d?.horas ?? []).flatMap((h) => h.bloques).reduce((a, b) => ({ o: a.o + b.ocupados, t: a.t + b.total }), { o: 0, t: 0 }), [d]);

  // ---- acciones (las de Horarios) ----
  async function enviar(t: Tarjeta, body: Record<string, unknown>, hecho: string) {
    setOcupado(t.id);
    const r = await post(t.id, body).catch(() => null);
    setOcupado(null);
    if (r?.ok && r.data?.ok) { avisar(hecho); setAbierta(null); }
    else if (r?.data?.error === "sin_cupo") setAlerta("Ese bloque se llenó mientras arrastrabas (un estudiante tomó el cupo). La tarjeta volvió a su lugar.");
    else setAlerta(r?.data?.mensaje ?? "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.");
    await cargar();
  }

  function liberar(t: Tarjeta) {
    if (t.evaluado) return setAlerta("Ya tiene una evaluación guardada: no se libera.");
    setConfirmar({
      titulo: `¿Liberar la hora de ${t.proyecto}?`, avisos: ["Queda sin hora y el cupo queda libre para otro proyecto. Queda en el historial."], si: "Liberar",
      ok: () => void enviar(t, { accion: "liberar", motivo: "Tablero" }, "Hora liberada"),
    });
  }

  function soltarEnBloque(t: Tarjeta, b: BloqueTablero) {
    if (t.inicio === b.inicio) return;
    if (t.evaluado) return setAlerta("Ya tiene una evaluación guardada: no se mueve.");
    const libres = b.total - b.ocupados;
    const hora = horaCO(new Date(b.inicio));
    if (libres <= 0) return setAlerta(`${hora} ya está lleno (${b.ocupados} de ${b.total}). Elige otro bloque.`);
    const deSuCiudad = b.libres.filter((g) => g.ciudades.includes(t.ciudad)).reduce((a, g) => a + g.n, 0);
    const avisos: string[] = [];
    if (!(d?.diasPorCiudad[t.ciudad] ?? []).includes(d?.dia ?? "")) avisos.push(`${t.ciudad} no presenta este día (no está habilitada o ya pasó su clausura).`);
    if (!deSuCiudad) avisos.push(`A las ${hora} no quedan asientos de ${t.ciudad}: tomará uno de ${b.libres.map((g) => g.ciudades.join(" + ") || "sin ciudad").join(", ")}.`);
    const mover = () => void enviar(t, { accion: "cambiar", inicio: b.inicio, otraCiudad: !deSuCiudad, motivo: "Tablero" }, `Movido a las ${hora}`);
    if (avisos.length) setConfirmar({ titulo: `¿Mover ${t.proyecto} a las ${hora}?`, avisos: [...avisos, "Quedará anotado en el historial."], si: "Mover de todas formas", ok: mover });
    else mover();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const onDragStart = (e: DragStartEvent) => setArrastrando((e.active.data.current as { t: Tarjeta }).t);
  function onDragEnd(e: DragEndEvent) {
    setArrastrando(null);
    const t = (e.active.data.current as { t: Tarjeta } | undefined)?.t;
    if (!t || !e.over) return;
    if (e.over.id === SIN_HORA) { if (t.inicio) liberar(t); return; }
    const b = (e.over.data.current as { b: BloqueTablero } | undefined)?.b;
    if (b) soltarEnBloque(t, b);
  }

  return (
    <AppShell user={user} active="tablero">
      <div className={s.head}>
        <div>
          <div className={s.kicker}>Tablero · hora COL</div>
          <h1 className={s.title}>{d?.dia ? etiquetaDia(d.dia) : "Tablero"}{d?.dia && <span className={s.ocupacion}> · {ocupacion.o} de {ocupacion.t} cupos ocupados</span>}</h1>
        </div>
        <div className={s.dias} role="group" aria-label="Día">
          {(d?.dias ?? []).map((x) => {
            const [sem, num] = fmtDia.format(new Date(x + "T12:00:00Z")).replace(".", "").split(" ");
            return <button key={x} type="button" className={`${s.dia} ${x === d?.dia ? s.diaOn : ""}`} aria-pressed={x === d?.dia} onClick={() => setDia(x)}><span>{sem}</span><b>{num}</b></button>;
          })}
        </div>
      </div>

      <div className={s.barra}>
        <select className={`input ${s.sel}`} aria-label="Ciudad" value={fCiudad} onChange={(e) => setFCiudad(e.target.value)}>
          <option value="">Todas las ciudades</option>{ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={`input ${s.sel}`} aria-label="Ruta" value={fRuta} onChange={(e) => setFRuta(e.target.value)}>
          <option value="">Todas las rutas</option><option value="Básica">Básica</option><option value="Avanzada">Avanzada</option>
        </select>
        <select className={`input ${s.sel}`} aria-label="Estado" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="">Todos los estados</option><option value="pendiente">Pendiente</option><option value="presente">Se presentó</option><option value="ausente">No se presentó</option><option value="evaluado">Evaluado</option>
        </select>
        {d && d.ciudadesDia.length > 0 && (
          <div className={s.habilitadas}>Ciudades habilitadas:{d.ciudadesDia.map((c) => <span key={c.ciudad} className={s.ciudadChip}><i style={{ background: colorDe(c.ciudad) }} />{c.ciudad}</span>)}</div>
        )}
        {!mueve && <span className={s.soloLectura}>Solo lectura</span>}
      </div>

      {error && !d && <div className="note note-error">No pudimos cargar el tablero. <button type="button" className="btn-link" onClick={() => void cargar()}>Intentar de nuevo</button></div>}
      {!d && !error && <div className={s.skel} aria-busy="true" />}

      {d && (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setArrastrando(null)}
          accessibility={{ screenReaderInstructions: { draggable: "Para mover la tarjeta, presiona espacio o Enter, usa las flechas y vuelve a presionar espacio o Enter para soltar. Escape cancela. La letra O abre la ficha." }, announcements: ANUNCIOS }}>
          <div className={s.tablero}>
            <ColumnaSinHora tarjetas={sinHora} total={d.sinHora.length} ciudades={ciudades} filtro={fSinHora} setFiltro={setFSinHora} mueve={mueve} ocupado={ocupado} onAbrir={setAbierta} onNuevo={() => setNuevo(true)} />
            <div className={s.horas}>
              {!d.horas.length && <div className={s.vacio}>Este día no tiene horas con mentores.</div>}
              {d.horas.map((h) => (
                <section key={h.hora} className={s.hora} aria-label={`${horaCO(new Date(h.bloques[0]!.inicio))}`}>
                  <div className={s.horaHead}><b>{horaCO(new Date(h.bloques[0]!.inicio))}</b><span>{h.mentores} {h.mentores === 1 ? "mentor" : "mentores"}</span></div>
                  <div className={s.bloques}>
                    {h.bloques.map((b) => <Bloque key={b.inicio} b={b} pasa={pasa} mueve={mueve} ocupado={ocupado} onAbrir={setAbierta} />)}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>{arrastrando ? <TarjetaVista t={arrastrando} flotando /> : null}</DragOverlay>
        </DndContext>
      )}

      {/* Celular: lista por hora, sin arrastre (las acciones están en la ficha). */}
      {d && (
        <div className={s.lista}>
          {d.horas.flatMap((h) => h.bloques).filter((b) => b.tarjetas.some(pasa)).map((b) => (
            <div key={b.inicio}>
              <div className={s.listaHora}><b>{horaCO(new Date(b.inicio))}</b><span>{b.ocupados}/{b.total}</span></div>
              {b.tarjetas.filter(pasa).map((t) => <TarjetaVista key={t.id} t={t} onClick={() => setAbierta(t)} />)}
            </div>
          ))}
          {sinHora.length > 0 && <div className={s.listaHora}><b>Sin hora</b><span>{sinHora.length}</span></div>}
          {sinHora.map((t) => <TarjetaVista key={t.id} t={t} onClick={() => setAbierta(t)} />)}
        </div>
      )}

      {abierta && d && <Ficha t={abierta} d={d} mueve={mueve} ocupado={!!ocupado} onCerrar={() => setAbierta(null)} onLiberar={() => liberar(abierta)}
        onCambiarMentor={(asiento) => void enviar(abierta, { accion: "cambiar", inicio: abierta.inicio, asiento, otraCiudad: true, motivo: "Tablero: cambio de mentor" }, "Mentor cambiado")}
        onAnular={(motivo) => { const t = abierta; setConfirmar({
          titulo: `¿Anular la evaluación de ${t.proyecto}?`, avisos: ["La evaluación se guarda en el historial (no se borra) y el proyecto vuelve a Pendiente: se puede mover o volver a evaluar.", `Motivo: ${motivo}`], si: "Sí, anular",
          ok: () => void enviar(t, { accion: "anular", motivo, ...(t.evaluadoEn ? { version: t.evaluadoEn } : {}) }, "Evaluación anulada"),
        }); }} />}

      {confirmar && (
        <div className={s.overlay} role="alertdialog" aria-modal="true" aria-labelledby="c-t">
          <div className={s.modal}>
            <div id="c-t" className={s.modalT}>{confirmar.titulo}</div>
            {confirmar.avisos.map((a) => <div key={a} className="note note-warn">{a}</div>)}
            <div className={s.acts}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmar(null)}>Cancelar</button>
              <button type="button" className="btn btn-dark" autoFocus onClick={() => { confirmar.ok(); setConfirmar(null); }}>{confirmar.si}</button>
            </div>
          </div>
        </div>
      )}
      {alerta && (
        <div className={s.alerta} role="alert"><span><b>No se movió.</b> {alerta}</span><button type="button" onClick={() => setAlerta("")}>Entendido</button></div>
      )}
      {nuevo && <GestionProyecto abierto={{ modo: "crear" }} onCerrar={() => setNuevo(false)} onHecho={(msg) => { setNuevo(false); avisar(msg); void cargar(); }} />}
      {toast && <div className={s.toast} role="status">{toast}</div>}
    </AppShell>
  );
}

function ColumnaSinHora({ tarjetas, total, ciudades, filtro, setFiltro, mueve, ocupado, onAbrir, onNuevo }: {
  tarjetas: Tarjeta[]; total: number; ciudades: string[]; filtro: string; setFiltro: (c: string) => void; mueve: boolean; ocupado: string | null; onAbrir: (t: Tarjeta) => void; onNuevo: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: SIN_HORA, disabled: !mueve });
  return (
    <section ref={setNodeRef} className={`${s.sinHora} ${isOver ? s.encima : ""}`} aria-label="Sin hora">
      <div className={s.sinHoraHead}><b>Sin hora</b><span className={s.cuenta}>{total}</span></div>
      {mueve && <button type="button" className={s.nuevoProyecto} onClick={onNuevo}>+ Nuevo proyecto</button>}
      <div className={s.filtroCiudades}>
        <button type="button" className={`${s.fc} ${!filtro ? s.fcOn : ""}`} onClick={() => setFiltro("")}>Todas</button>
        {ciudades.map((c) => <button key={c} type="button" className={`${s.fc} ${filtro === c ? s.fcOn : ""}`} onClick={() => setFiltro(filtro === c ? "" : c)}><i style={{ background: colorDe(c) }} />{c}</button>)}
      </div>
      <div className={s.sinHoraLista}>
        {tarjetas.map((t) => <Arrastrable key={t.id} t={t} mueve={mueve} ocupado={ocupado === t.id} onAbrir={onAbrir} />)}
        {!tarjetas.length && <p className={s.vacioTxt}>{total ? "Nadie con ese filtro." : "Todos los proyectos tienen hora."}</p>}
      </div>
    </section>
  );
}

const Bloque = memo(function Bloque({ b, pasa, mueve, ocupado, onAbrir }: { b: BloqueTablero; pasa: (t: Tarjeta) => boolean; mueve: boolean; ocupado: string | null; onAbrir: (t: Tarjeta) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: b.inicio, data: { b }, disabled: !mueve || !b.total });
  const lleno = b.total > 0 && b.ocupados >= b.total;
  return (
    <div ref={setNodeRef} className={`${s.bloque} ${isOver ? (lleno ? s.encimaLleno : s.encima) : ""} ${!b.total ? s.bloqueOff : ""}`}>
      <div className={s.bloqueHead}>
        <span>{horaCO(new Date(b.inicio))}</span>
        <span className={`${s.capacidad} ${lleno ? s.capLlena : ""}`}>{b.ocupados}/{b.total}</span>
      </div>
      <div className={s.bloqueLista}>
        {b.tarjetas.filter(pasa).map((t) => <Arrastrable key={t.id} t={t} mueve={mueve} ocupado={ocupado === t.id} onAbrir={onAbrir} />)}
      </div>
    </div>
  );
});

const Arrastrable = memo(function Arrastrable({ t, mueve, ocupado, onAbrir }: { t: Tarjeta; mueve: boolean; ocupado: boolean; onAbrir: (t: Tarjeta) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: t.id, data: { t }, disabled: !mueve || t.evaluado || ocupado });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={s.arrastrable} style={{ opacity: isDragging || ocupado ? 0.4 : 1 }}
      aria-label={`${t.proyecto}, ${t.ciudad}${t.inicio ? `, ${horaCO(new Date(t.inicio))}` : ", sin hora"}`}
      onClick={() => onAbrir(t)} onKeyDown={(e) => { listeners?.onKeyDown?.(e); if (e.key === "o" || e.key === "O") onAbrir(t); }}>
      <TarjetaVista t={t} />
    </div>
  );
});

function TarjetaVista({ t, flotando, onClick }: { t: Tarjeta; flotando?: boolean; onClick?: () => void }) {
  const cuerpo = (
    <>
      <i className={s.borde} style={{ background: colorDe(t.ciudad) }} />
      <div className={s.cCiudad}><i style={{ background: colorDe(t.ciudad) }} />{t.ciudad}{t.ruta && <span className={s.cRuta}>{t.ruta}</span>}</div>
      <div className={s.cProyecto}>{t.proyecto}</div>
      <div className={s.cGente}>{t.integrantes.join(" y ")}</div>
      {t.mentor && <div className={s.cMeta}>↳ {t.mentor}{t.sala ? ` · Sala ${t.sala}` : ""}{t.monitor ? ` · ${t.monitor}` : ""}</div>}
      <span className={`${s.estado} ${s[`estado_${t.estado}`]}`}>{t.evaluado ? "Evaluado" : ESTADO[t.estado]}</span>
    </>
  );
  if (onClick) return <button type="button" className={`${s.tarjeta} ${s[`t_${t.estado}`]}`} onClick={onClick}>{cuerpo}</button>;
  return <div className={`${s.tarjeta} ${s[`t_${t.estado}`]} ${flotando ? s.flotando : ""}`}>{cuerpo}</div>;
}

const fmtFecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
const ACCION: Record<string, string> = {
  reservar: "Eligió hora", cambiar_hora: "Cambio de hora", liberar: "Hora liberada", asignar_monitor: "Monitor asignado", evaluar: "Evaluación",
  no_presento: "No se presentó", presente: "Se presentó", nota_monitor: "Nota del monitor", sugerir_cambio: "Cambio sugerido", aprobar_cambio: "Sugerencia aprobada", rechazar_cambio: "Sugerencia rechazada", anular_evaluacion: "Evaluación anulada",
};

function Ficha({ t, d, mueve, ocupado, onCerrar, onLiberar, onCambiarMentor, onAnular }: {
  t: Tarjeta; d: DatosTablero; mueve: boolean; ocupado: boolean; onCerrar: () => void; onLiberar: () => void; onCambiarMentor: (asiento: string) => void; onAnular: (motivo: string) => void;
}) {
  const [motivoAnular, setMotivoAnular] = useState("");
  const [hist, setHist] = useState<Cambio[] | null>(null);
  const [asiento, setAsiento] = useState("");
  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/proyectos/${t.id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { historial: [] })).then((x) => vivo && setHist(x.historial)).catch(() => vivo && setHist([]));
    return () => { vivo = false; };
  }, [t.id]);
  const v = useVentana(onCerrar, { bloqueado: ocupado });
  const bloque = d.horas.flatMap((h) => h.bloques).find((b) => b.inicio === t.inicio);
  const otros = bloque?.asientosLibres ?? [];
  const elegido = otros.find((x) => x.id === asiento);
  return (
    <div className={s.overlay}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="f-t" {...v.dialogo}>
        {v.confirmacion}
        <div className={s.cCiudad}><i style={{ background: colorDe(t.ciudad) }} />{t.ciudad}{t.ruta && <span className={s.cRuta}>Ruta {t.ruta.toLowerCase()}</span>}</div>
        <div id="f-t" className={s.modalT}>{t.proyecto}</div>
        <div className={s.datos}>
          <div><span>Integrantes</span><b>{t.integrantes.join(" y ")}</b></div>
          <div><span>Hora COL</span><b>{t.inicio ? `${etiquetaDia(d.dia)}, ${horaCO(new Date(t.inicio))}` : "Sin hora"}</b></div>
          {t.mentor && <div><span>Mentor</span><b>{t.mentor}{t.sala ? ` · Sala ${t.sala}` : ""}</b></div>}
          {t.inicio && <div><span>Monitor</span><b>{t.monitor ?? "Sin monitor"}</b></div>}
          <div><span>Estado</span><b><span className={`${s.estado} ${s[`estado_${t.estado}`]}`}>{t.evaluado ? "Evaluado" : ESTADO[t.estado]}</span></b></div>
        </div>
        {mueve && t.evaluado && (
          <div className={s.panel}>
            <div className="note note-warn">Ya tiene una evaluación guardada: no se mueve ni se libera. Salida de emergencia: anularla (se guarda en el historial y vuelve a Pendiente).</div>
            <label className={s.campo}>
              <span className="label">Motivo para anular la evaluación</span>
              <input className="input" value={motivoAnular} maxLength={300} onChange={(e) => setMotivoAnular(e.target.value)} placeholder="Ej.: se evaluó al proyecto equivocado" />
            </label>
            <div className={s.acts}><button type="button" className="btn btn-dark" disabled={ocupado || motivoAnular.trim().length < 3} onClick={() => onAnular(motivoAnular.trim())}>Anular evaluación</button></div>
          </div>
        )}
        {mueve && !t.evaluado && t.inicio && (
          <div className={s.panel}>
            <label className={s.campo}>
              <span className="label">Cambiar mentor (mismo bloque)</span>
              <select className={`input ${s.sel}`} value={asiento} onChange={(e) => setAsiento(e.target.value)} disabled={!otros.length}>
                <option value="">{otros.length ? "Elige un mentor con cupo libre" : "No hay otro mentor libre a esta hora"}</option>
                {otros.map((x) => <option key={x.id} value={x.id}>{x.mentor}{x.ciudades.includes(t.ciudad) ? "" : ` · asiento de ${x.ciudades.join(" + ") || "sin ciudad"}`}</option>)}
              </select>
            </label>
            {elegido && !elegido.ciudades.includes(t.ciudad) && <div className="note note-warn">Ese asiento es de {elegido.ciudades.join(" + ") || "ninguna ciudad"}, no de {t.ciudad}. Quedará en el historial.</div>}
            <div className={s.acts}>
              <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={onLiberar}>Liberar hora</button>
              <button type="button" className="btn btn-primary" disabled={ocupado || !asiento} onClick={() => onCambiarMentor(asiento)}>Cambiar mentor</button>
            </div>
          </div>
        )}
        <div className={s.histT}>Historial</div>
        {!hist ? <div className={s.skelFila} /> : !hist.length ? <p className={s.vacioTxt}>Sin cambios registrados.</p> : (
          <ol className={s.hist}>
            {hist.map((h, i) => (
              <li key={i}><b>{ACCION[h.accion] ?? h.accion}</b>{h.anterior ? ` · ${h.anterior}` : ""}{h.nuevo ? ` → ${h.nuevo}` : ""}{h.motivo ? ` · ${h.motivo}` : ""}<span>{fmtFecha.format(new Date(h.fecha))} · {h.actor.usuario ?? h.actor.rol}</span></li>
            ))}
          </ol>
        )}
        <div className={s.acts}><a className="btn btn-ghost" href="/admin/horarios">Abrir en Horarios</a><button type="button" className="btn btn-dark" onClick={v.cerrar}>Cerrar</button></div>
      </div>
    </div>
  );
}

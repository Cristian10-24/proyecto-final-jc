"use client";

import { useEffect, useRef, useState } from "react";
import { horaCO } from "@/lib/ciudades";
import { diaDe, diaLargo, fechaHora, grupoHora, hora, paisDe, partesDia } from "./formato";
import { BotonCalendario, Boleto, Kicker, Nota, Skeleton, Titulo, ZonaAviso } from "./Piezas";
import type { Aviso, Consulta, DiaAgenda, EstadoInicial } from "./tipos";
import s from "./Portal.module.css";

// Portal del estudiante (sin sesión): documento → datos → día → hora → confirmar → boleto.
// Lo que se muestra sale del PLAN: nada de cupos, conteos ni mentores; solo disponible o no.

type Vista =
  | "ingreso"
  | "buscando"
  | "no_encontrado"
  | "datos"
  | "dia"
  | "hora"
  | "confirmar"
  | "exito"
  | "ya_tiene"
  | "sin_horas"
  | "antes"
  | "cerrado";

const PASO: Partial<Record<Vista, number>> = { datos: 1, dia: 2, hora: 3, confirmar: 4 };
const ATRAS: Partial<Record<Vista, Vista>> = { datos: "ingreso", dia: "datos", hora: "dia", confirmar: "hora" };

type Respuesta = { ok: true; data: unknown } | { ok: false; status: number; data: ErrorApi };
type ErrorApi = { error?: string; mensaje?: string; abre?: string; inicio?: string };

async function api(ruta: string, body: Record<string, string>): Promise<Respuesta> {
  try {
    const res = await fetch(`/api/estudiante/${ruta}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as unknown;
    if (res.ok) return { ok: true, data };
    return { ok: false, status: res.status, data: (data ?? {}) as ErrorApi };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

const AVISO_RED: Aviso = { tipo: "error", titulo: "Sin conexión. Revisa tu internet e inténtalo otra vez." };
const AVISO_429: Aviso = { tipo: "error", titulo: "Demasiados intentos. Espera unos minutos e intenta otra vez." };
const AVISO_OCUPADA: Aviso = { tipo: "warn", titulo: "Esa hora se acaba de ocupar, elige otra.", texto: "Alguien la confirmó segundos antes que tú." };
const AVISO_PASADA: Aviso = { tipo: "warn", titulo: "Esa hora ya pasó, elige otra." };
const AVISO_DIA: Aviso = { tipo: "warn", titulo: "Ese día ya no está disponible, elige otro." };

function validarDocumento(v: string): string | null {
  if (!v) return "Escribe tu número de documento";
  if (!/^\d+$/.test(v)) return "Escribe solo números, sin puntos ni espacios";
  if (v.length < 5) return "El número parece incompleto. Revísalo.";
  if (v.length > 15) return "El número es demasiado largo. Revísalo.";
  return null;
}

export default function Portal({ estado }: { estado: EstadoInicial }) {
  const [vista, setVista] = useState<Vista>(estado.estado === "abierto" ? "ingreso" : estado.estado);
  const [abre, setAbre] = useState<string | null>(estado.estado === "antes" ? estado.abre : null);
  const [valor, setValor] = useState("");
  const [errorDoc, setErrorDoc] = useState<string | null>(null);
  const [documento, setDocumento] = useState("");
  const [datos, setDatos] = useState<Consulta | null>(null);
  const [dias, setDias] = useState<DiaAgenda[] | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [bloques, setBloques] = useState<string[] | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [confirmada, setConfirmada] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const turno = useRef(0); // descarta respuestas de cargas que ya no corresponden a la pantalla

  const ir = (v: Vista) => {
    setAviso(null);
    setVista(v);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  /** Errores comunes a las tres rutas. Devuelve true si ya se atendió. */
  function comun(r: Extract<Respuesta, { ok: false }>, volverA?: Vista): boolean {
    const avisar = (a: Aviso) => {
      if (volverA) ir(volverA);
      setAviso(a);
      return true;
    };
    if (r.status === 0) return avisar(AVISO_RED);
    if (r.status === 429) return avisar(AVISO_429);
    if (r.data.error === "aun_no_abre" && r.data.abre) {
      setAbre(r.data.abre);
      ir("antes");
      return true;
    }
    if (r.data.error === "cerrado") {
      ir("cerrado");
      return true;
    }
    if (r.status === 404) {
      ir("no_encontrado");
      return true;
    }
    if (r.status === 400) return avisar({ tipo: "error", titulo: r.data.mensaje ?? "Revisa el número de documento." });
    return false;
  }

  function errorGeneral(volverA?: Vista) {
    if (volverA) ir(volverA);
    setAviso({ tipo: "error", titulo: "Algo salió mal. Inténtalo otra vez." });
  }

  // ---------- Acciones ----------

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const v = valor.trim();
    const err = validarDocumento(v);
    setErrorDoc(err);
    if (err) return;
    setDocumento(v);
    ir("buscando");
    const r = await api("consultar", { documento: v });
    if (!r.ok) {
      if (!comun(r, "ingreso")) errorGeneral("ingreso");
      return;
    }
    const c = r.data as Consulta;
    setDatos(c);
    ir(c.hora ? "ya_tiene" : "datos");
  }

  /** Recarga los datos tras un "ya tiene hora" para saber quién la eligió. */
  async function mostrarYaTiene(doc = documento) {
    const r = await api("consultar", { documento: doc });
    if (!r.ok) {
      if (!comun(r)) errorGeneral();
      return;
    }
    const c = r.data as Consulta;
    setDatos(c);
    ir(c.hora ? "ya_tiene" : "dia");
    if (!c.hora) cargarDias();
  }

  async function cargarDias(avisoTrasCargar?: Aviso) {
    const t = ++turno.current;
    ir("dia");
    if (avisoTrasCargar) setAviso(avisoTrasCargar);
    setDias(null);
    const r = await api("agenda", { documento });
    if (t !== turno.current) return;
    if (!r.ok) {
      if (r.data.error === "ya_tiene_hora") return void mostrarYaTiene();
      if (!comun(r)) errorGeneral();
      return;
    }
    const lista = (r.data as { dias: DiaAgenda[] }).dias;
    setDias(lista);
    if (!lista.some((d) => d.estado === "disponible" || d.estado === "aun_no_abre")) ir("sin_horas");
  }

  async function cargarBloques(d: string) {
    const t = ++turno.current;
    setBloques(null);
    const r = await api("agenda", { documento, dia: d });
    if (t !== turno.current) return;
    if (!r.ok) {
      if (r.data.error === "ya_tiene_hora") return void mostrarYaTiene();
      if (r.data.error === "dia_no_disponible") return void cargarDias(AVISO_DIA);
      if (!comun(r)) errorGeneral();
      return;
    }
    const lista = (r.data as { bloques: string[] }).bloques;
    setBloques(lista);
    if (lista.length === 0) ir("sin_horas");
  }

  function elegirDia(d: string) {
    setDia(d);
    setInicio(null);
    ir("hora");
    cargarBloques(d);
  }

  function elegirHora(iso: string) {
    setInicio(iso);
    ir("confirmar");
  }

  async function confirmar() {
    if (!inicio || ocupado) return;
    setOcupado(true);
    setAviso(null);
    const r = await api("reservar", { documento, inicio });
    setOcupado(false);
    if (r.ok) {
      const ok = r.data as { inicio: string };
      setConfirmada(ok.inicio);
      ir("exito");
      return;
    }
    const err = r.data.error;
    if (err === "sin_cupo" || err === "bloque_pasado") {
      ir("hora");
      setAviso(err === "sin_cupo" ? AVISO_OCUPADA : AVISO_PASADA);
      cargarBloques(dia ?? diaDe(inicio));
      return;
    }
    if (err === "ya_tiene_hora") return void mostrarYaTiene();
    if (err === "dia_no_disponible" || (err === "aun_no_abre" && !r.data.abre)) return void cargarDias(AVISO_DIA);
    if (!comun(r)) errorGeneral();
  }

  function atras() {
    const destino = ATRAS[vista];
    if (!destino) return;
    turno.current++;
    if (destino === "dia") return void cargarDias();
    ir(destino);
  }

  function reiniciar() {
    turno.current++;
    setDatos(null);
    setDias(null);
    setBloques(null);
    setDia(null);
    setInicio(null);
    setConfirmada(null);
    setDocumento("");
    setValor("");
    setErrorDoc(null);
    ir("ingreso");
  }

  // ---------- Render ----------

  const paso = PASO[vista];
  const pais = paisDe(datos?.proyecto.ciudad ?? "");
  const tu = datos?.integrantes.find((i) => i.tu);
  const pareja = datos?.integrantes.find((i) => !i.tu);

  const nav = paso ? { paso, atras } : null;

  return (
    <div className={s.pagina}>
      {/* Formas decorativas del prototipo web (solo en pantalla ancha). */}
      <div className={s.deco} aria-hidden="true"><i className={s.decoAro} /><i className={s.decoPunto} /><i className={s.decoCuadro} /><i className={s.decoCirculo} /></div>
      <header className={s.encabezado}>
        <div className={s.barra}>
          {paso ? (
            <button type="button" className={s.atras} onClick={atras}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Atrás
            </button>
          ) : null}
          {/* En el celular el logo va solo en el ingreso (en los pasos, "Atrás"); en pantalla ancha, siempre. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-jc.png" alt="Jóvenes creaTIvos" width={713} height={634} className={`${s.logo} ${paso ? s.logoSoloWeb : ""}`} />
          {paso && <span className={s.pasoTexto}>Paso {paso} de 4</span>}
          <div className={s.marcaWeb}><span>Fundación ROFÉ</span><i aria-hidden="true" /><span>¿Problemas? Escríbele a tu monitor</span></div>
        </div>
        {paso && (
          <div className={s.progreso} role="progressbar" aria-label="Avance" aria-valuemin={1} aria-valuemax={4} aria-valuenow={paso}>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={n <= paso ? s.segmentoOn : s.segmento} />
            ))}
          </div>
        )}
      </header>

      <main className={s.contenido}>
        {vista === "ingreso" && (
          <Pantalla nav={nav} intro={<>
            <Kicker marca>Proyecto final · 2026</Kicker>
            <Titulo grande enfocar={false}>Elige la hora de tu presentación</Titulo>
            <p className={s.texto}>Presentas tu proyecto ante un mentor durante 15 minutos. Te toma menos de un minuto.</p>
          </>}>
            <form className={s.accionForm} onSubmit={buscar} noValidate>
              <div className={s.campo}>
                <label className="label" htmlFor="documento">Número de documento</label>
                <input
                  id="documento"
                  className={`input ${s.docGrande} ${errorDoc ? "is-error" : ""}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Sin puntos ni espacios"
                  maxLength={30}
                  autoFocus
                  value={valor}
                  aria-invalid={!!errorDoc}
                  aria-describedby={errorDoc ? "documento-error documento-ayuda" : "documento-ayuda"}
                  onChange={(e) => {
                    setValor(e.target.value);
                    if (errorDoc) setErrorDoc(null);
                  }}
                />
                <div id="documento-error" role="alert" className={errorDoc ? "msg-error" : undefined}>{errorDoc}</div>
              </div>
              <button type="submit" className="btn btn-primary">Buscar mi proyecto</button>
              <p id="documento-ayuda" className={s.ayuda}>Sirve el documento de cualquiera de los integrantes.</p>
              <ZonaAviso aviso={aviso} />
            </form>
          </Pantalla>
        )}

        {vista === "buscando" && (
          <Pantalla nav={nav} centro estado intro={<>
            <Kicker>Un momento</Kicker>
            <Titulo>Buscando tu proyecto…</Titulo>
          </>}>
            <div className={`spinner ${s.primero}`} aria-hidden="true" />
          </Pantalla>
        )}

        {vista === "no_encontrado" && (
          <Pantalla nav={nav} intro={<>
            <Titulo>Tu documento no aparece</Titulo>
            <p className={s.texto}>Revisa que el número esté bien escrito. Si sigue sin aparecer, escríbele a tu monitor.</p>
          </>}>
            <div className={s.tarjeta}>
              <Kicker>Número que escribiste</Kicker>
              <div className={s.numero}>{documento}</div>
            </div>
            <button type="button" className="btn btn-primary" onClick={reiniciar}>Intentar con otro número</button>
          </Pantalla>
        )}

        {vista === "datos" && datos && (
          <Pantalla nav={nav} intro={<>
            <Titulo>Hola, {tu?.nombre.split(" ")[0] ?? "estudiante"}</Titulo>
            <p className={s.texto}>Revisa que todo esté bien. Aquí no se puede editar.</p>
          </>}>
            <ZonaAviso aviso={aviso} />
            {datos.integrantes.map((i) => (
              <section key={i.documento + i.nombre} className={s.tarjeta} aria-label={i.tu ? "Tú" : "Tu pareja"}>
                <Kicker marca={i.tu}>{i.tu ? "Tú" : "Tu pareja (no se puede cambiar)"}</Kicker>
                <div className={s.nombre}>{i.nombre}</div>
                <dl className={s.datos}>
                  <dt>Documento</dt><dd>{i.documento}</dd>
                  {i.celular && (<><dt>Celular</dt><dd>{i.celular}</dd></>)}
                  {i.correo && (<><dt>Correo</dt><dd>{i.correo}</dd></>)}
                </dl>
              </section>
            ))}
            {!pareja && <div className={s.chip}>Proyecto individual</div>}
            <section className={`${s.tarjeta} ${s.tarjetaProyecto}`} aria-label="Tu proyecto">
              <i className={s.aro} aria-hidden="true" />
              <Kicker>Tu proyecto</Kicker>
              <div className={s.nombre}>{datos.proyecto.nombre}</div>
              {datos.proyecto.descripcion && <p className={s.descripcion}>{datos.proyecto.descripcion}</p>}
              <div className={s.ciudad}>{datos.proyecto.ciudad}</div>
            </section>
            <button type="button" className="btn btn-primary" onClick={() => cargarDias()}>Mis datos están bien, elegir hora</button>
            <p className={s.ayuda}>¿Algo está mal? Escríbele a tu monitor.</p>
          </Pantalla>
        )}

        {vista === "dia" && datos && (
          <Pantalla nav={nav} intro={<>
            <Titulo>¿Qué día presentas?</Titulo>
            <p className={s.texto}>Estos son los días habilitados para {datos.proyecto.ciudad}.</p>
          </>}>
            <ZonaAviso aviso={aviso} />
            {dias === null ? (
              <Skeleton filas={3} alto={84} />
            ) : (
              <ul className={s.lista}>
                {dias.map((d) => {
                  const p = partesDia(d.dia);
                  const libre = d.estado === "disponible";
                  return (
                    <li key={d.dia}>
                      <button
                        type="button"
                        className={s.opcionDia}
                        disabled={!libre}
                        onClick={() => elegirDia(d.dia)}
                        aria-label={`${diaLargo(d.dia)}${libre ? "" : d.estado === "aun_no_abre" ? ", aún no abre" : ", sin horas"}`}
                      >
                        <span className={s.diaTile} aria-hidden="true"><span>{p.semana.slice(0, 3)}</span><b>{p.numero}</b></span>
                        <span className={s.diaTexto}>
                          <span className={s.diaSemana}>{p.semana}</span>
                          <span className={s.diaMes}>{p.mes}</span>
                        </span>
                        <span className={s.diaEstado}>
                          {libre ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
                              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : d.estado === "aun_no_abre" && d.abre ? (
                            `Abre ${fechaHora(d.abre)}`
                          ) : (
                            "Sin horas"
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Pantalla>
        )}

        {vista === "hora" && dia && (
          <Pantalla nav={nav} intro={<>
            <Titulo>¿A qué hora?</Titulo>
            <p className={s.texto}>
              <span className={s.capital}>{diaLargo(dia)}</span> · Hora COL · 15 minutos
            </p>
          </>}>
            <ZonaAviso aviso={aviso} />
            {bloques === null ? (
              <Skeleton filas={4} alto={56} />
            ) : (
              <Bloques bloques={bloques} pais={pais} onElegir={elegirHora} />
            )}
          </Pantalla>
        )}

        {vista === "confirmar" && datos && inicio && (
          <Pantalla nav={nav} intro={<>
            <Kicker marca>Último paso</Kicker>
            <Titulo>Confirma tu hora</Titulo>
            <p className={s.texto}>Revisa antes de confirmar.</p>
          </>}>
            <ZonaAviso aviso={aviso} />
            <section className={`${s.tarjeta} ${s.tarjetaProyecto}`} aria-label="Tu presentación">
              <i className={s.aro} aria-hidden="true" />
              <Kicker>Tu presentación</Kicker>
              <div className={`${s.nombre} ${s.capital}`}>{diaLargo(dia ?? diaDe(inicio))}</div>
              <div className={s.horaGrande}>{hora(inicio, pais)}</div>
              <div className={s.meta}>15 minutos · Hora COL</div>
            </section>
            <section className={s.tarjeta} aria-label="Integrantes">
              <Kicker>Integrantes</Kicker>
              <ul className={s.nombres}>
                {datos.integrantes.map((i) => <li key={i.documento + i.nombre}>{i.nombre}</li>)}
              </ul>
            </section>
            <button type="button" className="btn btn-primary" onClick={confirmar} disabled={ocupado} aria-busy={ocupado}>
              {ocupado ? (<><span className="spinner-sm" aria-hidden="true" />Reservando tu hora…</>) : "Confirmar mi hora"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => ir("hora")} disabled={ocupado}>Elegir otra hora</button>
            <Nota aviso={{ tipo: "info", titulo: "Si necesitas cambiarla, escríbele a tu monitor." }} />
          </Pantalla>
        )}

        {vista === "exito" && datos && confirmada && (
          <Pantalla nav={nav} intro={<>
            <Kicker marca>Hora confirmada</Kicker>
            <Titulo>¡Listo! Ya tienes tu hora</Titulo>
            <p className={s.texto}>Presentas ante un mentor por 15 minutos. Conéctate 5 minutos antes.</p>
          </>}>
            <Boleto inicio={confirmada} pais={pais} proyecto={datos.proyecto.nombre} integrantes={datos.integrantes} />
            <BotonCalendario inicio={confirmada} proyecto={datos.proyecto.nombre} />
            <Nota aviso={{ tipo: "info", titulo: "Tu monitor te enviará el enlace de la sala por WhatsApp." }} />
            <button type="button" className="btn btn-soft" onClick={reiniciar}>Salir</button>
          </Pantalla>
        )}

        {vista === "ya_tiene" && datos?.hora && (
          <Pantalla nav={nav} intro={<>
            <Kicker marca>Todo en orden</Kicker>
            <Titulo>Ya tienes una hora</Titulo>
            <p className={s.texto}>
              {datos.hora.elegidaPor === "pareja"
                ? pareja
                  ? `Tu compañero/a ${pareja.nombre} ya eligió la hora.`
                  : "Tu compañero/a ya eligió la hora."
                : datos.hora.elegidaPor === "tu"
                  ? "Ya elegiste tu hora antes."
                  : "Coordinación te asignó esta hora."}
            </p>
          </>}>
            <Boleto inicio={datos.hora.inicio} pais={pais} proyecto={datos.proyecto.nombre} integrantes={datos.integrantes} />
            <BotonCalendario inicio={datos.hora.inicio} proyecto={datos.proyecto.nombre} />
            <Nota aviso={{ tipo: "info", titulo: "Tu monitor te enviará el enlace de la sala por WhatsApp.", texto: "Si necesitas cambiarla, escríbele a tu monitor." }} />
            <ZonaAviso aviso={aviso} />
            <button type="button" className="btn btn-soft" onClick={reiniciar}>Salir</button>
          </Pantalla>
        )}

        {vista === "sin_horas" && (
          <Pantalla nav={nav} intro={<>
            <Titulo>Ya no quedan horas en tu día</Titulo>
            <p className={s.texto}>Escríbele a tu monitor para que te ayude.</p>
          </>}>
            <ZonaAviso aviso={aviso} />
            <button type="button" className="btn btn-ghost" onClick={() => cargarDias()}>Volver a revisar los días</button>
            <button type="button" className="btn btn-soft" onClick={reiniciar}>Salir</button>
          </Pantalla>
        )}

        {vista === "antes" && (
          <Pantalla nav={nav} intro={<>
            <Kicker marca>Proyecto final · 2026</Kicker>
            <Titulo enfocar={false}>Todavía no puedes elegir tu hora</Titulo>
            <p className={s.texto}>Las inscripciones abren pronto. Guarda la fecha.</p>
          </>}>
            {abre && <FechaClave iso={abre} titulo="Abrimos el" />}
            <div className="note note-warn">Cuando abra, entra con tu documento. Las horas se asignan por orden de llegada.</div>
          </Pantalla>
        )}

        {vista === "cerrado" && (
          <Pantalla nav={nav} intro={<>
            <Kicker marca>Proyecto final · 2026</Kicker>
            <Titulo enfocar={false}>Las inscripciones ya cerraron</Titulo>
            <p className={s.texto}>Si aún no tienes hora, escríbele a tu monitor.</p>
          </>}>
            <div className={`${s.tarjeta} ${s.soloWeb}`}>
              <Kicker>Inscripciones cerradas</Kicker>
              <div className={s.nombre}>Ya no se pueden elegir horas</div>
              <div className={s.meta}>Tu monitor te ayuda por WhatsApp.</div>
            </div>
          </Pantalla>
        )}
      </main>

      <footer className={s.pie}>¿Problemas? Escríbele a tu monitor</footer>
    </div>
  );
}

/** Recuadro de una fecha clave (apertura o cierre), como el prototipo: día en un cuadro de color y la hora COL. */
function FechaClave({ iso, titulo, cerrada = false }: { iso: string; titulo: string; cerrada?: boolean }) {
  const d = partesDia(diaDe(iso));
  return (
    <div className={s.fechaClave} suppressHydrationWarning>
      <span className={`${s.diaTile} ${cerrada ? s.diaTileCerrado : ""}`} aria-hidden="true"><span>{d.semana.slice(0, 3)}</span><b>{d.numero}</b></span>
      <span>
        <span className={s.fechaClaveT}>{titulo} {d.numero} de {d.mes}</span>
        <span className={s.meta}>{horaCO(new Date(iso))} · Hora COL</span>
      </span>
    </div>
  );
}

/**
 * Una pantalla del portal. En el celular, `intro` y la acción fluyen en una sola columna (como siempre); desde 900 px,
 * dos columnas como el prototipo web: a la izquierda qué hacer (con "Atrás" y el avance) y a la derecha una tarjeta.
 */
function Pantalla({ nav, intro, children, centro = false, estado = false }: {
  nav: { paso: number; atras: () => void } | null; intro: React.ReactNode; children: React.ReactNode; centro?: boolean; estado?: boolean;
}) {
  return (
    <div className={`${s.pantalla} ${centro ? s.centro : ""}`} {...(estado ? { role: "status" } : {})}>
      <div className={s.intro}>
        {nav && (
          <div className={s.navWeb}>
            <button type="button" className={s.atrasWeb} onClick={nav.atras}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Atrás
            </button>
            <div className={s.avanceWeb} aria-hidden="true">
              <span className={s.segmentosWeb}>{[1, 2, 3, 4].map((n) => <i key={n} className={n <= nav.paso ? s.segOnWeb : undefined} />)}</span>
              Paso {nav.paso} de 4
            </div>
          </div>
        )}
        {intro}
      </div>
      <div className={s.accion}>{children}</div>
    </div>
  );
}

/** Bloques libres agrupados por hora de Colombia. */
function Bloques({ bloques, pais, onElegir }: { bloques: string[]; pais: ReturnType<typeof paisDe>; onElegir: (iso: string) => void }) {
  const grupos: { etiqueta: string; items: string[] }[] = [];
  for (const b of bloques) {
    const etiqueta = grupoHora(b);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.etiqueta === etiqueta) ultimo.items.push(b);
    else grupos.push({ etiqueta, items: [b] });
  }
  return (
    <div className={s.grupos}>
      {grupos.map((g) => (
        <section key={g.etiqueta} aria-label={`${g.etiqueta} hora Colombia`}>
          <Kicker>{g.etiqueta} · COL</Kicker>
          <div className={pais === "UY" ? s.bloquesUna : s.bloques}>
            {g.items.map((b) => (
              <button key={b} type="button" className={s.bloque} onClick={() => onElegir(b)}>
                {hora(b, pais)}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

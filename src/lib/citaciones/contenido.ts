import { createHash } from "node:crypto";
import { CIUDADES, horaCO, horaUY } from "../ciudades";
import { horaCOL, MINUTOS_BLOQUE } from "../edicion";

// Fase 5 · Paso 27 · Contenido de las citaciones del calendario (funciones puras, sin base ni Google).
// Tres tipos de evento por día:
//  - participante: uno por proyecto en su bloque de 15 min; invitados = sus integrantes (nadie más).
//  - mentor: uno por franja (bloques con proyecto unidos si hay ≤ 30 min entre ellos); solo el mentor; sin contactos
//    de estudiantes (solo nombres).
//  - monitor: uno por franja de los bloques de SUS salas (planSalas); con nombre, celular y correo de esos integrantes.
// La sala, el enlace y el monitor de cada bloque salen del plan de salas (día, hora, mentor).
// El `resumen` guarda solo lo que decide si una citación quedó desactualizada (hora, sala, enlace, mentor, monitor,
// proyectos e invitados), nunca datos de contacto (de cada invitado, solo una huella de su correo); su huella (sha256)
// se compara con la de lo ya citado. Nombres y textos pasan por `limpio` (una línea, sin control ni < >).

export const TITULO_BASE = "Proyecto Final JC 2026";
export const ZONA = "America/Bogota";
/** Dos bloques con proyecto quedan en la misma franja si entre el fin de uno y el inicio del otro hay ≤ 30 min. */
export const UNIR_MINUTOS = 30;
export const PREFIJO_PRUEBA = "[PRUEBA] ";

export const TEN_EN_CUENTA_DEFECTO = [
  "Entra a la sala 5 minutos antes de tu hora. Tu monitor te admitirá.",
  "Usa un computador con cámara y micrófono funcionando, y una conexión estable.",
  "Ten tu proyecto abierto y listo para mostrar antes de entrar.",
  "Tu presentación dura 15 minutos: organiza qué vas a mostrar y explicar.",
  "Si presentas en pareja, ambos deben estar conectados y participar.",
  "Si tienes algún inconveniente antes de tu hora, escríbele a tu monitor.",
  "Las reprogramaciones no están permitidas; solo se consideran casos de calamidad o fuerza mayor.",
].join("\n");

export const CIERRE_MONITOR = "Las reprogramaciones no están permitidas; casos de calamidad o fuerza mayor se reportan a Astrid o Cristian.";

export type TipoCitacion = "participante" | "mentor" | "monitor";
export const TIPOS_CITACION = ["participante", "mentor", "monitor"] as const satisfies readonly TipoCitacion[];

export type Persona = { nombre: string; correo?: string; celular?: string };
export type IntegranteDia = { nombre: string; correo?: string; celular?: string };
export type ProyectoDia = { id: string; codigo: string; nombre: string; ciudad: string; integrantes: IntegranteDia[] };
/** Un asiento con proyecto del día. */
export type BloqueDia = { inicio: Date; mentorId: string; proyecto: ProyectoDia };
export type SalaPlan = { hora: number; mentorId: string; sala: number; monitor: string | null };

/** Todo lo que hace falta para citar un día (lo arma el servicio desde la base). */
export type DatosDia = {
  dia: string;
  bloques: BloqueDia[];
  plan: SalaPlan[];
  /** Enlace https de cada sala (número → enlace). */
  enlaces: Record<number, string>;
  /** Por id de mentor (Horarios). */
  mentores: Record<string, Persona>;
  /** Por usuario del monitor. */
  monitores: Record<string, Persona>;
};

export type Invitado = { correo: string; nombre: string };
export type Evento = { titulo: string; inicio: Date; fin: Date; ubicacion?: string; descripcion: string; invitados: Invitado[] };

/** Un bloque tal como quedó citado (sin contactos). */
export type BloqueResumen = { inicio: string; sala: number | null; enlace: string; mentor: string; monitor: string | null; proyecto: string };
export type Resumen = { franjas: { inicio: string; fin: string; bloques: BloqueResumen[] }[]; invitados: string[] };

export type Citacion = {
  tipo: TipoCitacion;
  /** Id del proyecto (participante), id del mentor o usuario del monitor. */
  clave: string;
  dia: string;
  /** Para la fila de la pantalla: nombre del proyecto o de la persona. */
  nombre: string;
  /** Resumen corto para la fila («2:15 p. m. · Sala 3 · Mentor X»). */
  detalle: string;
  eventos: Evento[];
  /** Se puede citar, pero falta algo (p. ej. un integrante sin correo). */
  avisos: string[];
  /** No se puede citar (sin correo, sin sala o sin enlace). */
  bloqueo?: string;
  resumen: Resumen;
  huella: string;
};

/* ------------------------------------------------------------------ utilidades */

const fmtFecha = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: ZONA });
/** «jueves 12 de noviembre». */
export const fechaLarga = (d: Date) => fmtFecha.format(d).replace(/,/g, "");
const finDe = (inicio: Date) => new Date(inicio.getTime() + MINUTOS_BLOQUE * 60_000);
const paisDe = (ciudad: string) => CIUDADES.find((c) => c.nombre === ciudad)?.pais;
const celularTxt = (p?: Persona) => p?.celular?.trim() || "sin registrar";
/** Texto de una sola línea para el evento: sin saltos, sin caracteres de control y sin < > (Google muestra HTML). */
export const limpio = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, " ").replace(/\s+/g, " ").trim();
const unirNombres = (ns: string[]) => ns.map(limpio).join(", ").replace(/, ([^,]*)$/, " y $1");
/** El resumen guardado no lleva correos: solo una huella de cada uno (basta para saber si cambiaron los invitados). */
const huellaCorreo = (c: string) => createHash("sha256").update(c.trim().toLowerCase()).digest("hex").slice(0, 16);

/** Une los bloques ordenados en franjas: uno nuevo empieza si hay más de 30 min desde el fin del anterior. */
export function franjas<T extends { inicio: Date }>(bloques: readonly T[], unirMin = UNIR_MINUTOS): { inicio: Date; fin: Date; bloques: T[] }[] {
  const orden = [...bloques].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const out: { inicio: Date; fin: Date; bloques: T[] }[] = [];
  for (const b of orden) {
    const ult = out[out.length - 1], fin = finDe(b.inicio);
    if (ult && b.inicio.getTime() - ult.fin.getTime() <= unirMin * 60_000) {
      ult.bloques.push(b);
      if (fin > ult.fin) ult.fin = fin;
    } else out.push({ inicio: b.inicio, fin, bloques: [b] });
  }
  return out;
}

/** Huella estable de un resumen (el orden de las claves es fijo porque se arma siempre igual). */
export const huella = (r: Resumen) => createHash("sha256").update(JSON.stringify(r)).digest("hex");

/** Qué cambió entre lo citado y lo de ahora (vacío = igual). */
export function queCambio(antes: Resumen, ahora: Resumen): string[] {
  const todos = (r: Resumen) => r.franjas.flatMap((f) => f.bloques);
  const a = todos(antes), b = todos(ahora);
  const lista = (xs: BloqueResumen[], k: keyof BloqueResumen) => JSON.stringify(xs.map((x) => x[k]));
  const out: string[] = [];
  const proyectos = (xs: BloqueResumen[]) => JSON.stringify(xs.map((x) => x.proyecto).sort());
  if (proyectos(a) !== proyectos(b)) out.push("los proyectos");
  if (lista(a, "inicio") !== lista(b, "inicio") || JSON.stringify(antes.franjas.map((f) => [f.inicio, f.fin])) !== JSON.stringify(ahora.franjas.map((f) => [f.inicio, f.fin]))) out.push("la hora");
  if (lista(a, "sala") !== lista(b, "sala")) out.push("la sala");
  if (lista(a, "enlace") !== lista(b, "enlace")) out.push("el enlace");
  if (lista(a, "mentor") !== lista(b, "mentor")) out.push("el mentor");
  if (lista(a, "monitor") !== lista(b, "monitor")) out.push("el monitor");
  if (JSON.stringify([...antes.invitados].sort()) !== JSON.stringify([...ahora.invitados].sort())) out.push("los invitados");
  return out;
}

/** Modo prueba: todo va solo al correo de prueba y el título empieza con «[PRUEBA] ». La descripción dice a quién iría. */
export function enModoPrueba(e: Evento, correoPrueba: string): Evento {
  const reales = e.invitados.map((i) => i.correo).join(", ") || "nadie";
  return {
    ...e,
    titulo: PREFIJO_PRUEBA + e.titulo,
    invitados: [{ correo: correoPrueba, nombre: "Prueba" }],
    descripcion: `MODO PRUEBA · Invitados reales (no se les envió): ${reales}\n\n${e.descripcion}`,
  };
}

/* ------------------------------------------------------------------ cruce con el plan de salas */

type BloqueSala = BloqueDia & { sala: number | null; enlace: string; monitor: string | null };

function conSala(d: DatosDia): BloqueSala[] {
  const plan = new Map(d.plan.map((p) => [`${p.hora}|${p.mentorId}`, p]));
  return d.bloques
    .map((b) => {
      const p = plan.get(`${horaCOL(b.inicio)}|${b.mentorId}`);
      const sala = p?.sala ?? null;
      return { ...b, sala, enlace: sala !== null ? d.enlaces[sala] ?? "" : "", monitor: p?.monitor ?? null };
    })
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.mentorId.localeCompare(b.mentorId));
}

const resumenDe = (fs: { inicio: Date; fin: Date; bloques: BloqueSala[] }[], invitados: Invitado[]): Resumen => ({
  franjas: fs.map((f) => ({
    inicio: f.inicio.toISOString(), fin: f.fin.toISOString(),
    bloques: f.bloques.map((b) => ({ inicio: b.inicio.toISOString(), sala: b.sala, enlace: b.enlace, mentor: b.mentorId, monitor: b.monitor, proyecto: b.proyecto.id })),
  })),
  invitados: invitados.map((i) => huellaCorreo(i.correo)).sort(),
});

const salaTxt = (b: BloqueSala) => (b.sala !== null ? `Sala ${b.sala}` : "Sala por asignar");

/** Faltantes que impiden citar un bloque (sin sala o sin enlace). */
function faltaSala(bs: BloqueSala[]): string | undefined {
  const sinSala = bs.find((b) => b.sala === null);
  if (sinSala) return `Falta la sala de las ${horaCO(sinSala.inicio)} (revisa el Plan de salas).`;
  const sinEnlace = bs.find((b) => !b.enlace);
  if (sinEnlace) return `Falta el enlace de la Sala ${sinEnlace.sala} (hoja Salas).`;
  return undefined;
}

function cerrar(c: Omit<Citacion, "huella">): Citacion {
  return { ...c, huella: huella(c.resumen) };
}

/* ------------------------------------------------------------------ participantes */

export function citacionesParticipantes(d: DatosDia, tenEnCuenta: string): Citacion[] {
  return conSala(d).map((b) => {
    const p = b.proyecto, fin = finDe(b.inicio);
    const invitados = p.integrantes.filter((i) => i.correo).map((i) => ({ correo: i.correo!, nombre: limpio(i.nombre) }));
    const sinCorreo = p.integrantes.filter((i) => !i.correo).map((i) => limpio(i.nombre));
    const monitor = b.monitor ? limpio(d.monitores[b.monitor]?.nombre ?? b.monitor) : null;
    const nombreProyecto = limpio(p.nombre);
    const uy = paisDe(p.ciudad) === "UY";
    const hora = `${horaCO(b.inicio)} a ${horaCO(fin)} (hora de Colombia)${uy ? ` · ${horaUY(b.inicio)} a ${horaUY(fin)} (hora de Uruguay)` : ""}`;
    const items = tenEnCuenta.split("\n").map(limpio).filter(Boolean).map((l) => `• ${l}`);
    const descripcion = [
      `Fecha: ${fechaLarga(b.inicio)}`,
      `Hora: ${hora}`,
      `${salaTxt(b)}: ${b.enlace || "enlace por confirmar"}`,
      `Monitor a cargo: ${monitor ?? "por asignar"}`,
      "",
      "Ten en cuenta para tu presentación:",
      ...items,
    ].join("\n");
    const avisos = [
      ...sinCorreo.map((n) => `${n} no tiene correo: no recibirá la invitación.`),
      ...(monitor ? [] : ["La sala no tiene monitor asignado: el evento dirá «por asignar»."]),
    ];
    const bloqueo = faltaSala([b]) ?? (invitados.length ? undefined : "Ningún integrante tiene correo.");
    return cerrar({
      tipo: "participante", clave: p.id, dia: d.dia, nombre: nombreProyecto,
      detalle: `${horaCO(b.inicio)} · ${salaTxt(b)} · ${limpio(d.mentores[b.mentorId]?.nombre ?? b.mentorId)} · Monitor: ${monitor ?? "por asignar"}`,
      eventos: [{ titulo: `${TITULO_BASE} · Presentación de ${nombreProyecto}`, inicio: b.inicio, fin, ...(b.enlace ? { ubicacion: b.enlace } : {}), descripcion, invitados }],
      avisos, ...(bloqueo ? { bloqueo } : {}),
      resumen: resumenDe([{ inicio: b.inicio, fin, bloques: [b] }], invitados),
    });
  });
}

/* ------------------------------------------------------------------ mentores */

/** Tramos seguidos de una franja con la misma sala y el mismo monitor. */
function tramos<T extends { sala: number | null; enlace: string; monitor: string | null; mentorId: string; inicio: Date }>(bs: T[], clave: (b: T) => string): T[][] {
  const out: T[][] = [];
  for (const b of bs) {
    const ult = out[out.length - 1];
    if (ult && clave(ult[0]!) === clave(b)) ult.push(b);
    else out.push([b]);
  }
  return out;
}

export function citacionesMentores(d: DatosDia): Citacion[] {
  const porMentor = new Map<string, BloqueSala[]>();
  for (const b of conSala(d)) porMentor.set(b.mentorId, [...(porMentor.get(b.mentorId) ?? []), b]);
  return [...porMentor].map(([mentorId, bs]) => {
    const m0 = d.mentores[mentorId] ?? { nombre: mentorId }, m = { ...m0, nombre: limpio(m0.nombre) };
    const invitados = m.correo ? [{ correo: m.correo, nombre: m.nombre }] : [];
    const fs = franjas(bs);
    const monitorTxt = (u: string | null) => (u ? `${limpio(d.monitores[u]?.nombre ?? u)} · Celular: ${limpio(celularTxt(d.monitores[u]))}` : "por asignar");
    const eventos: Evento[] = fs.map((f) => {
      const ts = tramos(f.bloques, (b) => `${b.sala}|${b.monitor}`);
      const cabecera = ts.length === 1
        ? [`${salaTxt(ts[0]![0]!)}: ${ts[0]![0]!.enlace || "enlace por confirmar"}`, `Monitor: ${monitorTxt(ts[0]![0]!.monitor)}`]
        : ["Sala y monitor por hora:", ...ts.map((t) => `Desde las ${horaCO(t[0]!.inicio)}: ${salaTxt(t[0]!)} (${t[0]!.enlace || "enlace por confirmar"}) · Monitor: ${monitorTxt(t[0]!.monitor)}`)];
      const proyectos = f.bloques.map((b) => `• ${horaCO(b.inicio)} · ${limpio(b.proyecto.nombre)} · ${unirNombres(b.proyecto.integrantes.map((i) => i.nombre))}`);
      return {
        titulo: `${TITULO_BASE} · Calificación de proyectos`, inicio: f.inicio, fin: f.fin,
        ...(ts.length === 1 && ts[0]![0]!.enlace ? { ubicacion: ts[0]![0]!.enlace } : {}),
        descripcion: [`Fecha: ${fechaLarga(f.inicio)}`, `Hora: ${horaCO(f.inicio)} a ${horaCO(f.fin)} (hora de Colombia)`, "", ...cabecera, "", "Tus proyectos:", ...proyectos].join("\n"),
        invitados,
      };
    });
    const sinMonitor = bs.some((b) => !b.monitor);
    const bloqueo = faltaSala(bs) ?? (invitados.length ? undefined : "El mentor no tiene correo (hoja Mentores o Usuarios).");
    return cerrar({
      tipo: "mentor", clave: mentorId, dia: d.dia, nombre: m.nombre,
      detalle: `${fs.map((f) => `${horaCO(f.inicio)} a ${horaCO(f.fin)}`).join(" y ")} · ${bs.length} proyecto${bs.length === 1 ? "" : "s"}`,
      eventos, avisos: sinMonitor ? ["Alguna sala no tiene monitor: el evento dirá «por asignar»."] : [], ...(bloqueo ? { bloqueo } : {}),
      resumen: resumenDe(fs, invitados),
    });
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/* ------------------------------------------------------------------ monitores */

export function citacionesMonitores(d: DatosDia): Citacion[] {
  const porMonitor = new Map<string, BloqueSala[]>();
  for (const b of conSala(d)) if (b.monitor) porMonitor.set(b.monitor, [...(porMonitor.get(b.monitor) ?? []), b]);
  return [...porMonitor].map(([usuario, bs]) => {
    const yo0 = d.monitores[usuario] ?? { nombre: usuario }, yo = { ...yo0, nombre: limpio(yo0.nombre) };
    const invitados = yo.correo ? [{ correo: yo.correo, nombre: yo.nombre }] : [];
    const fs = franjas(bs);
    const eventos: Evento[] = fs.map((f) => {
      // Por sala y hora: número, enlace y mentor; luego sus proyectos con el contacto de cada integrante.
      const grupos = tramos(f.bloques, (b) => `${horaCOL(b.inicio)}|${b.sala}|${b.mentorId}`);
      const lineas = grupos.flatMap((g) => {
        const b0 = g[0]!, mentor = d.mentores[b0.mentorId];
        return [
          `${salaTxt(b0)} · ${horaCO(b0.inicio)} a ${horaCO(finDe(g[g.length - 1]!.inicio))}`,
          `Enlace: ${b0.enlace || "por confirmar"}`,
          `Mentor: ${limpio(mentor?.nombre ?? b0.mentorId)} · Celular: ${limpio(celularTxt(mentor))}`,
          ...g.flatMap((b) => [
            `• ${horaCO(b.inicio)} · ${limpio(b.proyecto.nombre)}`,
            ...b.proyecto.integrantes.map((i) => `   – ${limpio(i.nombre)} · Celular: ${limpio(i.celular || "sin registrar")} · Correo: ${limpio(i.correo || "sin registrar")}`),
          ]),
          "",
        ];
      });
      return {
        titulo: `${TITULO_BASE} · Monitoría de salas`, inicio: f.inicio, fin: f.fin,
        descripcion: [`Fecha: ${fechaLarga(f.inicio)}`, `Hora: ${horaCO(f.inicio)} a ${horaCO(f.fin)} (hora de Colombia)`, "", ...lineas, CIERRE_MONITOR].join("\n"),
        invitados,
      };
    });
    const bloqueo = faltaSala(bs) ?? (invitados.length ? undefined : "El monitor no tiene correo (Usuarios → Editar).");
    return cerrar({
      tipo: "monitor", clave: usuario, dia: d.dia, nombre: yo.nombre,
      detalle: `${fs.map((f) => `${horaCO(f.inicio)} a ${horaCO(f.fin)}`).join(" y ")} · ${bs.length} proyecto${bs.length === 1 ? "" : "s"} · ${[...new Set(bs.map(salaTxt))].join(", ")}`,
      eventos, avisos: [], ...(bloqueo ? { bloqueo } : {}),
      resumen: resumenDe(fs, invitados),
    });
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Las citaciones de un tipo para un día. */
export function citacionesDelDia(tipo: TipoCitacion, d: DatosDia, tenEnCuenta = TEN_EN_CUENTA_DEFECTO): Citacion[] {
  return tipo === "participante" ? citacionesParticipantes(d, tenEnCuenta) : tipo === "mentor" ? citacionesMentores(d) : citacionesMonitores(d);
}

import { createHash } from "node:crypto";
import { CIUDADES, horaCO, horaUY } from "../ciudades";
import { horaCOL, MINUTOS_BLOQUE } from "../edicion";

// Fase 5 · Paso 27 · Contenido de las citaciones del calendario (funciones puras, sin base ni Google).
// Tres tipos de evento por día:
//  - participante: uno por proyecto en su bloque de 15 min; invitados = sus integrantes (nadie más); sin datos del
//    monitor.
//  - mentor: uno por franja (bloques con proyecto unidos si hay ≤ 30 min entre ellos); solo el mentor; sin contactos
//    de estudiantes (solo nombres).
//  - monitor: uno por franja de los bloques de SUS salas (planSalas); con nombre, celular y correo de esos integrantes.
// La sala, el enlace y el monitor de cada bloque salen del plan de salas (día, hora, mentor).
// Textos: los formatos exactos que pidió el usuario (ajuste del Paso 29), hora «8:00 a. m.» en hora Colombia.
// El `resumen` guarda solo lo que decide si una citación quedó desactualizada (hora, sala, enlace, mentor, monitor,
// proyectos e invitados), nunca datos de contacto (de cada invitado, solo una huella de su correo) ni el texto: cambiar
// «Ten en cuenta» no marca desactualizado (DECISIONES). Su huella (sha256) se compara con la de lo ya citado. Nombres y
// textos pasan por `limpio` (una línea, sin control ni < >).

export const TITULO_PARTICIPANTE = "Presentación de Proyecto Final · Jóvenes creaTIvos 2026";
export const TITULO_MENTOR = "Calificación de proyectos · Proyecto Final Jóvenes creaTIvos 2026";
export const TITULO_MONITOR = "Monitoría de salas · Proyecto Final Jóvenes creaTIvos 2026";
export const ZONA = "America/Bogota";
/** Dos bloques con proyecto quedan en la misma franja si entre el fin de uno y el inicio del otro hay ≤ 30 min. */
export const UNIR_MINUTOS = 30;
export const PREFIJO_PRUEBA = "[PRUEBA] ";
export const SIN_REGISTRAR = "Sin registrar";

/** Valor por defecto del texto editable «Ten en cuenta» (si ya se guardó otro, manda el guardado). */
export const TEN_EN_CUENTA_DEFECTO = [
  "Ten en cuenta estas recomendaciones para tu presentación:",
  "• Ingresa a la sala 5 minutos antes de tu hora. Tu monitor te dará acceso.",
  "• Conéctate desde un computador, con cámara, micrófono y conexión estable.",
  "• Ten tu proyecto abierto y listo para compartir antes de ingresar.",
  "• Dispones de 15 minutos para presentar tu proyecto. Organiza previamente lo que vas a mostrar y explicar.",
  "• Si presentas en pareja, ambos deben conectarse y participar.",
  "• Si tienes algún inconveniente antes de tu presentación, comunícate con tu monitor.",
].join("\n");

export const CIERRE_PARTICIPANTE = "¡Estamos muy emocionados de conocer tu proyecto!";

export const CIERRE_MONITOR = [
  "Importante:",
  "Asegúrate de estar en la sala antes de iniciar cada presentación y de acompañar el ingreso de los participantes y el mentor.",
  "Las reprogramaciones no se pueden hacer de forma autónoma y deben ser aprobadas. Los casos de calamidad o fuerza mayor deben reportarse a Astrid o Cristian.",
].join("\n");

export const CIERRE_MENTOR = [
  "Recomendaciones:",
  "• Conéctate unos minutos antes del inicio de tu primera evaluación.",
  "• Respeta los tiempos asignados para cada presentación (15 minutos).",
  "• Asegúrate de evaluar cada proyecto según los criterios establecidos.",
  "",
  "¡Gracias por compartir tu experiencia y contribuir al crecimiento de nuestros jóvenes!",
].join("\n");

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
/** «Jueves 12 de noviembre». */
export const fechaLarga = (d: Date) => { const t = fmtFecha.format(d).replace(/,/g, ""); return t.charAt(0).toUpperCase() + t.slice(1); };
const finDe = (inicio: Date) => new Date(inicio.getTime() + MINUTOS_BLOQUE * 60_000);
/** «8:00 a. m. a 8:15 a. m.» */
const rango = (a: Date, b: Date) => `${horaCO(a)} a ${horaCO(b)}`;
/** Colonia y Paysandú: también la hora de Uruguay en la misma línea. */
export const esUruguay = (ciudad: string) => CIUDADES.some((c) => c.nombre === ciudad && c.pais === "UY");
/**
 * Texto de una sola línea para el evento: sin saltos, sin caracteres de control ni invisibles o de dirección, y sin < >
 * (Google muestra HTML).
 */
export const limpio = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f<>​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
const oSinRegistrar = (s?: string) => limpio(s?.trim() || SIN_REGISTRAR);
/** «A», «A y B», «A, B y C». */
const unirConY = (ns: string[]) => ns.join(", ").replace(/, ([^,]*)$/, " y $1");
export const primerNombre = (n: string) => limpio(n).split(" ")[0] ?? "";
/** El resumen guardado no lleva correos: solo una huella de cada uno (basta para saber si cambiaron los invitados). */
const huellaCorreo = (c: string) => createHash("sha256").update(c.trim().toLowerCase()).digest("hex").slice(0, 16);

/** Una línea del «Ten en cuenta» que podría pasar por un dato del evento (sala, enlace, hora…) o trae una URL. */
const PARECE_DATO = /^(sala|enlace|hora|horario|fecha|monitor|mentor|celular|correo|participantes?)\b|https?:\/\/|www\./i;

/**
 * Líneas del «Ten en cuenta»: un encabezado (termina en «:», sin URL ni forma de dato) va tal cual; todo lo demás, con
 * viñeta «• » (sin duplicarla). Así el texto editable nunca imita las líneas de Sala, Enlace u Hora.
 */
export function lineasTenEnCuenta(texto: string): string[] {
  return texto.split("\n").map(limpio).filter(Boolean).map((l) => {
    if (!l.startsWith("•") && l.endsWith(":") && !PARECE_DATO.test(l)) return l;
    return `• ${l.replace(/^•\s*/, "")}`;
  });
}

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
  const reales = e.invitados.map((i) => limpio(i.correo)).join(", ") || "nadie";
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
      // El enlace también pasa por limpio (Google interpreta HTML en la descripción y en la ubicación).
      return { ...b, sala, enlace: sala !== null ? limpio(d.enlaces[sala] ?? "") : "", monitor: p?.monitor ?? null };
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

const salaTxt = (b: { sala: number | null }) => (b.sala !== null ? `Sala ${b.sala}` : "Sala por asignar");
const enlaceTxt = (b: { enlace: string }) => b.enlace || "por confirmar";

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

/** Agrupa en orden de aparición (los bloques ya vienen en orden de hora). */
function agrupar<T>(xs: T[], clave: (x: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(clave(x), [...(m.get(clave(x)) ?? []), x]);
  return [...m.values()];
}

/* ------------------------------------------------------------------ participantes */

export function citacionesParticipantes(d: DatosDia, tenEnCuenta: string): Citacion[] {
  return conSala(d).map((b) => {
    const p = b.proyecto, fin = finDe(b.inicio);
    const invitados = p.integrantes.filter((i) => i.correo).map((i) => ({ correo: i.correo!, nombre: limpio(i.nombre) }));
    const sinCorreo = p.integrantes.filter((i) => !i.correo).map((i) => limpio(i.nombre));
    const monitor = b.monitor ? limpio(d.monitores[b.monitor]?.nombre ?? b.monitor) : null;
    const nombreProyecto = limpio(p.nombre);
    // Sin datos del monitor en el evento del participante.
    const descripcion = [
      "PRESENTACIÓN DE PROYECTO FINAL · Jóvenes creaTIvos 2026",
      `Hola, ${unirConY(p.integrantes.map((i) => primerNombre(i.nombre)).filter(Boolean))}:`,
      "¡Llegó el momento de presentar tu Proyecto Final!",
      `Fecha: ${fechaLarga(b.inicio)}`,
      `Hora: ${rango(b.inicio, fin)} (hora Colombia)${esUruguay(p.ciudad) ? ` · ${horaUY(b.inicio)} a ${horaUY(fin)} (hora Uruguay)` : ""}`,
      `Sala: ${salaTxt(b)}`,
      `Enlace de conexión: ${enlaceTxt(b)}`,
      "",
      ...lineasTenEnCuenta(tenEnCuenta),
      "",
      CIERRE_PARTICIPANTE,
    ].join("\n");
    const avisos = sinCorreo.map((n) => `${n} no tiene correo: no recibirá la invitación.`);
    const bloqueo = faltaSala([b]) ?? (invitados.length ? undefined : "Ningún integrante tiene correo.");
    const eventos: Evento[] = [{ titulo: TITULO_PARTICIPANTE, inicio: b.inicio, fin, ...(b.enlace ? { ubicacion: b.enlace } : {}), descripcion, invitados }];
    return cerrar({
      tipo: "participante", clave: p.id, dia: d.dia, nombre: nombreProyecto,
      detalle: `${horaCO(b.inicio)} · ${salaTxt(b)} · ${limpio(d.mentores[b.mentorId]?.nombre ?? b.mentorId)} · Monitor: ${monitor ?? "por asignar"}`,
      eventos, avisos, ...(bloqueo ? { bloqueo } : {}),
      // El evento del participante no muestra al monitor: cambiarlo no lo desactualiza.
      resumen: resumenDe([{ inicio: b.inicio, fin, bloques: [{ ...b, monitor: null }] }], invitados),
    });
  });
}

/* ------------------------------------------------------------------ mentores */

/** Tramos seguidos de una franja con la misma clave (p. ej. misma sala y mismo monitor). */
function tramos<T>(bs: T[], clave: (b: T) => string): T[][] {
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
    const monitorNombre = (u: string | null) => (u ? limpio(d.monitores[u]?.nombre ?? u) : "Por asignar");
    const monitorCel = (u: string | null) => (u ? oSinRegistrar(d.monitores[u]?.celular) : SIN_REGISTRAR);
    const eventos: Evento[] = fs.map((f) => {
      const ts = tramos(f.bloques, (b) => `${b.sala}|${b.monitor}`);
      const varias = ts.length > 1;
      // Una sola sala: sala, enlace y monitor una vez. Si cambia dentro de la franja: un bloque por sala (desde qué
      // hora) y la sala junto a cada proyecto.
      const cabecera = !varias
        ? [`Sala: ${salaTxt(ts[0]![0]!)}`, `Enlace de conexión: ${enlaceTxt(ts[0]![0]!)}`, `Monitor a cargo: ${monitorNombre(ts[0]![0]!.monitor)}`, `Celular del monitor: ${monitorCel(ts[0]![0]!.monitor)}`]
        : ts.flatMap((t) => [`Sala: ${salaTxt(t[0]!)} (desde las ${horaCO(t[0]!.inicio)})`, `Enlace de conexión: ${enlaceTxt(t[0]!)}`, `Monitor a cargo: ${monitorNombre(t[0]!.monitor)}`, `Celular del monitor: ${monitorCel(t[0]!.monitor)}`, ""]).slice(0, -1);
      // Solo nombres de los participantes: el mentor nunca ve su celular ni su correo.
      const proyectos = f.bloques.flatMap((b) => [
        `${horaCO(b.inicio)} · ${limpio(b.proyecto.nombre)}${varias ? ` · ${salaTxt(b)}` : ""}`,
        ...b.proyecto.integrantes.map((i) => `• Participante: ${limpio(i.nombre)}`),
      ]);
      return {
        titulo: TITULO_MENTOR, inicio: f.inicio, fin: f.fin,
        ...(!varias && ts[0]![0]!.enlace ? { ubicacion: ts[0]![0]!.enlace } : {}),
        descripcion: [
          `Hola, ${primerNombre(m.nombre)}:`,
          "Gracias por acompañarnos como mentor en las presentaciones de los Proyectos Finales de Jóvenes creaTIvos 2026.",
          "Esta es tu programación:",
          `Fecha: ${fechaLarga(f.inicio)}`,
          `Horario: ${rango(f.inicio, f.fin)} (hora Colombia)`,
          ...cabecera,
          "Proyectos asignados para evaluación:",
          ...proyectos,
          "",
          CIERRE_MENTOR,
        ].join("\n"),
        invitados,
      };
    });
    const sinMonitor = bs.some((b) => !b.monitor);
    const bloqueo = faltaSala(bs) ?? (invitados.length ? undefined : "El mentor no tiene correo (hoja Mentores o Usuarios).");
    return cerrar({
      tipo: "mentor", clave: mentorId, dia: d.dia, nombre: m.nombre,
      detalle: `${fs.map((f) => rango(f.inicio, f.fin)).join(" y ")} · ${bs.length} proyecto${bs.length === 1 ? "" : "s"}`,
      eventos, avisos: sinMonitor ? ["Alguna sala no tiene monitor: el evento dirá «Por asignar»."] : [], ...(bloqueo ? { bloqueo } : {}),
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
      // Por sala (y su mentor), en orden de hora; luego sus proyectos con el contacto de cada integrante.
      const salas = agrupar(f.bloques, (b) => `${b.sala}|${b.mentorId}`).flatMap((g) => {
        const b0 = g[0]!, mentor = d.mentores[b0.mentorId];
        return [
          "",
          b0.sala !== null ? `SALA ${b0.sala}` : "SALA POR ASIGNAR",
          `Horario: ${rango(b0.inicio, finDe(g[g.length - 1]!.inicio))}`,
          `Enlace de conexión: ${enlaceTxt(b0)}`,
          `Mentor asignado: ${limpio(mentor?.nombre ?? b0.mentorId)}`,
          `Celular: ${oSinRegistrar(mentor?.celular)}`,
          "Participantes:",
          ...g.flatMap((b) => [
            `${horaCO(b.inicio)} · ${limpio(b.proyecto.nombre)}`,
            ...b.proyecto.integrantes.flatMap((i) => [`• Participante: ${limpio(i.nombre)}`, `• Celular: ${oSinRegistrar(i.celular)}`, `• Correo: ${oSinRegistrar(i.correo)}`]),
          ]),
        ];
      });
      return {
        titulo: TITULO_MONITOR, inicio: f.inicio, fin: f.fin,
        descripcion: [
          `Hola, ${primerNombre(yo.nombre)}:`,
          "Esta es tu programación para acompañar las presentaciones de los Proyectos Finales.",
          `Fecha: ${fechaLarga(f.inicio)}`,
          `Horario asignado: ${rango(f.inicio, f.fin)} (hora Colombia)`,
          ...salas,
          "",
          CIERRE_MONITOR,
        ].join("\n"),
        invitados,
      };
    });
    const bloqueo = faltaSala(bs) ?? (invitados.length ? undefined : "El monitor no tiene correo (Usuarios → Editar).");
    return cerrar({
      tipo: "monitor", clave: usuario, dia: d.dia, nombre: yo.nombre,
      detalle: `${fs.map((f) => rango(f.inicio, f.fin)).join(" y ")} · ${bs.length} proyecto${bs.length === 1 ? "" : "s"} · ${[...new Set(bs.map(salaTxt))].join(", ")}`,
      eventos, avisos: [], ...(bloqueo ? { bloqueo } : {}),
      resumen: resumenDe(fs, invitados),
    });
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Las citaciones de un tipo para un día. */
export function citacionesDelDia(tipo: TipoCitacion, d: DatosDia, tenEnCuenta = TEN_EN_CUENTA_DEFECTO): Citacion[] {
  return tipo === "participante" ? citacionesParticipantes(d, tenEnCuenta) : tipo === "mentor" ? citacionesMentores(d) : citacionesMonitores(d);
}

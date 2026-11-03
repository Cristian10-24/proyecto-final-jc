// Formatos de fecha y hora del portal (siempre en hora de Colombia) y archivo .ics del calendario.
import { CIUDADES, horaCO, horaParaCiudad, type Pais } from "@/lib/ciudades";

const ZONA = "America/Bogota";

export function paisDe(ciudad: string): Pais {
  return CIUDADES.find((c) => c.nombre === ciudad)?.pais ?? "CO";
}

/** Mediodía de Colombia del día 'YYYY-MM-DD' (evita saltos de día al formatear). */
const mediodia = (dia: string) => new Date(`${dia}T12:00:00-05:00`);

function partes(d: Date, opc: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("es-CO", { ...opc, timeZone: ZONA }).formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** "jueves 12 de noviembre" */
export function fechaLarga(d: Date): string {
  const p = partes(d, { weekday: "long", day: "numeric", month: "long" });
  return `${p.weekday} ${p.day} de ${p.month}`;
}

export const diaLargo = (dia: string) => fechaLarga(mediodia(dia));

/** Partes para la tarjeta de día: { semana: "jueves", numero: "12", mes: "noviembre" } */
export function partesDia(dia: string) {
  const p = partes(mediodia(dia), { weekday: "long", day: "numeric", month: "long" });
  return { semana: p.weekday, numero: p.day, mes: p.month };
}

/** "jueves 12 de noviembre · 6:00 p. m." (hora de Colombia) */
export const fechaHora = (iso: string) => `${fechaLarga(new Date(iso))} · ${horaCO(new Date(iso))}`;

export const hora = (iso: string, pais: Pais) => horaParaCiudad(new Date(iso), pais);

/** Etiqueta del grupo de una hora: "6 p. m." en Colombia. */
export function grupoHora(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", hour12: true, timeZone: ZONA }).format(new Date(iso)).replace(/\s+/g, " ");
}

/** Día 'YYYY-MM-DD' en Colombia de un instante. */
export function diaDe(iso: string): string {
  const p = partes(new Date(iso), { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

// ---------- Calendario (.ics) ----------

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapar = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function descargarIcs(inicio: string, proyecto: string) {
  const ini = new Date(inicio);
  const fin = new Date(ini.getTime() + 15 * 60_000);
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jovenes creaTIvos//Proyecto final 2026//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${utc(ini)}-${Math.random().toString(36).slice(2)}@proyecto-final-jc`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(ini)}`,
    `DTEND:${utc(fin)}`,
    `SUMMARY:${escapar("Presentación proyecto final · Jóvenes creaTIvos")}`,
    `DESCRIPTION:${escapar(`Proyecto: ${proyecto}\nTu monitor te enviará el enlace de la sala por WhatsApp.`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Presentación proyecto final",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lineas.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "presentacion-proyecto-final.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

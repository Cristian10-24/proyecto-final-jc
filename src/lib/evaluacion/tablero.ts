import { calc, ITEMS_A, primerNombre, RESULTADOS, TEMAS_B, type Criterios, type MotivoInasistencia, type PartesA, type PartesB, type Resultado } from "./criterios";

// Seguimiento general (Paso 15): funciones puras, sin base. Una fila por estudiante y todas las tablas del prototipo
// (docs/EVALUACION.md · Seguimiento general), copiadas de su renderTablero(); el mensaje para el estudiante es copia
// de su messageFor(). La pareja es el mismo proyecto. La tabla "por monitor" cuenta por la sala y hora (DECISIONES).

export type FilaEstudiante = {
  proyectoId: string; codigo: string;
  nombre: string; documento: string; correo: string; celular: string;
  ciudad: string; ruta: string; pareja: { nombre: string; documento: string } | null;
  proyecto: string; descripcion: string;
  dia: string | null; hora: string; sala: number | null; mentor: string; monitor: string;
  /** Evaluación guardada de este integrante (null = Pendiente). */
  ev: { a: PartesA; b: PartesB; noPresento: boolean; destacado: boolean; fortaleza: string; mejora: string; percepcion: string } | null;
  motivo: MotivoInasistencia | null; observacion: string;
};

export const SIN_MONITOR = "Sin monitor";
export const SIN_MENTOR = "Sin asignar";

const RES_TXT: Record<Resultado, string> = {
  Excelente: "Excelente. Tu aplicación funciona y demostraste un gran dominio de tu código.",
  Aprobado: "Aprobado. Cumpliste con el proyecto final y demostraste lo que aprendiste.",
  Incompleto: "Pendiente de completar la evaluación con tu mentor.",
  "No se presentó": "Pendiente.",
  Pendiente: "Pendiente.",
};

/** Asunto y mensaje final para el estudiante (copia del prototipo): solo si quedó Aprobado o Excelente. */
export function mensajeEstudiante(f: FilaEstudiante, crit: Criterios): { asunto: string; mensaje: string } {
  const c = calc(f.ev, crit);
  if (!f.ev || (c.res !== "Aprobado" && c.res !== "Excelente")) return { asunto: "", mensaje: "" };
  const nm = primerNombre(f.nombre), mate = f.pareja ? primerNombre(f.pareja.nombre) : null, L: string[] = [];
  L.push(`Hola, ${nm}:`, "");
  L.push(`¡Felicitaciones por presentar tu proyecto final${f.proyecto ? `, ${f.proyecto}` : ""}${mate ? `, junto a ${mate}` : ""}! Construir una aplicación web completa y mostrarla funcionando es un logro enorme.`, "");
  L.push(`Tu resultado: ${RES_TXT[c.res]}`, "");
  if (f.ev.fortaleza) L.push(mate ? "Lo que hicieron muy bien:" : "Lo que hiciste muy bien:", f.ev.fortaleza, "");
  if (f.ev.mejora) L.push("Para seguir creciendo:", f.ev.mejora, "");
  if (f.ev.percepcion) L.push("Un mensaje de tu mentor:", f.ev.percepcion, "");
  if (f.ev.destacado) L.push("Además, tu proyecto fue nominado como uno de los proyectos destacados de Jóvenes creaTIvos 2026.", "");
  L.push("Gracias por tu esfuerzo durante todo el programa. ¡Sigue creando!", "", f.mentor && f.mentor !== SIN_MENTOR ? f.mentor : "Tu mentor", "Equipo Jóvenes creaTIvos");
  return { asunto: `¡Felicitaciones por tu proyecto final, ${nm}! · Jóvenes creaTIvos`, mensaje: L.join("\n") };
}

const prom = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : null);

export type FilaGrupo = { grupo: string; estudiantes: number; evaluados: number; noSePresentaron: number; excelentes: number | null; nivel: number | null };
export type Tablero = {
  kpis: { evaluados: number; estudiantes: number; proyectos: number; avance: number | null; pctExcelentes: number | null; excelentes: number; noSePresentaron: number; destacados: number };
  resultados: { res: Resultado; n: number }[];
  parteA: { k: string; titulo: string; si: number | null; n: number }[];
  parteB: { k: string; titulo: string; promedio: number | null; n: number }[];
  porRuta: FilaGrupo[]; porCiudad: FilaGrupo[]; porModalidad: FilaGrupo[];
  parejas: { ambos: number; uno: number; ninguno: number };
  inasistencias: { total: number; conMotivo: number; motivos: { motivo: string; n: number }[]; porMonitor: { monitor: string; estudiantes: number; noSePresentaron: number; conMotivo: number; sinMotivo: number }[] };
  destacados: { nombre: string; proyecto: string; mentor: string; res: Resultado; fortaleza: string }[];
  excelentes: { nombre: string; proyecto: string; mentor: string; a: number | null; b: number | null }[];
  porDia: { dia: string | null; programados: number; evaluados: number; noSePresentaron: number; avance: number | null }[];
  porMentor: { mentor: string; asignados: number; evaluados: number; avance: number | null; funciona: number | null; nivel: number | null }[];
};

const hecho = (r: Resultado) => r !== "Pendiente" && r !== "No se presentó";

/** Todas las tablas del seguimiento a partir de las filas (ya filtradas por día y ciudad). */
export function tablero(filas: FilaEstudiante[], crit: Criterios): Tablero {
  const rows = filas.map((f) => ({ f, c: calc(f.ev, crit) }));
  const evd = rows.filter((r) => r.c.res !== "Pendiente"), n = evd.length;
  const cuenta = (res: Resultado) => rows.filter((r) => r.c.res === res).length;
  const ns = cuenta("No se presentó"), pres = n - ns, dest = rows.filter((r) => r.f.ev?.destacado);

  const grupo = (clave: (f: FilaEstudiante) => string, fijos: string[] = []): FilaGrupo[] =>
    [...new Set([...fijos, ...filas.map(clave)])].map((g) => {
      const rs = rows.filter((r) => clave(r.f) === g), e = rs.filter((r) => hecho(r.c.res));
      return {
        grupo: g, estudiantes: rs.length, evaluados: e.length, noSePresentaron: rs.filter((r) => r.c.res === "No se presentó").length,
        excelentes: e.length ? e.filter((r) => r.c.res === "Excelente").length / e.length : null,
        nivel: prom(e.map((r) => r.c.b).filter((x): x is number => x !== null)),
      };
    }).filter((g) => g.estudiantes > 0).sort((x, y) => y.estudiantes - x.estudiantes || x.grupo.localeCompare(y.grupo, "es"));

  // Parejas con los dos evaluados: los dos, solo uno o ninguno excelente.
  const parejas = { ambos: 0, uno: 0, ninguno: 0 };
  for (const id of new Set(filas.filter((f) => f.pareja).map((f) => f.proyectoId))) {
    const rs = rows.filter((r) => r.f.proyectoId === id);
    if (rs.length !== 2 || !rs.every((r) => hecho(r.c.res))) continue;
    const k = rs.filter((r) => r.c.res === "Excelente").length;
    parejas[k === 2 ? "ambos" : k === 1 ? "uno" : "ninguno"]++;
  }

  const nsRows = rows.filter((r) => r.c.res === "No se presentó");
  const motivos = new Map<string, number>();
  for (const r of rows) if (r.f.motivo) motivos.set(r.f.motivo, (motivos.get(r.f.motivo) ?? 0) + 1); // incluye reprogramados
  const monitores = [...new Set(filas.map((f) => f.monitor))].sort((a, b) => a.localeCompare(b, "es"));
  const dias = [...new Set(filas.map((f) => f.dia))].sort((a, b) => (a ?? "9").localeCompare(b ?? "9"));
  const mentores = [...new Set(filas.map((f) => f.mentor))].sort((a, b) => a.localeCompare(b, "es"));
  const proyectos = new Set(filas.map((f) => f.proyectoId)).size;

  return {
    kpis: {
      evaluados: n, estudiantes: filas.length, proyectos, avance: filas.length ? n / filas.length : null,
      pctExcelentes: pres ? cuenta("Excelente") / pres : null, excelentes: cuenta("Excelente"), noSePresentaron: ns, destacados: dest.length,
    },
    resultados: [...RESULTADOS].map((res) => ({ res, n: cuenta(res) })),
    parteA: ITEMS_A.map(([k, titulo]) => {
      const m = evd.filter((r) => r.f.ev?.a[k]), si = m.filter((r) => r.f.ev?.a[k] === "si").length;
      return { k, titulo, si: m.length ? si / m.length : null, n: m.length };
    }),
    parteB: TEMAS_B.map(([k, titulo]) => {
      const v = evd.map((r) => r.f.ev?.b[k]).filter((x): x is number => typeof x === "number");
      return { k, titulo, promedio: prom(v), n: v.length };
    }),
    porRuta: grupo((f) => f.ruta || "Sin dato", ["Básica", "Avanzada"]),
    porCiudad: grupo((f) => f.ciudad),
    porModalidad: grupo((f) => (f.pareja ? "En pareja" : "Individual"), ["Individual", "En pareja"]),
    parejas,
    inasistencias: {
      total: nsRows.length, conMotivo: nsRows.filter((r) => r.f.motivo).length,
      motivos: [...motivos].map(([motivo, k]) => ({ motivo, n: k })).sort((a, b) => b.n - a.n),
      porMonitor: monitores.map((m) => {
        const rs = rows.filter((r) => r.f.monitor === m), nr = rs.filter((r) => r.c.res === "No se presentó"), w = nr.filter((r) => r.f.motivo).length;
        return { monitor: m, estudiantes: rs.length, noSePresentaron: nr.length, conMotivo: w, sinMotivo: nr.length - w };
      }),
    },
    destacados: dest.map((r) => ({ nombre: r.f.nombre, proyecto: r.f.proyecto, mentor: r.f.mentor, res: r.c.res, fortaleza: r.f.ev?.fortaleza ?? "" })),
    excelentes: rows.filter((r) => r.c.res === "Excelente").map((r) => ({ nombre: r.f.nombre, proyecto: r.f.proyecto, mentor: r.f.mentor, a: r.c.a, b: r.c.b })),
    porDia: dias.map((d) => {
      const rs = rows.filter((r) => r.f.dia === d), e = rs.filter((r) => r.c.res !== "Pendiente"), nd = rs.filter((r) => r.c.res === "No se presentó").length;
      return { dia: d, programados: rs.length, evaluados: e.length - nd, noSePresentaron: nd, avance: rs.length ? e.length / rs.length : null };
    }),
    porMentor: mentores.map((m) => {
      const rs = rows.filter((r) => r.f.mentor === m), e = rs.filter((r) => r.c.res !== "Pendiente");
      return {
        mentor: m, asignados: rs.length, evaluados: e.length, avance: rs.length ? e.length / rs.length : null,
        funciona: prom(e.map((r) => r.c.a).filter((x): x is number => x !== null)), nivel: prom(e.map((r) => r.c.b).filter((x): x is number => x !== null)),
      };
    }),
  };
}

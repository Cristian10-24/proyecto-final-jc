import { describe, expect, it } from "vitest";
import {
  CIERRE_MONITOR, citacionesMentores, citacionesMonitores, citacionesParticipantes, enModoPrueba, franjas, huella,
  queCambio, TEN_EN_CUENTA_DEFECTO, type DatosDia, type ProyectoDia,
} from "../src/lib/citaciones/contenido";
import { horaCO } from "../src/lib/ciudades";
import { inicioUTC } from "../src/lib/edicion";

// Fase 5 · Paso 27 · Contenido de las citaciones (sin base ni Google).

const DIA = "2026-11-12";
const t = (h: number, m = 0) => inicioUTC(DIA, h, m);
const P = (id: string, nombre: string, ciudad: string, integrantes: ProyectoDia["integrantes"]): ProyectoDia => ({ id, codigo: `C-${id}`, nombre, ciudad, integrantes });

const p1 = P("p1", "Robot Solar", "Cali", [
  { nombre: "Ana Uno", correo: "ana@x.org", celular: "+573001110001" },
  { nombre: "Beto Dos", correo: "beto@x.org", celular: "+573001110002" },
]);
const p2 = P("p2", "App Agua", "Cali", [{ nombre: "Carla Tres", correo: "carla@x.org", celular: "+573001110003" }]);
const p3 = P("p3", "Huerta", "Cartagena", [{ nombre: "Dani Cuatro", correo: "dani@x.org", celular: "+573001110004" }, { nombre: "Eva Cinco", celular: "+573001110005" }]);
const p4 = P("p4", "Juego Río", "Colonia", [{ nombre: "Fito Seis", correo: "fito@x.org", celular: "099111222" }]);
const p5 = P("p5", "Bici", "Cartagena", [{ nombre: "Gabi Siete", correo: "gabi@x.org", celular: "+573001110007" }]);

function datos(cambios: Partial<DatosDia> = {}): DatosDia {
  return {
    dia: DIA,
    bloques: [
      { inicio: t(14), mentorId: "m1", proyecto: p1 },
      { inicio: t(14, 30), mentorId: "m1", proyecto: p2 },
      { inicio: t(15), mentorId: "m1", proyecto: p3 },
      { inicio: t(17), mentorId: "m1", proyecto: p4 },
      { inicio: t(14, 15), mentorId: "m2", proyecto: p5 },
    ],
    plan: [
      { hora: 14, mentorId: "m1", sala: 1, monitor: "mon1" },
      { hora: 15, mentorId: "m1", sala: 2, monitor: "mon2" },
      { hora: 14, mentorId: "m2", sala: 3, monitor: "mon2" },
      { hora: 17, mentorId: "m1", sala: 1, monitor: "mon1" },
    ],
    enlaces: { 1: "https://meet.google.com/sala-uno", 2: "https://meet.google.com/sala-dos", 3: "https://meet.google.com/sala-tres" },
    mentores: { m1: { nombre: "Mentora Uno", correo: "mentora1@x.org", celular: "+573009990001" }, m2: { nombre: "Mentor Dos", celular: "+573009990002" } },
    monitores: { mon1: { nombre: "Monitor Uno", correo: "mon1@x.org", celular: "+573008880001" }, mon2: { nombre: "Monitora Dos", correo: "mon2@x.org" } },
    ...cambios,
  };
}

const CELULARES = ["+57300111000", "099111222"];

describe("franjas", () => {
  it("une bloques con ≤ 30 min entre ellos y separa los demás", () => {
    expect(franjas([{ inicio: t(14) }, { inicio: t(14, 45) }]).length).toBe(1); // 14:15 → 14:45 = 30 min
    expect(franjas([{ inicio: t(14) }, { inicio: t(14, 46) }]).length).toBe(2);
    const [f] = franjas([{ inicio: t(14, 30) }, { inicio: t(14) }]);
    expect(f!.inicio).toEqual(t(14));
    expect(f!.fin).toEqual(t(14, 45));
  });
});

describe("participantes", () => {
  const cs = citacionesParticipantes(datos(), TEN_EN_CUENTA_DEFECTO);
  const de = (id: string) => cs.find((c) => c.clave === id)!;

  it("un evento por proyecto en su bloque exacto, con el título y la descripción exactos y solo sus integrantes", () => {
    expect(cs).toHaveLength(5);
    const c = de("p1"), [e] = c.eventos;
    expect(c.eventos).toHaveLength(1);
    expect(e!.titulo).toBe("Presentación de Proyecto Final · Jóvenes creaTIvos 2026");
    expect(e!.inicio).toEqual(t(14));
    expect(e!.fin).toEqual(t(14, 15));
    expect(e!.ubicacion).toBe("https://meet.google.com/sala-uno");
    expect(e!.invitados.map((i) => i.correo)).toEqual(["ana@x.org", "beto@x.org"]);
    expect(e!.descripcion).toBe([
      "PRESENTACIÓN DE PROYECTO FINAL · Jóvenes creaTIvos 2026",
      "Hola, Ana y Beto:",
      "¡Llegó el momento de presentar tu Proyecto Final!",
      "Fecha: Jueves 12 de noviembre",
      "Hora: 2:00 p. m. a 2:15 p. m. (hora Colombia)",
      "Sala: Sala 1",
      "Enlace de conexión: https://meet.google.com/sala-uno",
      "",
      "Ten en cuenta estas recomendaciones para tu presentación:",
      "• Ingresa a la sala 5 minutos antes de tu hora. Tu monitor te dará acceso.",
      "• Conéctate desde un computador, con cámara, micrófono y conexión estable.",
      "• Ten tu proyecto abierto y listo para compartir antes de ingresar.",
      "• Dispones de 15 minutos para presentar tu proyecto. Organiza previamente lo que vas a mostrar y explicar.",
      "• Si presentas en pareja, ambos deben conectarse y participar.",
      "• Si tienes algún inconveniente antes de tu presentación, comunícate con tu monitor.",
      "",
      "¡Estamos muy emocionados de conocer tu proyecto!",
    ].join("\n"));
    expect(c.bloqueo).toBeUndefined();
  });

  it("sin datos del monitor (ni nombre ni celular); la sala es la de su hora", () => {
    for (const c of cs) {
      expect(c.eventos[0]!.descripcion).not.toMatch(/Monitor Uno|Monitora Dos|\+57300888/);
      expect(c.eventos[0]!.titulo).not.toContain(c.nombre);
    }
    expect(de("p5").eventos[0]!.descripcion).toContain("Sala: Sala 3\nEnlace de conexión: https://meet.google.com/sala-tres");
    expect(de("p2").eventos[0]!.descripcion).toContain("Hola, Carla:");
  });

  it("nunca lleva celulares ni correos (ni de su proyecto ni de otros) en la descripción", () => {
    for (const c of cs) {
      const d = c.eventos[0]!.descripcion;
      for (const cel of CELULARES) expect(d).not.toContain(cel);
      expect(d).not.toMatch(/@x\.org/);
      expect(d).not.toContain("Mentora Uno");
    }
  });

  it("integrante sin correo: se cita a los demás con aviso; nadie con correo: no se puede citar", () => {
    expect(de("p3").eventos[0]!.invitados.map((i) => i.correo)).toEqual(["dani@x.org"]);
    expect(de("p3").avisos.join()).toContain("Eva Cinco no tiene correo");
    const sinCorreo = { ...p2, integrantes: [{ nombre: "Carla Tres" }] };
    const [c] = citacionesParticipantes(datos({ bloques: [{ inicio: t(14, 30), mentorId: "m1", proyecto: sinCorreo }] }), TEN_EN_CUENTA_DEFECTO);
    expect(c!.bloqueo).toBe("Ningún integrante tiene correo.");
  });

  it("Colonia y Paysandú: hora de Colombia y de Uruguay en la misma línea; los demás, solo Colombia", () => {
    expect(de("p4").eventos[0]!.descripcion).toContain("Hora: 5:00 p. m. a 5:15 p. m. (hora Colombia) · 7:00 p. m. a 7:15 p. m. (hora Uruguay)\nSala:");
    const pay = { ...p4, ciudad: "Paysandú" };
    const [c] = citacionesParticipantes(datos({ bloques: [{ inicio: t(8), mentorId: "m1", proyecto: pay }] }), TEN_EN_CUENTA_DEFECTO);
    expect(c!.eventos[0]!.descripcion).toContain("Hora: 8:00 a. m. a 8:15 a. m. (hora Colombia) · 10:00 a. m. a 10:15 a. m. (hora Uruguay)");
    expect(de("p1").eventos[0]!.descripcion).not.toContain("Uruguay");
  });

  it("sin sala o sin enlace no se puede citar", () => {
    const sinPlan = citacionesParticipantes(datos({ plan: [] }), TEN_EN_CUENTA_DEFECTO);
    expect(sinPlan[0]!.bloqueo).toContain("Falta la sala");
    const sinEnlace = citacionesParticipantes(datos({ enlaces: {} }), TEN_EN_CUENTA_DEFECTO);
    expect(sinEnlace[0]!.bloqueo).toContain("Falta el enlace de la Sala 1");
  });

  it("el texto «Ten en cuenta» no puede imitar las líneas de Sala, Enlace u Hora ni meter enlaces sin viñeta", () => {
    const [c] = citacionesParticipantes(datos(), "Sala: Sala 9:\nEnlace de conexión: https://otro.example/x:\nVisita https://otro.example:\nHora: 9:00 a. m.\n•Ya con viñeta\u200b");
    const d = c!.eventos[0]!.descripcion;
    expect(d).toContain("\n• Sala: Sala 9:\n• Enlace de conexión: https://otro.example/x:\n• Visita https://otro.example:\n• Hora: 9:00 a. m.\n• Ya con viñeta\n");
    expect(d.match(/^Sala: /gm)).toEqual(["Sala: "]);
    expect(d.match(/^Enlace de conexión: /gm)).toHaveLength(1);
  });

  it("el enlace de la sala pasa por limpio (sin < > en la descripción ni en la ubicación)", () => {
    const [c] = citacionesParticipantes(datos({ enlaces: { 1: "https://x.co/\"><b>hola", 2: "", 3: "" } }), TEN_EN_CUENTA_DEFECTO);
    expect(c!.eventos[0]!.descripcion).not.toMatch(/[<>]/);
    expect(c!.eventos[0]!.ubicacion).not.toMatch(/[<>]/);
  });

  it("el texto «Ten en cuenta» editado: encabezados (con «:») tal cual, viñeta en lo demás sin duplicarla, y cierre fijo", () => {
    const [c] = citacionesParticipantes(datos(), "Consejos:\nPrimera\n\n  • Segunda  ");
    expect(c!.eventos[0]!.descripcion).toMatch(/\n\nConsejos:\n• Primera\n• Segunda\n\n¡Estamos muy emocionados de conocer tu proyecto!$/);
  });
});

describe("mentores", () => {
  const cs = citacionesMentores(datos());
  const m1 = cs.find((c) => c.clave === "m1")!, m2 = cs.find((c) => c.clave === "m2")!;

  it("un evento por franja; solo el mentor invitado", () => {
    expect(m1.eventos).toHaveLength(2); // 14:00–15:15 y 17:00–17:15
    expect(m1.eventos[0]!.inicio).toEqual(t(14));
    expect(m1.eventos[0]!.fin).toEqual(t(15, 15));
    expect(m1.eventos[1]!.inicio).toEqual(t(17));
    for (const e of m1.eventos) {
      expect(e.titulo).toBe("Calificación de proyectos · Proyecto Final Jóvenes creaTIvos 2026");
      expect(e.invitados).toEqual([{ correo: "mentora1@x.org", nombre: "Mentora Uno" }]);
    }
  });

  it("una sola sala en la franja: descripción exacta y ubicación = enlace", () => {
    expect(m1.eventos[1]!.descripcion).toBe([
      "Hola, Mentora:",
      "Gracias por acompañarnos como mentor en las presentaciones de los Proyectos Finales de Jóvenes creaTIvos 2026.",
      "Esta es tu programación:",
      "Fecha: Jueves 12 de noviembre",
      "Horario: 5:00 p. m. a 5:15 p. m. (hora Colombia)",
      "Sala: Sala 1",
      "Enlace de conexión: https://meet.google.com/sala-uno",
      "Monitor a cargo: Monitor Uno",
      "Celular del monitor: +573008880001",
      "Proyectos asignados para evaluación:",
      "5:00 p. m. · Juego Río",
      "• Participante: Fito Seis",
      "",
      "Recomendaciones:",
      "• Conéctate unos minutos antes del inicio de tu primera evaluación.",
      "• Respeta los tiempos asignados para cada presentación (15 minutos).",
      "• Asegúrate de evaluar cada proyecto según los criterios establecidos.",
      "",
      "¡Gracias por compartir tu experiencia y contribuir al crecimiento de nuestros jóvenes!",
    ].join("\n"));
    expect(m1.eventos[1]!.ubicacion).toBe("https://meet.google.com/sala-uno");
  });

  it("si cambia de sala dentro de la franja: sala, enlace y monitor por tramo y la sala junto a cada proyecto", () => {
    const d = m1.eventos[0]!.descripcion;
    expect(d).toContain("Horario: 2:00 p. m. a 3:15 p. m. (hora Colombia)");
    expect(d).toContain("Sala: Sala 1 (desde las 2:00 p. m.)\nEnlace de conexión: https://meet.google.com/sala-uno\nMonitor a cargo: Monitor Uno\nCelular del monitor: +573008880001");
    expect(d).toContain("Sala: Sala 2 (desde las 3:00 p. m.)\nEnlace de conexión: https://meet.google.com/sala-dos\nMonitor a cargo: Monitora Dos\nCelular del monitor: Sin registrar");
    expect(d).toContain("2:00 p. m. · Robot Solar · Sala 1\n• Participante: Ana Uno\n• Participante: Beto Dos\n2:30 p. m. · App Agua · Sala 1");
    expect(d).toContain("3:00 p. m. · Huerta · Sala 2\n• Participante: Dani Cuatro\n• Participante: Eva Cinco");
    expect(m1.eventos[0]!.ubicacion).toBeUndefined();
  });

  it("nunca lleva contactos de estudiantes", () => {
    for (const e of [...m1.eventos, ...m2.eventos]) {
      for (const cel of CELULARES) expect(e.descripcion).not.toContain(cel);
      expect(e.descripcion).not.toMatch(/(ana|beto|carla|dani|fito|gabi)@x\.org/);
    }
  });

  it("mentor sin correo: no se puede citar", () => {
    expect(m2.bloqueo).toContain("no tiene correo");
    expect(m2.eventos[0]!.invitados).toEqual([]);
  });
});

describe("monitores", () => {
  const cs = citacionesMonitores(datos());
  const mon1 = cs.find((c) => c.clave === "mon1")!, mon2 = cs.find((c) => c.clave === "mon2")!;

  it("un evento por franja de sus salas; solo el monitor invitado; cierre al final", () => {
    expect(mon1.eventos).toHaveLength(2); // 14:00–14:45 y 17:00–17:15
    expect(mon2.eventos).toHaveLength(1); // 14:15 (sala 3) y 15:00 (sala 2): 14:15–15:15
    expect(mon2.eventos[0]!.inicio).toEqual(t(14, 15));
    expect(mon2.eventos[0]!.fin).toEqual(t(15, 15));
    for (const e of [...mon1.eventos, ...mon2.eventos]) {
      expect(e.titulo).toBe("Monitoría de salas · Proyecto Final Jóvenes creaTIvos 2026");
      expect(e.descripcion.endsWith(CIERRE_MONITOR)).toBe(true);
    }
    expect(mon1.eventos[0]!.invitados).toEqual([{ correo: "mon1@x.org", nombre: "Monitor Uno" }]);
  });

  it("descripción exacta: por sala, horario, enlace, mentor con celular y contacto de cada integrante", () => {
    expect(mon1.eventos[0]!.descripcion).toBe([
      "Hola, Monitor:",
      "Esta es tu programación para acompañar las presentaciones de los Proyectos Finales.",
      "Fecha: Jueves 12 de noviembre",
      "Horario asignado: 2:00 p. m. a 2:45 p. m. (hora Colombia)",
      "",
      "SALA 1",
      "Horario: 2:00 p. m. a 2:45 p. m.",
      "Enlace de conexión: https://meet.google.com/sala-uno",
      "Mentor asignado: Mentora Uno",
      "Celular: +573009990001",
      "Participantes:",
      "2:00 p. m. · Robot Solar",
      "• Participante: Ana Uno",
      "• Celular: +573001110001",
      "• Correo: ana@x.org",
      "• Participante: Beto Dos",
      "• Celular: +573001110002",
      "• Correo: beto@x.org",
      "2:30 p. m. · App Agua",
      "• Participante: Carla Tres",
      "• Celular: +573001110003",
      "• Correo: carla@x.org",
      "",
      "Importante:",
      "Asegúrate de estar en la sala antes de iniciar cada presentación y de acompañar el ingreso de los participantes y el mentor.",
      "Las reprogramaciones no se pueden hacer de forma autónoma y deben ser aprobadas. Los casos de calamidad o fuerza mayor deben reportarse a Astrid o Cristian.",
    ].join("\n"));
  });

  it("varias salas en la franja, en orden de hora; sin correo o celular: «Sin registrar»", () => {
    const d = mon2.eventos[0]!.descripcion;
    expect(d.indexOf("SALA 3")).toBeLessThan(d.indexOf("SALA 2"));
    expect(d).toContain("SALA 3\nHorario: 2:15 p. m. a 2:30 p. m.\nEnlace de conexión: https://meet.google.com/sala-tres\nMentor asignado: Mentor Dos\nCelular: +573009990002");
    expect(d).toContain("• Participante: Eva Cinco\n• Celular: +573001110005\n• Correo: Sin registrar");
    expect(d).toContain("Hola, Monitora:");
  });

  it("solo los contactos de los proyectos de sus salas", () => {
    const d1 = mon1.eventos.map((e) => e.descripcion).join("\n"), d2 = mon2.eventos[0]!.descripcion;
    expect(d1).not.toContain("gabi@x.org");
    expect(d1).not.toContain("dani@x.org");
    expect(d2).not.toContain("ana@x.org");
    expect(d2).not.toContain("fito@x.org");
  });

  it("salas sin monitor no generan citación de monitor", () => {
    const sin = citacionesMonitores(datos({ plan: datos().plan.map((p) => ({ ...p, monitor: null })) }));
    expect(sin).toEqual([]);
  });
});

describe("desactualizadas", () => {
  const base = datos();
  const de = (d: DatosDia, id = "p1") => citacionesParticipantes(d, TEN_EN_CUENTA_DEFECTO).find((c) => c.clave === id)!;

  it("igual → misma huella y sin cambios; el texto «Ten en cuenta» no cuenta", () => {
    const a = de(base), b = citacionesParticipantes(datos(), "otro texto").find((c) => c.clave === "p1")!;
    expect(a.huella).toBe(b.huella);
    expect(queCambio(a.resumen, b.resumen)).toEqual([]);
  });

  it("detecta hora, sala, enlace, mentor y monitor", () => {
    const a = de(base);
    const hora = de(datos({ bloques: base.bloques.map((b) => (b.proyecto.id === "p1" ? { ...b, inicio: t(14, 15) } : b)) }));
    expect(queCambio(a.resumen, hora.resumen)).toEqual(["la hora"]);
    const sala = de(datos({ plan: base.plan.map((p) => (p.hora === 14 && p.mentorId === "m1" ? { ...p, sala: 2 } : p)) }));
    expect(queCambio(a.resumen, sala.resumen)).toEqual(["la sala", "el enlace"]);
    const monitor = de(datos({ plan: base.plan.map((p) => (p.hora === 14 && p.mentorId === "m1" ? { ...p, monitor: "mon2" } : p)) }));
    // El participante no ve al monitor: no se desactualiza. El mentor sí lo ve.
    expect(queCambio(a.resumen, monitor.resumen)).toEqual([]);
    expect(monitor.huella).toBe(a.huella);
    const mA = citacionesMentores(base).find((c) => c.clave === "m1")!;
    const mB = citacionesMentores(datos({ plan: base.plan.map((p) => (p.hora === 14 && p.mentorId === "m1" ? { ...p, monitor: "mon2" } : p)) })).find((c) => c.clave === "m1")!;
    expect(queCambio(mA.resumen, mB.resumen)).toEqual(["el monitor"]);
    const mentor = de(datos({ bloques: base.bloques.map((b) => (b.proyecto.id === "p1" ? { ...b, mentorId: "m2" } : b)) }));
    expect(queCambio(a.resumen, mentor.resumen)).toContain("el mentor");
  });

  it("mentor: un proyecto nuevo en su franja cambia «los proyectos»", () => {
    const a = citacionesMentores(base).find((c) => c.clave === "m1")!;
    const nuevo = P("p9", "Nuevo", "Cali", [{ nombre: "Hugo", correo: "hugo@x.org" }]);
    const b = citacionesMentores(datos({ bloques: [...base.bloques, { inicio: t(14, 15), mentorId: "m1", proyecto: nuevo }] })).find((c) => c.clave === "m1")!;
    expect(queCambio(a.resumen, b.resumen)).toContain("los proyectos");
    expect(huella(a.resumen)).toBe(a.huella);
  });

  it("el resumen no guarda contactos (ni celulares ni correos), pero detecta un cambio de invitados", () => {
    const todo = JSON.stringify([...citacionesParticipantes(base, ""), ...citacionesMentores(base), ...citacionesMonitores(base)].map((c) => c.resumen));
    for (const cel of CELULARES) expect(todo).not.toContain(cel);
    expect(todo).not.toContain("@");
    const a = de(base);
    const otro = de(datos({ bloques: base.bloques.map((b) => (b.proyecto.id === "p1" ? { ...b, proyecto: { ...p1, integrantes: [p1.integrantes[0]!, { ...p1.integrantes[1]!, correo: "beto.nuevo@x.org" }] } } : b)) }));
    expect(queCambio(a.resumen, otro.resumen)).toEqual(["los invitados"]);
  });

  it("nombres con saltos de línea o etiquetas no inventan líneas ni HTML en el evento", () => {
    const raro = { ...p2, nombre: "App\nSala 9: https://malo.example\n<a href=x>clic</a>", integrantes: [{ nombre: "Carla\nSala: 9 <b>", correo: "carla@x.org" }] };
    const d = datos({ bloques: [{ inicio: t(14, 30), mentorId: "m1", proyecto: raro }] });
    const e = citacionesParticipantes(d, TEN_EN_CUENTA_DEFECTO)[0]!.eventos[0]!;
    const em = citacionesMentores(d)[0]!.eventos[0]!;
    expect(em.descripcion).toContain("2:30 p. m. · App Sala 9: https://malo.example a href=x clic /a\n• Participante: Carla Sala: 9 b");
    for (const x of [e, em]) {
      expect(x.descripcion).not.toMatch(/^Sala 9/m);
      expect(x.descripcion).not.toMatch(/^Sala: 9/m);
      expect(x.descripcion).not.toContain("<");
    }
    expect(e.descripcion).toContain("Hola, Carla:");
  });
});

describe("modo prueba", () => {
  it("todo va solo al correo de prueba y el título empieza con [PRUEBA]", () => {
    const e = citacionesParticipantes(datos(), TEN_EN_CUENTA_DEFECTO)[0]!.eventos[0]!;
    const p = enModoPrueba(e, "yo@tocaunavida.org");
    expect(p.titulo).toBe("[PRUEBA] Presentación de Proyecto Final · Jóvenes creaTIvos 2026");
    expect(p.invitados).toEqual([{ correo: "yo@tocaunavida.org", nombre: "Prueba" }]);
    expect(p.descripcion).toMatch(/^MODO PRUEBA · Invitados reales \(no se les envió\): ana@x\.org, beto@x\.org/);
  });
});

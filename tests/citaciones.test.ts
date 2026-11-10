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

  it("un evento por proyecto en su bloque exacto, con título, sala como ubicación y solo sus integrantes", () => {
    expect(cs).toHaveLength(5);
    const c = de("p1"), [e] = c.eventos;
    expect(c.eventos).toHaveLength(1);
    expect(e!.titulo).toBe("Proyecto Final JC 2026 · Presentación de Robot Solar");
    expect(e!.inicio).toEqual(t(14));
    expect(e!.fin).toEqual(t(14, 15));
    expect(e!.ubicacion).toBe("https://meet.google.com/sala-uno");
    expect(e!.invitados.map((i) => i.correo)).toEqual(["ana@x.org", "beto@x.org"]);
    expect(e!.descripcion).toContain("jueves 12 de noviembre");
    expect(e!.descripcion).toContain(`${horaCO(t(14))} a ${horaCO(t(14, 15))} (hora de Colombia)`);
    expect(e!.descripcion).toContain("Sala 1: https://meet.google.com/sala-uno");
    expect(e!.descripcion).toContain("Monitor a cargo: Monitor Uno");
    expect(e!.descripcion).toContain("Ten en cuenta para tu presentación:");
    expect(e!.descripcion).toContain("• Entra a la sala 5 minutos antes de tu hora. Tu monitor te admitirá.");
    expect(c.bloqueo).toBeUndefined();
  });

  it("el monitor a cargo es el de la sala en esa hora", () => {
    expect(de("p3").eventos[0]!.descripcion).toContain("Monitor a cargo: Monitora Dos");
    expect(de("p5").eventos[0]!.descripcion).toContain("Sala 3:");
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

  it("Uruguay: también la hora de Uruguay", () => {
    expect(de("p4").eventos[0]!.descripcion).toContain("(hora de Uruguay)");
    expect(de("p1").eventos[0]!.descripcion).not.toContain("Uruguay");
  });

  it("sin sala o sin enlace no se puede citar", () => {
    const sinPlan = citacionesParticipantes(datos({ plan: [] }), TEN_EN_CUENTA_DEFECTO);
    expect(sinPlan[0]!.bloqueo).toContain("Falta la sala");
    const sinEnlace = citacionesParticipantes(datos({ enlaces: {} }), TEN_EN_CUENTA_DEFECTO);
    expect(sinEnlace[0]!.bloqueo).toContain("Falta el enlace de la Sala 1");
  });

  it("el texto «Ten en cuenta» editado sale tal cual, una viñeta por línea", () => {
    const [c] = citacionesParticipantes(datos(), "Primera\n\n  Segunda  ");
    expect(c!.eventos[0]!.descripcion).toMatch(/• Primera\n• Segunda$/);
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
      expect(e.titulo).toBe("Proyecto Final JC 2026 · Calificación de proyectos");
      expect(e.invitados).toEqual([{ correo: "mentora1@x.org", nombre: "Mentora Uno" }]);
    }
  });

  it("proyectos con hora, nombre e integrantes (solo nombres); cambio de sala y monitor por hora", () => {
    const d = m1.eventos[0]!.descripcion;
    expect(d).toContain(`• ${horaCO(t(14))} · Robot Solar · Ana Uno y Beto Dos`);
    expect(d).toContain(`• ${horaCO(t(15))} · Huerta · Dani Cuatro y Eva Cinco`);
    expect(d).toContain("Sala y monitor por hora:");
    expect(d).toContain(`Desde las ${horaCO(t(14))}: Sala 1 (https://meet.google.com/sala-uno) · Monitor: Monitor Uno · Celular: +573008880001`);
    expect(d).toContain(`Desde las ${horaCO(t(15))}: Sala 2 (https://meet.google.com/sala-dos) · Monitor: Monitora Dos · Celular: sin registrar`);
    // Una sola sala y monitor en la franja: cabecera simple y ubicación = enlace.
    expect(m1.eventos[1]!.descripcion).toContain("Sala 1: https://meet.google.com/sala-uno\nMonitor: Monitor Uno · Celular: +573008880001");
    expect(m1.eventos[1]!.ubicacion).toBe("https://meet.google.com/sala-uno");
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
      expect(e.titulo).toBe("Proyecto Final JC 2026 · Monitoría de salas");
      expect(e.descripcion.endsWith(CIERRE_MONITOR)).toBe(true);
    }
    expect(mon1.eventos[0]!.invitados).toEqual([{ correo: "mon1@x.org", nombre: "Monitor Uno" }]);
  });

  it("por sala y hora: enlace, mentor con celular y, por proyecto, contacto de cada integrante", () => {
    const d = mon1.eventos[0]!.descripcion;
    expect(d).toContain(`Sala 1 · ${horaCO(t(14))} a ${horaCO(t(14, 45))}`);
    expect(d).toContain("Enlace: https://meet.google.com/sala-uno");
    expect(d).toContain("Mentor: Mentora Uno · Celular: +573009990001");
    expect(d).toContain("Ana Uno · Celular: +573001110001 · Correo: ana@x.org");
    expect(d).toContain("Carla Tres · Celular: +573001110003 · Correo: carla@x.org");
    expect(mon2.eventos[0]!.descripcion).toContain("Eva Cinco · Celular: +573001110005 · Correo: sin registrar");
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
    expect(queCambio(a.resumen, monitor.resumen)).toEqual(["el monitor"]);
    expect(monitor.huella).not.toBe(a.huella);
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
    const raro = { ...p2, nombre: "App\nSala 9: https://malo.example\n<a href=x>clic</a>" };
    const [c] = citacionesParticipantes(datos({ bloques: [{ inicio: t(14, 30), mentorId: "m1", proyecto: raro }] }), TEN_EN_CUENTA_DEFECTO);
    const e = c!.eventos[0]!;
    expect(e.titulo).toBe("Proyecto Final JC 2026 · Presentación de App Sala 9: https://malo.example a href=x clic /a");
    expect(e.descripcion).not.toMatch(/^Sala 9/m);
    expect(e.descripcion).not.toContain("<");
  });
});

describe("modo prueba", () => {
  it("todo va solo al correo de prueba y el título empieza con [PRUEBA]", () => {
    const e = citacionesParticipantes(datos(), TEN_EN_CUENTA_DEFECTO)[0]!.eventos[0]!;
    const p = enModoPrueba(e, "yo@tocaunavida.org");
    expect(p.titulo).toBe("[PRUEBA] Proyecto Final JC 2026 · Presentación de Robot Solar");
    expect(p.invitados).toEqual([{ correo: "yo@tocaunavida.org", nombre: "Prueba" }]);
    expect(p.descripcion).toMatch(/^MODO PRUEBA · Invitados reales \(no se les envió\): ana@x\.org, beto@x\.org/);
  });
});

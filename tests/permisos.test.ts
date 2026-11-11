import { ObjectId } from "mongodb";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { etiquetaRoles, inicioPorRol, puede, rolesDe, ROLES, type Permiso } from "@/lib/permisos";

// Se prueba el camino real de autorización (cookie firmada → getCurrentUser → exigir) contra los route handlers.
// Solo se simulan la cookie (next/headers) y la base: si un permiso fallara, la ruta intentaría usar
// la base de verdad y la prueba no devolvería 403.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", usuario: null as Record<string, unknown> | null };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }),
}));

const prohibido = () => { throw new Error("La ruta llegó a la base sin permiso"); };
vi.mock("@/lib/db", () => ({
  collections: async () => ({
    users: { findOne: async () => estado.usuario, find: prohibido, insertOne: prohibido, updateOne: prohibido, findOneAndUpdate: prohibido },
    changeLog: new Proxy({}, { get: () => prohibido }),
    rateLimits: new Proxy({}, { get: () => prohibido }),
  }),
}));

async function como(rol: "mentor" | "monitor" | "coordinador" | "admin", rolesExtra?: string[]) {
  const { createToken } = await import("@/lib/auth");
  const _id = new ObjectId();
  estado.usuario = { _id, usuario: `prueba-${rol}`, nombre: "Usuario Prueba", rol, ciudades: rol === "monitor" ? ["Cali"] : [], ...(rol === "mentor" ? { mentorId: "mentor-prueba" } : {}), ...(rolesExtra ? { rolesExtra } : {}), activo: true, tokenVersion: 0 };
  estado.token = createToken(_id.toHexString(), 0);
}

const ID = new ObjectId().toHexString();
const ctx = { params: Promise.resolve({ id: ID }) };
const json = (method: string, body: unknown) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Rutas que solo administración puede usar.
const soloAdmin: [string, () => Promise<Response>][] = [
  ["ver usuarios", async () => (await import("@/app/api/admin/usuarios/route")).GET()],
  ["crear usuario", async () => (await import("@/app/api/admin/usuarios/route")).POST(json("POST", { usuario: "nuevo", nombre: "Nuevo Usuario", rol: "monitor", ciudades: ["Cali"] }))],
  ["editar usuario", async () => (await import("@/app/api/admin/usuarios/[id]/route")).PATCH(json("PATCH", { rol: "admin" }), ctx)],
  ["restablecer clave", async () => (await import("@/app/api/admin/usuarios/[id]/clave/route")).POST(json("POST", {}), ctx)],
  ["ver el plan de salas", async () => (await import("@/app/api/admin/salas/route")).GET()],
  ["cambiar el monitor de una sala", async () => (await import("@/app/api/admin/salas/route")).POST(json("POST", { accion: "monitor", id: "2026-11-12|8|1", monitor: null }))],
  ["recalcular el plan de salas", async () => (await import("@/app/api/admin/salas/route")).POST(json("POST", { accion: "recalcular" }))],
  ["descargar el plan de salas", async () => (await import("@/app/api/admin/salas/excel/route")).GET()],
  ["ver la bandeja de cambios sugeridos", async () => (await import("@/app/api/admin/sugerencias/route")).GET(new Request("http://localhost/x"))],
  ["ver cuántas sugerencias hay", async () => (await import("@/app/api/admin/sugerencias/conteo/route")).GET()],
  ["aprobar una sugerencia", async () => (await import("@/app/api/admin/sugerencias/[id]/route")).POST(json("POST", { accion: "aprobar", inicio: "2026-11-12T13:00:00.000Z" }), ctx)],
  ["rechazar una sugerencia", async () => (await import("@/app/api/admin/sugerencias/[id]/route")).POST(json("POST", { accion: "rechazar", motivo: "No hay cupo" }), ctx)],
  ["cambiar la hora (Horarios o tablero)", async () => (await import("@/app/api/admin/proyectos/[id]/route")).POST(json("POST", { accion: "cambiar", inicio: "2026-11-12T13:00:00.000Z" }), ctx)],
  ["cambiar el mentor desde el tablero", async () => (await import("@/app/api/admin/proyectos/[id]/route")).POST(json("POST", { accion: "cambiar", inicio: "2026-11-12T13:00:00.000Z", asiento: ID }), ctx)],
  ["anular una evaluación", async () => (await import("@/app/api/admin/proyectos/[id]/route")).POST(json("POST", { accion: "anular", motivo: "Error de mentor" }), ctx)],
  ["aplicar una propuesta de carga de mentores (Paso 24)", async () => (await import("@/app/api/admin/carga-mentores/route")).POST(json("POST", { accion: "aplicar", proyecto: ID, desde: ID, hacia: ID }))],
  ["revertir un cambio del estudiante (Paso 23)", async () => (await import("@/app/api/admin/proyectos/[id]/route")).POST(json("POST", { accion: "revertir", cambio: ID }), ctx)],
  ["liberar una hora", async () => (await import("@/app/api/admin/proyectos/[id]/route")).POST(json("POST", { accion: "liberar" }), ctx)],
  ["ver las reglas de cupos", async () => (await import("@/app/api/admin/reglas/route")).GET()],
  ["aplicar reglas de cupos", async () => (await import("@/app/api/admin/reglas/route")).POST(json("POST", { accion: "aplicar", dia: "2026-11-12", ciudades: [] }))],
  ["guardar el cierre de inscripciones", async () => (await import("@/app/api/admin/reglas/cierre/route")).POST(json("POST", { horasAntes: 24, porCiudad: {} }))],
  ["ver las citaciones (Paso 29)", async () => (await import("@/app/api/admin/citaciones/route")).GET(new Request("http://localhost/x?dia=2026-11-12&tipo=participante"))],
  ["ver la vista previa de una citación", async () => (await import("@/app/api/admin/citaciones/previa/route")).GET(new Request("http://localhost/x?dia=2026-11-12&tipo=participante&clave=abc"))],
  ["citar por Google Calendar", async () => (await import("@/app/api/admin/citaciones/acciones/route")).POST(json("POST", { accion: "citar", tipo: "participante", dia: "2026-11-12", claves: ["abc"] }))],
  ["marcar todos como citados", async () => (await import("@/app/api/admin/citaciones/acciones/route")).POST(json("POST", { accion: "marcar_todos", tipo: "mentor", dia: "2026-11-12" }))],
  ["editar el texto «Ten en cuenta»", async () => (await import("@/app/api/admin/citaciones/texto/route")).POST(json("POST", { texto: "Llega a tiempo" }))],
  ["cargar usuarios por Excel", async () => (await import("@/app/api/admin/usuarios/importar/route")).POST(new Request("http://localhost/x", { method: "POST", body: new FormData() }))],
  ["cambiar roles adicionales (Paso 26)", async () => (await import("@/app/api/admin/usuarios/[id]/roles/route")).POST(json("POST", { rolesExtra: ["coordinador"] }), ctx)],
  ["ver mentores libres de un bloque (Paso 25)", async () => (await import("@/app/api/admin/proyectos/[id]/mentores/route")).GET(new Request("http://localhost/x"), ctx)],
];

// Escribir una evaluación: solo el mentor (coordinación y admin solo leen).
const soloMentor: [string, () => Promise<Response>][] = [
  ["guardar una evaluación", async () => (await import("@/app/api/evaluacion/proyectos/[id]/route")).POST(json("POST", { accion: "presente", i: 0 }), ctx)],
  ["guardar un borrador", async () => (await import("@/app/api/evaluacion/proyectos/[id]/route")).POST(json("POST", { accion: "borrador", formulario: {} }), ctx)],
];
// Ver evaluaciones: el mentor (las suyas), coordinación y admin; el monitor no.
const verEvaluaciones: [string, () => Promise<Response>][] = [
  ["ver la lista de evaluaciones", async () => (await import("@/app/api/evaluacion/proyectos/route")).GET(new Request("http://localhost/x"))],
  ["ver una evaluación", async () => (await import("@/app/api/evaluacion/proyectos/[id]/route")).GET(new Request("http://localhost/x"), ctx)],
];

// Mis salas (presentaciones): solo el monitor, y dentro solo los proyectos de sus salas (pruebas con base).
const soloMonitor: [string, () => Promise<Response>][] = [
  ["ver sus salas", async () => (await import("@/app/api/evaluacion/salas/route")).GET(new Request("http://localhost/x"))],
  ["ver la ficha de un proyecto de sala", async () => (await import("@/app/api/evaluacion/salas/[id]/route")).GET(new Request("http://localhost/x"), ctx)],
  ["anotar asistencia", async () => (await import("@/app/api/evaluacion/salas/[id]/route")).POST(json("POST", { accion: "anotar", i: 0, asistencia: "no", motivo: "Salud", observacion: "" }), ctx)],
  ["reprogramar desde la sala", async () => (await import("@/app/api/evaluacion/salas/[id]/route")).POST(json("POST", { accion: "reprogramar", asiento: ID, motivo: "Cita médica" }), ctx)],
  ["sugerir un cambio especial", async () => (await import("@/app/api/evaluacion/salas/[id]/route")).POST(json("POST", { accion: "sugerir", detalle: "Otro día", motivo: "Viaja" }), ctx)],
  ["ver cupos para reprogramar", async () => (await import("@/app/api/evaluacion/salas/[id]/cupos/route")).GET(new Request("http://localhost/x"), ctx)],
];
// Paso 22: comentarios de seguimiento. Escriben monitor, coordinación y admin; el mentor no (ni lee).
const comentar: [string, () => Promise<Response>][] = [
  ["escribir un comentario", async () => (await import("@/app/api/monitor/proyectos/[id]/comentarios/route")).POST(json("POST", { accion: "crear", texto: "Hola" }), ctx)],
  ["editar un comentario", async () => (await import("@/app/api/monitor/proyectos/[id]/comentarios/route")).POST(json("POST", { accion: "editar", comentario: ID, texto: "Hola" }), ctx)],
  ["borrar un comentario", async () => (await import("@/app/api/monitor/proyectos/[id]/comentarios/route")).POST(json("POST", { accion: "borrar", comentario: ID }), ctx)],
  ["leer los comentarios", async () => (await import("@/app/api/monitor/proyectos/[id]/comentarios/route")).GET(new Request("http://localhost/x"), ctx)],
];

// Seguimiento general, Excel de resultados y criterios: coordinación y admin.
const soloCoordinacion: [string, () => Promise<Response>][] = [
  ["ver el seguimiento general", async () => (await import("@/app/api/evaluacion/seguimiento/route")).GET(new Request("http://localhost/x"))],
  ["descargar el Excel de resultados", async () => (await import("@/app/api/evaluacion/seguimiento/excel/route")).GET(new Request("http://localhost/x"))],
  ["guardar los criterios", async () => (await import("@/app/api/evaluacion/criterios/route")).POST(json("POST", { exA: 0.9, exB: 3 }))],
  // Paso 24: carga de los mentores (solo lectura) y su Excel.
  ["ver la carga de los mentores", async () => (await import("@/app/api/admin/carga-mentores/route")).GET(new Request("http://localhost/x"))],
  ["descargar la carga de los mentores", async () => (await import("@/app/api/admin/carga-mentores/excel/route")).GET()],
];

describe("matriz de permisos", () => {
  const tabla: Record<Permiso, [boolean, boolean, boolean, boolean]> = {
    // [mentor, monitor, coordinador, admin]
    ver_seguimiento: [false, true, true, true],
    ver_todas_las_ciudades: [false, false, true, true],
    ver_resumen: [false, false, true, true],
    descargar_excel: [false, false, true, true],
    importar: [false, false, false, true],
    gestionar_usuarios: [false, false, false, true],
    cambiar_horario: [false, false, false, true],
    evaluar: [true, false, false, false],
    ver_evaluaciones: [false, false, true, true],
    monitorear_salas: [false, true, false, false],
    editar_criterios: [false, false, true, true],
    comentar_proyectos: [false, true, true, true],
    citar: [false, false, false, true],
    descargar_datos_personales: [false, false, false, true],
  };
  for (const [permiso, esperado] of Object.entries(tabla))
    it(permiso, () => expect(ROLES.map((r) => puede(r, permiso as Permiso))).toEqual(esperado));
  it("un rol desconocido no tiene permisos", () => expect(puede("intruso", "ver_resumen")).toBe(false));
});

describe("el coordinador recibe 403", () => {
  beforeAll(() => como("coordinador"));
  for (const [nombre, llamar] of soloAdmin) it(`al ${nombre}`, async () => expect((await llamar()).status).toBe(403));
});

describe("el monitor recibe 403", () => {
  beforeAll(() => como("monitor"));
  for (const [nombre, llamar] of [...soloAdmin, ...soloMentor, ...verEvaluaciones]) it(`al ${nombre}`, async () => expect((await llamar()).status).toBe(403));
});

describe("el mentor recibe 403", () => {
  beforeAll(() => como("mentor"));
  const seguimiento: [string, () => Promise<Response>] = ["ver el seguimiento", async () => (await import("@/app/api/monitor/seguimiento/route")).GET()];
  for (const [nombre, llamar] of [...soloAdmin, seguimiento, ...soloMonitor, ...comentar]) it(`al ${nombre}`, async () => expect((await llamar()).status).toBe(403));
});

describe("coordinación y admin no escriben evaluaciones", () => {
  for (const rol of ["coordinador", "admin"] as const)
    for (const [nombre, llamar] of soloMentor) it(`${rol}: 403 al ${nombre}`, async () => { await como(rol); expect((await llamar()).status).toBe(403); });
});

describe("Comentarios (Paso 22): origen, validación y lectura", () => {
  const ruta = () => import("@/app/api/monitor/proyectos/[id]/comentarios/route");
  it("403 desde otro origen aunque sea el monitor; 400 con campos de más, acción desconocida o id inválido", async () => {
    await como("monitor");
    const req = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify({ accion: "crear", texto: "Hola" }) });
    const res = await (await ruta()).POST(req, ctx);
    expect([res.status, (await res.json()).error]).toEqual([403, "origen"]);
    for (const body of [{ accion: "crear", texto: "Hola", otro: 1 }, { accion: "publicar", texto: "Hola" }, { accion: "borrar", comentario: "abc" }, { accion: "crear", texto: "x".repeat(2001) }])
      expect((await (await ruta()).POST(json("POST", body), ctx)).status).toBe(400);
    expect((await (await ruta()).POST(json("POST", { accion: "crear", texto: "Hola" }), { params: Promise.resolve({ id: "no-es-id" }) })).status).toBe(400);
  });
  it("leer: el mentor recibe 403 y sin sesión 401", async () => {
    await como("mentor");
    expect((await (await ruta()).GET(new Request("http://localhost/x"), ctx)).status).toBe(403);
    estado.token = ""; estado.usuario = null;
    expect((await (await ruta()).GET(new Request("http://localhost/x"), ctx)).status).toBe(401);
  });
});

describe("Carga de mentores (Paso 24): aplicar desde otro origen o con datos de más", () => {
  it("403 desde otro origen aunque sea admin; 400 con campos de más o ids inválidos", async () => {
    await como("admin");
    const ruta = await import("@/app/api/admin/carga-mentores/route");
    const otro = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify({ accion: "aplicar", proyecto: ID, desde: ID, hacia: ID }) });
    expect([(await ruta.POST(otro)).status]).toEqual([403]);
    for (const body of [{ accion: "aplicar", proyecto: ID, desde: ID, hacia: ID, inicio: "2026-11-12T13:00:00Z" }, { accion: "aplicar", proyecto: "x", desde: ID, hacia: ID }, { accion: "mover", proyecto: ID, desde: ID, hacia: ID }])
      expect((await ruta.POST(json("POST", body))).status).toBe(400);
    expect((await ruta.POST(json("POST", { accion: "aplicar", proyecto: ID, desde: ID, hacia: ID, relleno: "x".repeat(2000) }))).status).toBe(413);
  });
});

describe("Mis salas: POST desde otro origen", () => {
  it("403 aunque sea el monitor", async () => {
    await como("monitor");
    const req = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify({ accion: "anotar", i: 0, asistencia: "si", motivo: null, observacion: "" }) });
    const res = await (await import("@/app/api/evaluacion/salas/[id]/route")).POST(req, ctx);
    expect([res.status, (await res.json()).error]).toEqual([403, "origen"]);
  });
});

describe("Usuarios por Excel: POST desde otro origen", () => {
  it("403 aunque sea admin", async () => {
    await como("admin");
    const res = await (await import("@/app/api/admin/usuarios/importar/route")).POST(new Request("http://localhost/x", { method: "POST", headers: { Origin: "https://otro.test", Host: "localhost" }, body: new FormData() }));
    expect([res.status, (await res.json()).error]).toEqual([403, "origen"]);
  });
});

describe("Bandeja: POST desde otro origen", () => {
  it("403 aunque sea admin", async () => {
    await como("admin");
    const req = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify({ accion: "rechazar", motivo: "No hay cupo" }) });
    const res = await (await import("@/app/api/admin/sugerencias/[id]/route")).POST(req, ctx);
    expect([res.status, (await res.json()).error]).toEqual([403, "origen"]);
  });
});

describe("mentor y monitor no ven el tablero de horarios", () => {
  for (const rol of ["mentor", "monitor"] as const)
    it(`${rol}: 403`, async () => { await como(rol); expect((await (await import("@/app/api/admin/tablero/route")).GET(new Request("http://localhost/x"))).status).toBe(403); });
});

describe("mentor y monitor no ven el seguimiento general ni cambian criterios", () => {
  for (const rol of ["mentor", "monitor"] as const)
    for (const [nombre, llamar] of soloCoordinacion) it(`${rol}: 403 al ${nombre}`, async () => { await como(rol); expect((await llamar()).status).toBe(403); });
});

describe("Criterios: POST desde otro origen y validación", () => {
  it("403 desde otro origen aunque sea coordinación", async () => {
    await como("coordinador");
    const req = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify({ exA: 0.9, exB: 3 }) });
    const res = await (await import("@/app/api/evaluacion/criterios/route")).POST(req);
    expect([res.status, (await res.json()).error]).toEqual([403, "origen"]);
  });
  it("criterios y filtro inválidos: 400 antes de tocar la base", async () => {
    await como("coordinador");
    const { POST } = await import("@/app/api/evaluacion/criterios/route");
    for (const body of [{ exA: 1.2, exB: 3 }, { exA: -0.1, exB: 3 }, { exA: 0.9, exB: 5 }, { exA: "0.9", exB: 3 }, { exA: 0.9, exB: 3, otro: 1 }])
      expect((await POST(json("POST", body))).status).toBe(400);
    expect((await POST(new Request("http://localhost/x", { method: "POST", body: "no es json" }))).status).toBe(400);
    const { GET } = await import("@/app/api/evaluacion/seguimiento/route");
    for (const q of ["dia=12-11-2026", "ciudad=Narnia", "dia=2026-11-12&otro=1"])
      expect((await GET(new Request(`http://localhost/x?${q}`))).status).toBe(400);
  });
});

describe("Anular evaluación: motivo obligatorio y origen", () => {
  it("400 sin motivo, vacío, corto, largo o con campos de más; 403 desde otro origen", async () => {
    await como("admin");
    const { POST } = await import("@/app/api/admin/proyectos/[id]/route");
    for (const body of [{ accion: "anular" }, { accion: "anular", motivo: "" }, { accion: "anular", motivo: "   " }, { accion: "anular", motivo: "ab" }, { accion: "anular", motivo: "x".repeat(301) }, { accion: "anular", motivo: "Error de mentor", otro: 1 }])
      expect((await POST(json("POST", body), ctx)).status).toBe(400);
    const req = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify({ accion: "anular", motivo: "Error de mentor" }) });
    expect((await POST(req, ctx)).status).toBe(403);
  });
});

describe("Reglas y cierre: origen y validación", () => {
  it("403 desde otro origen; 400 con datos inválidos", async () => {
    await como("admin");
    const otro = (body: unknown) => new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify(body) });
    const reglas = await import("@/app/api/admin/reglas/route"), cierre = await import("@/app/api/admin/reglas/cierre/route");
    expect((await reglas.POST(otro({ accion: "previa", dia: "2026-11-12", ciudades: [] }))).status).toBe(403);
    expect((await cierre.POST(otro({ horasAntes: 24, porCiudad: {} }))).status).toBe(403);
    for (const body of [{ accion: "previa", dia: "12-11-2026", ciudades: [] }, { accion: "borrar", dia: "2026-11-12", ciudades: [] }, { accion: "previa", dia: "2026-11-12", ciudades: [{ ciudad: "Narnia", minimo: 1, maximo: null, sobrante: false, abre: null }] }, { accion: "previa", dia: "2026-11-12", ciudades: [], otro: 1 }])
      expect((await reglas.POST(json("POST", body))).status).toBe(400);
    for (const body of [{ horasAntes: -1, porCiudad: {} }, { horasAntes: "24", porCiudad: {} }, { horasAntes: 24, porCiudad: { Cali: "mañana" } }, { horasAntes: 24, porCiudad: { Narnia: null } }])
      expect((await cierre.POST(json("POST", body))).status).toBe(400);
  });
});

describe("coordinación y admin no entran a Mis salas", () => {
  for (const rol of ["coordinador", "admin"] as const)
    for (const [nombre, llamar] of soloMonitor) it(`${rol}: 403 al ${nombre}`, async () => { await como(rol); expect((await llamar()).status).toBe(403); });
});

describe("sin sesión", () => {
  beforeAll(() => { estado.token = ""; estado.usuario = null; });
  for (const [nombre, llamar] of [...soloAdmin, ...soloMentor, ...verEvaluaciones, ...soloMonitor, ...soloCoordinacion, ...comentar]) it(`401 al ${nombre}`, async () => expect((await llamar()).status).toBe(401));
});

describe("sesión con clave restablecida", () => {
  it("una cookie con versión vieja ya no sirve", async () => {
    await como("admin");
    estado.usuario = { ...estado.usuario!, tokenVersion: 1 }; // se restableció la clave después de emitir la cookie
    const { getCurrentUser } = await import("@/lib/auth");
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("Paso 26 · un usuario con varios roles", () => {
  const todos = Object.keys({ ver_seguimiento: 1, ver_todas_las_ciudades: 1, ver_resumen: 1, descargar_excel: 1, importar: 1, gestionar_usuarios: 1, cambiar_horario: 1, evaluar: 1, ver_evaluaciones: 1, monitorear_salas: 1, editar_criterios: 1, comentar_proyectos: 1, citar: 1, descargar_datos_personales: 1 }) as Permiso[];

  it("sus permisos son la suma de sus roles, sin ninguno de administración", () => {
    const k = { rol: "monitor", rolesExtra: ["coordinador"] };
    for (const p of todos) expect(puede(k, p), p).toBe(puede("monitor", p) || puede("coordinador", p));
    for (const p of ["importar", "gestionar_usuarios", "cambiar_horario", "citar", "descargar_datos_personales"] as Permiso[]) expect(puede(k, p), p).toBe(false);
    expect(etiquetaRoles({ ...k, ciudades: ["Panamá"] })).toBe("Monitor · Panamá + Coordinación");
    expect(inicioPorRol(k)).toBe("/admin");
  });

  it("un monitor sin roles extra (o con la lista vacía) tiene exactamente lo de hoy", () => {
    for (const u of [{ rol: "monitor" }, { rol: "monitor", rolesExtra: [] }])
      for (const p of todos) expect(puede(u, p), p).toBe(puede("monitor", p));
    expect(inicioPorRol({ rol: "monitor" })).toBe("/monitor");
  });

  it("«admin» o un rol desconocido como adicional no dan nada", () => {
    expect(rolesDe({ rol: "monitor", rolesExtra: ["admin", "intruso", "monitor"] })).toEqual(["monitor"]);
    for (const p of todos) expect(puede({ rol: "monitor", rolesExtra: ["admin"] }, p), p).toBe(puede("monitor", p));
  });

  describe("monitor + coordinación recibe 403 en todo lo de administración", () => {
    beforeAll(() => como("monitor", ["coordinador"]));
    for (const [nombre, llamar] of soloAdmin) it(`al ${nombre}`, async () => expect((await llamar()).status).toBe(403));
  });

  it("quitar el rol adicional le quita el acceso en la petición siguiente", async () => {
    const { exigir } = await import("@/lib/auth");
    await como("monitor", ["coordinador"]);
    expect((await exigir("ver_resumen")).error).toBeUndefined();
    estado.usuario = { ...estado.usuario!, rolesExtra: [] }; // el admin se lo quitó (la sesión se relee en cada petición)
    expect((await exigir("ver_resumen")).error?.status).toBe(403);
    expect((await exigir("ver_seguimiento")).error).toBeUndefined(); // sigue siendo monitor
  });

  it("cambiar roles: 403 desde otro origen aunque sea admin; 400 con «admin», un rol desconocido o campos de más", async () => {
    await como("admin");
    const ruta = await import("@/app/api/admin/usuarios/[id]/roles/route");
    const otro = new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://otro.test", Host: "localhost" }, body: JSON.stringify({ rolesExtra: ["coordinador"] }) });
    const res = await ruta.POST(otro, ctx);
    expect([res.status, (await res.json()).error]).toEqual([403, "origen"]);
    for (const body of [{ rolesExtra: ["admin"] }, { rolesExtra: ["jefe"] }, { rolesExtra: ["monitor"], rol: "admin" }, {}, { rolesExtra: "monitor" }])
      expect((await ruta.POST(json("POST", body), ctx)).status, JSON.stringify(body)).toBe(400);
    expect((await ruta.POST(json("POST", { rolesExtra: [] }), { params: Promise.resolve({ id: "no-es-id" }) })).status).toBe(400);
  });
});

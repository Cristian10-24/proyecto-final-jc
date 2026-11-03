import { ObjectId } from "mongodb";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { puede, ROLES, type Permiso } from "@/lib/permisos";

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

async function como(rol: "mentor" | "monitor" | "coordinador" | "admin") {
  const { createToken } = await import("@/lib/auth");
  const _id = new ObjectId();
  estado.usuario = { _id, usuario: `prueba-${rol}`, nombre: "Usuario Prueba", rol, ciudades: rol === "monitor" ? ["Cali"] : [], ...(rol === "mentor" ? { mentorId: "mentor-prueba" } : {}), activo: true, tokenVersion: 0 };
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
  ["liberar una hora", async () => (await import("@/app/api/admin/proyectos/[id]/route")).POST(json("POST", { accion: "liberar" }), ctx)],
  ["cargar usuarios por Excel", async () => (await import("@/app/api/admin/usuarios/importar/route")).POST(new Request("http://localhost/x", { method: "POST", body: new FormData() }))],
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

// Seguimiento general, Excel de resultados y criterios: coordinación y admin.
const soloCoordinacion: [string, () => Promise<Response>][] = [
  ["ver el seguimiento general", async () => (await import("@/app/api/evaluacion/seguimiento/route")).GET(new Request("http://localhost/x"))],
  ["descargar el Excel de resultados", async () => (await import("@/app/api/evaluacion/seguimiento/excel/route")).GET(new Request("http://localhost/x"))],
  ["guardar los criterios", async () => (await import("@/app/api/evaluacion/criterios/route")).POST(json("POST", { exA: 0.9, exB: 3 }))],
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
  for (const [nombre, llamar] of [...soloAdmin, seguimiento, ...soloMonitor]) it(`al ${nombre}`, async () => expect((await llamar()).status).toBe(403));
});

describe("coordinación y admin no escriben evaluaciones", () => {
  for (const rol of ["coordinador", "admin"] as const)
    for (const [nombre, llamar] of soloMentor) it(`${rol}: 403 al ${nombre}`, async () => { await como(rol); expect((await llamar()).status).toBe(403); });
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

describe("coordinación y admin no entran a Mis salas", () => {
  for (const rol of ["coordinador", "admin"] as const)
    for (const [nombre, llamar] of soloMonitor) it(`${rol}: 403 al ${nombre}`, async () => { await como(rol); expect((await llamar()).status).toBe(403); });
});

describe("sin sesión", () => {
  beforeAll(() => { estado.token = ""; estado.usuario = null; });
  for (const [nombre, llamar] of [...soloAdmin, ...soloMentor, ...verEvaluaciones, ...soloMonitor, ...soloCoordinacion]) it(`401 al ${nombre}`, async () => expect((await llamar()).status).toBe(401));
});

describe("sesión con clave restablecida", () => {
  it("una cookie con versión vieja ya no sirve", async () => {
    await como("admin");
    estado.usuario = { ...estado.usuario!, tokenVersion: 1 }; // se restableció la clave después de emitir la cookie
    const { getCurrentUser } = await import("@/lib/auth");
    expect(await getCurrentUser()).toBeNull();
  });
});

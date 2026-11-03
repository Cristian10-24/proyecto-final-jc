import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { usarBaseLocal } from "./helpers/base-local";

// Carga de usuarios por Excel y revisión de nombres (Paso 13) contra la base LOCAL. Datos INVENTADOS.

usarBaseLocal(5);
const db = await import("@/lib/db");
const ux = await import("@/lib/usuariosExcel");

function libro(filas: (string | null)[][], encabezados: string[] = ["Nombre", "Correo", "Rol", "Usuario", "Ciudades"]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Usuarios");
  ws.addRow(encabezados);
  filas.forEach((f) => ws.addRow(f));
  return wb;
}
const ADMIN_ID = new ObjectId();
const previa = async (filas: (string | null)[][]) => ux.previaUsuarios(ux.leerUsuarios(libro(filas)), String(ADMIN_ID));

beforeAll(async () => {
  await (await db.getDb()).dropDatabase();
  await db.closeDb();
  const c = await db.collections();
  await c.mentores.insertMany([{ _id: "camila-rios", nombre: "Camila Ríos" }, { _id: "yehiron-bermudez", nombre: "Yehiron Bermúdez" }, { _id: "ana-lopez", nombre: "Ana López" }]);
  const now = new Date();
  await c.users.insertMany([
    { _id: ADMIN_ID, usuario: "admin.p", nombre: "Admin Prueba", rol: "admin", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
    { _id: new ObjectId(), usuario: "ana.lopez", nombre: "Ana López", rol: "mentor", mentorId: "ana-lopez", ciudades: [], activo: true, passwordHash: "hash-ana", creadoEn: now },
    { _id: new ObjectId(), usuario: "mon.viejo", nombre: "Monitor Viejo", correo: "viejo@ejemplo.org", rol: "monitor", ciudades: ["Cali"], activo: true, passwordHash: "hash-viejo", creadoEn: now },
    { _id: new ObjectId(), usuario: "otro.mentor", nombre: "Mentor Inexistente", rol: "mentor", mentorId: "mentor-inexistente", ciudades: [], activo: true, passwordHash: "x", creadoEn: now },
  ]);
  await c.planSalas.insertMany([
    { _id: "2026-11-12|8|1", dia: "2026-11-12", hora: 8, sala: 1, mentorId: "ana-lopez", monitor: "mon.viejo", origen: "importado" },
    { _id: "2026-11-12|8|2", dia: "2026-11-12", hora: 8, sala: 2, mentorId: "camila-rios", monitor: null, origen: null },
  ]);
});
afterAll(() => db.closeDb());

describe("leer el Excel", () => {
  it("reconoce encabezados por sinónimos, roles y ciudades; marca errores por fila", () => {
    const l = ux.leerUsuarios(libro([
      ["Camila Ríos", "Camila.Rios@Ejemplo.org", "mentora", null, null],
      ["Monitor Nuevo", null, "Monitor", null, "cali; cartagena"],
      ["Jefa", "jefa@ejemplo.org", "Administración", null, null],
      ["Sin Rol Claro", null, "Profesor", null, null],
      ["Correo Malo", "no-es-correo", "Monitor", null, null],
      ["Ciudad Mala", null, "Monitor", null, "Narnia"],
      [null, null, null, null, null],
    ], ["Nombre completo", "Email", "Cargo", "Usuario", "Ciudad"]));
    expect(l.filas.map((f) => [f.nombre, f.rol, f.correo ?? null, f.ciudades])).toEqual([
      ["Camila Ríos", "mentor", "camila.rios@ejemplo.org", []],
      ["Monitor Nuevo", "monitor", null, ["Cali", "Cartagena"]],
    ]);
    expect(l.errores.map((e) => e.fila)).toEqual([4, 5, 6, 7]);
    expect(l.errores[0]!.mensaje).toMatch(/administración no se carga por Excel/);
  });

  it("usuario sugerido: del correo o nombre.apellido, sin tildes", () => {
    expect(ux.usuarioSugerido("Camila Ríos", "camila.rios@ejemplo.org")).toBe("camila.rios");
    expect(ux.usuarioSugerido("José Ángel Peña Ruiz")).toBe("jose.pena");
    expect(ux.usuarioSugerido("Lu Ña")).toBe("lu.na");
  });
});

describe("vista previa", () => {
  it("crea, actualiza por correo o por mentor, y no toca la clave", async () => {
    const p = await previa([
      ["Camila Ríos", "camila.rios@ejemplo.org", "Mentor", null, null],
      ["MONITOR viejo", "viejo@ejemplo.org", "Monitor", null, "Cartagena"],
      ["Ana López", null, "Mentor", null, null],
    ]);
    expect(p.errores).toEqual([]);
    expect(p.acciones.map((a) => [a.usuario, a.accion])).toEqual([["camila.rios", "crear"], ["mon.viejo", "actualizar"], ["ana.lopez", "igual"]]);
    expect(p.acciones[1]!.cambios).toEqual(["nombre: Monitor Viejo → MONITOR viejo", "ciudades: Cartagena"]);
  });

  it("no se queda con la cuenta de otra persona (mismo usuario o correo, otro nombre) ni reactiva cuentas", async () => {
    const c = await db.collections();
    const p = await previa([
      ["Intruso Uno", "viejo@ejemplo.org", "Coordinación", null, null],
      ["Intruso Dos", null, "Coordinación", "mon.viejo", null],
    ]);
    expect(p.errores.map((e) => e.mensaje)).toEqual([
      "Intruso Uno: el correo viejo@ejemplo.org ya es de Monitor Viejo. Si es la misma persona, cambia el nombre con «Editar».",
      "Intruso Dos: el usuario \"mon.viejo\" ya es de Monitor Viejo. Si es la misma persona, cambia el nombre con «Editar».",
    ]);
    await c.users.updateOne({ usuario: "mon.viejo" }, { $set: { activo: false } });
    const q = await previa([["Monitor Viejo", null, "Monitor", null, null]]);
    expect(q.errores[0]!.mensaje).toMatch(/está desactivada/);
    await c.users.updateOne({ usuario: "mon.viejo" }, { $set: { activo: true } });
  });

  it("mentor que no está en Horarios: error con el nombre más parecido", async () => {
    const p = await previa([["Yehiron Bermudes", null, "Mentor", null, null]]);
    expect(p.errores[0]!.mensaje).toMatch(/¿Quisiste decir "Yehiron Bermúdez"\?/);
    expect(p.acciones).toEqual([]);
  });

  it("la misma persona dos veces, usuario ocupado, admin y uno mismo: errores", async () => {
    const p = await previa([
      ["Camila Ríos", "c1@ejemplo.org", "Mentor", null, null],
      ["Camila Rios", "c2@ejemplo.org", "Mentor", null, null], // mismo mentor
      ["Admin Prueba", null, "Coordinación", "admin.p", null],
    ]);
    expect(p.errores.map((e) => e.fila)).toEqual([3, 4]);
    expect(p.errores[0]!.mensaje).toMatch(/misma persona de la fila 2/);
    expect(p.errores[1]!.mensaje).toMatch(/administración/);
  });

  it("sin usuario ni correo, el mismo nombre (sin tildes) es la misma persona", async () => {
    const p = await previa([["monitor viejo", null, "Monitor", null, "Cali"]]);
    expect(p.acciones[0]).toMatchObject({ usuario: "mon.viejo", accion: "actualizar" });
  });

  it("duplicados en el archivo: mismo nombre, mismo correo o mismo usuario; usuario ajeno ya existente; mentor de otro usuario", async () => {
    const p = await previa([
      ["Pedro Pérez", null, "Monitor", null, null],
      ["Pedro Perez", null, "Coordinación", null, null], // mismo nombre sin tildes
      ["Rosa Uno", "rosa@ejemplo.org", "Monitor", null, null],
      ["Rosa Dos", "rosa@ejemplo.org", "Monitor", null, null], // mismo correo
      ["Luis Uno", null, "Monitor", "luis.x", null],
      ["Luis Dos", null, "Monitor", "luis.x", null], // mismo usuario
      ["Ana López", "viejo@ejemplo.org", "Mentor", null, null], // el correo es de mon.viejo, el mentor es de ana.lopez
    ]);
    expect(p.errores.map((e) => [e.fila, e.mensaje.replace(/^[^:]+: /, "")])).toEqual([
      [3, "es la misma persona de la fila 2."], [5, "es la misma persona de la fila 4."], [7, "el usuario \"luis.x\" ya está en la fila 6."], [8, "el correo viejo@ejemplo.org ya es de Monitor Viejo. Si es la misma persona, cambia el nombre con «Editar»."],
    ]);
  });

  it("la vista previa no escribe nada", async () => {
    const c = await db.collections();
    const antes = await c.users.countDocuments();
    await previa([["Alguien Nuevo", null, "Monitor", null, null]]);
    expect(await c.users.countDocuments()).toBe(antes);
  });

  it("usuario sugerido ocupado por otra persona: se le agrega un número", async () => {
    const p = await previa([["Ana Lopera", "ana.lopez@otro.org", "Monitor", null, null]]);
    expect(p.acciones[0]).toMatchObject({ usuario: "ana.lopez2", accion: "crear" });
  });
});

describe("aplicar", () => {
  it("crea con clave temporal (una sola vez), actualiza sin cambiar la clave y deja changeLog", async () => {
    const p = await previa([
      ["Camila Ríos", "camila.rios@ejemplo.org", "Mentor", null, null],
      ["Monitor Viejo", "viejo@ejemplo.org", "Monitor", null, null],
      ["Solo Salas", null, "Monitor", null, null],
    ]);
    const claves = await ux.aplicarUsuarios(p, "admin.p");
    expect(claves.map((k) => k.usuario)).toEqual(["camila.rios", "solo.salas"]);
    expect(claves[0]!.clave).toMatch(/^[A-Za-z2-9]{10}$/);
    const c = await db.collections();
    const camila = await c.users.findOne({ usuario: "camila.rios" });
    expect([camila?.mentorId, camila?.correo, camila?.passwordHash.startsWith("$2")]).toEqual(["camila-rios", "camila.rios@ejemplo.org", true]);
    const viejo = await c.users.findOne({ usuario: "mon.viejo" });
    expect([viejo?.nombre, viejo?.ciudades, viejo?.passwordHash]).toEqual(["Monitor Viejo", ["Cali"], "hash-viejo"]); // sin Ciudades: conserva las suyas
    expect((await c.users.findOne({ usuario: "solo.salas" }))?.ciudades).toEqual([]);
    expect(await c.changeLog.countDocuments({ accion: "importar", nuevo: /Usuarios: 2 nuevos, 0 actualizados/ })).toBe(1);
  });

  it("cada clave nueva es distinta, su hash corresponde y no queda en el registro", async () => {
    const claves = await ux.aplicarUsuarios(await previa([["Clave Uno", null, "Monitor", null, null], ["Clave Dos", null, "Monitor", null, null]]), "admin.p");
    expect(new Set(claves.map((k) => k.clave)).size).toBe(2);
    const c = await db.collections();
    for (const k of claves) expect(await bcrypt.compare(k.clave, (await c.users.findOne({ usuario: k.usuario }))!.passwordHash)).toBe(true);
    const log = JSON.stringify(await c.changeLog.find({}).toArray());
    for (const k of claves) expect(log).not.toContain(k.clave);
  });

  it("actualiza sin cambiar la clave; una fila igual no escribe", async () => {
    const c = await db.collections();
    const uno = (await c.users.findOne({ usuario: "clave.uno" }))!, dos = (await c.users.findOne({ usuario: "clave.dos" }))!;
    const p = await previa([["Clave Uno", null, "Monitor", null, "Cali"], ["Clave Dos", null, "Monitor", null, null]]);
    expect(p.acciones.map((a) => [a.accion, a.cambios])).toEqual([["actualizar", ["ciudades: Cali"]], ["igual", []]]);
    await ux.aplicarUsuarios(p, "admin.p");
    expect(await c.users.findOne({ usuario: "clave.uno" })).toMatchObject({ ciudades: ["Cali"], passwordHash: uno.passwordHash });
    expect((await c.users.findOne({ usuario: "clave.dos" }))?.actualizadoEn).toEqual(dos.actualizadoEn);
  });

  it("si alguien cambió entre la vista previa y confirmar, no se aplica nada (transacción)", async () => {
    const c = await db.collections();
    const p = await previa([["Nuevo Atomico", null, "Monitor", null, null], ["Clave Uno", null, "Coordinación", null, null]]);
    await c.users.updateOne({ usuario: "clave.uno" }, { $set: { rol: "admin" } });
    await expect(ux.aplicarUsuarios(p, "admin.p")).rejects.toBeInstanceOf(ux.CambioUsuarios);
    expect(await c.users.findOne({ usuario: "nuevo.atomico" })).toBeNull();
    expect((await c.users.findOne({ usuario: "clave.uno" }))?.rol).toBe("admin");
    await c.users.updateOne({ usuario: "clave.uno" }, { $set: { rol: "monitor" } });
  });

  it("más de 300 personas: error sin leer más", () => {
    const filas = Array.from({ length: 301 }, (_, i) => [`Persona ${i}`, null, "Monitor", null, null]);
    expect(ux.leerUsuarios(libro(filas)).errores[0]!.mensaje).toMatch(/más de 300 personas/);
  });

  it("cambiar el rol cierra sus sesiones (sube tokenVersion)", async () => {
    const c = await db.collections();
    const antes = (await c.users.findOne({ usuario: "mon.viejo" }))?.tokenVersion ?? 0;
    await ux.aplicarUsuarios(await previa([["Monitor Viejo", "viejo@ejemplo.org", "Coordinación", null, null]]), "admin.p");
    const u = await c.users.findOne({ usuario: "mon.viejo" });
    expect([u?.rol, u?.ciudades, u?.tokenVersion]).toEqual(["coordinador", [], antes + 1]);
  });
});

describe("revisión de nombres", () => {
  it("mentores sin usuario, usuarios que no coinciden, salas sin monitor y monitores sin salas", async () => {
    const r = await ux.revisionNombres();
    expect(r.mentoresSinUsuario).toEqual(["Yehiron Bermúdez"]);
    expect(r.usuariosSinMentor.map((u) => u.usuario)).toEqual(["otro.mentor"]);
    expect(r.salasSinMonitor).toBe(1);
    expect(r.monitoresSinSalas).toEqual(["Clave Dos", "Clave Uno", "Solo Salas"]);
    expect(r.usuariosSinMentor[0]!.sugerencias).toEqual([]);
  });

  it("los inactivos no cuentan; sin Horarios ni plan de salas no compara", async () => {
    const c = await db.collections();
    await c.users.updateMany({ usuario: { $in: ["otro.mentor", "clave.uno", "clave.dos"] } }, { $set: { activo: false } });
    const r = await ux.revisionNombres();
    expect([r.usuariosSinMentor, r.monitoresSinSalas]).toEqual([[], ["Solo Salas"]]);
    await c.mentores.deleteMany({});
    await c.planSalas.deleteMany({});
    expect(await ux.revisionNombres()).toEqual({ horariosImportados: false, mentoresSinUsuario: [], usuariosSinMentor: [], planSalas: false, monitoresSinSalas: [], salasSinMonitor: 0 });
  });
});

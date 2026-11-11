// Roles y permisos. Es la única fuente de verdad: el servidor valida con estas funciones
// y la interfaz las usa solo para mostrar u ocultar botones.
//
//  mentor       → solo evalúa los proyectos que tiene asignados (su nombre en Horarios = su usuario).
//  monitor      → inscripción: solo sus ciudades (ver quién ya eligió hora, copiar pendientes para WhatsApp);
//                 presentaciones: solo los estudiantes de sus salas asignadas, de cualquier ciudad.
//  coordinador  → todas las ciudades: lo mismo + resumen y Excel del cronograma.
//  admin        → todo lo del coordinador + importar, usuarios, liberar o cambiar la hora de un proyecto.

export const ROLES = ["mentor", "monitor", "coordinador", "admin"] as const;
export type RolUsuario = (typeof ROLES)[number];

export type Permiso =
  | "ver_todas_las_ciudades"
  | "ver_seguimiento"
  | "ver_resumen"
  | "descargar_excel"
  | "importar"
  | "gestionar_usuarios"
  | "cambiar_horario"
  | "evaluar"
  | "ver_evaluaciones"
  | "monitorear_salas"
  | "editar_criterios"
  /** Fase 4 · Paso 22: escribir comentarios de seguimiento (monitor: sus ciudades; coordinación y admin: todas). */
  | "comentar_proyectos"
  /** Fase 5 · Paso 29: citar por Google Calendar (solo administración). */
  | "citar"
  /** Cronograma en Excel con documento y correo de cada integrante (solo administración). */
  | "descargar_datos_personales";

const PERMISOS: Record<RolUsuario, readonly Permiso[]> = {
  mentor: ["evaluar"],
  monitor: ["ver_seguimiento", "monitorear_salas", "comentar_proyectos"],
  coordinador: ["ver_seguimiento", "ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "ver_evaluaciones", "editar_criterios", "comentar_proyectos"],
  admin: ["ver_seguimiento", "ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "importar", "gestionar_usuarios", "cambiar_horario", "ver_evaluaciones", "editar_criterios", "comentar_proyectos", "citar", "descargar_datos_personales"],
};

/** Paso 26 · Roles que se pueden dar como adicionales (nunca administración). */
export const ROLES_EXTRA = ["mentor", "monitor", "coordinador"] as const satisfies readonly RolUsuario[];
export type RolExtra = (typeof ROLES_EXTRA)[number];

/** Quien pide: un rol suelto o un usuario con su rol principal y, opcionales, sus roles adicionales. */
export type ConRoles = { rol: string; rolesExtra?: readonly string[] };

/** Todos los roles de un usuario: el principal más los adicionales válidos (administración nunca entra como adicional). */
export function rolesDe(quien: string | ConRoles | undefined): RolUsuario[] {
  if (!quien) return [];
  if (typeof quien === "string") return ROLES.includes(quien as RolUsuario) ? [quien as RolUsuario] : [];
  const extra = (quien.rolesExtra ?? []).filter((r): r is RolExtra => (ROLES_EXTRA as readonly string[]).includes(r));
  return [...new Set([...rolesDe(quien.rol), ...extra])];
}

/** ¿Tiene el permiso? Con un usuario, sus permisos son la suma de los de todos sus roles. */
export function puede(quien: string | ConRoles | undefined, permiso: Permiso): boolean {
  return rolesDe(quien).some((r) => PERMISOS[r].includes(permiso));
}

/** ¿Tiene ese rol, como principal o adicional? */
export const tieneRol = (quien: string | ConRoles | undefined, rol: RolUsuario) => rolesDe(quien).includes(rol);

/** Filtro de Mongo de quienes cuentan como monitores (rol principal o adicional). */
export const FILTRO_MONITOR = { $or: [{ rol: "monitor" as const }, { rolesExtra: "monitor" as const }] };

export const ROL_TXT: Record<RolUsuario, string> = { mentor: "Mentor", monitor: "Monitor", coordinador: "Coordinación", admin: "Administración" };

/** Página de inicio después del login. */
export const inicioPorRol = (quien: string | ConRoles) => (puede(quien, "ver_resumen") ? "/admin" : puede(quien, "evaluar") ? "/mentor" : "/monitor");

/** "Monitor · Panamá + Coordinación" (rol principal primero; las ciudades solo junto a Monitor). */
export function etiquetaRoles(u: ConRoles & { ciudades?: readonly string[] }): string {
  return rolesDe(u).map((r) => (r === "monitor" && u.ciudades?.length ? `Monitor · ${u.ciudades.join(" · ")}` : ROL_TXT[r])).join(" + ");
}

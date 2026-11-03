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
  | "editar_criterios";

const PERMISOS: Record<RolUsuario, readonly Permiso[]> = {
  mentor: ["evaluar"],
  monitor: ["ver_seguimiento", "monitorear_salas"],
  coordinador: ["ver_seguimiento", "ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "ver_evaluaciones", "editar_criterios"],
  admin: ["ver_seguimiento", "ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "importar", "gestionar_usuarios", "cambiar_horario", "ver_evaluaciones", "editar_criterios"],
};

export function puede(rol: string | undefined, permiso: Permiso): boolean {
  return !!rol && (PERMISOS[rol as RolUsuario] ?? []).includes(permiso);
}

export const ROL_TXT: Record<RolUsuario, string> = { mentor: "Mentor", monitor: "Monitor", coordinador: "Coordinación", admin: "Administración" };

/** Página de inicio después del login. */
export const inicioPorRol = (rol: string) => (puede(rol, "ver_resumen") ? "/admin" : puede(rol, "evaluar") ? "/mentor" : "/monitor");

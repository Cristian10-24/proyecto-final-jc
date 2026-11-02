// Roles y permisos. Es la única fuente de verdad: el servidor valida con estas funciones
// y la interfaz las usa solo para mostrar u ocultar botones.
//
//  monitor      → solo sus ciudades: ver quién ya eligió hora y copiar pendientes para WhatsApp.
//  coordinador  → todas las ciudades: lo mismo + resumen y Excel del cronograma.
//  admin        → todo lo del coordinador + importar, usuarios, liberar o cambiar la hora de un proyecto.

export const ROLES = ["monitor", "coordinador", "admin"] as const;
export type RolUsuario = (typeof ROLES)[number];

export type Permiso =
  | "ver_todas_las_ciudades"
  | "ver_seguimiento"
  | "ver_resumen"
  | "descargar_excel"
  | "importar"
  | "gestionar_usuarios"
  | "cambiar_horario";

const PERMISOS: Record<RolUsuario, readonly Permiso[]> = {
  monitor: ["ver_seguimiento"],
  coordinador: ["ver_seguimiento", "ver_todas_las_ciudades", "ver_resumen", "descargar_excel"],
  admin: ["ver_seguimiento", "ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "importar", "gestionar_usuarios", "cambiar_horario"],
};

export function puede(rol: string | undefined, permiso: Permiso): boolean {
  return !!rol && (PERMISOS[rol as RolUsuario] ?? []).includes(permiso);
}

export const ROL_TXT: Record<RolUsuario, string> = { monitor: "Monitor", coordinador: "Coordinación", admin: "Administración" };

/** Página de inicio después del login. */
export const inicioPorRol = (rol: string) => (puede(rol, "ver_resumen") ? "/admin" : "/monitor");

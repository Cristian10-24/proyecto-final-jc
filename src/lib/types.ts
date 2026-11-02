import type { ObjectId } from "mongodb";
import type { RolUsuario } from "./permisos";

export type Rol = "estudiante" | RolUsuario;

export type Actor = { rol: Rol; usuario?: string };

export type User = {
  _id: ObjectId;
  usuario: string;
  nombre: string;
  passwordHash: string;
  rol: RolUsuario;
  ciudades: string[];
  activo: boolean;
  /** Sube al restablecer la clave o desactivar: invalida las sesiones abiertas. */
  tokenVersion?: number;
  creadoEn: Date;
  actualizadoEn?: Date;
};

/** Historial de cambios importantes (reservas, liberaciones, cambios de hora, importaciones). */
export type ChangeLog = {
  _id?: ObjectId;
  proyectoId?: ObjectId;
  accion: "reservar" | "liberar" | "cambiar_hora" | "importar" | "asignar_monitor";
  anterior?: string;
  nuevo?: string;
  motivo?: string;
  actor: Actor;
  fecha: Date;
};

export type RateLimit = { _id: string; count: number; expiraEn: Date };

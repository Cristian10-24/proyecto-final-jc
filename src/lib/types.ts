import type { ObjectId } from "mongodb";
import type { RolUsuario } from "./permisos";
import type { Disponible, MonitorFijo, Sala } from "./salas";

export type Rol = "estudiante" | RolUsuario;

export type Actor = { rol: Rol; usuario?: string };

export type User = {
  _id: ObjectId;
  usuario: string;
  nombre: string;
  passwordHash: string;
  rol: RolUsuario;
  ciudades: string[];
  /** Solo rol mentor: su id en Horarios (idMentor de su nombre). */
  mentorId?: string;
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
  accion: "reservar" | "liberar" | "cambiar_hora" | "importar" | "asignar_monitor" | "reetiquetar" | "monitor_sala" | "evaluar" | "no_presento" | "presente";
  anterior?: string;
  nuevo?: string;
  motivo?: string;
  actor: Actor;
  fecha: Date;
};

export type Ruta = "Básica" | "Avanzada";

export type Integrante = { documento: string; nombre: string; celular?: string; correo?: string };

/** Proyecto importado del Excel. Su hora vive en el asiento (asientos.proyectoId), no aquí. */
export type Proyecto = {
  _id: ObjectId;
  codigo: string;
  ciudad: string;
  nombre: string;
  descripcion?: string;
  grupo?: string;
  ruta?: Ruta;
  /** Usuario del monitor; null = por asignar (la ciudad tiene varios monitores o ninguno). */
  monitor?: string | null;
  integrantes: Integrante[];
  creadoEn: Date;
  actualizadoEn: Date;
};

export type Mentor = { _id: string; nombre: string; correo?: string; celular?: string };

/** Un asiento = un bloque de 15 min con un mentor. `ciudades`: quién puede tomarlo. */
export type Asiento = {
  _id: ObjectId;
  dia: string;
  inicio: Date;
  mentorId: string;
  ciudades: string[];
  proyectoId: ObjectId | null;
  reservadoEn?: Date;
};

/**
 * Configuración de un día: qué ciudades presentan y desde cuándo pueden elegir.
 * `cupos` es exacto para las ciudades sin sobrante y un mínimo para la ciudad de sobrante,
 * que se queda con todo lo que no tomen las demás (a lo sumo una por día).
 */
export type CupoCiudad = { ciudad: string; cupos: number | null; sobrante: boolean; abre: Date | null };
export type DiaConfig = { _id: string; ciudades: CupoCiudad[] };

export type RateLimit ={ _id: string; count: number; expiraEn: Date };

/** Lo último importado en el libro de salas y monitores (ya reconocido): permite recalcular el plan. */
export type SalasConfig = { _id: "actual"; salas: Sala[]; importados: MonitorFijo[]; disponibilidad: Disponible[]; actualizadoEn: Date };

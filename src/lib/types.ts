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
  /** Opcional (no se usa para entrar): sirve para reconocer a la persona al cargar usuarios por Excel. */
  correo?: string;
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
  accion: "reservar" | "liberar" | "cambiar_hora" | "importar" | "asignar_monitor" | "reetiquetar" | "monitor_sala" | "evaluar" | "no_presento" | "presente" | "nota_monitor" | "sugerir_cambio" | "aprobar_cambio" | "rechazar_cambio" | "restablecer_clave" | "criterios" | "anular_evaluacion" | "reglas_cupos" | "cierre_inscripciones" | "franjas"
    | "crear_proyecto" | "editar_proyecto" | "separar_pareja" | "agregar_integrante" | "unir_proyecto"
    | "modo_cupos" | "sin_proyecto" | "quitar_sin_proyecto";
  anterior?: string;
  nuevo?: string;
  motivo?: string;
  /** Fase 4 · Paso 23: edición del estudiante en el portal, [antes, después] (para revertirla). Solo en entradas nuevas. */
  cambio?: { nombre: [string, string]; descripcion: [string, string] };
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
  /** Fase 4 · Marcado a mano como «Sin proyecto» (solo sin hora). Sin el campo = como siempre. */
  sinProyecto?: { desde: Date; por: string; motivo?: string };
};

/** Fase 4 · Participante sin proyecto (colección nueva `sin_proyecto`, documento único). Al convertirlo en proyecto
 *  no se borra: queda con `convertidoEn` y `proyectoId`. */
export type ParticipanteSinProyecto = {
  _id: ObjectId;
  nombre: string; documento: string; ciudad: string; celular?: string; correo?: string;
  /** Usuario del monitor; null = por asignar. */
  monitor: string | null;
  creadoEn: Date; creadoPor: string;
  convertidoEn?: Date; proyectoId?: ObjectId;
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
  /** Sube en cada escritura de evaluación o nota sobre el proyecto del asiento: obliga a un conflicto de escritura
   *  entre esas transacciones y la de reprogramar (sin esto, ambas podrían confirmarse a la vez). */
  rev?: number;
};

/**
 * Configuración de un día: qué ciudades presentan y desde cuándo pueden elegir.
 * `cupos` es exacto para las ciudades sin sobrante y un mínimo para la ciudad de sobrante,
 * que se queda con todo lo que no tomen las demás (a lo sumo una por día).
 */
export type CupoCiudad = { ciudad: string; cupos: number | null; sobrante: boolean; abre: Date | null; /** Máximo del día (Paso 17); sin él, los cupos son exactos (o "todo lo que sobre" si es la de sobrante). */ max?: number | null };
/** `editadoEn`: las reglas se editaron en pantalla (Paso 17); mandan hasta la próxima importación de la hoja Cupos. */
export type DiaConfig = { _id: string; ciudades: CupoCiudad[]; editadoEn?: Date; editadoPor?: string; /** Último cambio de mentores en Franjas (serializa a dos admins). */ franjasEn?: Date };

/** Cierre de inscripciones por ciudad (Paso 17): por defecto `horasAntes` antes de su primer bloque; `porCiudad` lo fija a mano. */
export type InscripcionesConfig = { _id: "cierre"; horasAntes: number; porCiudad: Record<string, Date>; actualizadoEn: Date };

export type RateLimit ={ _id: string; count: number; expiraEn: Date };

/** Fase 4 · Interruptor del modo orden de llegada (colección nueva `ajustes`). Sin documento = apagado (como antes). */
export type AjusteModoCupos = { _id: "modoCupos"; ordenLlegada: boolean; actualizadoEn: Date; actualizadoPor: string };

/** Fase 4 · Candado de una ciudad en un día (`candados_cupo`, `_id` = "<día>|<ciudad>"): solo se incrementa, para que
 *  dos reservas simultáneas de la misma ciudad y día choquen en la transacción y no pasen el tope. */
export type CandadoCupo = { _id: string; v: number };

/** Lo último importado en el libro de salas y monitores (ya reconocido): permite recalcular el plan. */
export type SalasConfig = { _id: "actual"; salas: Sala[]; importados: MonitorFijo[]; disponibilidad: Disponible[]; actualizadoEn: Date };

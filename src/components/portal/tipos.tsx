// Tipos de las respuestas de /api/estudiante/* que usa el portal.

export type Integrante = { nombre: string; documento: string; celular?: string; correo?: string; tu: boolean };

export type HoraElegida = { inicio: string; elegidaPor: "tu" | "pareja" | "coordinacion" };

export type Consulta = {
  proyecto: { nombre: string; descripcion?: string; ciudad: string };
  integrantes: Integrante[];
  hora: HoraElegida | null;
  /** Paso 23: versión para editar nombre y descripción, y si todavía se puede (sin evaluación guardada). */
  edicion?: { version: string; puede: boolean };
};

export type DiaAgenda = { dia: string; estado: "disponible" | "sin_horas" | "aun_no_abre"; abre?: string };

export type Aviso = { tipo: "error" | "warn" | "info"; titulo: string; texto?: string };

export type EstadoInicial = { estado: "abierto" } | { estado: "antes"; abre: string } | { estado: "cerrado" };

import { z } from "zod";
import { NOMBRES_CIUDADES } from "../ciudades";

// Formularios de gestión de proyectos (crear, editar, agregar integrante). La validación fina (documento, celular,
// correo) la hace src/lib/gestionProyectos.ts con las mismas funciones del importador.

export const IntegranteEntrada = z.object({
  nombre: z.string().trim().min(1).max(120),
  documento: z.string().trim().min(1).max(30),
  celular: z.string().trim().max(30).optional(),
  correo: z.string().trim().max(120).optional(),
}).strict();

export const ProyectoEntrada = z.object({
  ciudad: z.enum(NOMBRES_CIUDADES as [string, ...string[]]),
  nombre: z.string().trim().min(1).max(160),
  descripcion: z.string().trim().max(1000).optional(),
  ruta: z.enum(["Básica", "Avanzada"]).nullable().optional(),
  monitor: z.string().trim().min(1).max(40).nullable().optional(),
  integrantes: z.array(IntegranteEntrada).min(1).max(2),
}).strict();

export const Version = z.iso.datetime().optional();

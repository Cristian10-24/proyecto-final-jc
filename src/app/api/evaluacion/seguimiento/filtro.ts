import { z } from "zod";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { esDia } from "@/lib/edicion";

/** Filtro del Excel de resultados (y del seguimiento de antes): día y ciudad, ambos opcionales. */
export const FiltroSeguimientoSchema = z.object({
  dia: z.string().refine(esDia).optional(),
  ciudad: z.string().refine((c) => NOMBRES_CIUDADES.includes(c)).optional(),
}).strict();

/** Seguimiento v2 (solo lectura): además ruta, modalidad, búsqueda y «Contar por» (las listas largas son de ese modo). */
export const FiltroSeguimientoV2Schema = FiltroSeguimientoSchema.extend({
  ruta: z.enum(["Básica", "Avanzada"]).optional(),
  modalidad: z.enum(["individual", "pareja"]).optional(),
  q: z.string().trim().max(60).optional(),
  modo: z.enum(["est", "proy"]).optional(),
}).strict();

/** Reporte del día: solo el día (sin día = todos los días). Siempre todas las ciudades. */
export const FiltroReporteSchema = z.object({ dia: z.string().refine(esDia).optional() }).strict();

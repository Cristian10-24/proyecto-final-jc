import { z } from "zod";
import { NOMBRES_CIUDADES } from "@/lib/ciudades";
import { esDia } from "@/lib/edicion";

/** Filtro del seguimiento y del Excel: día y ciudad, ambos opcionales. */
export const FiltroSeguimientoSchema = z.object({
  dia: z.string().refine(esDia).optional(),
  ciudad: z.string().refine((c) => NOMBRES_CIUDADES.includes(c)).optional(),
}).strict();

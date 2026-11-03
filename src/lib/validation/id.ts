import { ObjectId } from "mongodb";
import { z } from "zod";

/** Parámetro [id] de las rutas: un ObjectId válido. */
export const IdParams = z.object({ id: z.string().refine((s) => ObjectId.isValid(s)).transform((s) => new ObjectId(s)) }).strict();

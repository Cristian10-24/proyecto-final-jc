import { digitosTelefono } from "@/lib/evaluacion/criterios";

/** "Llamar" y "WhatsApp" para un celular (Mis salas y Mis proyectos). */
export default function BotonesContacto({ celular }: { celular: string }) {
  const d = digitosTelefono(celular);
  return (
    <>
      <a className="ev-btn" href={`tel:+${d}`}>Llamar</a>
      <a className="ev-btn" href={`https://wa.me/${d}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
    </>
  );
}

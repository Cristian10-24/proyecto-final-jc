"use client";

import { useEffect, useState } from "react";
import { elegirTema, temaActual, type Tema } from "@/lib/tema";
import s from "./BotonTema.module.css";

// Botón de modo claro/oscuro (Paso 18). Muestra el tema al que cambia: luna en claro, sol en oscuro.
export default function BotonTema({ className = "" }: { className?: string }) {
  const [tema, setTema] = useState<Tema | null>(null);
  useEffect(() => {
    setTema(temaActual());
    // Si sigue al sistema y este cambia, el script del <head> cambia data-theme: el icono lo acompaña.
    const o = new MutationObserver(() => setTema(temaActual()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => o.disconnect();
  }, []);
  const oscuro = tema === "dark";
  return (
    <button type="button" className={`${s.boton} ${className}`} aria-label={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={oscuro ? "Modo claro" : "Modo oscuro"}
      onClick={() => { const t = oscuro ? "light" : "dark"; elegirTema(t); setTema(t); }}>
      {oscuro ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" /></svg>
      )}
    </button>
  );
}

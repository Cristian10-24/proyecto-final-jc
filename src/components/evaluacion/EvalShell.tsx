"use client";

import "@/app/tema-evaluacion.css";
import type { SessionUser } from "@/lib/auth";
import { inicioPorRol, puede, type Permiso } from "@/lib/permisos";
import BotonTema from "../BotonTema";
import s from "./Evaluacion.module.css";

// Marco del módulo de evaluación igual al prototipo aprobado: barra superior oscura con el logo de Jóvenes
// creaTIvos, "Evaluación del proyecto final", el logo de Sofka y las pestañas. Aplica el tema .tema-evaluacion
// (Lexend + Inter y colores --ev-*); el resto de la app sigue con AppShell y tokens.css.

export type SeccionEval = "evaluaciones" | "salas" | "seguimiento";

const TABS: { key: SeccionEval; label: string; href: string; permiso: Permiso }[] = [
  { key: "evaluaciones", label: "Mis evaluaciones", href: "/mentor", permiso: "evaluar" },
  { key: "evaluaciones", label: "Evaluaciones", href: "/mentor", permiso: "ver_evaluaciones" },
  { key: "salas", label: "Mis salas", href: "/monitor/salas", permiso: "monitorear_salas" },
  { key: "seguimiento", label: "Seguimiento general", href: "/evaluacion/seguimiento", permiso: "ver_evaluaciones" },
];

export default function EvalShell({ user, active, children }: { user: SessionUser; active: SeccionEval; children: React.ReactNode }) {
  const tabs = TABS.filter((t) => puede(user.rol, t.permiso));
  // Quien también usa el panel (seguimiento, horarios, importar…) vuelve a él desde aquí.
  const panel = puede(user.rol, "ver_seguimiento") ? inicioPorRol(user.rol) : null;

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    try { for (const k of Object.keys(localStorage)) if (k.startsWith("pfjc-borrador-")) localStorage.removeItem(k); } catch { /* sin almacenamiento */ }
    window.location.assign("/login");
  }

  return (
    <div className="tema-evaluacion">
      {/* Tipografías del prototipo (solo en este módulo). */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" precedence="default" />
      <header className={s.top}>
        <div className={s.topIn}>
          <div className={s.marca}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.logo} src="/logo-jc-redondo.webp" alt="Jóvenes creaTIvos" width={52} height={52} />
            <div className={s.marcaTxt}><b>Jóvenes creaTIvos 2026</b><span>Evaluación del proyecto final</span></div>
            <span className={s.divisor} aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.logoSofka} src="/logo-sofka.webp" alt="Sofka" width={98} height={28} />
          </div>
          <nav className={s.tabs} aria-label="Secciones">
            {tabs.map((t) => <a key={t.key} className={s.tab} href={t.href} aria-current={t.key === active ? "page" : undefined}>{t.label}</a>)}
            {panel && <a className={s.tab} href={panel}>Panel</a>}
            <div className={s.yo}><BotonTema className={s.temaTop} /><span>{user.nombre}</span><button type="button" className={s.salir} onClick={salir}>Salir</button></div>
          </nav>
        </div>
      </header>
      <main className={s.main}>{children}</main>
    </div>
  );
}

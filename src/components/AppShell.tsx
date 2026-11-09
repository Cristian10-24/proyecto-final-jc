"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { puede, ROL_TXT, type Permiso } from "@/lib/permisos";
import BotonTema from "./BotonTema";
import s from "./AppShell.module.css";

export type Seccion = "evaluaciones" | "resumen" | "seguimiento" | "missalas" | "segGeneral" | "tablero" | "franjas" | "reglas" | "cargaMentores" | "horarios" | "sinProyecto" | "salas" | "importar" | "usuarios";

// Cada sección aparece solo si el rol tiene el permiso (el servidor lo vuelve a validar).
const NAV: { key: Seccion; label: string; href: string; permiso: Permiso }[] = [
  { key: "evaluaciones", label: "Mis evaluaciones", href: "/mentor", permiso: "evaluar" },
  { key: "resumen", label: "Resumen", href: "/admin", permiso: "ver_resumen" },
  { key: "seguimiento", label: "Seguimiento", href: "/monitor", permiso: "ver_seguimiento" },
  { key: "missalas", label: "Mis salas", href: "/monitor/salas", permiso: "monitorear_salas" },
  { key: "evaluaciones", label: "Evaluaciones", href: "/mentor", permiso: "ver_evaluaciones" },
  { key: "segGeneral", label: "Seguimiento general", href: "/evaluacion/seguimiento", permiso: "ver_evaluaciones" },
  { key: "tablero", label: "Tablero", href: "/admin/tablero", permiso: "ver_resumen" },
  { key: "cargaMentores", label: "Carga de mentores", href: "/admin/carga-mentores", permiso: "ver_resumen" },
  { key: "franjas", label: "Franjas", href: "/admin/franjas", permiso: "ver_resumen" },
  { key: "horarios", label: "Horarios", href: "/admin/horarios", permiso: "cambiar_horario" },
  { key: "sinProyecto", label: "Sin proyecto", href: "/admin/sin-proyecto", permiso: "cambiar_horario" },
  { key: "salas", label: "Salas", href: "/admin/salas", permiso: "cambiar_horario" },
  { key: "reglas", label: "Reglas de cupos", href: "/admin/reglas", permiso: "cambiar_horario" },
  { key: "importar", label: "Importar", href: "/admin/importar", permiso: "importar" },
  { key: "usuarios", label: "Usuarios", href: "/admin/usuarios", permiso: "gestionar_usuarios" },
];

export function iniciales(nombre: string): string {
  return nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export default function AppShell({ user, active, children }: { user: SessionUser; active: Seccion; children: React.ReactNode }) {
  const nav = NAV.filter((n) => puede(user.rol, n.permiso));
  // Contador de cambios sugeridos por los monitores que esperan respuesta (junto a "Horarios").
  const [pendientes, setPendientes] = useState(0);
  useEffect(() => {
    if (!puede(user.rol, "cambiar_horario")) return;
    const leer = () => fetch("/api/admin/sugerencias/conteo", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setPendientes(d.pendientes)).catch(() => null);
    void leer();
    const t = setInterval(leer, 60_000);
    const alCambiar = (e: Event) => { const n = (e as CustomEvent<unknown>).detail; if (Number.isInteger(n)) setPendientes(n as number); };
    window.addEventListener("pfjc-pendientes", alCambiar);
    return () => { clearInterval(t); window.removeEventListener("pfjc-pendientes", alCambiar); };
  }, [user.rol]);
  const etiqueta = (n: (typeof NAV)[number]) => (
    <>{n.label}{n.key === "horarios" && pendientes > 0 && <span className={s.badge} aria-label={`${pendientes} cambios sugeridos pendientes`}>{pendientes}</span>}</>
  );

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    // Borradores de evaluación guardados en este navegador (solo existen si la sesión venció o no hubo conexión).
    try { for (const k of Object.keys(localStorage)) if (k.startsWith("pfjc-borrador-")) localStorage.removeItem(k); } catch { /* sin almacenamiento */ }
    window.location.assign("/login");
  }

  return (
    <div className={s.shell}>
      <aside className={s.side}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-jc.png" alt="Jóvenes creaTIvos" className={s.logo} />
        <nav className={s.nav}>
          {nav.map((n) => (
            <a key={n.key} href={n.href} className={`${s.navItem} ${n.key === active ? s.navOn : ""}`} aria-current={n.key === active ? "page" : undefined}>{etiqueta(n)}</a>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <div className={s.sideUser}>
          <div className={s.avatar}>{iniciales(user.nombre)}</div>
          <div>
            <div className={s.sideName}>{user.nombre}</div>
            <div className={s.sideRole}>{user.rol === "monitor" ? `Monitor · ${user.ciudades.join(" · ")}` : ROL_TXT[user.rol]}</div>
          </div>
        </div>
      </aside>

      <main className={s.main}>
        <div className={s.topbar}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-jc.png" alt="Jóvenes creaTIvos" className={`${s.logo} ${s.topLogo}`} />
          <div className={s.me}>
            <div className={s.avatar} title={user.nombre}>{iniciales(user.nombre)}</div>
            <span className={s.meName}>{user.nombre}</span>
            <BotonTema />
            <button type="button" className={s.logout} onClick={salir}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
              Cerrar sesión
            </button>
          </div>
        </div>
        {nav.length > 1 && (
          <nav className={s.tabs} aria-label="Secciones">
            {nav.map((n) => <a key={n.key} href={n.href} className={`${s.tab} ${n.key === active ? s.tabOn : ""}`}>{etiqueta(n)}</a>)}
          </nav>
        )}
        {children}
      </main>
    </div>
  );
}

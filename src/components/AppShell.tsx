"use client";

import type { SessionUser } from "@/lib/auth";
import { puede, ROL_TXT, type Permiso } from "@/lib/permisos";
import s from "./AppShell.module.css";

export type Seccion = "evaluaciones" | "resumen" | "seguimiento" | "horarios" | "salas" | "importar" | "usuarios";

// Cada sección aparece solo si el rol tiene el permiso (el servidor lo vuelve a validar).
const NAV: { key: Seccion; label: string; href: string; permiso: Permiso }[] = [
  { key: "evaluaciones", label: "Mis evaluaciones", href: "/mentor", permiso: "evaluar" },
  { key: "resumen", label: "Resumen", href: "/admin", permiso: "ver_resumen" },
  { key: "seguimiento", label: "Seguimiento", href: "/monitor", permiso: "ver_seguimiento" },
  { key: "horarios", label: "Horarios", href: "/admin/horarios", permiso: "cambiar_horario" },
  { key: "salas", label: "Salas", href: "/admin/salas", permiso: "cambiar_horario" },
  { key: "importar", label: "Importar", href: "/admin/importar", permiso: "importar" },
  { key: "usuarios", label: "Usuarios", href: "/admin/usuarios", permiso: "gestionar_usuarios" },
];

export function iniciales(nombre: string): string {
  return nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export default function AppShell({ user, active, children }: { user: SessionUser; active: Seccion; children: React.ReactNode }) {
  const nav = NAV.filter((n) => puede(user.rol, n.permiso));

  async function salir() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  }

  return (
    <div className={s.shell}>
      <aside className={s.side}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-jc.png" alt="Jóvenes creaTIvos" className={s.logo} />
        <nav className={s.nav}>
          {nav.map((n) => (
            <a key={n.key} href={n.href} className={`${s.navItem} ${n.key === active ? s.navOn : ""}`} aria-current={n.key === active ? "page" : undefined}>{n.label}</a>
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
            <button type="button" className={s.logout} onClick={salir}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
              Cerrar sesión
            </button>
          </div>
        </div>
        {nav.length > 1 && (
          <nav className={s.tabs} aria-label="Secciones">
            {nav.map((n) => <a key={n.key} href={n.href} className={`${s.tab} ${n.key === active ? s.tabOn : ""}`}>{n.label}</a>)}
          </nav>
        )}
        {children}
      </main>
    </div>
  );
}

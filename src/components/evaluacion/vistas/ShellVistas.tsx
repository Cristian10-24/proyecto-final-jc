"use client";

import "@/app/tema-evaluacion.css";
import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { inicioPorRol, puede, ROL_TXT } from "@/lib/permisos";
import { elegirTema, temaActual, type Tema } from "@/lib/tema";
import BotonTema from "../../BotonTema";
import { TABS, type SeccionEval } from "../EvalShell";
import s from "../Evaluacion.module.css";
import { useDialogo } from "./Dialogos";
import { IcoCarpeta, IcoCerrar, IcoCuadricula, IcoLista, IcoLuna, IcoMenu, IcoSalir, IcoSol, IcoUbicacion } from "./Iconos";
import v from "./Vistas.module.css";

// Fase 6 · Marco de las vistas nuevas (Mi ciudad y Monitores). En web es la misma barra de EvalShell (mismas clases,
// mismas pestañas); desde 899 px hacia abajo la cabecera deja de ser fija, las pestañas se esconden y el botón ☰ abre
// un cajón con nombre, rol, secciones, modo claro/oscuro y «Salir» (prototipo 02/04/06). EvalShell no cambia: las
// vistas de hoy siguen igual.

const ICONO: Partial<Record<SeccionEval | "panel", React.ReactNode>> = { proyectos: <IcoCarpeta />, salas: <IcoCarpeta />, ciudad: <IcoUbicacion />, panel: <IcoCuadricula /> };

async function salir() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("pfjc-borrador-")) localStorage.removeItem(k); } catch { /* sin almacenamiento */ }
  window.location.assign("/login");
}

export default function ShellVistas({ user, active, children }: { user: SessionUser; active: SeccionEval; children: React.ReactNode }) {
  const tabs = TABS.filter((t) => [t.permiso].flat().some((p) => puede(user, p)));
  const panel = puede(user, "ver_seguimiento") ? inicioPorRol(user) : null;
  const [menu, setMenu] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  return (
    <div className={`tema-evaluacion ${v.shell}`}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap" precedence="default" />
      <header className={`${s.top} ${v.cabecera}`}>
        <div className={`${s.topIn} ${v.cabeceraIn}`}>
          <div className={s.marca}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.logo} src="/logo-jc-redondo.webp" alt="Jóvenes creaTIvos" width={52} height={52} />
            <div className={s.marcaTxt}><b>Jóvenes creaTIvos 2026</b><span>Evaluación del proyecto final</span></div>
            <span className={s.divisor} aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`${s.logoSofka} ${v.sofka}`} src="/logo-sofka.webp" alt="Sofka" width={98} height={28} />
          </div>
          <nav className={`${s.tabs} ${v.tabsWeb}`} aria-label="Secciones">
            {tabs.map((t) => <a key={t.href + t.label} className={s.tab} href={t.href} aria-current={t.key === active ? "page" : undefined}>{t.label}</a>)}
            {panel && <a className={s.tab} href={panel}>Panel</a>}
            <div className={s.yo}><BotonTema className={s.temaTop} /><span>{user.nombre}</span><button type="button" className={s.salir} onClick={salir}>Salir</button></div>
          </nav>
          <button ref={boton} type="button" className={v.menuBtn} aria-label="Abrir menú" aria-haspopup="dialog" aria-expanded={menu} onClick={() => setMenu(true)}><IcoMenu /></button>
        </div>
      </header>
      <main className={v.main}>{children}</main>
      {menu && (
        <Cajon user={user} onCerrar={() => setMenu(false)}>
          {tabs.map((t) => (
            <a key={t.href + t.label} className={v.cajonItem} href={t.href} aria-current={t.key === active ? "page" : undefined}>
              {ICONO[t.key] ?? <IcoLista />}{t.label}
            </a>
          ))}
          {panel && <a className={v.cajonItem} href={panel}>{ICONO.panel}Panel</a>}
        </Cajon>
      )}
    </div>
  );
}

function Cajon({ user, onCerrar, children }: { user: SessionUser; onCerrar: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tema, setTema] = useState<Tema | null>(null);
  useDialogo(ref, onCerrar);
  useEffect(() => {
    setTema(temaActual());
    const o = new MutationObserver(() => setTema(temaActual()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => o.disconnect();
  }, []);
  const oscuro = tema === "dark";
  return (
    <>
      <div className={v.velo} onClick={onCerrar} aria-hidden="true" />
      <div ref={ref} className={v.cajon} role="dialog" aria-modal="true" aria-label="Menú">
        <div className={v.cajonHead}>
          <div><b>{user.nombre}</b><span>{ROL_TXT[user.rol]}</span></div>
          <button type="button" className={v.ibtn} aria-label="Cerrar menú" onClick={onCerrar}><IcoCerrar /></button>
        </div>
        <nav aria-label="Secciones" className={v.hojaCampos} style={{ gap: 4 }}>{children}</nav>
        <div className={v.cajonSep} />
        <button type="button" className={v.cajonItem} onClick={() => { const t = oscuro ? "light" : "dark"; elegirTema(t); setTema(t); }}>
          {oscuro ? <IcoSol /> : <IcoLuna />}{oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        </button>
        <button type="button" className={v.cajonItem} onClick={salir}><IcoSalir />Salir</button>
      </div>
    </>
  );
}

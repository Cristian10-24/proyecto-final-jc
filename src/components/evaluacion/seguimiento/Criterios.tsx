"use client";

import { useState } from "react";
import type { Criterios as Crit } from "@/lib/evaluacion/criterios";
import { excelentesCon } from "@/lib/evaluacion/seguimientoV2";
import { N } from "./formato";
import s from "./Seguimiento.module.css";

// Seguimiento v2 · Criterios: los mismos dos mínimos y «Guardar criterios» de hoy (POST /api/evaluacion/criterios,
// solo con editar_criterios), más una vista previa de solo lectura antes de guardar.

export default function Criterios({ inicial, pares, editable, onGuardado }: { inicial: Crit; pares: [number, number, number][]; editable: boolean; onGuardado: () => void }) {
  const a0 = String(Math.round(inicial.exA * 100)), b0 = String(inicial.exB);
  const [a, setA] = useState(a0);
  const [b, setB] = useState(b0);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const exA = Number(a) / 100, exB = Number(b);
  const okA = a.trim() !== "" && exA >= 0 && exA <= 1, okB = b.trim() !== "" && exB >= 0 && exB <= 4;
  const cambio = a !== a0 || b !== b0;
  const hoy = excelentesCon(pares, inicial.exA, inicial.exB), con = okA && okB ? excelentesCon(pares, exA, exB) : null;

  async function guardar() {
    if (!(okA && okB)) return setMsg("Revisa los valores: Parte A entre 0 y 100, Parte B entre 0 y 4.");
    setOcupado(true); setMsg("");
    const res = await fetch("/api/evaluacion/criterios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exA, exB }) }).catch(() => null);
    setOcupado(false);
    if (res?.status === 401) return window.location.assign("/login");
    setMsg(res?.ok ? "Criterios guardados. Los resultados se recalculan con estos mínimos." : "No se pudo guardar. Inténtalo otra vez.");
    if (res?.ok) onGuardado();
  }

  return (
    <div className={s.grid}>
      <section className={`${s.c} ${s.crit}`} aria-labelledby="crit-t">
        <div className={s.ch}><div><h3 id="crit-t">Criterios de resultado</h3><p className={`${s.muted} ${s.small}`}>Aplican a todo el seguimiento y al reporte del día</p></div></div>
        <p>Todo estudiante que presenta su proyecto queda <b>Aprobado</b>. Queda <b>Excelente</b> si alcanza estos dos mínimos: el % de la Parte A (¿funciona?) y el nivel promedio de la Parte B (¿lo entiende?).</p>
        <div className={s.critf}>
          <label htmlFor="exA"><span className={s.lbl}>Excelente · Parte A mínima (%)</span>
            <input id="exA" className={s.control} type="number" min={0} max={100} step={5} inputMode="numeric" value={a} disabled={!editable} aria-invalid={!okA || undefined} onChange={(x) => setA(x.target.value)} />
            <small className={s.muted}>Qué funcionó en la demo, de 0 a 100</small></label>
          <label htmlFor="exB"><span className={s.lbl}>Excelente · Parte B mínima (0–4)</span>
            <input id="exB" className={s.control} type="number" min={0} max={4} step={0.5} inputMode="decimal" value={b} disabled={!editable} aria-invalid={!okB || undefined} onChange={(x) => setB(x.target.value)} />
            <small className={s.muted}>Nivel de conocimiento promedio</small></label>
        </div>
        {con !== null
          ? <p className={s.aviso} role="status"><span>Con estos mínimos quedarían <b>{N(con)} {con === 1 ? "estudiante excelente" : "estudiantes excelentes"}</b>{cambio ? ` (hoy son ${N(hoy)})` : ""}. Vista previa con los filtros de arriba: no guarda nada.</span></p>
          : <p className={`${s.aviso} ${s.avisoErr}`} role="alert"><span>Revisa los valores: Parte A va de 0 a 100 y Parte B de 0 a 4.</span></p>}
        {editable && (
          <div className={s.critb}>
            <button type="button" className={`${s.btn} ${s.btnPri}`} disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar criterios"}</button>
            {cambio && <button type="button" className={s.btn} onClick={() => { setA(a0); setB(b0); setMsg(""); }}>Deshacer cambios</button>}
          </div>
        )}
        {msg && <p className={s.nota} role="status">{msg}</p>}
      </section>
    </div>
  );
}

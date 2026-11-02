"use client";

import { useState } from "react";
import s from "./login.module.css";

export default function LoginForm() {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !clave) return setError("Escribe tu usuario y tu clave.");
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, clave }) });
      if (res.ok) return window.location.assign((await res.json().catch(() => ({}))).destino ?? "/monitor");
      setError(
        res.status === 401 ? "Usuario o clave incorrectos. Intenta otra vez."
        : res.status === 429 ? "Demasiados intentos. Espera unos minutos e intenta otra vez."
        : "No pudimos entrar. Intenta otra vez.",
      );
    } catch {
      setError("No pudimos conectarnos. Revisa tu internet e intenta otra vez.");
    }
    setEnviando(false);
  }

  return (
    <form className={s.form} onSubmit={entrar} noValidate>
      <h1 className={s.title}>Ingresa a tu panel</h1>
      <p className={s.sub}>Usa el usuario y la clave que te dio coordinación.</p>
      {error && (
        <div className={s.error} role="alert">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ flex: "none" }} aria-hidden><circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5" /><path d="M12 16.5v.5" /></svg>
          {error}
        </div>
      )}
      <div className={s.field}>
        <label className="label" htmlFor="usuario">Usuario</label>
        <input id="usuario" className={`input ${error ? "is-error" : ""}`} value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" autoFocus />
      </div>
      <div className={s.field}>
        <label className="label" htmlFor="clave">Clave</label>
        <div className={s.pass}>
          <input id="clave" type={ver ? "text" : "password"} className={`input ${error ? "is-error" : ""}`} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" />
          <button type="button" className={s.show} onClick={() => setVer(!ver)}>{ver ? "Ocultar" : "Ver"}</button>
        </div>
      </div>
      <div className={s.grow} />
      <button type="submit" className="btn btn-primary" disabled={enviando}>
        {enviando ? <><span className="spinner-sm" />Entrando…</> : "Entrar"}
      </button>
      <div className={s.help}>¿Olvidaste la clave? Pídela a coordinación</div>
    </form>
  );
}

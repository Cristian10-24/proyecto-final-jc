"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { ROL_TXT, ROLES, type RolUsuario } from "@/lib/permisos";
import type { VistaUsuario } from "@/lib/usuarios";
import AppShell from "./AppShell";
import s from "./UsersPanel.module.css";

const ROL_DESC: Record<RolUsuario, string> = {
  mentor: "Evalúa solo los proyectos que tiene asignados. El nombre debe escribirse igual que en la hoja Horarios.",
  monitor: "Solo sus ciudades: ve quién ya eligió hora y copia los pendientes para WhatsApp.",
  coordinador: "Todas las ciudades: lo mismo que un monitor, resumen y Excel del cronograma.",
  admin: "Todo: además importa los Excel, gestiona usuarios y libera o cambia horas.",
};

type Form = {
  modo: "crear" | "editar";
  id?: string;
  usuario: string;
  nombre: string;
  rol: RolUsuario;
  ciudades: string[];
  activo: boolean;
  claveModo: "generar" | "asignar";
  clave: string;
  saving: boolean;
  error: string;
};
type Clave = { id: string; usuario: string; claveModo: "generar" | "asignar"; clave: string; saving: boolean; error: string; resultado?: string };

export default function UsersPanel({ user }: { user: SessionUser }) {
  const [usuarios, setUsuarios] = useState<VistaUsuario[] | null>(null);
  const [ciudadesDisp, setCiudadesDisp] = useState<string[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | RolUsuario>("todos");
  const [form, setForm] = useState<Form | null>(null);
  const [clave, setClave] = useState<Clave | null>(null);
  const [nuevaClave, setNuevaClave] = useState<{ usuario: string; clave: string } | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function cargar() {
    setLoadErr(false);
    try {
      const res = await fetch("/api/admin/usuarios", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setUsuarios(d.usuarios);
      setCiudadesDisp(d.ciudades);
    } catch {
      setLoadErr(true);
    }
  }
  useEffect(() => { cargar(); }, []);

  function aviso(t: string) {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  const reemplazar = (u: VistaUsuario) => setUsuarios((us) => (us ?? []).map((x) => (x.id === u.id ? u : x)));

  async function pedir(url: string, method: string, body: object) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 401) { window.location.assign("/login"); throw new Error(""); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.mensaje ?? "No se pudo guardar.");
    return data;
  }

  function nuevo() {
    setForm({ modo: "crear", usuario: "", nombre: "", rol: "monitor", ciudades: [], activo: true, claveModo: "generar", clave: "", saving: false, error: "" });
  }
  function editar(u: VistaUsuario) {
    setForm({ modo: "editar", id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.ciudades, activo: u.activo, claveModo: "generar", clave: "", saving: false, error: "" });
  }

  async function guardar() {
    if (!form) return;
    setForm({ ...form, saving: true, error: "" });
    try {
      if (form.modo === "crear") {
        const d = await pedir("/api/admin/usuarios", "POST", {
          usuario: form.usuario, nombre: form.nombre, rol: form.rol, ciudades: form.ciudades,
          ...(form.claveModo === "asignar" ? { clave: form.clave } : {}),
        });
        setUsuarios((us) => [...(us ?? []), d.usuario]);
        setForm(null);
        setNuevaClave({ usuario: d.usuario.usuario, clave: d.clave });
      } else {
        const d = await pedir(`/api/admin/usuarios/${form.id}`, "PATCH", { nombre: form.nombre, rol: form.rol, ciudades: form.ciudades, activo: form.activo });
        reemplazar(d.usuario);
        setForm(null);
        aviso("Usuario actualizado ✓");
      }
    } catch (e) {
      setForm({ ...form, saving: false, error: e instanceof Error ? e.message : "No se pudo guardar." });
    }
  }

  async function alternarActivo(u: VistaUsuario) {
    try {
      reemplazar((await pedir(`/api/admin/usuarios/${u.id}`, "PATCH", { activo: !u.activo })).usuario);
      aviso(u.activo ? `${u.usuario} desactivado` : `${u.usuario} activado ✓`);
    } catch (e) {
      aviso(e instanceof Error ? e.message : "No se pudo cambiar.");
    }
  }

  async function guardarClave() {
    if (!clave) return;
    setClave({ ...clave, saving: true, error: "" });
    try {
      const d = await pedir(`/api/admin/usuarios/${clave.id}/clave`, "POST", clave.claveModo === "asignar" ? { clave: clave.clave } : {});
      setClave(null);
      setNuevaClave({ usuario: clave.usuario, clave: d.clave });
    } catch (e) {
      setClave({ ...clave, saving: false, error: e instanceof Error ? e.message : "No se pudo guardar." });
    }
  }

  async function copiar(t: string) {
    try { await navigator.clipboard.writeText(t); aviso("Clave copiada"); } catch { /* el usuario puede copiarla a mano */ }
  }

  const lista = (usuarios ?? [])
    .filter((u) => filtro === "todos" || u.rol === filtro)
    .sort((a, b) => ROLES.indexOf(b.rol) - ROLES.indexOf(a.rol) || a.usuario.localeCompare(b.usuario));
  const esYo = (id?: string) => id === user.id;

  return (
    <AppShell user={user} active="usuarios">
      <div className={s.head}>
        <div>
          <div className={s.kicker}>Administración</div>
          <h1 className={s.title}>Usuarios</h1>
        </div>
        <button type="button" className={s.newBtn} onClick={nuevo}>+ Nuevo usuario</button>
      </div>

      <div className={s.filters}>
        {(["todos", ...ROLES] as const).map((k) => (
          <button key={k} type="button" className={`${s.pill} ${filtro === k ? s.pillOn : ""}`} onClick={() => setFiltro(k)}>
            {k === "todos" ? "Todos" : ROL_TXT[k]} {usuarios ? `(${k === "todos" ? usuarios.length : usuarios.filter((u) => u.rol === k).length})` : ""}
          </button>
        ))}
      </div>

      <div className={s.tHead}><span>Usuario</span><span>Rol</span><span>Ciudades</span><span>Estado</span><span /></div>
      {loadErr && <div className={s.errBox}>No pudimos cargar los usuarios. <button type="button" className="btn-link" onClick={cargar}>Intentar de nuevo</button></div>}
      {!usuarios && !loadErr && <div className={s.skeleton}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>}

      {lista.map((u) => (
        <div key={u.id} className={`${s.row} ${u.activo ? "" : s.rowOff}`}>
          <div className={s.who}>
            <div className={s.name}>{u.nombre}{esYo(u.id) && <span className={s.me}>Tú</span>}</div>
            <div className={s.user}>{u.usuario}</div>
          </div>
          <span className={`${s.rol} ${s[`rol_${u.rol}`]}`}>{ROL_TXT[u.rol]}</span>
          <div className={s.cities}>{u.rol === "monitor" ? u.ciudades.join(", ") : u.rol === "mentor" ? "Sus proyectos asignados" : "Todas las ciudades"}</div>
          <div className={s.state}><i className={s.dot} style={{ background: u.activo ? "var(--green)" : "var(--muted-2)" }} />{u.activo ? "Activo" : "Inactivo"}</div>
          <div className={s.acts}>
            <button type="button" className={s.act} onClick={() => editar(u)}>Editar</button>
            <button type="button" className={s.act} onClick={() => setClave({ id: u.id, usuario: u.usuario, claveModo: "generar", clave: "", saving: false, error: "" })}>Clave</button>
            {!esYo(u.id) && (
              <button type="button" className={`${s.act} ${u.activo ? s.actWarn : s.actOk}`} onClick={() => alternarActivo(u)}>{u.activo ? "Desactivar" : "Activar"}</button>
            )}
          </div>
        </div>
      ))}

      {form && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && !form.saving && setForm(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="u-title">
            <div id="u-title" className={s.modalTitle}>{form.modo === "crear" ? "Nuevo usuario" : `Editar ${form.usuario}`}</div>
            {form.modo === "crear" && (
              <div>
                <label className="label" htmlFor="u-usuario">Usuario</label>
                <input id="u-usuario" className="input" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} autoCapitalize="none" autoCorrect="off" placeholder="ej. maria.lopez" />
                <div className={s.hint}>Minúsculas, sin espacios ni tildes. No se puede cambiar después.</div>
              </div>
            )}
            <div>
              <label className="label" htmlFor="u-nombre">Nombre completo</label>
              <input id="u-nombre" className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <span className="label">Rol</span>
              <div className={s.roles} role="radiogroup">
                {ROLES.map((r) => {
                  const bloqueado = esYo(form.id) && r !== "admin";
                  return (
                    <label key={r} className={`${s.roleOpt} ${form.rol === r ? s.roleOn : ""}`} style={bloqueado ? { opacity: .45, cursor: "not-allowed" } : undefined}>
                      <input type="radio" name="rol" checked={form.rol === r} disabled={bloqueado} onChange={() => setForm({ ...form, rol: r })} />
                      <span><span className={s.roleName}>{ROL_TXT[r]}</span><br /><span className={s.roleDesc}>{ROL_DESC[r]}</span></span>
                    </label>
                  );
                })}
              </div>
              {esYo(form.id) && <div className={s.hint}>No puedes quitarte el rol de administración.</div>}
            </div>
            {form.rol === "monitor" && (
              <div>
                <span className="label">Ciudades</span>
                <div className={s.cityGrid}>
                  {ciudadesDisp.map((c) => {
                    const on = form.ciudades.includes(c);
                    return (
                      <label key={c} className={`${s.cityChk} ${on ? s.cityOn : ""}`}>
                        <input type="checkbox" checked={on} onChange={() => setForm({ ...form, ciudades: on ? form.ciudades.filter((x) => x !== c) : [...form.ciudades, c] })} />{c}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {form.modo === "editar" && !esYo(form.id) && (
              <label className={s.switch}><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />Cuenta activa</label>
            )}
            {form.modo === "crear" && (
              <div>
                <span className="label">Clave</span>
                <div className={s.claveOpts}>
                  {(["generar", "asignar"] as const).map((m) => (
                    <button key={m} type="button" className={`${s.pill} ${form.claveModo === m ? s.pillOn : ""}`} onClick={() => setForm({ ...form, claveModo: m })}>{m === "generar" ? "Generar automáticamente" : "Asignar una"}</button>
                  ))}
                </div>
                {form.claveModo === "asignar" && <input className="input" style={{ marginTop: 8 }} value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value })} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />}
                <div className={s.hint}>Se muestra una sola vez al guardar.</div>
              </div>
            )}
            {form.error && <div className="msg-error">{form.error}</div>}
            <div className={s.modalActions}>
              <button type="button" className={s.cancel} onClick={() => setForm(null)} disabled={form.saving}>Cancelar</button>
              <button type="button" className={s.save} onClick={guardar} disabled={form.saving}>{form.saving ? "Guardando…" : form.modo === "crear" ? "Crear usuario" : "Guardar cambios"}</button>
            </div>
          </div>
        </div>
      )}

      {clave && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && !clave.saving && setClave(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="c-title">
            <div id="c-title" className={s.modalTitle}>Clave de {clave.usuario}</div>
            <div className={s.modalSub}>La clave anterior deja de funcionar y se cierran las sesiones abiertas de este usuario.</div>
            <div className={s.claveOpts}>
              {(["generar", "asignar"] as const).map((m) => (
                <button key={m} type="button" className={`${s.pill} ${clave.claveModo === m ? s.pillOn : ""}`} onClick={() => setClave({ ...clave, claveModo: m })}>{m === "generar" ? "Generar una nueva" : "Asignar una"}</button>
              ))}
            </div>
            {clave.claveModo === "asignar" && <input className="input" value={clave.clave} onChange={(e) => setClave({ ...clave, clave: e.target.value })} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />}
            {clave.error && <div className="msg-error">{clave.error}</div>}
            <div className={s.modalActions}>
              <button type="button" className={s.cancel} onClick={() => setClave(null)} disabled={clave.saving}>Cancelar</button>
              <button type="button" className={s.save} onClick={guardarClave} disabled={clave.saving}>{clave.saving ? "Guardando…" : "Guardar clave"}</button>
            </div>
          </div>
        </div>
      )}

      {nuevaClave && (
        <div className={s.overlay}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="n-title">
            <div id="n-title" className={s.modalTitle}>Clave de {nuevaClave.usuario}</div>
            <div className={s.secret}>
              <span className={s.secretVal}>{nuevaClave.clave}</span>
              <button type="button" className={s.copy} onClick={() => copiar(nuevaClave.clave)}>Copiar</button>
            </div>
            <div className={s.once}>Guárdala o entrégala ahora: no se volverá a mostrar. Si se pierde, genera otra.</div>
            <div className={s.modalActions} style={{ gridTemplateColumns: "1fr" }}>
              <button type="button" className={s.save} onClick={() => setNuevaClave(null)}>Listo, ya la guardé</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={s.toast} role="status">{toast}</div>}
    </AppShell>
  );
}

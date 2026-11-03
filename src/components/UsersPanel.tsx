"use client";

import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { ROL_TXT, ROLES, type RolUsuario } from "@/lib/permisos";
import type { VistaUsuario } from "@/lib/usuarios";
import type { ClaveNueva, PreviaUsuarios, RevisionNombres } from "@/lib/usuariosExcel";
import AppShell from "./AppShell";
import s from "./UsersPanel.module.css";

const ROL_DESC: Record<RolUsuario, string> = {
  mentor: "Evalúa solo los proyectos que tiene asignados. El nombre debe escribirse igual que en la hoja Horarios.",
  monitor: "Inscripción: sus ciudades (quién ya eligió hora y pendientes para WhatsApp). Presentaciones: solo sus salas. Sin ciudades, solo sus salas.",
  coordinador: "Todas las ciudades: lo mismo que un monitor, resumen y Excel del cronograma.",
  admin: "Todo: además importa los Excel, gestiona usuarios y libera o cambia horas.",
};

type Form = {
  modo: "crear" | "editar";
  id?: string;
  usuario: string;
  nombre: string;
  correo: string;
  rol: RolUsuario;
  ciudades: string[];
  activo: boolean;
  claveModo: "generar" | "asignar";
  clave: string;
  saving: boolean;
  error: string;
};
type Carga = { archivo: File; previa?: PreviaUsuarios; error?: string; enviando: boolean };
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
  const [revision, setRevision] = useState<RevisionNombres | null>(null);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [claves, setClaves] = useState<ClaveNueva[] | null>(null);
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
      setRevision(d.revision ?? null);
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
    setForm({ modo: "crear", usuario: "", nombre: "", correo: "", rol: "monitor", ciudades: [], activo: true, claveModo: "generar", clave: "", saving: false, error: "" });
  }
  function editar(u: VistaUsuario) {
    setForm({ modo: "editar", id: u.id, usuario: u.usuario, nombre: u.nombre, correo: u.correo, rol: u.rol, ciudades: u.ciudades, activo: u.activo, claveModo: "generar", clave: "", saving: false, error: "" });
  }

  async function guardar() {
    if (!form) return;
    setForm({ ...form, saving: true, error: "" });
    try {
      if (form.modo === "crear") {
        const d = await pedir("/api/admin/usuarios", "POST", {
          usuario: form.usuario, nombre: form.nombre, rol: form.rol, ciudades: form.ciudades, ...(form.correo.trim() ? { correo: form.correo } : {}),
          ...(form.claveModo === "asignar" ? { clave: form.clave } : {}),
        });
        setUsuarios((us) => [...(us ?? []), d.usuario]);
        setForm(null);
        setNuevaClave({ usuario: d.usuario.usuario, clave: d.clave });
      } else {
        const d = await pedir(`/api/admin/usuarios/${form.id}`, "PATCH", { nombre: form.nombre, correo: form.correo, rol: form.rol, ciudades: form.ciudades, activo: form.activo });
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

  async function copiar(t: string, que = "Clave copiada") {
    try { await navigator.clipboard.writeText(t); aviso(que); } catch { /* el usuario puede copiarla a mano */ }
  }

  // Carga por Excel: el mismo archivo va dos veces (vista previa y confirmar).
  async function enviarCarga(archivo: File, modo: "previa" | "confirmar") {
    setCarga({ archivo, enviando: true });
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("modo", modo);
    try {
      const res = await fetch("/api/admin/usuarios/importar", { method: "POST", body: fd });
      if (res.status === 401) return window.location.assign("/login");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setCarga({ archivo, enviando: false, error: d.mensaje ?? "No se pudo leer el archivo." });
      if (d.aplicado) {
        setCarga(null);
        await cargar();
        if (d.claves?.length) setClaves(d.claves);
        else aviso(`${d.previa.totales.actualizar} usuarios actualizados ✓`);
      } else setCarga({ archivo, enviando: false, previa: d.previa });
    } catch {
      setCarga({ archivo, enviando: false, error: "No se pudo enviar el archivo. Revisa tu conexión." });
    }
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

      <div className={s.tools}>
        <section className={s.box} aria-labelledby="rev-t">
          <h2 id="rev-t" className={s.boxTitle}>Revisión de nombres</h2>
          {!revision ? <p className={s.boxSub}>Cargando…</p> : <Revision r={revision} />}
        </section>
        <section className={s.box} aria-labelledby="carga-t">
          <h2 id="carga-t" className={s.boxTitle}>Cargar varias personas desde Excel</h2>
          <p className={s.boxSub}>Columnas: <b>Nombre · Correo · Rol</b> (Mentor, Monitor o Coordinación); Usuario y Ciudades son opcionales. Si alguien ya existe, se actualiza y su clave no cambia. Primero ves qué va a pasar; nada se guarda hasta confirmar.</p>
          <div className={s.cargaActs}>
            <label className={s.fileBtn}>
              Subir archivo de Excel
              <input type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviarCarga(f, "previa"); }} />
            </label>
            <a className={s.linkBtn} href="/api/admin/plantillas/usuarios">Descargar plantilla</a>
          </div>
          {carga && <Previa carga={carga} onConfirmar={() => void enviarCarga(carga.archivo, "confirmar")} onCancelar={() => setCarga(null)} />}
        </section>
      </div>

      <div className={s.tHead}><span>Usuario</span><span>Rol</span><span>Ciudades</span><span>Estado</span><span /></div>
      {loadErr && <div className={s.errBox}>No pudimos cargar los usuarios. <button type="button" className="btn-link" onClick={cargar}>Intentar de nuevo</button></div>}
      {!usuarios && !loadErr && <div className={s.skeleton}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>}

      {lista.map((u) => (
        <div key={u.id} className={`${s.row} ${u.activo ? "" : s.rowOff}`}>
          <div className={s.who}>
            <div className={s.name}>{u.nombre}{esYo(u.id) && <span className={s.me}>Tú</span>}</div>
            <div className={s.user}>{u.usuario}</div>
            {u.correo && <div className={s.correo}>{u.correo}</div>}
          </div>
          <span className={`${s.rol} ${s[`rol_${u.rol}`]}`}>{ROL_TXT[u.rol]}</span>
          <div className={s.cities}>{u.rol === "monitor" ? u.ciudades.join(", ") || "Solo sus salas" : u.rol === "mentor" ? "Sus proyectos asignados" : "Todas las ciudades"}</div>
          <div className={s.state}><i className={s.dot} style={{ background: u.activo ? "var(--green)" : "var(--muted-2)" }} />{u.activo ? "Activo" : "Inactivo"}</div>
          <div className={s.acts}>
            <button type="button" className={s.act} onClick={() => editar(u)}>Editar</button>
            <button type="button" className={s.act} onClick={() => setClave({ id: u.id, usuario: u.usuario, claveModo: "generar", clave: "", saving: false, error: "" })}>Restablecer clave</button>
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
              <label className="label" htmlFor="u-correo">Correo (opcional)</label>
              <input id="u-correo" className="input" type="email" inputMode="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} autoCapitalize="none" autoCorrect="off" />
              <div className={s.hint}>No se usa para entrar: sirve para reconocer a la persona al cargar el Excel.</div>
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
            <div id="c-title" className={s.modalTitle}>Restablecer clave de {clave.usuario}</div>
            <div className={s.modalSub}>La clave anterior deja de funcionar y se cierran las sesiones abiertas de este usuario.</div>
            <div className={s.claveOpts}>
              {(["generar", "asignar"] as const).map((m) => (
                <button key={m} type="button" className={`${s.pill} ${clave.claveModo === m ? s.pillOn : ""}`} onClick={() => setClave({ ...clave, claveModo: m })}>{m === "generar" ? "Generar una temporal" : "Asignar una"}</button>
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

      {claves && (
        <div className={s.overlay}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="k-title">
            <div id="k-title" className={s.modalTitle}>{claves.length === 1 ? "1 usuario nuevo" : `${claves.length} usuarios nuevos`}</div>
            <div className={s.claves}>
              {claves.map((k) => (
                <div key={k.usuario} className={s.claveFila}>
                  <span>{k.nombre}<br /><span className={s.user}>{k.usuario} · {ROL_TXT[k.rol]}</span></span>
                  <code>{k.clave}</code>
                </div>
              ))}
            </div>
            <div className={s.once}>Entrégalas ahora: no se volverán a mostrar. Si una se pierde, usa «Restablecer clave».</div>
            <div className={s.modalActions}>
              <button type="button" className={s.cancel} onClick={() => void copiar(claves.map((k) => `${k.nombre} · usuario: ${k.usuario} · clave: ${k.clave}`).join("\n"), "Claves copiadas")}>Copiar todas</button>
              <button type="button" className={s.save} onClick={() => setClaves(null)}>Listo, ya las guardé</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={s.toast} role="status">{toast}</div>}
    </AppShell>
  );
}

/** Revisión de nombres (como el prototipo): verde si está bien, amarillo con los nombres si falta algo. */
function Revision({ r }: { r: RevisionNombres }) {
  const linea = (ok: boolean, texto: string, nombres?: string[], key?: string) => (
    <p key={key} className={`${s.revLine} ${ok ? s.revOk : s.revWarn}`}>{ok ? "✔ " : "⚠ "}{texto}{nombres?.length ? <b> {nombres.join(", ")}</b> : null}</p>
  );
  return (
    <>
      {!r.horariosImportados ? linea(false, "Todavía no se ha importado la hoja Horarios, así que no puedo comparar los nombres de los mentores.") : (
        <>
          {linea(!r.mentoresSinUsuario.length, r.mentoresSinUsuario.length ? (r.mentoresSinUsuario.length === 1 ? "1 mentor de Horarios no tiene usuario:" : `${r.mentoresSinUsuario.length} mentores de Horarios no tienen usuario:`) : "Todos los mentores de Horarios tienen usuario.", r.mentoresSinUsuario)}
          {r.usuariosSinMentor.map((u) => linea(false, `El usuario ${u.usuario} (${u.nombre}) no coincide con ningún mentor de Horarios.${u.sugerencias.length ? ` ¿Quisiste decir ${u.sugerencias.join(", ")}?` : ""} Corrige el nombre con «Editar».`, undefined, u.usuario))}
        </>
      )}
      {r.planSalas && (
        <>
          {linea(!r.salasSinMonitor, r.salasSinMonitor ? `${r.salasSinMonitor === 1 ? "1 sala (hora y mentor) no tiene" : `${r.salasSinMonitor} salas (hora y mentor) no tienen`} monitor. Asígnalo en Salas.` : "Todas las salas tienen monitor.")}
          {r.monitoresSinSalas.length > 0 && linea(false, r.monitoresSinSalas.length === 1 ? "1 monitor activo no tiene salas en las presentaciones:" : `${r.monitoresSinSalas.length} monitores activos no tienen salas en las presentaciones:`, r.monitoresSinSalas)}
        </>
      )}
    </>
  );
}

const TXT_ACCION = { crear: "Nuevo", actualizar: "Se actualiza", igual: "Sin cambios" } as const;

function Previa({ carga, onConfirmar, onCancelar }: { carga: Carga; onConfirmar: () => void; onCancelar: () => void }) {
  if (carga.enviando) return <p className={s.boxSub} style={{ marginTop: 12 }}>Leyendo {carga.archivo.name}…</p>;
  if (carga.error) return <div className={`note-error ${s.cargaError}`}>{carga.error}</div>;
  const p = carga.previa!;
  const aplicables = p.totales.crear + p.totales.actualizar;
  return (
    <div className={s.previa}>
      <div className={s.totales}>{carga.archivo.name}: {p.totales.crear} nuevos · {p.totales.actualizar} se actualizan · {p.totales.igual} sin cambios{p.errores.length ? ` · ${p.errores.length} con error` : ""}</div>
      {p.errores.length > 0 && (
        <ul className={s.errores}>
          {p.errores.map((e, i) => <li key={i}>{e.fila ? `Fila ${e.fila}: ` : ""}{e.mensaje}</li>)}
        </ul>
      )}
      {p.acciones.length > 0 && (
        <div className={s.acciones}>
          {p.acciones.map((a) => (
            <div key={a.fila} className={s.accion}>
              <span><b>{a.nombre}</b> · {ROL_TXT[a.rol]}</span>
              <span className={`${s.tag} ${s[`tag_${a.accion}`]}`}>{TXT_ACCION[a.accion]}</span>
              <span className={s.accionDet}>usuario {a.usuario}{a.correo ? ` · ${a.correo}` : ""}{a.rol === "monitor" ? ` · ${a.ciudades.join(", ") || "solo sus salas"}` : ""}{a.cambios.length ? ` · ${a.cambios.join(" · ")}` : ""}</span>
            </div>
          ))}
        </div>
      )}
      <div className={s.cargaActs}>
        <button type="button" className={`${s.fileBtn} ${s.confirmar}`} disabled={!!p.errores.length || !aplicables} onClick={onConfirmar}>
          {p.errores.length ? "Corrige los errores y vuelve a subirlo" : aplicables ? `Confirmar carga (${aplicables})` : "No hay nada que cambiar"}
        </button>
        <button type="button" className={s.linkBtn} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// Modo oscuro (Paso 18): el tema vive en <html data-theme="light|dark">. Sigue al sistema hasta que la persona
// elige con el botón; la elección se recuerda en este navegador (localStorage).

export const CLAVE_TEMA = "pfjc-tema";
export type Tema = "light" | "dark";

/** Va en el <head>: aplica el tema antes de pintar (sin parpadeo) y sigue los cambios del sistema si no hay elección. */
export const SCRIPT_TEMA = `(function(){var d=document.documentElement;var m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem("${CLAVE_TEMA}")}catch(e){}d.dataset.theme=t==="dark"||t==="light"?t:(m.matches?"dark":"light")}a();try{m.addEventListener("change",a)}catch(e){}})();`;

export function temaActual(): Tema {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function elegirTema(t: Tema) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(CLAVE_TEMA, t); } catch { /* sin almacenamiento: dura hasta recargar */ }
}

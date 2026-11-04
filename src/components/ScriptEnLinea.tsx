"use client";

// Script en línea que corre al leer el HTML, antes de pintar (guía de Next 16 "Preventing flash before hydration").
// En el servidor sale como text/javascript (el navegador lo ejecuta con su nonce de la CSP); en el cliente React lo
// ve como text/plain, así no avisa "Encountered a script tag" ni lo vuelve a ejecutar. suppressHydrationWarning
// cubre esa diferencia de type y la del nonce (el navegador lo oculta del DOM).
export default function ScriptEnLinea({ html, nonce }: { html: string; nonce?: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

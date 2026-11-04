// Content-Security-Policy (cierre técnico). Solo lo necesario: lo propio, Google Fonts y los scripts con el nonce
// de cada petición (los de Next y el del tema, src/lib/tema.ts). La pone src/proxy.ts en cada página.
// - script-src: nonce + 'strict-dynamic' (Next mete scripts en línea distintos por página: un hash no alcanza).
//   En desarrollo, 'unsafe-eval' (React lo usa para depurar; en producción no).
// - style-src: 'unsafe-inline' porque React escribe atributos style="…" al renderizar en el servidor (un nonce no
//   cubre atributos, y si hubiera nonce el navegador ignoraría 'unsafe-inline'). Solo estilos: no ejecuta código.
// - connect-src 'self': la app solo llama a su propia API.

export function politicaCSP(nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

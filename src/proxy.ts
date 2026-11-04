import { NextResponse, type NextRequest } from "next/server";
import { politicaCSP } from "@/lib/csp";

// Proxy de Next 16 (antes "middleware"): un nonce nuevo por petición para la CSP. Next lo lee del encabezado
// Content-Security-Policy de la petición y lo pone en sus scripts; el layout lo lee de "x-nonce" para el del tema.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaCSP(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce); // siempre lo pone el servidor: lo que mande el navegador se reemplaza
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      // Páginas: no la API (responde JSON o archivos) ni los archivos estáticos.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

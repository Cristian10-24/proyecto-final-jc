import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./tokens.css";
import "./globals.css";
import { SCRIPT_TEMA } from "@/lib/tema";

export const metadata: Metadata = {
  title: "Proyecto final · Jóvenes creaTIvos",
  description: "Elige el día y la hora de la presentación de tu proyecto final.",
  robots: { index: false, follow: false },
  icons: { icon: "/logo-jc.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F25C2A" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce de la CSP (src/proxy.ts) para el script del tema. Leer headers() hace que todas las páginas se rendericen
  // en cada petición, que es lo que exige el nonce.
  // Solo si la petición pasó por el proxy (trae su CSP con ese nonce): un x-nonce que mande el cliente no sirve.
  const h = await headers(), x = h.get("x-nonce");
  const nonce = x && h.get("content-security-policy")?.includes(`'nonce-${x}'`) ? x : undefined;
  return (
    // data-theme lo pone el script antes de pintar (modo oscuro): por eso React no debe quejarse de la diferencia.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

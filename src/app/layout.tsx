import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme lo pone el script antes de pintar (modo oscuro): por eso React no debe quejarse de la diferencia.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
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

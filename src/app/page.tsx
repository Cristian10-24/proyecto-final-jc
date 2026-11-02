import { redirect } from "next/navigation";
import { studentPortalOpen } from "@/lib/portal";

export const dynamic = "force-dynamic";

// Portal del estudiante: se construye en el Día 5 del plan (documento → datos → día → hora → confirmar).
export default function Home() {
  if (!studentPortalOpen()) redirect("/cerrado");
  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 14 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-jc.png" alt="Jóvenes creaTIvos" style={{ height: 58, width: "auto", marginBottom: 12 }} />
      <div className="kicker" style={{ color: "var(--orange-dark)" }}>Proyecto final 2026</div>
      <h1 style={{ margin: 0, font: "800 32px/1.1 var(--font)", letterSpacing: "-.03em", maxWidth: 480 }}>Muy pronto podrás elegir la hora de tu presentación</h1>
      <p style={{ margin: 0, font: "500 17px/1.5 var(--font)", color: "var(--muted)", maxWidth: 420 }}>
        Tu monitor te avisará cuando esté abierto.
      </p>
    </main>
  );
}

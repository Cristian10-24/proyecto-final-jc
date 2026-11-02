import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { inicioPorRol } from "@/lib/permisos";
import LoginForm from "./LoginForm";
import s from "./login.module.css";

export const metadata = { title: "Ingresa · Panel de monitores · Jóvenes creaTIvos" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(inicioPorRol(user.rol));
  return (
    <div className={s.shell}>
      <aside className={s.brand}>
        <i className={s.ring} aria-hidden />
        <i className={s.sun} aria-hidden />
        <i className={s.square} aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className={s.logoChip}><img src="/logo-jc.png" alt="Jóvenes creaTIvos" /></div>
        <div style={{ flex: 1 }} />
        <div className={s.brandKicker}>MONITORES Y COORDINACIÓN</div>
        <div className={s.brandTitle}>Mira rápido quién falta en tu grupo</div>
        <div style={{ flex: 1.2 }} />
      </aside>
      <div className={s.formSide}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-jc.png" alt="Jóvenes creaTIvos" className={s.logoMobile} />
        <LoginForm />
      </div>
    </div>
  );
}

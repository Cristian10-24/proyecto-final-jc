import { describe, expect, it } from "vitest";
import { NAV } from "@/components/AppShell";
import { TABS } from "@/components/evaluacion/EvalShell";
import { puede, type Permiso } from "@/lib/permisos";

// Fase 6 · Las pestañas nuevas solo aparecen a quien corresponde, en EvalShell (TABS) y en el menú del Panel (NAV):
// «Mi ciudad» solo al monitor (también como rol adicional); «Monitores» solo a coordinación y admin.

type U = { rol: "mentor" | "monitor" | "coordinador" | "admin"; rolesExtra?: ("mentor" | "monitor" | "coordinador")[] };
const ve = (lista: { label: string; permiso: Permiso | Permiso[] }[], u: U, label: string) =>
  lista.filter((t) => [t.permiso].flat().some((p) => puede(u as never, p))).some((t) => t.label === label);

const ROLES: [string, U][] = [
  ["monitor", { rol: "monitor" }], ["coordinador", { rol: "coordinador" }], ["admin", { rol: "admin" }], ["mentor", { rol: "mentor" }],
  ["mentor + monitor", { rol: "mentor", rolesExtra: ["monitor"] }], ["monitor + coordinación", { rol: "monitor", rolesExtra: ["coordinador"] }],
];

describe("pestañas nuevas", () => {
  for (const [nombre, menu] of [["EvalShell", TABS], ["AppShell (Panel)", NAV]] as const)
    for (const [quien, u] of ROLES)
      it(`${nombre}: ${quien}`, () => {
        const monitor = u.rol === "monitor" || !!u.rolesExtra?.includes("monitor");
        const coordOAdmin = u.rol === "admin" || u.rol === "coordinador" || !!u.rolesExtra?.includes("coordinador");
        expect(ve(menu, u, "Mi ciudad")).toBe(monitor);
        expect(ve(menu, u, "Monitores")).toBe(coordOAdmin);
        expect(ve(menu, u, "Mis salas")).toBe(false); // entrega B: se fusionó con «Mis proyectos»
        expect(ve(menu, u, "Mis proyectos")).toBe(monitor || coordOAdmin);
      });
});

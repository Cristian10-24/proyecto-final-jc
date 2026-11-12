// Íconos de línea de las vistas nuevas (24×24, color = currentColor). Siempre decorativos: el texto o el
// aria-label del botón dice qué hace.

type P = { size?: number };
const svg = (size: number, d: React.ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{d}</svg>
);

export const IcoTelefono = ({ size = 18 }: P) => svg(size, <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />);
export const IcoWhatsApp = ({ size = 18 }: P) => svg(size, <path d="M3 21l1.7-4.6A8.5 8.5 0 1 1 8 19.6L3 21z" />);
export const IcoBuscar = ({ size = 18 }: P) => svg(size, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const IcoFiltros = ({ size = 18 }: P) => svg(size, <path d="M4 6h16M7 12h10M10 18h4" />);
export const IcoCerrar = ({ size = 20 }: P) => svg(size, <path d="M6 6l12 12M18 6L6 18" />);
export const IcoMenu = ({ size = 22 }: P) => svg(size, <path d="M4 7h16M4 12h16M4 17h16" />);
export const IcoFlecha = ({ size = 18 }: P) => svg(size, <path d="M6 9l6 6 6-6" />);
export const IcoCarpeta = ({ size = 20 }: P) => svg(size, <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IcoUbicacion = ({ size = 20 }: P) => svg(size, <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const IcoCuadricula = ({ size = 20 }: P) => svg(size, <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const IcoLista = ({ size = 20 }: P) => svg(size, <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />);
export const IcoLuna = ({ size = 20 }: P) => svg(size, <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />);
export const IcoSol = ({ size = 20 }: P) => svg(size, <><circle cx="12" cy="12" r="4.5" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const IcoSalir = ({ size = 20 }: P) => svg(size, <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />);
export const IcoAlerta = ({ size = 20 }: P) => svg(size, <><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>);
export const IcoReloj = ({ size = 20 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IcoDescargar = ({ size = 18 }: P) => svg(size, <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />);
export const IcoCamara = ({ size = 18 }: P) => svg(size, <><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="M15.5 10.5l6-3.5v10l-6-3.5" /></>);
export const IcoVacio = ({ size = 26 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>);

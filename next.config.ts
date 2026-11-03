import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// En desarrollo, permite abrir el servidor desde el celular por el wifi (npm run dev:red): las IP privadas
// de este computador. En producción no aplica.
const ipsLocales = Object.values(networkInterfaces()).flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ipsLocales,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

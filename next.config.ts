import type { NextConfig } from "next";
const isDevelopment = process.env.NODE_ENV !== "production";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: { "/share-card/*/*": ["./public/assets/share/ruvora-orb-card.png"] },
  agentRules: false,
  devIndicators: false,
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    const apiHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      {
        key: "Content-Security-Policy",
        value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      },
      ...(!isDevelopment
        ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
        : []),
    ];
    return [
      {
        source: "/api/(.*)",
        headers: apiHeaders,
      },
    ];
  },
};
export default config;

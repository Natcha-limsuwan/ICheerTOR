import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// The backend API is on a different origin; the browser may only fetch from it and from this app.
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api").origin;

/**
 * Content Security Policy (threats T11, T25; ASVS V3.4.3, V3.4.6).
 *
 * Allowlist-based policy following the Next.js "Without Nonces" guide, so
 * pages stay statically renderable. 'unsafe-inline' is still needed for
 * Next.js bootstrap scripts and MUI/Emotion styles; moving scripts to a
 * nonce-based policy (proxy.ts + dynamic rendering) is the documented
 * upgrade path. 'unsafe-eval' is only added in development (React dev tools).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.gstatic.com https://lh3.googleusercontent.com",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only when the deployment is HTTPS; otherwise a local production build could not reach http://localhost.
  ...(apiOrigin.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Obsolete but harmless backup for frame-ancestors in older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The OAuth callback page briefly holds a one-time login code: never cache it, never leak it via Referer.
      {
        source: "/callback",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

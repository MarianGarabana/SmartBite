import path from "node:path";
import { fileURLToPath } from "node:url";
import { OFF_PRODUCT_URL } from "./lib/off.js";
import { HOSTED_LLM_ORIGINS } from "./lib/providers.js";

// Content-Security-Policy: the browser may call only this site, the model hosts in lib/providers.js, Open Food
// Facts and the user's own computer. It guards the API key in localStorage: an injected script could not send it
// anywhere else. SMARTBITE_CSP=enforce | report-only | off; Vercel builds default to report-only (watch the
// console, then switch to enforce), local runs to off so a copy on localhost can call any endpoint.
const CSP_MODE = process.env.SMARTBITE_CSP || (process.env.VERCEL ? "report-only" : "off");
const isDev = process.env.NODE_ENV === "development";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`, // Next.js inline scripts; eval only for dev reload
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", // photos the user adds are blob URLs
  "font-src 'self' data:",
  ["connect-src 'self'", ...HOSTED_LLM_ORIGINS, new URL(OFF_PRODUCT_URL).origin, "http://localhost:*", "http://127.0.0.1:*"]
    .join(" "),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(CSP_MODE === "off" ? []
    : [{ key: CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp }]),
];

/** Demo meals are read from demo/meals/*.json on the server, so they go into every server trace. */
const nextConfig = {
  devIndicators: false, // keeps the dev badge out of the comparison screenshots
  poweredByHeader: false,
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)), // this folder is the app root
  outputFileTracingIncludes: { "/*": ["./demo/meals/*.json"] },
  // Settings became Profile (2026-10-22): old links still work
  async redirects() {
    return [{ source: "/settings", destination: "/profile", permanent: true }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Dev only: the Python engine runs on 8100 (on Vercel, vercel.json routes /api/* to the engine service)
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      { source: "/api/evaluate", destination: "http://127.0.0.1:8100/api/evaluate" },
      { source: "/api/health", destination: "http://127.0.0.1:8100/api/health" },
    ];
  },
};
export default nextConfig;

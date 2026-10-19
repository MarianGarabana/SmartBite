import path from "node:path";
import { fileURLToPath } from "node:url";

/** Demo meals are read from demo/meals/*.json on the server, so they go into every server trace. */
const nextConfig = {
  devIndicators: false, // keeps the dev badge out of the comparison screenshots
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)), // this folder is the app root
  outputFileTracingIncludes: { "/*": ["./demo/meals/*.json"] },
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

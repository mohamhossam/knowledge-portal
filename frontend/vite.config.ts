import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { basePath } from "./basePath.ts";
import { contentSecurityPolicy } from "./contentSecurityPolicy.ts";

// The knowledge API in development: `uv run python -m knowledge_portal.interfaces.api.serve --port 8100`.
const apiPort = process.env.KNOWLEDGE_API_PORT ?? "8100";

const apiProxy = {
  "/knowledge-api": {
    target: `http://127.0.0.1:${apiPort}`,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/knowledge-api/, ""),
  },
};

/**
 * Served under KNOWLEDGE_BASE_PATH: /knowledge/ unless set, as on the platform's
 * origin beside requirement work, or / on the portal's own hostname
 * (requirement-portal ADR-0104). Its API is /knowledge-api/.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: basePath(env.KNOWLEDGE_BASE_PATH),
    plugins: [
      react(),
      contentSecurityPolicy({
        apiBase: env.VITE_API_BASE,
        identityOrigins: env.CSP_IDENTITY_ORIGINS,
      }),
    ],
    server: { port: 5174, strictPort: true, proxy: apiProxy },
    preview: { port: 4174, strictPort: true, proxy: apiProxy },
  };
});

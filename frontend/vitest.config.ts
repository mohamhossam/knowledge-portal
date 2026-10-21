import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VITE_API_BASE": JSON.stringify("http://localhost/knowledge-api") },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // Rendering with real CSS in jsdom is heavy, and the suite runs in parallel: under load a
    // whole explorer sheet can take over the default 5 s. A hang still fails, at 15 s.
    testTimeout: 15_000,
  },
});

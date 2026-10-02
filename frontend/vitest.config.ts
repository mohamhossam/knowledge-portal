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
  },
});

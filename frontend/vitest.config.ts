import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Pages print times in the reader's own zone; tests read them in UTC so a fixture's
// "09:30Z" reads 09:30 on any machine. Set before the workers start, so they inherit it.
process.env.TZ = "UTC";

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

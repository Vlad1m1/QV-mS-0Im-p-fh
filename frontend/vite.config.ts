import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { setupFiles: ["./src/test/setup.ts"] },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        // Keep Host aligned with the browser's Origin for the API's CSRF checks.
        changeOrigin: false,
      },
    },
  },
});

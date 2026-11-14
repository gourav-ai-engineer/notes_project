/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const apiPort = process.env.PORT ?? "8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser only ever talks to /api; the server holds the secret key.
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
  preview: {
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/components/**/*.test.{ts,tsx}"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
  },
});

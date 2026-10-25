import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Base-aware build: BASE_PATH=/<REPO>/ for project sites, default "/" for local dev and owner sites.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "NexTHTax เอกสารภาษีบนเครื่อง",
        short_name: "NexTHTax",
        lang: "th",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#1f5f8b",
      },
      workbox: {
        // Precache app shell and static rule catalog only. Workspace files live outside the origin.
        globPatterns: ["**/*.{js,css,html,json,mjs,wasm}"],
        globIgnores: ["**/attachments/**", "**/data.json"],
        navigateFallback: null,
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 0,
  },
});

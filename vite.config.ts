import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "scheduler"],
  },
  optimizeDeps: {
    // Força o Vite a pré-bundlizar TUDO que é usado pelo React internamente.
    // Sem isso, o Rollup deixa "scheduler" como bare import externo,
    // causando "Failed to resolve module specifier scheduler" no browser.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "scheduler",
    ],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 15000,
    rollupOptions: {
      // NENHUMA configuração de external — tudo deve ser bundlizado.
      // O manualChunks foi removido pois causava o scheduler ser
      // extraído como chunk separado sem ser resolvido corretamente.
      output: {
        // Sem manualChunks: o Rollup decide a divisão automaticamente.
        // Isso garante que scheduler, react e react-dom ficam no mesmo chunk.
      },
    },
  },
  server: {
    port: 4000,
    strictPort: false,
    host: true,
  },
});

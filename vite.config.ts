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
      // "@assets" removido — a pasta attached_assets/ não existe no repositório.
      // Se for necessário no futuro, crie a pasta e reative o alias abaixo:
      // "@assets": path.resolve(import.meta.dirname, "attached_assets"),
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
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Apenas react-vendor (react+scheduler juntos, obrigatório para evitar
        // "Failed to resolve module specifier scheduler").
        // Sem fragmentação excessiva → build significativamente mais rápido.
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
  server: {
    port: 4000,
    strictPort: false,
    host: true,
  },
});

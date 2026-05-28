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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // manualChunks seguro: agrupa vendors pesados sem separar react/scheduler.
        // react, react-dom e scheduler ficam JUNTOS no chunk "react-vendor"
        // para evitar o erro "Failed to resolve module specifier scheduler".
        manualChunks(id) {
          // React runtime (scheduler deve ficar junto com react-dom)
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/") ||
            id.includes("node_modules/react/jsx-runtime") ||
            id.includes("node_modules/react/jsx-dev-runtime")
          ) {
            return "react-vendor";
          }
          // Radix UI — muitos pacotes pequenos, agrupar reduz overhead de chunks
          if (id.includes("node_modules/@radix-ui/")) {
            return "radix-vendor";
          }
          // Gráficos e visualização
          if (
            id.includes("node_modules/recharts/") ||
            id.includes("node_modules/d3") ||
            id.includes("node_modules/victory")
          ) {
            return "charts-vendor";
          }
          // PDF e geração de documentos
          if (
            id.includes("node_modules/jspdf/") ||
            id.includes("node_modules/pdf-lib/") ||
            id.includes("node_modules/html2canvas/")
          ) {
            return "pdf-vendor";
          }
          // Animações
          if (id.includes("node_modules/framer-motion/")) {
            return "motion-vendor";
          }
          // Markdown
          if (
            id.includes("node_modules/react-markdown/") ||
            id.includes("node_modules/remark") ||
            id.includes("node_modules/unified") ||
            id.includes("node_modules/hast") ||
            id.includes("node_modules/mdast") ||
            id.includes("node_modules/micromark")
          ) {
            return "markdown-vendor";
          }
          // Demais node_modules em um chunk genérico
          if (id.includes("node_modules/")) {
            return "vendor";
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

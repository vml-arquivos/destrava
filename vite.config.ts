import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }
          // Radix UI
          if (id.includes("node_modules/@radix-ui")) {
            return "vendor-radix";
          }
          // Mermaid (diagramas) — isolado por ser gigante
          if (id.includes("node_modules/mermaid") || id.includes("node_modules/cytoscape")) {
            return "vendor-mermaid";
          }
          // Shiki (syntax highlighter com 200+ linguagens) — maior culpado do bundle pesado
          if (id.includes("node_modules/shiki") || id.includes("node_modules/@shikijs")) {
            return "vendor-shiki";
          }
          // KaTeX (renderização matemática)
          if (id.includes("node_modules/katex")) {
            return "vendor-katex";
          }
          // Recharts / D3
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3")) {
            return "vendor-charts";
          }
          // Framer Motion
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          // Supabase
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          // Demais node_modules
          if (id.includes("node_modules")) {
            return "vendor-misc";
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

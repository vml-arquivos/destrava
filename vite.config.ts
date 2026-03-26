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
    // CRÍTICO: garante que apenas UMA instância do React é usada em todo o bundle.
    // Sem isso, pacotes como streamdown/react-markdown podem criar uma segunda
    // instância, causando "Cannot read properties of undefined (reading 'createContext')".
    dedupe: ["react", "react-dom", "scheduler"],
  },
  // Pré-bundling das dependências mais pesadas para evitar ciclos no build
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@supabase/supabase-js",
      "framer-motion",
      "recharts",
    ],
    exclude: ["shiki", "mermaid"],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: {
        // Estratégia simplificada: apenas separa os chunks gigantes que
        // causam timeout no browser. Não tenta separar React — o Vite/Rollup
        // já garante uma única instância via dedupe + optimizeDeps.
        manualChunks(id) {
          // Shiki: 9MB — deve ficar isolado para não bloquear o carregamento
          if (
            id.includes("node_modules/shiki/") ||
            id.includes("node_modules/@shikijs/")
          ) {
            return "vendor-shiki";
          }
          // Mermaid: 1.5MB — isolado por tamanho
          if (
            id.includes("node_modules/mermaid/") ||
            id.includes("node_modules/cytoscape/")
          ) {
            return "vendor-mermaid";
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

import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  // Fallback observável: se o #root não existir, exibe erro visível
  // em vez de tela branca silenciosa
  document.body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#dc2626;padding:2rem;text-align:center">' +
    "<h1>Erro crítico: elemento #root não encontrado.</h1>" +
    "<p>Verifique o index.html e o build do frontend.</p>" +
    "</div>";
} else {
  createRoot(rootEl).render(
    // ErrorBoundary no nível mais alto captura qualquer erro de bootstrap,
    // incluindo falhas no AuthProvider, antes que resultem em tela branca silenciosa
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  );
}

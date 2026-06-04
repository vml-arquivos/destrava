// API client with JWT token management
// Replaces Supabase SDK for all frontend API calls

const API_BASE = "";

// Chave canônica do token. A leitura ainda tenta a chave legada "token"
// para compatibilidade com sessões já abertas antes desta padronização.
const TOKEN_KEY = "destrava_token";
const TOKEN_KEY_LEGACY = "token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY_LEGACY) || null;
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Remove a chave legada ao fazer login para não deixar dois tokens em aberto
  localStorage.removeItem(TOKEN_KEY_LEGACY);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY_LEGACY);
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isFormData && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(API_BASE + path, {
    ...options,
    headers,
  });

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  let payload: any = null;
  if (text.trim() && contentType.includes("application/json")) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      (text.trim() && !contentType.includes("application/json")
        ? text.slice(0, 180).replace(/\s+/g, " ")
        : res.statusText);

    throw new Error(message || `HTTP ${res.status}`);
  }

  if (!text.trim()) return null;

  if (!contentType.includes("application/json")) {
    throw new Error(
      `A rota ${path} não retornou JSON. Content-Type recebido: ${contentType || "vazio"}`
    );
  }

  return payload;
}

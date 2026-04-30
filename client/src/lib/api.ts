// API client with JWT token management
// Replaces Supabase SDK for all frontend API calls

const API_BASE = "";

export function getToken(): string | null {
  return localStorage.getItem("destrava_token") || localStorage.getItem("token");
}

export function setToken(token: string): void {
  localStorage.setItem("destrava_token", token);
  localStorage.setItem("token", token);
}

export function removeToken(): void {
  localStorage.removeItem("destrava_token");
  localStorage.removeItem("token");
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();

  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
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

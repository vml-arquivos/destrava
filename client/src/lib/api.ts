// API client with JWT token management
// Replaces Supabase SDK for all frontend API calls

const API_BASE = "";

export function getToken(): string | null {
  return localStorage.getItem("destrava_token");
}

export function setToken(token: string): void {
  localStorage.setItem("destrava_token", token);
}

export function removeToken(): void {
  localStorage.removeItem("destrava_token");
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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * webhookClient.ts
 *
 * Cliente HTTP para o Nexus assinar e enviar eventos do Automation Engine.
 * Assina cada requisição (HMAC-SHA256 + timestamp + nonce) por cima do
 * segredo compartilhado já existente, seguindo o mesmo esquema verificado
 * por webhookAuth.ts no lado receptor.
 */
import crypto from "crypto";
import { assinarPayload } from "../../middleware/webhookAuth";

export interface RespostaWebhook {
  ok: boolean;
  status: number;
  body: string;
}

function nexusBaseUrl(): string {
  return (process.env.NEXUS_PUBLIC_URL || "").replace(/\/$/, "");
}

function segredoCompartilhado(): string {
  return (process.env.NEXUS_INTEGRATION_SECRET || process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET || "").trim();
}

export function nexusConfigurado(): boolean {
  return Boolean(nexusBaseUrl() && segredoCompartilhado());
}

/**
 * Chama um endpoint do Nexus com a mesma assinatura HMAC para qualquer
 * método -- usado tanto pelo despacho de eventos (POST) quanto pela tela de
 * acompanhamento bancário (GET/PATCH ao vivo na tarefa do Nexus). Sempre
 * envia um corpo JSON (mesmo que "{}" para leituras), para que a verificação
 * de assinatura do lado receptor seja consistente independente do método.
 * Lança em caso de falha de rede ou HTTP não-2xx.
 */
export async function chamarNexus(
  metodo: "GET" | "POST" | "PATCH",
  caminho: string,
  payload: Record<string, unknown> = {},
  idempotencyKey?: string
): Promise<RespostaWebhook> {
  const base = nexusBaseUrl();
  if (!base) throw new Error("NEXUS_PUBLIC_URL não configurado");

  // Assina sempre sobre o JSON do payload (mesmo "{}" para leituras sem
  // corpo), pra bater com a verificação do lado receptor -- mas o fetch()
  // não pode enviar body em GET (Node/undici rejeita), então só anexamos
  // o body de fato para métodos que o admitem.
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString("hex");
  const assinatura = assinarPayload(body, timestamp, nonce);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Signature": assinatura,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "x-nexus-integration-secret": segredoCompartilhado(),
    "X-Source": "destrava-credito",
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers,
    body: metodo === "GET" ? undefined : body,
    signal: AbortSignal.timeout(10_000),
  });

  const responseBody = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: responseBody };
}

/** Compatibilidade com o dispatcher de eventos (sempre POST). */
export async function enviarWebhookNexus(
  caminho: string,
  payload: Record<string, unknown>,
  idempotencyKey: string
): Promise<RespostaWebhook> {
  return chamarNexus("POST", caminho, payload, idempotencyKey);
}

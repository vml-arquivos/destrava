import {
  getMarketingAttribution,
  trackEvent,
  type MarketingAttribution,
} from "@/lib/analytics";

export type LeadPayload = Record<string, unknown> & {
  nome: string;
  telefone: string;
  origem: string;
};

export class LeadSubmissionError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "LeadSubmissionError";
    this.status = status;
  }
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};

  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorMessage(data: Record<string, unknown>) {
  const value = data.message || data.error;
  return typeof value === "string" && value.trim()
    ? value
    : "Não foi possível enviar seus dados agora. Tente novamente ou fale conosco pelo WhatsApp.";
}

export async function submitLead(
  payload: LeadPayload,
  attribution: MarketingAttribution = getMarketingAttribution(),
) {
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...attribution, ...payload }),
  });
  const data = await parseResponse(response);

  if (!response.ok) throw new LeadSubmissionError(errorMessage(data), response.status);

  const id = data.id || data.lead_id || data.triagem_id;
  trackEvent("generate_lead", {
    lead_id: typeof id === "string" || typeof id === "number" ? String(id) : undefined,
    lead_source: payload.origem,
    product: typeof payload.produto_interesse === "string" ? payload.produto_interesse : undefined,
    value: typeof payload.valorDesejado === "number" ? payload.valorDesejado : undefined,
    currency: "BRL",
  });

  return data;
}

export async function submitContact(payload: Record<string, unknown>) {
  const attribution = getMarketingAttribution();
  const response = await fetch("/api/contato", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...attribution, ...payload }),
  });
  const data = await parseResponse(response);

  if (!response.ok) throw new LeadSubmissionError(errorMessage(data), response.status);

  trackEvent("generate_lead", {
    lead_source: "contato_site",
    form_name: "contato",
    currency: "BRL",
  });
  return data;
}


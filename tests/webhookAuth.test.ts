/**
 * webhookAuth.test.ts
 *
 * Cobre a assinatura HMAC-SHA256 + janela de replay + nonce de uso único
 * (server/middleware/webhookAuth.ts) que endurece o tráfego serviço-a-serviço
 * do Automation Engine por cima do segredo estático já existente.
 */
import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import { assinarPayload, verificarAssinaturaRequisicao } from "../server/middleware/webhookAuth";

const SEGREDO = "segredo-de-teste-bem-forte";

function construirRequisicao(overrides: Partial<{ body: string; timestamp: string; nonce: string; semAssinatura: boolean }> = {}) {
  const body = overrides.body ?? JSON.stringify({ ok: true });
  const timestamp = overrides.timestamp ?? String(Date.now());
  const nonce = overrides.nonce ?? crypto.randomBytes(8).toString("hex");
  const assinatura = assinarPayload(body, timestamp, nonce);

  return {
    headers: overrides.semAssinatura
      ? {}
      : {
          "x-signature": assinatura,
          "x-timestamp": timestamp,
          "x-nonce": nonce,
        },
    rawBody: Buffer.from(body),
    body: JSON.parse(body),
  } as any;
}

describe("webhookAuth", () => {
  beforeEach(() => {
    process.env.NEXUS_INTEGRATION_SECRET = SEGREDO;
    delete process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET;
    delete process.env.INTEGRATION_SECRET;
  });

  it("aceita uma requisição assinada corretamente", () => {
    const req = construirRequisicao();
    const resultado = verificarAssinaturaRequisicao(req);
    expect(resultado.valido).toBe(true);
  });

  it("rejeita quando os cabeçalhos de assinatura estão ausentes", () => {
    const req = construirRequisicao({ semAssinatura: true });
    const resultado = verificarAssinaturaRequisicao(req);
    expect(resultado.valido).toBe(false);
    expect(resultado.erro).toMatch(/ausentes/i);
  });

  it("rejeita timestamp fora da janela de replay (>5min)", () => {
    const seiMinutosAtras = String(Date.now() - 6 * 60 * 1000);
    const req = construirRequisicao({ timestamp: seiMinutosAtras });
    const resultado = verificarAssinaturaRequisicao(req);
    expect(resultado.valido).toBe(false);
    expect(resultado.erro).toMatch(/janela/i);
  });

  it("rejeita assinatura inválida (corpo adulterado depois de assinado)", () => {
    const body = JSON.stringify({ ok: true });
    const timestamp = String(Date.now());
    const nonce = crypto.randomBytes(8).toString("hex");
    const assinatura = assinarPayload(body, timestamp, nonce);

    const req = {
      headers: { "x-signature": assinatura, "x-timestamp": timestamp, "x-nonce": nonce },
      rawBody: Buffer.from(JSON.stringify({ ok: false })), // corpo diferente do assinado
      body: { ok: false },
    } as any;

    const resultado = verificarAssinaturaRequisicao(req);
    expect(resultado.valido).toBe(false);
    expect(resultado.erro).toMatch(/inválida/i);
  });

  it("rejeita reuso do mesmo nonce (replay de uma requisição capturada)", () => {
    const nonce = crypto.randomBytes(8).toString("hex");
    const req1 = construirRequisicao({ nonce });
    const primeira = verificarAssinaturaRequisicao(req1);
    expect(primeira.valido).toBe(true);

    // Mesmo nonce, mesmo timestamp/corpo (replay exato da mesma requisição)
    const req2 = construirRequisicao({ nonce, timestamp: req1.headers["x-timestamp"], body: req1.rawBody.toString() });
    const segunda = verificarAssinaturaRequisicao(req2);
    expect(segunda.valido).toBe(false);
    expect(segunda.erro).toMatch(/reutilizado/i);
  });

  it("sem segredo configurado, recusa com erro de configuração", () => {
    delete process.env.NEXUS_INTEGRATION_SECRET;
    const req = construirRequisicao();
    const resultado = verificarAssinaturaRequisicao(req);
    expect(resultado.valido).toBe(false);
    expect(resultado.erro).toMatch(/não configurada/i);
  });
});

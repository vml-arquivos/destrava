/**
 * webhookAuth.ts
 *
 * Autenticação reforçada para o tráfego serviço-a-serviço do Automation
 * Engine (Destrava <-> Nexus). Endurece o segredo estático já existente
 * (NEXUS_INTEGRATION_SECRET / requireNexusIntegration) com assinatura
 * HMAC-SHA256 + janela de replay (timestamp) + nonce de uso único --
 * sem substituir o mecanismo antigo, que continua protegendo as rotas
 * /api/nexus/* já existentes.
 */
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // ±5 min

// Cache de nonces já usados, para impedir replay de uma requisição capturada.
// Em memória é suficiente porque tanto Destrava quanto Nexus rodam como
// processo único hoje (sem múltiplas réplicas atrás de um load balancer).
const noncesUsados = new Map<string, number>();

function limparNoncesExpirados(agora: number) {
  for (const [nonce, expiraEm] of noncesUsados) {
    if (expiraEm < agora) noncesUsados.delete(nonce);
  }
}

function segredoCompartilhado(): string {
  return (
    process.env.NEXUS_INTEGRATION_SECRET ||
    process.env.NEXUS_DESTRAVA_INTEGRATION_SECRET ||
    process.env.INTEGRATION_SECRET ||
    ""
  ).trim();
}

export function assinarPayload(body: string, timestamp: string, nonce: string): string {
  const base = `${timestamp}.${nonce}.${body}`;
  return crypto.createHmac("sha256", segredoCompartilhado()).update(base).digest("hex");
}

/**
 * Verificação pura (sem side-effect de resposta HTTP), usada tanto pelo
 * middleware abaixo quanto por rotas que precisam decidir condicionalmente
 * se exigem assinatura (ex.: /api/nexus/eventos, que também atende chamadas
 * legadas sem X-Signature e não pode quebrar essas por causa do Automation
 * Engine).
 */
export function verificarAssinaturaRequisicao(req: Request): { valido: boolean; erro?: string } {
  const segredo = segredoCompartilhado();
  if (!segredo) return { valido: false, erro: "Integração Destrava/Nexus não configurada (segredo ausente)." };

  const assinatura = String(req.headers["x-signature"] || "");
  const timestamp = String(req.headers["x-timestamp"] || "");
  const nonce = String(req.headers["x-nonce"] || "");

  if (!assinatura || !timestamp || !nonce) {
    return { valido: false, erro: "Cabeçalhos de assinatura ausentes (X-Signature/X-Timestamp/X-Nonce)." };
  }

  const agora = Date.now();
  const timestampNum = Number(timestamp);
  if (!Number.isFinite(timestampNum) || Math.abs(agora - timestampNum) > REPLAY_WINDOW_MS) {
    return { valido: false, erro: "Timestamp fora da janela permitida." };
  }

  limparNoncesExpirados(agora);
  if (noncesUsados.has(nonce)) {
    return { valido: false, erro: "Requisição já processada (nonce reutilizado)." };
  }

  const rawBody = (req as any).rawBody ? String((req as any).rawBody) : JSON.stringify(req.body || {});
  const esperada = assinarPayload(rawBody, timestamp, nonce);

  const assinaturaBuf = Buffer.from(assinatura, "hex");
  const esperadaBuf = Buffer.from(esperada, "hex");
  const valida =
    assinaturaBuf.length === esperadaBuf.length && crypto.timingSafeEqual(assinaturaBuf, esperadaBuf);

  if (!valida) return { valido: false, erro: "Assinatura inválida." };

  noncesUsados.set(nonce, agora + REPLAY_WINDOW_MS);
  return { valido: true };
}

/**
 * Middleware para as rotas novas do Automation Engine que recebem chamadas
 * do Nexus (ex.: server/routes/automationEngine.ts). Exige X-Signature,
 * X-Timestamp e X-Nonce válidos, além do segredo já configurado.
 */
export function requireWebhookSignature(req: Request, res: Response, next: NextFunction) {
  const resultado = verificarAssinaturaRequisicao(req);
  if (!resultado.valido) {
    res.status(resultado.erro?.includes("não configurada") ? 503 : 401).json({ error: resultado.erro });
    return;
  }
  next();
}

/**
 * eventBus.ts
 *
 * Catálogo tipado dos eventos de domínio do Automation Engine e ponto único
 * de publicação (publishEvent). Publicar um evento sempre grava no outbox
 * primeiro (garantindo durabilidade/idempotência) e só depois tenta o
 * despacho imediato -- nunca o contrário.
 */
import type { Pool } from "pg";
import { inserirEvento, registrarAuditoria, type AutomationEventRow } from "./outboxRepository";
import { despacharAgora } from "./dispatcher";

export type EventType =
  | "ContratoAssinado"
  | "ContratoValidado"
  | "ContratoEncerrado"
  | "AcompanhamentoCriado"
  | "SemanaConcluida"
  | "DocumentoAnexado"
  | "EmpresaAtualizada"
  | "ScoreAtualizado"
  | "RelatorioGerado"
  | "PendenciaResolvida"
  | "RotinaCndDue"
  | "RotinaCemprotDue";

export interface PublicarEventoInput {
  eventType: EventType;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  empresaId?: string | null;
}

/**
 * Publica um evento de domínio: grava no outbox (idempotente) e tenta
 * despachar imediatamente para o Nexus (efeito "tempo real"). Se o outbox
 * já continha esse evento (idempotencyKey repetida), não despacha de novo
 * e apenas registra a auditoria como duplicata ignorada.
 */
export async function publishEvent(pool: Pool, input: PublicarEventoInput): Promise<AutomationEventRow | null> {
  const inicio = Date.now();
  const evento = await inserirEvento(pool, {
    eventType: input.eventType,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
    correlationId: input.correlationId,
  });

  if (!evento) {
    await registrarAuditoria(pool, {
      evento: input.eventType,
      empresaId: input.empresaId || null,
      resultado: "ignorado_duplicado",
      tempoMs: Date.now() - inicio,
      detalhe: { idempotency_key: input.idempotencyKey, motivo: "evento já registrado no outbox" },
    });
    return null;
  }

  // Despacho síncrono best-effort: dá a sensação de tempo real. Se falhar,
  // o evento permanece 'pending'/'failed' no outbox e o sweep do scheduler
  // tenta de novo -- nunca perdemos o evento por causa de uma falha aqui.
  despacharAgora(pool, evento, input.empresaId || null).catch(() => {});

  return evento;
}

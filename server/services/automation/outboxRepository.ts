/**
 * outboxRepository.ts
 *
 * Persistência do outbox de eventos de domínio (tabela automation_events).
 * Todo evento é gravado aqui antes de ser despachado -- garante entrega
 * "at-least-once" mesmo se a chamada HTTP para o Nexus falhar, e a
 * constraint UNIQUE(event_type, idempotency_key) garante que o mesmo
 * evento de negócio nunca seja registrado duas vezes.
 */
import type { Pool } from "pg";

export type AutomationEventStatus = "pending" | "dispatched" | "failed" | "dead";

export interface AutomationEventRow {
  id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string | null;
  aggregate_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  status: AutomationEventStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  dispatched_at: string | null;
}

export interface NovoEvento {
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}

/**
 * Insere o evento no outbox. Retorna null se já existia (mesmo event_type +
 * idempotency_key) -- nesse caso o chamador deve tratar como "já processado",
 * nunca como erro.
 */
export async function inserirEvento(pool: Pool, evento: NovoEvento): Promise<AutomationEventRow | null> {
  const { rows } = await pool.query(
    `INSERT INTO automation_events (event_type, aggregate_type, aggregate_id, idempotency_key, payload, correlation_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (event_type, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      evento.eventType,
      evento.aggregateType || null,
      evento.aggregateId || null,
      evento.idempotencyKey,
      JSON.stringify(evento.payload || {}),
      evento.correlationId || null,
    ]
  );
  return rows[0] || null;
}

/**
 * Busca um lote de eventos pendentes ou falhos-para-retry, travando as
 * linhas (FOR UPDATE SKIP LOCKED) para que o sweep e um despacho síncrono
 * concorrente nunca processem o mesmo evento duas vezes ao mesmo tempo.
 */
export async function reivindicarLotePendente(pool: Pool, limite = 20): Promise<AutomationEventRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM automation_events
     WHERE status IN ('pending', 'failed') AND attempts < 10
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limite]
  );
  return rows;
}

export async function marcarDespachado(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `UPDATE automation_events SET status = 'dispatched', dispatched_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function marcarFalha(pool: Pool, id: string, erro: string, tentativas: number): Promise<void> {
  const proximoStatus = tentativas >= 10 ? "dead" : "failed";
  await pool.query(
    `UPDATE automation_events SET status = $1, attempts = $2, last_error = $3 WHERE id = $4`,
    [proximoStatus, tentativas, erro.slice(0, 2000), id]
  );
}

export async function buscarEventoPorId(pool: Pool, id: string): Promise<AutomationEventRow | null> {
  const { rows } = await pool.query(`SELECT * FROM automation_events WHERE id = $1`, [id]);
  return rows[0] || null;
}

export interface NovoRegistroAuditoria {
  eventId?: string | null;
  evento: string;
  origemSistema?: "destrava" | "nexus";
  empresaId?: string | null;
  executadoPor?: string | null;
  tempoMs?: number | null;
  resultado: "sucesso" | "falha" | "ignorado_duplicado";
  erro?: string | null;
  detalhe?: Record<string, unknown> | null;
}

export async function registrarAuditoria(pool: Pool, registro: NovoRegistroAuditoria): Promise<void> {
  await pool.query(
    `INSERT INTO automation_audit_log
       (event_id, evento, origem_sistema, empresa_id, executado_por, tempo_ms, resultado, erro, detalhe)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      registro.eventId || null,
      registro.evento,
      registro.origemSistema || "destrava",
      registro.empresaId || null,
      registro.executadoPor || null,
      registro.tempoMs ?? null,
      registro.resultado,
      registro.erro || null,
      JSON.stringify(registro.detalhe || {}),
    ]
  );
}

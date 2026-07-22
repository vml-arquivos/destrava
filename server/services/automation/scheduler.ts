/**
 * scheduler.ts
 *
 * Primeiro agendador do Destrava (o app não tinha nenhum antes). Usa
 * setInterval em vez de uma dependência nova (node-cron) para ficar
 * consistente com o único padrão de job já existente no ecossistema
 * (iniciarJobsNotificacao() do Nexus, também setInterval-based).
 *
 * Duas responsabilidades:
 *  1) Varredura de retry do outbox (entrega eventos que o despacho
 *     imediato não conseguiu concluir).
 *  2) Avaliação das rotinas recorrentes (CND todo dia 22, CEMPROT semanal)
 *     para contratos de assessoria ativos, publicando RotinaCndDue /
 *     RotinaCemprotDue -- a checagem "já emitido no período" acontece na
 *     própria query (NOT EXISTS contra automation_events), então rodar a
 *     avaliação várias vezes por dia é seguro e não gera eventos duplicados.
 */
import type { Pool } from "pg";
import { executarVarreduraOutbox } from "./dispatcher";
import { publishEvent } from "./eventBus";

const INTERVALO_RETRY_MS = Number(process.env.AUTOMATION_RETRY_INTERVAL_MS || 60_000);
const INTERVALO_ROTINAS_MS = Number(process.env.AUTOMATION_ROTINAS_INTERVAL_MS || 15 * 60_000);

interface ContratoAtivoRow {
  id: string;
  empresa_id: string;
  empresa_nome: string;
  empresa_cnpj: string | null;
  responsavel_contrato_id: string | null;
  responsavel_email: string | null;
  responsavel_nome: string | null;
}

async function buscarContratosParaCnd(pool: Pool): Promise<ContratoAtivoRow[]> {
  const { rows } = await pool.query(`
    SELECT c.id, c.empresa_id, e.razao_social AS empresa_nome, e.cnpj AS empresa_cnpj,
           c.responsavel_contrato_id, col.email AS responsavel_email, col.nome AS responsavel_nome
    FROM contratos_gerados c
    JOIN empresas e ON e.id = c.empresa_id
    LEFT JOIN colaboradores col ON col.id = c.responsavel_contrato_id
    WHERE c.tipo_contrato = 'assessoria'
      AND c.status = 'assinado'
      AND (c.data_fim_vigencia IS NULL OR c.data_fim_vigencia >= CURRENT_DATE)
      AND EXTRACT(DAY FROM CURRENT_DATE) = 22
      AND NOT EXISTS (
        SELECT 1 FROM automation_events ev
        WHERE ev.event_type = 'RotinaCndDue' AND ev.aggregate_id = c.id
          AND ev.idempotency_key = 'rotina:cnd:' || c.id || ':' || to_char(CURRENT_DATE, 'YYYY-MM')
      )
  `);
  return rows;
}

async function buscarContratosParaCemprot(pool: Pool): Promise<ContratoAtivoRow[]> {
  const { rows } = await pool.query(`
    SELECT c.id, c.empresa_id, e.razao_social AS empresa_nome, e.cnpj AS empresa_cnpj,
           c.responsavel_contrato_id, col.email AS responsavel_email, col.nome AS responsavel_nome
    FROM contratos_gerados c
    JOIN empresas e ON e.id = c.empresa_id
    LEFT JOIN colaboradores col ON col.id = c.responsavel_contrato_id
    WHERE c.tipo_contrato = 'assessoria'
      AND c.status = 'assinado'
      AND (c.data_fim_vigencia IS NULL OR c.data_fim_vigencia >= CURRENT_DATE)
      AND NOT EXISTS (
        SELECT 1 FROM automation_events ev
        WHERE ev.event_type = 'RotinaCemprotDue' AND ev.aggregate_id = c.id
          AND ev.idempotency_key = 'rotina:cemprot:' || c.id || ':' || to_char(CURRENT_DATE, 'IYYY-IW')
      )
  `);
  return rows;
}

/** Extraído como função pura (testável sem banco/rede) do formato YYYY-MM usado na idempotency_key. */
export function formatarCompetencia(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 7);
}

async function avaliarRotinas(pool: Pool): Promise<void> {
  const competencia = formatarCompetencia();

  const contratosCnd = await buscarContratosParaCnd(pool);
  for (const contrato of contratosCnd) {
    await publishEvent(pool, {
      eventType: "RotinaCndDue",
      aggregateType: "contrato",
      aggregateId: contrato.id,
      idempotencyKey: `rotina:cnd:${contrato.id}:${competencia}`,
      empresaId: contrato.empresa_id,
      payload: {
        contrato_id: contrato.id,
        empresa_id: contrato.empresa_id,
        empresa_nome: contrato.empresa_nome,
        empresa_cnpj: contrato.empresa_cnpj,
        responsavel_email: contrato.responsavel_email,
        responsavel_nome: contrato.responsavel_nome,
        competencia,
      },
    });
  }

  const { rows: semanaRows } = await pool.query(`SELECT to_char(CURRENT_DATE, 'IYYY-IW') AS iso_week`);
  const isoWeek = semanaRows[0]?.iso_week as string;

  const contratosCemprot = await buscarContratosParaCemprot(pool);
  for (const contrato of contratosCemprot) {
    await publishEvent(pool, {
      eventType: "RotinaCemprotDue",
      aggregateType: "contrato",
      aggregateId: contrato.id,
      idempotencyKey: `rotina:cemprot:${contrato.id}:${isoWeek}`,
      empresaId: contrato.empresa_id,
      payload: {
        contrato_id: contrato.id,
        empresa_id: contrato.empresa_id,
        empresa_nome: contrato.empresa_nome,
        empresa_cnpj: contrato.empresa_cnpj,
        responsavel_email: contrato.responsavel_email,
        responsavel_nome: contrato.responsavel_nome,
        competencia,
        iso_week: isoWeek,
      },
    });
  }
}

export function iniciarAutomationScheduler(pool: Pool): void {
  setInterval(() => {
    executarVarreduraOutbox(pool).catch((err) => {
      console.error("[automation-engine] Erro na varredura do outbox:", err);
    });
  }, INTERVALO_RETRY_MS);

  setInterval(() => {
    avaliarRotinas(pool).catch((err) => {
      console.error("[automation-engine] Erro na avaliação de rotinas CND/CEMPROT:", err);
    });
  }, INTERVALO_ROTINAS_MS);

  console.log(
    `[automation-engine] Scheduler iniciado (retry a cada ${INTERVALO_RETRY_MS}ms, rotinas a cada ${INTERVALO_ROTINAS_MS}ms)`
  );
}

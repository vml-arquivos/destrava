/**
 * dispatcher.ts
 *
 * Responsável por efetivamente entregar um evento do outbox ao Nexus:
 * despacho imediato (chamado logo após publishEvent) e varredura de retry
 * (chamada periodicamente pelo scheduler para reprocessar pendentes/falhos).
 * Todo evento Destrava -> Nexus vai para o mesmo endpoint genérico; quem
 * decide o que fazer com cada event_type é o Nexus.
 */
import type { Pool } from "pg";
import {
  reivindicarLotePendente,
  marcarDespachado,
  marcarFalha,
  registrarAuditoria,
  type AutomationEventRow,
} from "./outboxRepository";
import { enviarWebhookNexus, nexusConfigurado } from "./webhookClient";

const ENDPOINT_EVENTOS_NEXUS = "/api/integracoes/destrava/eventos";

function construirEnvelope(evento: AutomationEventRow) {
  return {
    event_id: evento.id,
    event_type: evento.event_type,
    event_version: evento.event_version,
    occurred_at: evento.created_at,
    source_system: "destrava",
    aggregate_type: evento.aggregate_type,
    aggregate_id: evento.aggregate_id,
    idempotency_key: evento.idempotency_key,
    correlation_id: evento.correlation_id,
    payload: evento.payload,
  };
}

/**
 * O Nexus devolve, na própria resposta HTTP de AcompanhamentoCriado, o
 * mapeamento semana -> tarefa criada (ver backend/src/routes/automation.ts
 * do Nexus). É assim que o Destrava aprende os IDs das tarefas sem precisar
 * de uma segunda chamada de volta -- e é o que a tela de acompanhamento
 * bancário usa depois para buscar/renderizar a tarefa certa de cada semana.
 */
async function registrarSemanasCriadas(pool: Pool, evento: AutomationEventRow, corpoResposta: string): Promise<void> {
  if (!evento.aggregate_id) return;
  let parsed: any;
  try {
    parsed = JSON.parse(corpoResposta);
  } catch {
    return;
  }
  const semanas = Array.isArray(parsed?.resultado) ? parsed.resultado : [];
  for (const semana of semanas) {
    const numero = Number(semana?.numero_semana);
    const nexusTarefaId = String(semana?.nexus_tarefa_id || "");
    if (!Number.isFinite(numero) || !nexusTarefaId) continue;
    await pool.query(
      `INSERT INTO nexus_task_links (entidade_tipo, entidade_id, numero_semana, nexus_tarefa_id, sincronizado_em)
       VALUES ('acompanhamento_semana', $1, $2, $3, NOW())
       ON CONFLICT (entidade_tipo, entidade_id, numero_semana)
       DO UPDATE SET nexus_tarefa_id = EXCLUDED.nexus_tarefa_id, sincronizado_em = NOW()`,
      [evento.aggregate_id, numero, nexusTarefaId]
    );
  }
}

async function tentarDespachar(
  pool: Pool,
  evento: AutomationEventRow,
  empresaId: string | null
): Promise<boolean> {
  const inicio = Date.now();

  if (!nexusConfigurado()) {
    await marcarFalha(pool, evento.id, "Integração Nexus não configurada (NEXUS_PUBLIC_URL/segredo ausente)", evento.attempts + 1);
    await registrarAuditoria(pool, {
      eventId: evento.id,
      evento: evento.event_type,
      empresaId,
      resultado: "falha",
      tempoMs: Date.now() - inicio,
      erro: "Integração Nexus não configurada",
    });
    return false;
  }

  try {
    const resposta = await enviarWebhookNexus(ENDPOINT_EVENTOS_NEXUS, construirEnvelope(evento), evento.idempotency_key);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}: ${resposta.body.slice(0, 300)}`);

    if (evento.event_type === "AcompanhamentoCriado") {
      await registrarSemanasCriadas(pool, evento, resposta.body);
    }

    await marcarDespachado(pool, evento.id);
    await registrarAuditoria(pool, {
      eventId: evento.id,
      evento: evento.event_type,
      empresaId,
      resultado: "sucesso",
      tempoMs: Date.now() - inicio,
    });
    return true;
  } catch (err: unknown) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await marcarFalha(pool, evento.id, mensagem, evento.attempts + 1);
    await registrarAuditoria(pool, {
      eventId: evento.id,
      evento: evento.event_type,
      empresaId,
      resultado: "falha",
      tempoMs: Date.now() - inicio,
      erro: mensagem,
    });
    return false;
  }
}

/** Chamado logo após a inserção no outbox -- tentativa imediata, best-effort. */
export async function despacharAgora(pool: Pool, evento: AutomationEventRow, empresaId: string | null): Promise<void> {
  await tentarDespachar(pool, evento, empresaId);
}

/**
 * Varredura de retry: reprocessa eventos pendentes/falhos que o despacho
 * imediato não conseguiu entregar. Chamada pelo scheduler em intervalo fixo.
 */
export async function executarVarreduraOutbox(pool: Pool): Promise<{ processados: number; sucesso: number }> {
  const client = await pool.connect();
  let processados = 0;
  let sucesso = 0;
  try {
    await client.query("BEGIN");
    const lote = await reivindicarLotePendente(client as unknown as Pool);
    for (const evento of lote) {
      processados++;
      const empresaId =
        typeof evento.payload?.empresa_id === "string" ? (evento.payload.empresa_id as string) : null;
      const ok = await tentarDespachar(client as unknown as Pool, evento, empresaId);
      if (ok) sucesso++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { processados, sucesso };
}

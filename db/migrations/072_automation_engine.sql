BEGIN;

-- Automation Engine: barramento de eventos entre Destrava e Nexus Gestão.
-- Aditivo apenas -- nenhuma tabela/coluna existente é removida ou alterada
-- de forma destrutiva. Idempotente: seguro rodar de novo.

-- Outbox: todo evento de domínio é persistido aqui antes de ser despachado
-- para o Nexus, garantindo entrega "at-least-once" mesmo se a chamada HTTP
-- imediata falhar (o retry sweep do scheduler reprocessa os pendentes/falhos).
CREATE TABLE IF NOT EXISTS automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_type VARCHAR(60) NOT NULL,
  event_version INT NOT NULL DEFAULT 1,

  aggregate_type VARCHAR(60),
  aggregate_id UUID,

  -- Único por (event_type, idempotency_key): garante que o mesmo evento de
  -- negócio nunca seja registrado (e portanto nunca despachado) duas vezes,
  -- mesmo sob disparos concorrentes.
  idempotency_key VARCHAR(200) NOT NULL,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id UUID,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,

  UNIQUE (event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_events_status_created ON automation_events (status, created_at);
CREATE INDEX IF NOT EXISTS idx_automation_events_aggregate ON automation_events (aggregate_type, aggregate_id);

-- Auditoria de automação: quem/quando/origem/empresa/evento/tempo/resultado/erro.
-- Mantida separada da audit_logs existente (que é centrada em ações de usuário)
-- porque aqui o "executor" é frequentemente o próprio sistema, não uma pessoa.
CREATE TABLE IF NOT EXISTS automation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES automation_events(id) ON DELETE SET NULL,
  evento VARCHAR(60) NOT NULL,
  origem_sistema VARCHAR(20) NOT NULL DEFAULT 'destrava' CHECK (origem_sistema IN ('destrava', 'nexus')),
  empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
  executado_por VARCHAR(120),
  executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tempo_ms INT,
  resultado VARCHAR(20) NOT NULL CHECK (resultado IN ('sucesso', 'falha', 'ignorado_duplicado')),
  erro TEXT,
  detalhe JSONB
);

CREATE INDEX IF NOT EXISTS idx_automation_audit_log_empresa ON automation_audit_log (empresa_id);
CREATE INDEX IF NOT EXISTS idx_automation_audit_log_executado_em ON automation_audit_log (executado_em DESC);

-- Mapeamento reverso Destrava -> Nexus (o Nexus já tem nexus_external_links
-- do lado dele; este é o equivalente do lado Destrava). É o que a tela de
-- acompanhamento bancário usa para saber qual tarefa do Nexus buscar/renderizar
-- para uma determinada semana/rotina. "numero_semana" existe porque um único
-- acompanhamento_bancario gera N tarefas (uma por semana) -- sem essa coluna,
-- todas as semanas do mesmo acompanhamento colidiriam no mesmo entidade_id.
CREATE TABLE IF NOT EXISTS nexus_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo VARCHAR(40) NOT NULL CHECK (entidade_tipo IN ('acompanhamento_semana', 'rotina_cnd', 'rotina_cemprot')),
  entidade_id UUID NOT NULL,
  numero_semana INT,
  nexus_tarefa_id UUID NOT NULL,
  nexus_snapshot JSONB,
  sincronizado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entidade_tipo, entidade_id, numero_semana)
);

CREATE INDEX IF NOT EXISTS idx_nexus_task_links_nexus_tarefa ON nexus_task_links (nexus_tarefa_id);

-- Vigência do contrato de assessoria -- hoje "prazo_contrato_meses" só existia
-- como variável de request, nunca persistido (ver server/index.ts, rota
-- POST /api/contratos/gerar). Sem isso não há como o scheduler de rotinas
-- CND/CEMPROT saber quais contratos estão ativos.
ALTER TABLE contratos_gerados
  ADD COLUMN IF NOT EXISTS data_inicio_vigencia DATE,
  ADD COLUMN IF NOT EXISTS data_fim_vigencia DATE,
  ADD COLUMN IF NOT EXISTS prazo_contrato_meses INT;

-- Backfill best-effort para contratos já existentes: início = data de
-- assinatura. Não fabricamos data_fim_vigencia para histórico -- contratos
-- antigos sem esse dado simplesmente ficam fora do scheduler até serem
-- atualizados manualmente (nenhum dado é inventado).
UPDATE contratos_gerados SET data_inicio_vigencia = data_assinatura WHERE data_inicio_vigencia IS NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_gerados_vigencia ON contratos_gerados (status, data_fim_vigencia);

-- Cache de alertas recebidos do Nexus (ladder 7d/3d/1d/hoje/atrasado das
-- rotinas CND/CEMPROT e do acompanhamento bancário), para o sino de
-- notificações do Destrava não precisar recalcular a régua -- o Nexus é
-- quem decide o tier, o Destrava só espelha para exibição.
CREATE TABLE IF NOT EXISTS automation_alerts_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL,
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  workflow_tipo VARCHAR(40),
  tier VARCHAR(20) NOT NULL,
  titulo TEXT NOT NULL,
  prazo DATE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tarefa_id, tier)
);

CREATE INDEX IF NOT EXISTS idx_automation_alerts_cache_empresa ON automation_alerts_cache (empresa_id, criado_em DESC);

COMMIT;

-- MIGRAÇÃO 014 — Base futura de integração Chatwoot por agente
-- Objetivo: preparar mapeamento operacional entre colaboradores e agentes do Chatwoot
-- e enriquecer crm_conversas com metadados de sincronismo sem alterar o fluxo atual.
-- Idempotente: seguro para reexecução.

BEGIN;

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS chatwoot_agente_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_chatwoot_agente_id
  ON public.colaboradores(chatwoot_agente_id)
  WHERE chatwoot_agente_id IS NOT NULL;

ALTER TABLE public.crm_conversas
  ADD COLUMN IF NOT EXISTS chatwoot_contact_id BIGINT,
  ADD COLUMN IF NOT EXISTS chatwoot_inbox_id BIGINT,
  ADD COLUMN IF NOT EXISTS chatwoot_assignee_id BIGINT,
  ADD COLUMN IF NOT EXISTS origem_atribuicao_agente TEXT,
  ADD COLUMN IF NOT EXISTS agente_ultima_atribuicao_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_chatwoot_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload_ultimo_evento JSONB;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_chatwoot_contact_id
  ON public.crm_conversas(chatwoot_contact_id)
  WHERE chatwoot_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_chatwoot_inbox_id
  ON public.crm_conversas(chatwoot_inbox_id)
  WHERE chatwoot_inbox_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_chatwoot_assignee_id
  ON public.crm_conversas(chatwoot_assignee_id)
  WHERE chatwoot_assignee_id IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_crm_chatwoot_operacional AS
SELECT
  c.id,
  c.lead_id,
  l.nome AS lead_nome,
  l.telefone AS lead_telefone,
  c.status,
  c.canal,
  c.canal_id_externo,
  c.caixa_id,
  cx.nome AS caixa_nome,
  c.chatwoot_contact_id,
  c.chatwoot_inbox_id,
  c.chatwoot_assignee_id,
  c.agente_responsavel_id,
  col.nome AS agente_nome,
  col.chatwoot_agente_id,
  c.origem_atribuicao_agente,
  c.agente_ultima_atribuicao_em,
  c.ultima_sincronizacao_chatwoot_em,
  c.ultima_interacao_em,
  c.created_at,
  c.updated_at
FROM public.crm_conversas c
LEFT JOIN public.leads l ON l.id = c.lead_id
LEFT JOIN public.crm_caixas cx ON cx.id = c.caixa_id
LEFT JOIN public.colaboradores col ON col.id = c.agente_responsavel_id;

COMMIT;

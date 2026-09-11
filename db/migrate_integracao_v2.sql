-- =============================================================================
-- DESTRAVA CRÉDITO — migrate_integracao_v2.sql
-- Versão: 2.1 — Corrigida com base na auditoria real do banco de produção
-- Data: 2026-03-30
-- =============================================================================
--
-- ── AUDITORIA REALIZADA ANTES DESTA MIGRAÇÃO ─────────────────────────────────
--
-- Usuário de execução: destravadb (DML em todas as tabelas)
-- Para DDL em tabelas com owner=postgres, usar: -U postgres
--
-- Tabelas confirmadas como JÁ EXISTENTES no banco real (23 tabelas):
--   crm_conversas       (owner: postgres) — 11 colunas — UNIQUE: canal_id_externo
--   crm_mensagens       (owner: postgres) — 12 colunas — UNIQUE: message_id_externo
--   crm_eventos_webhook (owner: postgres) —  9 colunas — UNIQUE: event_id
--   leads               (owner: postgres) — 35 colunas — inclui: chatwoot_conv_id, whatsapp_jid, empresa_id, responsavel_id
--   simulacoes_colaborador (owner: postgres) — 25 colunas — inclui: empresa_id, cliente_empresa
--   colaboradores       (owner: postgres) —  8 colunas — inclui: cargo NOT NULL
--   empresas            (owner: destravadb) — inclui: responsavel_id
--   empresa_historico   (owner: destravadb) — criada por migração anterior
--
-- Constraints UNIQUE confirmadas no banco real:
--   crm_conversas_canal_id_externo_key     → crm_conversas(canal_id_externo)
--   crm_eventos_webhook_event_id_key       → crm_eventos_webhook(event_id)
--   crm_mensagens_message_id_externo_key   → crm_mensagens(message_id_externo)
--
-- ── CONCLUSÃO DA AUDITORIA ────────────────────────────────────────────────────
--
-- ZERO novas tabelas necessárias — todas já existem no banco real.
-- ZERO novas colunas necessárias — todas as colunas usadas pelo código já existem.
-- Ownership implementado no código via colaboradores.cargo (campo real, NOT NULL).
-- Coluna `perfil` NÃO criada — ownership usa cargo existente.
-- Coluna `chatwoot_contact_id` NÃO criada — banco já tem chatwoot_conv_id.
-- Tabela `clientes` NÃO alterada — é tabela legada simples (9 colunas, owner: postgres).
-- Tabela `empresas` usada para vínculo de simulações — já existe (owner: destravadb).
--
-- Esta migração adiciona apenas índices de performance (IF NOT EXISTS — idempotentes).
--
-- ── COMO EXECUTAR ─────────────────────────────────────────────────────────────
--
-- Tabelas com owner=postgres (crm_*, leads, simulacoes_colaborador):
--   docker exec -i tr3go0jqyc5h3tuvz7f46zkc psql -U postgres -d postgres << 'SQL'
--   [conteúdo abaixo]
--   SQL
--
-- Tabelas com owner=destravadb (empresas, empresa_historico):
--   docker exec -i tr3go0jqyc5h3tuvz7f46zkc psql -U destravadb -d postgres << 'SQL'
--   [conteúdo abaixo]
--   SQL
--
-- Como todos os comandos abaixo são CREATE INDEX IF NOT EXISTS (sem ALTER TABLE),
-- o usuário destravadb tem permissão para criá-los em qualquer tabela onde tem acesso.
-- Execute com -U postgres para garantir permissão em todas as tabelas.
--
-- ROLLBACK: Ver rollback_integracao_v2.sql (apenas DROP INDEX — sem DROP TABLE)
-- =============================================================================

BEGIN;

-- ─── Índices de performance em crm_conversas ─────────────────────────────────
-- Constraint UNIQUE crm_conversas_canal_id_externo_key já existe — ON CONFLICT seguro.

CREATE INDEX IF NOT EXISTS idx_crm_conversas_lead_id
  ON public.crm_conversas(lead_id) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_conversas_status
  ON public.crm_conversas(status);

CREATE INDEX IF NOT EXISTS idx_crm_conversas_ultima_interacao
  ON public.crm_conversas(ultima_interacao_em DESC);

-- ─── Índices de performance em crm_mensagens ─────────────────────────────────
-- Constraint UNIQUE crm_mensagens_message_id_externo_key já existe — ON CONFLICT seguro.

CREATE INDEX IF NOT EXISTS idx_crm_mensagens_conversa_id
  ON public.crm_mensagens(conversa_id);

CREATE INDEX IF NOT EXISTS idx_crm_mensagens_created_at
  ON public.crm_mensagens(created_at DESC);

-- ─── Índices de performance em crm_eventos_webhook ───────────────────────────
-- Constraint UNIQUE crm_eventos_webhook_event_id_key já existe — ON CONFLICT seguro.

CREATE INDEX IF NOT EXISTS idx_crm_eventos_status_proc
  ON public.crm_eventos_webhook(status_processamento);

CREATE INDEX IF NOT EXISTS idx_crm_eventos_created_at
  ON public.crm_eventos_webhook(created_at DESC);

-- ─── Índices de performance em leads ─────────────────────────────────────────
-- chatwoot_conv_id já existe no banco real (bigint, nullable)
-- responsavel_id já existe no banco real (uuid, nullable)
-- empresa_id já existe no banco real (uuid, nullable)

CREATE INDEX IF NOT EXISTS idx_leads_chatwoot_conv_id
  ON public.leads(chatwoot_conv_id) WHERE chatwoot_conv_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_responsavel_id
  ON public.leads(responsavel_id) WHERE responsavel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_empresa_id
  ON public.leads(empresa_id) WHERE empresa_id IS NOT NULL;

-- ─── Índices de performance em simulacoes_colaborador ────────────────────────
-- empresa_id já existe no banco real (uuid, nullable) — adicionado por migração anterior

CREATE INDEX IF NOT EXISTS idx_simulacoes_empresa_id
  ON public.simulacoes_colaborador(empresa_id) WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_simulacoes_colaborador_id
  ON public.simulacoes_colaborador(colaborador_id);

-- ─── Índices de performance em empresa_historico ─────────────────────────────
-- Tabela já existe (owner: destravadb) — criada por migração anterior

CREATE INDEX IF NOT EXISTS idx_empresa_historico_empresa_id
  ON public.empresa_historico(empresa_id);

CREATE INDEX IF NOT EXISTS idx_empresa_historico_created_at
  ON public.empresa_historico(created_at DESC);

-- ─── Índices de performance em empresas ──────────────────────────────────────
-- responsavel_id já existe na tabela empresas (owner: destravadb)

CREATE INDEX IF NOT EXISTS idx_empresas_responsavel_id
  ON public.empresas(responsavel_id) WHERE responsavel_id IS NOT NULL;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO:
-- =============================================================================
-- docker exec -i tr3go0jqyc5h3tuvz7f46zkc psql -U destravadb -d postgres -c "
--   SELECT indexname, tablename
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname LIKE 'idx_%'
--   ORDER BY tablename, indexname;"
-- =============================================================================

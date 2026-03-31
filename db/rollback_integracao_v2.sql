-- =============================================================================
-- DESTRAVA CRÉDITO — rollback_integracao_v2.sql
-- Versão: 2.1 — Corrigida com base na auditoria real do banco de produção
-- Data: 2026-03-30
-- =============================================================================
--
-- ROLLBACK SEGURO: Remove apenas os índices criados pela migrate_integracao_v2.sql.
-- NÃO destrói nenhuma tabela. NÃO remove nenhuma coluna.
-- Todas as tabelas (crm_conversas, crm_mensagens, crm_eventos_webhook, etc.)
-- JÁ EXISTIAM antes desta migração e permanecem intactas após o rollback.
--
-- COMO EXECUTAR:
--   docker exec -i tr3go0jqyc5h3tuvz7f46zkc psql -U postgres -d postgres << 'SQL'
--   [conteúdo abaixo]
--   SQL
-- =============================================================================

BEGIN;

-- Índices de crm_conversas
DROP INDEX IF EXISTS public.idx_crm_conversas_lead_id;
DROP INDEX IF EXISTS public.idx_crm_conversas_status;
DROP INDEX IF EXISTS public.idx_crm_conversas_ultima_interacao;

-- Índices de crm_mensagens
DROP INDEX IF EXISTS public.idx_crm_mensagens_conversa_id;
DROP INDEX IF EXISTS public.idx_crm_mensagens_created_at;

-- Índices de crm_eventos_webhook
DROP INDEX IF EXISTS public.idx_crm_eventos_status_proc;
DROP INDEX IF EXISTS public.idx_crm_eventos_created_at;

-- Índices de leads
DROP INDEX IF EXISTS public.idx_leads_chatwoot_conv_id;
DROP INDEX IF EXISTS public.idx_leads_responsavel_id;
DROP INDEX IF EXISTS public.idx_leads_empresa_id;

-- Índices de simulacoes_colaborador
DROP INDEX IF EXISTS public.idx_simulacoes_empresa_id;
DROP INDEX IF EXISTS public.idx_simulacoes_colaborador_id;

-- Índices de empresa_historico
DROP INDEX IF EXISTS public.idx_empresa_historico_empresa_id;
DROP INDEX IF EXISTS public.idx_empresa_historico_created_at;

-- Índices de empresas
DROP INDEX IF EXISTS public.idx_empresas_responsavel_id;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO PÓS-ROLLBACK:
-- =============================================================================
-- docker exec -i tr3go0jqyc5h3tuvz7f46zkc psql -U destravadb -d postgres -c "
--   SELECT indexname, tablename
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname LIKE 'idx_%'
--   ORDER BY tablename, indexname;"
-- =============================================================================

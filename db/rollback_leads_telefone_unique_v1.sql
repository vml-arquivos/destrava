-- =============================================================================
-- ROLLBACK: rollback_leads_telefone_unique_v1.sql
-- Desfaz: migrate_leads_telefone_unique_v1.sql
-- Apenas remove o índice — nenhum dado é alterado
-- =============================================================================

DROP INDEX IF EXISTS public.idx_leads_telefone_unique;

-- ============================================================
-- DESTRAVA CRÉDITO — Rollback: Vínculo Simulações ↔ Empresas
-- Versão: v1.0 — 30/03/2026
-- ATENÇÃO: Execute apenas se necessário reverter a migração v1
-- ============================================================

BEGIN;

-- Remove empresa_id de simulacoes_colaborador
ALTER TABLE public.simulacoes_colaborador
  DROP COLUMN IF EXISTS empresa_id;

ALTER TABLE public.simulacoes_colaborador
  DROP COLUMN IF EXISTS cliente_empresa;

-- Remove empresa_id de leads
ALTER TABLE public.leads
  DROP COLUMN IF EXISTS empresa_id;

-- Remove empresa_id de triagem_leads
ALTER TABLE public.triagem_leads
  DROP COLUMN IF EXISTS empresa_id;

-- Remove índices criados
DROP INDEX IF EXISTS public.idx_simulacoes_empresa_id;
DROP INDEX IF EXISTS public.idx_leads_empresa_id;
DROP INDEX IF EXISTS public.idx_triagem_empresa_id;
DROP INDEX IF EXISTS public.idx_empresa_historico_empresa_id;
DROP INDEX IF EXISTS public.idx_empresa_historico_created_at;
DROP INDEX IF EXISTS public.idx_empresas_cnpj_normalizado;

-- NOTA: empresa_historico NÃO é removida pois pode conter dados
-- históricos criados manualmente. Remova manualmente se necessário:
-- DROP TABLE IF EXISTS public.empresa_historico;

COMMIT;

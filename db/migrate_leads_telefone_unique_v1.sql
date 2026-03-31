-- =============================================================================
-- MIGRAÇÃO: migrate_leads_telefone_unique_v1.sql
-- Objetivo: Criar UNIQUE INDEX em leads.telefone para suportar
--           ON CONFLICT (telefone) DO UPDATE usado pelo workflow n8n crm-qualificacao
-- Banco: postgres (destravadb) — produção
-- Usuário necessário: postgres (owner da tabela leads)
-- Segurança: idempotente, não destrutivo, verifica duplicatas antes
-- Data: 2026-03-30
-- =============================================================================

-- PASSO 1: Verificar duplicatas ANTES de criar o índice
-- Execute este SELECT separadamente. Se retornar linhas, resolva antes de continuar.
SELECT telefone, COUNT(*) as total
FROM public.leads
WHERE telefone IS NOT NULL
GROUP BY telefone
HAVING COUNT(*) > 1
ORDER BY total DESC;

-- =============================================================================
-- SÓ EXECUTE O BLOCO ABAIXO SE O SELECT ACIMA RETORNAR 0 LINHAS
-- =============================================================================

BEGIN;

-- Criar UNIQUE INDEX em leads.telefone
-- CONCURRENTLY não é suportado dentro de transação, mas para produção com
-- tabela pequena o CREATE INDEX direto é seguro e rápido
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_telefone_unique
  ON public.leads (telefone)
  WHERE telefone IS NOT NULL;

-- Verificar que o índice foi criado
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'leads'
  AND indexname = 'idx_leads_telefone_unique';

COMMIT;

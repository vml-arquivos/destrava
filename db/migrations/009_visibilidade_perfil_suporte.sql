-- ============================================================
-- MIGRAÇÃO 009 — Suporte à visibilidade por perfil
-- Versão: 1.0 | Data: 2026-04-01
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Adiciona gerente_id em colaboradores: permite que o
--      servidor saiba quais consultores estão sob um gerente.
--      Gerentes veem leads de todos os colaboradores com
--      gerente_id = gerente logado.
--
--   2. Adiciona caixa_atual em leads: coluna TEXT que armazena
--      o identificador da caixa atual do lead (ex: 'central',
--      'consultor_joao'). Permite filtrar por caixa além de
--      responsavel_id.
--
--   3. Cria função fn_ids_equipe(gerente_id) que retorna todos
--      os IDs de colaboradores sob um gerente (incluindo o
--      próprio gerente). Usada nas queries de escopo.
--
--   4. Cria índices de performance para as queries de escopo.
--
--   5. Popula gerente_id para colaboradores existentes:
--      Consultores sem gerente_id ficam NULL (visíveis apenas
--      para administradores e para eles mesmos).
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

BEGIN;

-- ─── 1. Coluna gerente_id em colaboradores ───────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS gerente_id UUID
    REFERENCES public.colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_gerente
  ON public.colaboradores(gerente_id)
  WHERE gerente_id IS NOT NULL;

-- ─── 2. Coluna caixa_atual em leads ──────────────────────────
-- Identifica a caixa atual do lead: 'central' para leads da
-- Destrava Central, ou o ID/slug da caixa do consultor.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS caixa_atual TEXT DEFAULT 'central';

CREATE INDEX IF NOT EXISTS idx_leads_caixa_atual
  ON public.leads(caixa_atual);

-- ─── 3. Coluna caixa_atual em triagem_leads ──────────────────
ALTER TABLE public.triagem_leads
  ADD COLUMN IF NOT EXISTS caixa_atual TEXT DEFAULT 'central';

-- ─── 4. Função: retorna IDs da equipe de um gerente ──────────
-- Retorna array com o ID do gerente + IDs de todos os
-- colaboradores com gerente_id = p_gerente_id.
CREATE OR REPLACE FUNCTION public.fn_ids_equipe(p_gerente_id UUID)
RETURNS UUID[] AS $$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT ARRAY(
    SELECT id FROM public.colaboradores
    WHERE id = p_gerente_id
       OR gerente_id = p_gerente_id
  ) INTO v_ids;
  RETURN v_ids;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 5. Função: retorna IDs da equipe de um gerente (TEXT[]) ─
-- Versão TEXT para uso em queries com = ANY($1::text[])
CREATE OR REPLACE FUNCTION public.fn_ids_equipe_text(p_gerente_id UUID)
RETURNS TEXT[] AS $$
DECLARE
  v_ids TEXT[];
BEGIN
  SELECT ARRAY(
    SELECT id::TEXT FROM public.colaboradores
    WHERE id = p_gerente_id
       OR gerente_id = p_gerente_id
  ) INTO v_ids;
  RETURN v_ids;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── 6. Backfill: caixa_atual = 'central' para leads sem caixa
UPDATE public.leads
SET caixa_atual = 'central'
WHERE caixa_atual IS NULL;

-- ─── 7. Backfill: caixa_atual em triagem_leads ───────────────
UPDATE public.triagem_leads
SET caixa_atual = 'central'
WHERE caixa_atual IS NULL;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'Migration 009 — suporte à visibilidade por perfil aplicado em %', NOW();
END $$;

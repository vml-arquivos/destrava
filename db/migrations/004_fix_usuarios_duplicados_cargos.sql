-- ============================================================
-- MIGRAÇÃO 004 — Correção de usuários duplicados e cargos
-- Versão: 1.0 | Data: 2026-04-01
--
-- PROBLEMA IDENTIFICADO:
--   1. CARGOS_VALIDOS no servidor usa Title Case ('Administrador')
--      mas HIERARQUIA_CARGOS usa lowercase ('administrador').
--      A função nivelCargo() faz .toLowerCase() mas a criação
--      de usuários pode gravar cargos com capitalização variada,
--      causando inconsistência nas permissões.
--
--   2. Não existe constraint UNIQUE no email de colaboradores
--      que seja case-insensitive. Dois usuários podem ter o
--      mesmo email com capitalização diferente.
--
--   3. Não existe índice único funcional em colaboradores.email
--      para prevenir duplicatas silenciosas.
--
-- SOLUÇÃO:
--   (a) Normalizar todos os cargos existentes para lowercase
--   (b) Criar índice único funcional em lower(email)
--   (c) Criar constraint CHECK nos cargos válidos
--   (d) Adicionar unique index no email normalizado
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

BEGIN;

-- ─── 1. Normalizar cargos existentes para lowercase ──────────
UPDATE public.colaboradores
SET cargo = LOWER(TRIM(cargo))
WHERE cargo IS DISTINCT FROM LOWER(TRIM(cargo));

-- ─── 2. Normalizar emails existentes para lowercase ──────────
UPDATE public.colaboradores
SET email = LOWER(TRIM(email))
WHERE email IS DISTINCT FROM LOWER(TRIM(email));

-- ─── 3. Índice único funcional no email (case-insensitive) ───
-- Previne duplicatas de email independente de capitalização
CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_email_unique
  ON public.colaboradores(LOWER(TRIM(email)));

-- ─── 4. CHECK constraint nos cargos válidos ──────────────────
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  -- Remove constraint antiga se existir
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.colaboradores'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%cargo%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.colaboradores DROP CONSTRAINT %I', v_constraint);
    RAISE NOTICE 'CHECK constraint de cargo % removido', v_constraint;
  END IF;
END $$;

ALTER TABLE public.colaboradores
  ADD CONSTRAINT colaboradores_cargo_check
  CHECK (cargo IN (
    'administrador',
    'diretor',
    'gerente comercial',
    'analista de crédito',
    'analista de credito',
    'consultor de crédito',
    'consultor de credito',
    'captador externo',
    'estagiário',
    'estagiario',
    'admin'
  ));

-- ─── 5. Garantir coluna ativo com DEFAULT TRUE ───────────────
ALTER TABLE public.colaboradores
  ALTER COLUMN ativo SET DEFAULT TRUE;

-- ─── 6. Índice de performance em cargo ───────────────────────
CREATE INDEX IF NOT EXISTS idx_colaboradores_cargo
  ON public.colaboradores(cargo);

COMMIT;

-- ─── Verificação ──────────────────────────────────────────────
SELECT cargo, COUNT(*) AS total, COUNT(*) FILTER (WHERE ativo) AS ativos
FROM public.colaboradores
GROUP BY cargo
ORDER BY cargo;

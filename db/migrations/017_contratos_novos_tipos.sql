-- ============================================================
-- MIGRATION 017: Contratos — Novos Tipos e Colunas
-- Data: 2026-04-30
-- Autor: Manus AI
-- ============================================================
-- ATENÇÃO: Esta migration NÃO é executada automaticamente.
-- Execute manualmente na VPS:
--   psql $DATABASE_URL < db/migrations/017_contratos_novos_tipos.sql
-- ============================================================
-- Esta migration é IDEMPOTENTE: usa ADD COLUMN IF NOT EXISTS,
-- DROP NOT NULL, DROP CONSTRAINT IF EXISTS e CREATE INDEX IF NOT EXISTS.
-- Pode ser executada em bancos que já possuam parte das colunas
-- (e.g., bancos que passaram pelo patch automático do startup).
-- ============================================================

-- ── 1. Tornar empresa_id opcional ────────────────────────────────────────────
-- Contratos de Limpa Nome PF, Limpa BACEN, Rating e Parceria Comercial
-- podem não ter empresa_id (ex.: contrato para lead/pessoa física ou parceiro).
ALTER TABLE contratos_gerados
  ALTER COLUMN empresa_id DROP NOT NULL;

-- ── 2. Adicionar coluna tipo_contrato ────────────────────────────────────────
-- Valores possíveis: assessoria | limpa_nome | limpa_bacen | rating | parceria_comercial
ALTER TABLE contratos_gerados
  ADD COLUMN IF NOT EXISTS tipo_contrato TEXT NOT NULL DEFAULT 'assessoria';

-- ── 3. Adicionar coluna cliente_tipo ─────────────────────────────────────────
-- Para contratos Limpa Nome: 'empresa' (PJ) ou 'lead' (PF)
ALTER TABLE contratos_gerados
  ADD COLUMN IF NOT EXISTS cliente_tipo TEXT;

-- ── 4. Adicionar coluna valor_contrato ───────────────────────────────────────
-- Valor cobrado ao cliente (Limpa Nome, Limpa BACEN, Rating).
-- Diferente de valor_referencia (usado apenas no contrato de Assessoria).
ALTER TABLE contratos_gerados
  ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC(15, 2);

-- ── 5. Adicionar coluna condicao_pagamento ───────────────────────────────────
-- Texto livre com a condição de pagamento (ex.: "50% na assinatura + 50% na entrega")
ALTER TABLE contratos_gerados
  ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT;

-- ── 6. Tornar valor_referencia opcional ──────────────────────────────────────
-- Contratos que não são de Assessoria não possuem valor_referencia.
-- O campo foi criado como NOT NULL na migration 016; tornamos opcional aqui.
ALTER TABLE contratos_gerados
  ALTER COLUMN valor_referencia DROP NOT NULL;

-- ── 7. Tornar taxa_comissao opcional ─────────────────────────────────────────
-- Apenas o contrato de Assessoria usa taxa_comissao.
-- Os demais tipos inserem 0 por compatibilidade.
ALTER TABLE contratos_gerados
  ALTER COLUMN taxa_comissao DROP NOT NULL;

-- ── 8. Tornar honorario_minimo_mes e honorario_minimo_total opcionais ─────────
ALTER TABLE contratos_gerados
  ALTER COLUMN honorario_minimo_mes DROP NOT NULL;

ALTER TABLE contratos_gerados
  ALTER COLUMN honorario_minimo_total DROP NOT NULL;

-- ── 9. Remover CHECK constraint de status (se existir) ───────────────────────
-- A migration 016 criou CHECK (status IN ('gerado','assinado','cancelado')).
-- Removemos para permitir extensão futura sem nova migration.
ALTER TABLE contratos_gerados
  DROP CONSTRAINT IF EXISTS contratos_gerados_status_check;

-- ── 10. Índices adicionais ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contratos_lead ON contratos_gerados(lead_id);
CREATE INDEX IF NOT EXISTS idx_contratos_tipo ON contratos_gerados(tipo_contrato);
CREATE INDEX IF NOT EXISTS idx_contratos_parceiro ON contratos_gerados(parceiro_id);

-- ── 11. Comentários descritivos ──────────────────────────────────────────────
COMMENT ON COLUMN contratos_gerados.tipo_contrato IS
  'Tipo do contrato: assessoria | limpa_nome | limpa_bacen | rating | parceria_comercial';

COMMENT ON COLUMN contratos_gerados.cliente_tipo IS
  'Para contratos Limpa Nome: empresa (PJ) ou lead (PF)';

COMMENT ON COLUMN contratos_gerados.valor_contrato IS
  'Valor cobrado ao cliente. Usado em Limpa Nome, Limpa BACEN e Rating.';

COMMENT ON COLUMN contratos_gerados.condicao_pagamento IS
  'Texto livre com a condição de pagamento acordada com o cliente.';

COMMENT ON COLUMN contratos_gerados.valor_referencia IS
  'Valor de referência para projeção de crédito. Usado apenas no contrato de Assessoria.';

-- ── FIM DA MIGRATION 017 ──────────────────────────────────────────────────────

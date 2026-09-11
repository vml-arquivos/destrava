-- ============================================================
-- MIGRATION 016: Previsão de Faturamento + Gerador de Contratos
-- Data: 2026-04-29
-- Autor: Manus (via Master Prompt Claude)
-- ============================================================
-- ATENÇÃO: Esta migration NÃO é executada automaticamente.
-- O Desenvolvedor Chefe deve executar manualmente na VPS:
--   psql $DATABASE_URL < db/migrations/016_previsao_faturamento_e_contratos.sql
-- ============================================================

-- ── MÓDULO A: Histórico de Faturamento ──────────────────────
CREATE TABLE IF NOT EXISTS faturamento_historico (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  competencia   DATE NOT NULL, -- Sempre o primeiro dia do mês: '2025-01-01'
  valor         NUMERIC(15, 2) NOT NULL CHECK (valor >= 0),
  origem        TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'importado')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_fat_historico_empresa ON faturamento_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fat_historico_competencia ON faturamento_historico(competencia DESC);

-- ── MÓDULO A: Previsões Geradas pela IA ─────────────────────
CREATE TABLE IF NOT EXISTS previsao_faturamento (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  gerada_em               TIMESTAMPTZ DEFAULT NOW(),
  modelo_usado            TEXT NOT NULL CHECK (modelo_usado IN ('prophet', 'arima')),
  horizonte_meses         INTEGER NOT NULL CHECK (horizonte_meses IN (12, 24)),
  capacidade_pgto_min     NUMERIC(15, 2) NOT NULL, -- 15% da média prevista
  capacidade_pgto_max     NUMERIC(15, 2) NOT NULL, -- 25% da média prevista
  payload_completo        JSONB NOT NULL, -- Array de {ds, yhat, yhat_lower, yhat_upper, is_historico}
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_previsao_empresa ON previsao_faturamento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_previsao_gerada ON previsao_faturamento(gerada_em DESC);

-- ── MÓDULO B: Parceiros Comerciais ──────────────────────────
CREATE TABLE IF NOT EXISTS parceiros_comerciais (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  cpf        TEXT NOT NULL,
  email      TEXT,
  telefone   TEXT,
  ativo      BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cpf)
);

-- ── MÓDULO B: Contratos Gerados ─────────────────────────────
CREATE TABLE IF NOT EXISTS contratos_gerados (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  parceiro_id           UUID REFERENCES parceiros_comerciais(id) ON DELETE SET NULL,
  lead_id               UUID REFERENCES leads(id) ON DELETE SET NULL,
  valor_referencia      NUMERIC(15, 2) NOT NULL,
  taxa_comissao         NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
  honorario_minimo_mes  NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
  honorario_minimo_total NUMERIC(5, 2) NOT NULL DEFAULT 12.00,
  data_assinatura       DATE NOT NULL,
  foro_eleito           TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'gerado'
    CHECK (status IN ('gerado', 'assinado', 'cancelado')),
  pdf_path              TEXT, -- caminho relativo: /uploads/contratos/{uuid}.pdf
  hash_documento        TEXT UNIQUE, -- SHA-256 do PDF gerado
  payload_snapshot      JSONB NOT NULL, -- Snapshot de todos os dados no momento da geração
  criado_por            UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos_gerados(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status ON contratos_gerados(status);
CREATE INDEX IF NOT EXISTS idx_contratos_created ON contratos_gerados(created_at DESC);

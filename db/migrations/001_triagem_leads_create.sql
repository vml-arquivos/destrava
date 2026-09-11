-- ============================================================
-- MIGRAÇÃO 001 — Criação da tabela triagem_leads
-- Versão: 1.0 | Data: 2026-04-01
-- Contexto: A tabela triagem_leads é referenciada pelo servidor
--   (server/index.ts) e por migrate_simulacoes_empresa_v1.sql,
--   mas nunca foi criada formalmente em nenhum schema do repositório.
--   Esta migration cria a tabela de forma idempotente.
-- Idempotente: seguro para reexecutar.
-- ============================================================

-- ─── Tabela: triagem_leads ────────────────────────────────────
-- Fila de pré-qualificação para leads vindos do simulador público.
-- Leads ficam aqui até serem qualificados (manual ou por IA) e
-- convertidos em leads reais na tabela `leads`.
CREATE TABLE IF NOT EXISTS public.triagem_leads (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           TEXT        NOT NULL DEFAULT '',
  email          TEXT,
  telefone       TEXT        NOT NULL DEFAULT '',
  empresa        TEXT,
  cpf_cnpj       TEXT,
  tipo_pessoa    TEXT        NOT NULL DEFAULT 'pj'
                   CHECK (tipo_pessoa IN ('pf','pj')),
  produto        TEXT,
  valor          NUMERIC(15,2),
  prazo          INTEGER,
  parcela        NUMERIC(15,2),
  taxa           NUMERIC(8,4),
  cidade         TEXT,
  estado         CHAR(2),
  utm_source     TEXT,
  utm_medium     TEXT,
  utm_campaign   TEXT,
  status         TEXT        NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente','possivel_cliente','curioso','sem_perfil','convertido','descartado')),
  classificacao  TEXT,
  observacoes    TEXT,
  observacoes_ia TEXT,
  score_ia       INTEGER     DEFAULT 0 CHECK (score_ia BETWEEN 0 AND 100),
  responsavel_id UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  empresa_id     UUID        REFERENCES public.empresas(id) ON DELETE SET NULL,
  lead_id        UUID        REFERENCES public.leads(id) ON DELETE SET NULL,
  convertido_em  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_triagem_status
  ON public.triagem_leads(status);

CREATE INDEX IF NOT EXISTS idx_triagem_created_at
  ON public.triagem_leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_triagem_telefone
  ON public.triagem_leads(telefone);

CREATE INDEX IF NOT EXISTS idx_triagem_empresa_id
  ON public.triagem_leads(empresa_id)
  WHERE empresa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_triagem_responsavel
  ON public.triagem_leads(responsavel_id)
  WHERE responsavel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_triagem_lead_id
  ON public.triagem_leads(lead_id)
  WHERE lead_id IS NOT NULL;

-- ─── Trigger: updated_at automático ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_triagem_updated_at') THEN
    CREATE TRIGGER trg_triagem_updated_at
      BEFORE UPDATE ON public.triagem_leads
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── Confirmação ──────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration 001 — triagem_leads criada/verificada em %', NOW();
END $$;

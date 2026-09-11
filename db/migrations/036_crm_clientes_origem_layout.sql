-- 036_crm_clientes_origem_layout.sql
-- Organização visual/operacional de clientes e origem sem regressão.
-- Todos os campos são opcionais e compatíveis com dados antigos.

ALTER TABLE IF EXISTS clientes_pf
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS canal TEXT,
  ADD COLUMN IF NOT EXISTS campanha TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS produto_interesse TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS ultima_interacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_id UUID,
  ADD COLUMN IF NOT EXISTS empresa_id UUID,
  ADD COLUMN IF NOT EXISTS tipo_cliente TEXT DEFAULT 'pf';

ALTER TABLE IF EXISTS empresas
  ADD COLUMN IF NOT EXISTS canal TEXT,
  ADD COLUMN IF NOT EXISTS campanha TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS landing_page TEXT,
  ADD COLUMN IF NOT EXISTS produto_interesse TEXT,
  ADD COLUMN IF NOT EXISTS ultima_interacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
  ADD COLUMN IF NOT EXISTS etapa_jornada_cliente TEXT;

ALTER TABLE IF EXISTS leads
  ADD COLUMN IF NOT EXISTS ultima_interacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proxima_acao TEXT,
  ADD COLUMN IF NOT EXISTS produto_interesse TEXT;

CREATE INDEX IF NOT EXISTS idx_clientes_pf_origem ON clientes_pf(origem);
CREATE INDEX IF NOT EXISTS idx_clientes_pf_status ON clientes_pf(status);
CREATE INDEX IF NOT EXISTS idx_clientes_pf_responsavel ON clientes_pf(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_clientes_pf_empresa ON clientes_pf(empresa_id);
CREATE INDEX IF NOT EXISTS idx_empresas_origem ON empresas(origem);
CREATE INDEX IF NOT EXISTS idx_empresas_proxima_acao ON empresas(proxima_acao);
CREATE INDEX IF NOT EXISTS idx_leads_proxima_acao ON leads(proxima_acao);

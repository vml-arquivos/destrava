-- ============================================================
-- 032_socios_empresa_completo.sql
-- Expande socios_empresa com dados completos para análise de crédito:
-- dados pessoais, cônjuge, endereço, RG, junta comercial, advogado
-- Idempotente — usa ADD COLUMN IF NOT EXISTS em tudo
--
-- EXECUTAR:
--   docker cp 032_socios_empresa_completo.sql tr3go0jqyc5h3tuvz7f46zkc:/tmp/
--   docker exec -it tr3go0jqyc5h3tuvz7f46zkc \
--     psql -U postgres -d postgres -f /tmp/032_socios_empresa_completo.sql
-- ============================================================

BEGIN;

\echo '── Garantir função set_updated_at (caso não exista) ─────────'
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

\echo '── Expandir socios_empresa ──────────────────────────────────'

-- Dados pessoais
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS rg                    TEXT,
  ADD COLUMN IF NOT EXISTS rg_orgao_emissor      TEXT,
  ADD COLUMN IF NOT EXISTS rg_uf_emissao         CHAR(2),
  ADD COLUMN IF NOT EXISTS rg_data_emissao       DATE,
  ADD COLUMN IF NOT EXISTS data_nascimento       DATE,
  ADD COLUMN IF NOT EXISTS nacionalidade         TEXT DEFAULT 'Brasileiro(a)',
  ADD COLUMN IF NOT EXISTS estado_civil          TEXT,
  ADD COLUMN IF NOT EXISTS profissao             TEXT,
  ADD COLUMN IF NOT EXISTS email                 TEXT,
  ADD COLUMN IF NOT EXISTS telefone              TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp              TEXT,
  ADD COLUMN IF NOT EXISTS pep                   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ativo                 BOOLEAN DEFAULT true;

-- Endereço do sócio
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS cep                   TEXT,
  ADD COLUMN IF NOT EXISTS logradouro            TEXT,
  ADD COLUMN IF NOT EXISTS numero                TEXT,
  ADD COLUMN IF NOT EXISTS complemento           TEXT,
  ADD COLUMN IF NOT EXISTS bairro                TEXT,
  ADD COLUMN IF NOT EXISTS cidade                TEXT,
  ADD COLUMN IF NOT EXISTS uf                    CHAR(2);

-- Cônjuge / companheiro(a)
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS conjuge_nome          TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_cpf           TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_rg            TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_data_nasc     DATE,
  ADD COLUMN IF NOT EXISTS conjuge_profissao     TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_email         TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_telefone      TEXT,
  ADD COLUMN IF NOT EXISTS regime_bens           TEXT;

-- Dados da Junta Comercial / JUCESP / JUCEG
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS junta_comercial_uf    CHAR(2),
  ADD COLUMN IF NOT EXISTS nire                  TEXT,
  ADD COLUMN IF NOT EXISTS data_registro_junta   DATE,
  ADD COLUMN IF NOT EXISTS numero_protocolo_junta TEXT,
  ADD COLUMN IF NOT EXISTS situacao_junta         TEXT DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS data_ultima_alteracao  DATE,
  ADD COLUMN IF NOT EXISTS numero_alteracao        TEXT;

-- Advogado / representante legal externo
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS advogado_nome         TEXT,
  ADD COLUMN IF NOT EXISTS advogado_cpf          TEXT,
  ADD COLUMN IF NOT EXISTS advogado_oab          TEXT,
  ADD COLUMN IF NOT EXISTS advogado_uf_oab       CHAR(2),
  ADD COLUMN IF NOT EXISTS advogado_email        TEXT,
  ADD COLUMN IF NOT EXISTS advogado_telefone     TEXT;

-- Análise de crédito / risco
ALTER TABLE public.socios_empresa
  ADD COLUMN IF NOT EXISTS score_serasa          INTEGER,
  ADD COLUMN IF NOT EXISTS score_spc             INTEGER,
  ADD COLUMN IF NOT EXISTS possui_restricao      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_restricao       NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS observacoes           TEXT,
  ADD COLUMN IF NOT EXISTS dados_extras          JSONB DEFAULT '{}'::jsonb;

\echo 'OK: socios_empresa expandido.'

-- Índices úteis para análise
CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf
  ON public.socios_empresa(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_ativo
  ON public.socios_empresa(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_conjuge_cpf
  ON public.socios_empresa(conjuge_cpf)
  WHERE conjuge_cpf IS NOT NULL;

-- Desabilitar RLS
ALTER TABLE public.socios_empresa DISABLE ROW LEVEL SECURITY;

-- Permissões
GRANT ALL PRIVILEGES ON public.socios_empresa TO postgres;

COMMIT;

\echo ''
\echo '── Validação ────────────────────────────────────────────────'
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'socios_empresa'
ORDER BY ordinal_position;

\echo 'CONCLUÍDO'

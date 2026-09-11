BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.socios_empresa
  ADD COLUMN IF NOT EXISTS cpf_completo_manual VARCHAR(14),
  ADD COLUMN IF NOT EXISTS cpf_validado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cpf_fonte VARCHAR(50) DEFAULT 'api_publica_cnpj',
  ADD COLUMN IF NOT EXISTS ultima_atualizacao_pessoal TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cpfhub_consultado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpfhub_status TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.empresas_contratos_sociais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome_arquivo VARCHAR(255) NOT NULL,
  caminho_arquivo VARCHAR(500) NOT NULL,
  url VARCHAR(500),
  tamanho_bytes INT,
  tipo_mime VARCHAR(50) DEFAULT 'application/pdf',
  data_assinatura DATE,
  numero_registro VARCHAR(50),
  data_registro DATE,
  numero_alteracoes INT DEFAULT 0,
  ultima_alteracao DATE,
  descricao TEXT,
  uploaded_by UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  data_upload TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contratos_sociais_empresa_id ON public.empresas_contratos_sociais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contratos_sociais_data_upload ON public.empresas_contratos_sociais(data_upload);

CREATE TABLE IF NOT EXISTS public.socios_conjuge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socio_id UUID NOT NULL REFERENCES public.socios_empresa(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  conjuge_nome VARCHAR(255),
  conjuge_cpf VARCHAR(14),
  regime_bens VARCHAR(100),
  data_casamento DATE,
  estado_civil VARCHAR(50),
  fonte VARCHAR(50) DEFAULT 'manual',
  criado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  atualizado_por UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  data_insercao TIMESTAMPTZ DEFAULT NOW(),
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_socios_conjuge_socio_id ON public.socios_conjuge(socio_id);
CREATE INDEX IF NOT EXISTS idx_socios_conjuge_empresa_id ON public.socios_conjuge(empresa_id);

COMMIT;

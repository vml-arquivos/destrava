-- 062_analise_cnpj_receita_cartao.sql
-- Fase 1 da IA documental: análise do CNPJ usando Receita Federal + Cartão CNPJ anexado.
-- Idempotente: pode ser executada mais de uma vez.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.analises_cnpj_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cartao_cnpj_arquivo_id UUID NULL REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'concluida',
  score_cnpj INTEGER NOT NULL DEFAULT 0,
  risco_cnpj TEXT NOT NULL DEFAULT 'nao_calculado',

  cnpj TEXT NULL,
  matriz_filial TEXT NULL,
  data_abertura DATE NULL,
  idade_meses INTEGER NULL,
  tempo_abertura_descricao TEXT NULL,
  alerta_menos_12_meses BOOLEAN NOT NULL DEFAULT false,
  alerta_mais_36_meses BOOLEAN NOT NULL DEFAULT false,

  situacao_cadastral TEXT NULL,
  risco_situacao TEXT NULL,
  cnae_principal TEXT NULL,
  natureza_juridica TEXT NULL,
  porte TEXT NULL,
  capital_social NUMERIC NULL,

  data_emissao_cartao DATE NULL,
  dias_emissao_cartao INTEGER NULL,
  status_validade_cartao TEXT NOT NULL DEFAULT 'nao_verificado',
  cartao_pendente_ocr BOOLEAN NOT NULL DEFAULT false,
  cartao_anexado BOOLEAN NOT NULL DEFAULT false,

  campos_receita JSONB NOT NULL DEFAULT '{}'::jsonb,
  campos_cartao JSONB NOT NULL DEFAULT '{}'::jsonb,
  comparacao JSONB NOT NULL DEFAULT '{}'::jsonb,
  divergencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
  pontos_positivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  pontos_atencao JSONB NOT NULL DEFAULT '[]'::jsonb,
  pontos_impeditivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  recomendacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  diagnostico TEXT NULL,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  fonte_receita TEXT NULL,

  criado_por UUID NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT analises_cnpj_empresa_status_chk CHECK (status IN ('concluida','pendente_documento','pendente_ocr','revisao_humana','falhou')),
  CONSTRAINT analises_cnpj_empresa_risco_chk CHECK (risco_cnpj IN ('baixo','medio','alto','critico','nao_calculado')),
  CONSTRAINT analises_cnpj_empresa_validade_chk CHECK (status_validade_cartao IN ('valido','vencido','pendente','nao_verificado','divergente','ilegivel'))
);

CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_empresa_id ON public.analises_cnpj_empresa (empresa_id);
CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_criado_em ON public.analises_cnpj_empresa (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_score ON public.analises_cnpj_empresa (score_cnpj);
CREATE INDEX IF NOT EXISTS idx_analises_cnpj_empresa_resultado_gin ON public.analises_cnpj_empresa USING GIN (resultado);

CREATE OR REPLACE FUNCTION public.atualizar_timestamp_analises_cnpj_empresa()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_analises_cnpj_empresa_atualizado_em ON public.analises_cnpj_empresa;
CREATE TRIGGER trg_analises_cnpj_empresa_atualizado_em
BEFORE UPDATE ON public.analises_cnpj_empresa
FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp_analises_cnpj_empresa();

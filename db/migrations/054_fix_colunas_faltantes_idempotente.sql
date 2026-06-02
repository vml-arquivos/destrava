-- Migration 054 — Garantir colunas faltantes de forma idempotente
-- Corrige erros 500 causados por colunas inexistentes em ambientes que não
-- executaram todas as migrations anteriores na ordem correta.
-- Pode ser executada mais de uma vez sem efeitos colaterais.
BEGIN;

-- ─── Tabela: empresas ────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.empresas
  ADD COLUMN IF NOT EXISTS inscricao_estadual TEXT,
  ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT,
  ADD COLUMN IF NOT EXISTS natureza_juridica TEXT,
  ADD COLUMN IF NOT EXISTS capital_social NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS cnae_principal TEXT,
  ADD COLUMN IF NOT EXISTS cnaes_secundarios TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_abertura DATE,
  ADD COLUMN IF NOT EXISTS situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS data_situacao_cadastral DATE,
  ADD COLUMN IF NOT EXISTS motivo_situacao_cadastral TEXT,
  ADD COLUMN IF NOT EXISTS matriz_filial TEXT,
  ADD COLUMN IF NOT EXISTS regime_tributario TEXT,
  ADD COLUMN IF NOT EXISTS telefone_2 TEXT,
  ADD COLUMN IF NOT EXISTS dados_extra_receita JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_sincronizacao_receita TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analista_id UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS captador_id UUID NULL REFERENCES public.colaboradores(id) ON DELETE SET NULL;

-- ─── Tabela: socios_empresa ──────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.socios_empresa
  ADD COLUMN IF NOT EXISTS nome_representante TEXT,
  ADD COLUMN IF NOT EXISTS qualificacao_representante TEXT,
  ADD COLUMN IF NOT EXISTS data_entrada_sociedade DATE,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS rg TEXT,
  ADD COLUMN IF NOT EXISTS rg_orgao_emissor TEXT,
  ADD COLUMN IF NOT EXISTS rg_uf_emissao CHAR(2),
  ADD COLUMN IF NOT EXISTS rg_data_emissao DATE,
  ADD COLUMN IF NOT EXISTS data_nascimento DATE,
  ADD COLUMN IF NOT EXISTS nacionalidade TEXT,
  ADD COLUMN IF NOT EXISTS estado_civil TEXT,
  ADD COLUMN IF NOT EXISTS profissao TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telefone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS logradouro TEXT,
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT,
  ADD COLUMN IF NOT EXISTS bairro TEXT,
  ADD COLUMN IF NOT EXISTS cidade TEXT,
  ADD COLUMN IF NOT EXISTS uf CHAR(2),
  ADD COLUMN IF NOT EXISTS conjuge_nome TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_cpf TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_rg TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_data_nasc DATE,
  ADD COLUMN IF NOT EXISTS conjuge_profissao TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_email TEXT,
  ADD COLUMN IF NOT EXISTS conjuge_telefone TEXT,
  ADD COLUMN IF NOT EXISTS regime_bens TEXT,
  ADD COLUMN IF NOT EXISTS pep BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS fonte_dados TEXT DEFAULT 'api_publica_cnpj',
  ADD COLUMN IF NOT EXISTS percentual_capital NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cpf_completo_manual VARCHAR(14),
  ADD COLUMN IF NOT EXISTS cpf_validado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cpf_fonte VARCHAR(50) DEFAULT 'api_publica_cnpj',
  ADD COLUMN IF NOT EXISTS ultima_atualizacao_pessoal TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assinante_contrato BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pendencias_contrato TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS cadastro_completo_contrato BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dados_extra JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS genero VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cpfhub_consultado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpfhub_status TEXT,
  ADD COLUMN IF NOT EXISTS cpfcnpj_consultado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpfcnpj_status TEXT,
  ADD COLUMN IF NOT EXISTS cpfcnpj_fonte TEXT,
  ADD COLUMN IF NOT EXISTS cpfcnpj_payload_resumo JSONB DEFAULT '{}'::jsonb;

-- ─── Tabela: acompanhamento_bancario_atualizacoes ────────────────────────────
ALTER TABLE IF EXISTS public.acompanhamento_bancario_atualizacoes
  ADD COLUMN IF NOT EXISTS semanas_no_mes INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS semanas_restantes_mes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_anual NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_alerta_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico TEXT,
  ADD COLUMN IF NOT EXISTS faturamento_anual_ref NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_anual_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_mensal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_mensal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia_semanal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_semanal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_abaixo_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_ref_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_disponivel_teto_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_base_dinamica NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_anual NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS alerta_aderencia BOOLEAN DEFAULT false;

-- ─── Tabela: acompanhamento_compensacoes_historico ───────────────────────────
ALTER TABLE IF EXISTS public.acompanhamento_compensacoes_historico
  ADD COLUMN IF NOT EXISTS data_referencia_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_referencia_fim DATE,
  ADD COLUMN IF NOT EXISTS entrada_realizada NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_anual_ref NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_anual_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS faturamento_mensal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_mensal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referencia_semanal_base NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_semanal_movimentacao NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acumulado_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_abaixo_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_excedente_semana NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_faltante_ref_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_disponivel_teto_mensal NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_base_dinamica NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS teto_dinamico_proxima NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_semanal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_mensal NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_uso_anual NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status_aderencia TEXT,
  ADD COLUMN IF NOT EXISTS alerta_aderencia BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_alerta TEXT,
  ADD COLUMN IF NOT EXISTS diagnostico_tecnico TEXT,
  ADD COLUMN IF NOT EXISTS criado_por UUID;

-- Índice único para evitar duplicatas no histórico de compensações
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_acomp_comp_hist_acomp_semana'
  ) THEN
    CREATE UNIQUE INDEX ux_acomp_comp_hist_acomp_semana
      ON public.acompanhamento_compensacoes_historico(acompanhamento_id, numero_semana);
  END IF;
END $$;

-- ─── Tabela: empresa_checklist_documentos ────────────────────────────────────
-- Garante que a coluna socio_id existe (pode não existir em instâncias antigas)
ALTER TABLE IF EXISTS public.empresa_checklist_documentos
  ADD COLUMN IF NOT EXISTS socio_id UUID NULL REFERENCES public.socios_empresa(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'automatico',
  ADD COLUMN IF NOT EXISTS arquivo_id UUID NULL,
  ADD COLUMN IF NOT EXISTS data_vencimento DATE NULL;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpf ON public.socios_empresa(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_empresa_id ON public.socios_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_socios_empresa_cpfhub_status ON public.socios_empresa(cpfhub_status);

COMMIT;

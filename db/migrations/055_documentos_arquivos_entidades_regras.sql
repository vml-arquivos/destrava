-- 055_documentos_arquivos_entidades_regras.sql
-- Estrutura centralizada e auditável para documentos por entidade.
-- Idempotente e segura: cria novas tabelas/índices, preserva legados e migra referências conhecidas sem apagar arquivos.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'documento_entidade_tipo') THEN
    CREATE TYPE documento_entidade_tipo AS ENUM (
      'empresa', 'cliente_pf', 'lead', 'socio', 'contrato', 'simulacao',
      'acompanhamento_bancario', 'acompanhamento_financeiro', 'faturamento', 'contador', 'outros'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'documento_status_tipo') THEN
    CREATE TYPE documento_status_tipo AS ENUM (
      'ativo', 'arquivado', 'substituido', 'excluido', 'pendente_validacao', 'validado', 'recusado'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'documento_origem_tipo') THEN
    CREATE TYPE documento_origem_tipo AS ENUM (
      'upload_manual', 'gerado_sistema', 'importado_api', 'sincronizacao', 'migracao'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.documentos_arquivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  empresa_id UUID NULL,
  cliente_pf_id UUID NULL,
  lead_id UUID NULL,
  socio_id UUID NULL,
  contrato_id UUID NULL,
  simulacao_id UUID NULL,
  tipo_documento TEXT NOT NULL,
  nome_original TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  caminho_arquivo TEXT NOT NULL,
  url_arquivo TEXT NULL,
  mime_type TEXT,
  tamanho_bytes BIGINT,
  hash_arquivo TEXT NULL,
  status TEXT DEFAULT 'ativo',
  origem TEXT DEFAULT 'upload_manual',
  obrigatorio BOOLEAN DEFAULT false,
  validado BOOLEAN DEFAULT false,
  validado_por UUID NULL,
  validado_em TIMESTAMPTZ NULL,
  observacoes TEXT NULL,
  metadados JSONB DEFAULT '{}'::jsonb,
  criado_por UUID NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  excluido_em TIMESTAMPTZ NULL,
  CONSTRAINT documentos_arquivos_entidade_tipo_chk CHECK (entidade_tipo IN (
    'empresa','cliente_pf','lead','socio','contrato','simulacao','acompanhamento_bancario','acompanhamento_financeiro','faturamento','contador','outros'
  )),
  CONSTRAINT documentos_arquivos_status_chk CHECK (status IN (
    'ativo','arquivado','substituido','excluido','pendente_validacao','validado','recusado'
  )),
  CONSTRAINT documentos_arquivos_origem_chk CHECK (origem IN (
    'upload_manual','gerado_sistema','importado_api','sincronizacao','migracao'
  )),
  CONSTRAINT documentos_arquivos_tipo_chk CHECK (tipo_documento IN (
    'contrato_social','alteracao_contratual','documento_socio','rg','cpf','cnh','comprovante_residencia',
    'comprovante_faturamento','extrato_bancario','imposto_renda','balanco','dre','certidao','procuracao',
    'contrato_assessoria','declaracao_faturamento','cartao_cnpj','nire','estatuto','contrato_gerado',
    'contrato_assinado','outros'
  )),
  CONSTRAINT documentos_arquivos_cliente_pf_obr_chk CHECK (entidade_tipo <> 'cliente_pf' OR cliente_pf_id IS NOT NULL),
  CONSTRAINT documentos_arquivos_socio_obr_chk CHECK (entidade_tipo <> 'socio' OR (socio_id IS NOT NULL AND empresa_id IS NOT NULL)),
  CONSTRAINT documentos_arquivos_contrato_obr_chk CHECK (entidade_tipo <> 'contrato' OR contrato_id IS NOT NULL),
  CONSTRAINT documentos_arquivos_simulacao_obr_chk CHECK (entidade_tipo <> 'simulacao' OR simulacao_id IS NOT NULL),
  CONSTRAINT documentos_arquivos_lead_obr_chk CHECK (entidade_tipo <> 'lead' OR lead_id IS NOT NULL),
  CONSTRAINT documentos_arquivos_empresa_obr_chk CHECK (entidade_tipo <> 'empresa' OR empresa_id IS NOT NULL),
  CONSTRAINT documentos_arquivos_sem_pessoal_na_empresa_chk CHECK (
    NOT (entidade_tipo = 'empresa' AND tipo_documento IN ('rg','cpf','cnh','comprovante_residencia','documento_socio') AND socio_id IS NULL)
  ),
  CONSTRAINT documentos_arquivos_sem_empresarial_pf_chk CHECK (
    NOT (entidade_tipo = 'cliente_pf' AND tipo_documento IN ('contrato_social','alteracao_contratual','cartao_cnpj','nire','estatuto'))
  )
);

CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_entidade ON public.documentos_arquivos(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_empresa_id ON public.documentos_arquivos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_cliente_pf_id ON public.documentos_arquivos(cliente_pf_id);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_lead_id ON public.documentos_arquivos(lead_id);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_socio_id ON public.documentos_arquivos(socio_id);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_contrato_id ON public.documentos_arquivos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_simulacao_id ON public.documentos_arquivos(simulacao_id);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_tipo_documento ON public.documentos_arquivos(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_status ON public.documentos_arquivos(status);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_hash ON public.documentos_arquivos(hash_arquivo);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_ativos ON public.documentos_arquivos(entidade_tipo, entidade_id, status) WHERE excluido_em IS NULL;

CREATE TABLE IF NOT EXISTS public.auditoria_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NULL,
  acao TEXT NOT NULL,
  antes JSONB,
  depois JSONB,
  usuario_id UUID NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_documentos_documento_id ON public.auditoria_documentos(documento_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_documentos_usuario_id ON public.auditoria_documentos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_documentos_criado_em ON public.auditoria_documentos(criado_em DESC);

CREATE OR REPLACE FUNCTION public.set_documentos_arquivos_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documentos_arquivos_atualizado_em ON public.documentos_arquivos;
CREATE TRIGGER trg_documentos_arquivos_atualizado_em
BEFORE UPDATE ON public.documentos_arquivos
FOR EACH ROW EXECUTE FUNCTION public.set_documentos_arquivos_atualizado_em();

-- Migração compatível: empresa_documentos legado -> documentos_arquivos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='empresa_documentos') THEN
    INSERT INTO public.documentos_arquivos (
      entidade_tipo, entidade_id, empresa_id, tipo_documento, nome_original, nome_arquivo, caminho_arquivo,
      url_arquivo, mime_type, tamanho_bytes, status, origem, metadados, criado_em, atualizado_em
    )
    SELECT
      'empresa', ed.empresa_id, ed.empresa_id,
      CASE
        WHEN lower(coalesce(ed.tipo, '')) IN ('contrato_social','alteracao_contratual','cartao_cnpj','nire','estatuto') THEN lower(ed.tipo)
        WHEN lower(coalesce(ed.tipo, '')) IN ('rg','cpf','cnh','comprovante_residencia') THEN 'outros'
        ELSE 'outros'
      END,
      coalesce(ed.nome, ed.url, 'documento_legado'),
      coalesce(split_part(ed.url, '/', array_length(string_to_array(ed.url, '/'), 1)), ed.nome, ed.id::text),
      coalesce(ed.url, '/legado/empresa_documentos/' || ed.id::text),
      ed.url,
      NULL,
      ed.tamanho,
      CASE WHEN lower(coalesce(ed.tipo, '')) IN ('rg','cpf','cnh','comprovante_residencia') THEN 'pendente_validacao' ELSE 'ativo' END,
      'migracao',
      jsonb_build_object('origem_tabela','empresa_documentos','origem_id',ed.id,'tipo_legado',ed.tipo),
      coalesce(ed.created_at, NOW()),
      coalesce(ed.created_at, NOW())
    FROM public.empresa_documentos ed
    WHERE ed.empresa_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.documentos_arquivos da
        WHERE da.metadados->>'origem_tabela'='empresa_documentos'
          AND da.metadados->>'origem_id'=ed.id::text
      );
  END IF;
END $$;

-- Migração GED legado -> documentos_arquivos, preservando vínculo da empresa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='documentos_empresa') THEN
    INSERT INTO public.documentos_arquivos (
      entidade_tipo, entidade_id, empresa_id, tipo_documento, nome_original, nome_arquivo, caminho_arquivo,
      url_arquivo, mime_type, tamanho_bytes, status, origem, observacoes, metadados, criado_em, atualizado_em
    )
    SELECT
      'empresa', de.empresa_id, de.empresa_id,
      CASE
        WHEN de.tipo_documento IN ('contrato_social','alteracao_contratual','cartao_cnpj','nire','estatuto','declaracao_faturamento','extrato_bancario','dre','balanco','procuracao') THEN de.tipo_documento
        WHEN de.tipo_documento IN ('rg_socio','cpf_socio','cnh_socio','comprovante_residencia_socio') THEN 'outros'
        ELSE 'outros'
      END,
      coalesce(de.nome_arquivo, 'documento_ged'),
      coalesce(split_part(de.url_arquivo, '/', array_length(string_to_array(de.url_arquivo, '/'), 1)), de.nome_arquivo, de.id::text),
      coalesce(de.url_arquivo, '/legado/documentos_empresa/' || de.id::text),
      de.url_arquivo,
      NULL,
      de.tamanho_bytes,
      CASE
        WHEN de.status_validacao IN ('validado','recusado') THEN de.status_validacao
        WHEN de.status_validacao IN ('em_analise','pendente','pendente_validacao') THEN 'pendente_validacao'
        ELSE 'ativo'
      END,
      'migracao',
      NULL,
      jsonb_build_object('origem_tabela','documentos_empresa','origem_id',de.id,'tipo_legado',de.tipo_documento,'status_validacao',de.status_validacao),
      coalesce(de.created_at, NOW()),
      coalesce(de.updated_at, de.created_at, NOW())
    FROM public.documentos_empresa de
    WHERE de.empresa_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.documentos_arquivos da
        WHERE da.metadados->>'origem_tabela'='documentos_empresa'
          AND da.metadados->>'origem_id'=de.id::text
      );
  END IF;
END $$;

-- Migração contratos sociais legado -> documentos_arquivos.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='empresas_contratos_sociais') THEN
    INSERT INTO public.documentos_arquivos (
      entidade_tipo, entidade_id, empresa_id, tipo_documento, nome_original, nome_arquivo, caminho_arquivo,
      url_arquivo, mime_type, tamanho_bytes, status, origem, observacoes, criado_por, metadados, criado_em, atualizado_em
    )
    SELECT
      'empresa', ecs.empresa_id, ecs.empresa_id,
      CASE WHEN coalesce(ecs.numero_alteracoes, 0) > 0 THEN 'alteracao_contratual' ELSE 'contrato_social' END,
      coalesce(ecs.nome_arquivo, 'contrato_social.pdf'),
      coalesce(split_part(ecs.caminho_arquivo, '/', array_length(string_to_array(ecs.caminho_arquivo, '/'), 1)), ecs.nome_arquivo, ecs.id::text),
      coalesce(ecs.caminho_arquivo, ecs.url, '/legado/empresas_contratos_sociais/' || ecs.id::text),
      ecs.url,
      coalesce(ecs.tipo_mime, 'application/pdf'),
      ecs.tamanho_bytes,
      'ativo',
      'migracao',
      ecs.descricao,
      ecs.uploaded_by,
      jsonb_build_object('origem_tabela','empresas_contratos_sociais','origem_id',ecs.id,'numero_registro',ecs.numero_registro,'data_registro',ecs.data_registro),
      coalesce(ecs.data_upload, NOW()),
      coalesce(ecs.data_upload, NOW())
    FROM public.empresas_contratos_sociais ecs
    WHERE ecs.empresa_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.documentos_arquivos da
        WHERE da.metadados->>'origem_tabela'='empresas_contratos_sociais'
          AND da.metadados->>'origem_id'=ecs.id::text
      );
  END IF;
END $$;

-- Migração contratos gerados -> documentos_arquivos como entidade contrato.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contratos_gerados') THEN
    INSERT INTO public.documentos_arquivos (
      entidade_tipo, entidade_id, empresa_id, cliente_pf_id, lead_id, contrato_id, tipo_documento, nome_original,
      nome_arquivo, caminho_arquivo, url_arquivo, mime_type, tamanho_bytes, hash_arquivo, status, origem,
      criado_por, metadados, criado_em, atualizado_em
    )
    SELECT
      'contrato', cg.id, cg.empresa_id, cg.cliente_pf_id, cg.lead_id, cg.id,
      CASE WHEN cg.tipo_contrato = 'assessoria' THEN 'contrato_assessoria' ELSE 'contrato_gerado' END,
      coalesce('contrato-' || cg.id::text || '.pdf', 'contrato.pdf'),
      coalesce(split_part(cg.pdf_path, '/', array_length(string_to_array(cg.pdf_path, '/'), 1)), 'contrato-' || cg.id::text || '.pdf'),
      coalesce(cg.pdf_path, '/legado/contratos_gerados/' || cg.id::text || '.pdf'),
      CASE WHEN cg.pdf_path IS NOT NULL THEN '/uploads/contratos/' || split_part(cg.pdf_path, '/', array_length(string_to_array(cg.pdf_path, '/'), 1)) ELSE NULL END,
      'application/pdf',
      NULL,
      cg.hash_documento,
      'ativo',
      'gerado_sistema',
      cg.criado_por,
      jsonb_build_object('origem_tabela','contratos_gerados','origem_id',cg.id,'tipo_contrato',cg.tipo_contrato,'status_contrato',cg.status),
      coalesce(cg.created_at, NOW()),
      coalesce(cg.updated_at, cg.created_at, NOW())
    FROM public.contratos_gerados cg
    WHERE cg.pdf_path IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.documentos_arquivos da
        WHERE da.metadados->>'origem_tabela'='contratos_gerados'
          AND da.metadados->>'origem_id'=cg.id::text
      );
  END IF;
END $$;

INSERT INTO public.auditoria_documentos (documento_id, acao, antes, depois, usuario_id)
SELECT da.id, 'migracao_inicial', NULL, jsonb_build_object('id', da.id, 'entidade_tipo', da.entidade_tipo, 'entidade_id', da.entidade_id, 'origem', da.origem), NULL
FROM public.documentos_arquivos da
WHERE da.origem = 'migracao'
  AND NOT EXISTS (
    SELECT 1 FROM public.auditoria_documentos ad
    WHERE ad.documento_id = da.id AND ad.acao = 'migracao_inicial'
  );

COMMENT ON TABLE public.documentos_arquivos IS 'Armazenamento centralizado de arquivos por entidade cadastral, com vínculo principal obrigatório e referências auxiliares.';
COMMENT ON TABLE public.auditoria_documentos IS 'Auditoria de upload, edição, validação, exclusão lógica e migrações de documentos.';

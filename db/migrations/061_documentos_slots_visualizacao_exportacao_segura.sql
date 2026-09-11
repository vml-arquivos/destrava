-- 061_documentos_slots_visualizacao_exportacao_segura.sql
-- Garante a base mínima para anexar cada documento em seu local correto,
-- visualizar com JWT via blob e exportar documentos selecionados sem regressão.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS public.documentos_arquivos
  ADD COLUMN IF NOT EXISTS data_emissao_documento DATE,
  ADD COLUMN IF NOT EXISTS data_validade_documento DATE,
  ADD COLUMN IF NOT EXISTS validade_dias INTEGER,
  ADD COLUMN IF NOT EXISTS status_validade TEXT DEFAULT 'nao_verificado',
  ADD COLUMN IF NOT EXISTS exige_revisao_humana BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS nome_customizado TEXT,
  ADD COLUMN IF NOT EXISTS resultado_validacao JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_extracao_ia_id UUID,
  ADD COLUMN IF NOT EXISTS ultima_indexacao_rag_id UUID;

ALTER TABLE IF EXISTS public.documentos_arquivos
  DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_chk;

ALTER TABLE IF EXISTS public.documentos_arquivos
  ADD CONSTRAINT documentos_arquivos_tipo_chk CHECK (tipo_documento IN (
    'contrato_prestacao_servicos','contrato_assessoria',
    'cartao_cnpj','qsa','atos_junta_comercial','contrato_social','alteracao_contratual',
    'documento_socio','rg','cpf','cnh','comprovante_residencia','comprovante_endereco',
    'imposto_renda','irpf','recibo_irpf','certidao_casamento','averbacao_divorcio','certidao_obito',
    'rating_bacen_cnpj','rating_bacen_cpf','cenprot_cnpj','cenprot_cpf',
    'cnd_rfb_cnpj','cnd_rfb_cpf','cadin_cnpj','cadin_cpf','pgfn_cnpj','pgfn_cpf',
    'simples_nacional','pgdas','pgmei','ecf','recibo_ecf','recibo_pgdas','recibo_pgmei',
    'defis','dasn_simei','recibo_defis','recibo_dasn_simei',
    'scr_cnpj','ccs_cnpj','ccf_cnpj','scr_cpf','ccs_cpf','ccf_cpf',
    'consulta_serasa_cnpj','consulta_serasa_cpf','compartilhamento_ecac',
    'foto_fachada','foto_interna_1','foto_interna_2','foto_interna_3',
    'faturamento_12_meses','comprovante_faturamento','declaracao_faturamento','extrato_bancario',
    'balanco','dre','certidao','procuracao','nire','estatuto','contrato_gerado','contrato_assinado','outros'
  ));

CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_entidade_tipo_doc
  ON public.documentos_arquivos(entidade_tipo, entidade_id, tipo_documento)
  WHERE excluido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_status_validade
  ON public.documentos_arquivos(status_validade)
  WHERE excluido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_data_emissao
  ON public.documentos_arquivos(data_emissao_documento)
  WHERE excluido_em IS NULL;

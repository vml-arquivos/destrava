-- 067_fix_documentos_check_constraint.sql
-- Recria a CHECK constraint documentos_arquivos_tipo_documento com lista completa e definitiva.
-- Idempotente: DROP IF EXISTS antes de recriar.

BEGIN;

ALTER TABLE public.documentos_arquivos
  DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_documento_check;

ALTER TABLE public.documentos_arquivos
  DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_chk;

ALTER TABLE public.documentos_arquivos
  ADD CONSTRAINT documentos_arquivos_tipo_chk CHECK (tipo_documento IN (
    -- Contratos
    'contrato_prestacao_servicos','contrato_assessoria','contrato_social','alteracao_contratual',
    'contrato_gerado','contrato_assinado',
    -- Empresa
    'cartao_cnpj','qsa','atos_junta_comercial','nire','estatuto','procuracao',
    -- Sócios / Pessoal
    'documento_socio','rg','cpf','cnh','comprovante_residencia','comprovante_endereco',
    'imposto_renda','irpf','recibo_irpf',
    'certidao_casamento','averbacao_divorcio','certidao_obito',
    -- Certidões CNPJ
    'rating_bacen_cnpj','cenprot_cnpj','cnd_rfb_cnpj','cadin_cnpj','pgfn_cnpj',
    'scr_cnpj','ccs_cnpj','ccf_cnpj','consulta_serasa_cnpj','ccf_cnpj',
    -- Certidões CPF
    'rating_bacen_cpf','cenprot_cpf','cnd_rfb_cpf','cadin_cpf','pgfn_cpf',
    'scr_cpf','ccs_cpf','ccf_cpf','consulta_serasa_cpf',
    -- Fiscal / Tributário
    'simples_nacional','pgdas','pgmei','ecf',
    'recibo_ecf','recibo_pgdas','recibo_pgmei',
    'defis','dasn_simei','recibo_defis','recibo_dasn_simei',
    -- Financeiro
    'faturamento_12_meses','comprovante_faturamento','declaracao_faturamento',
    'extrato_bancario','balanco','dre','certidao',
    -- eCAC / Fotos
    'compartilhamento_ecac',
    'foto_fachada','foto_interna_1','foto_interna_2','foto_interna_3',
    -- Outros
    'outros'
  ));

COMMIT;

-- 078_documentos_enquadramento_situacao_fiscal.sql
-- Adiciona 'enquadramento_tributario_cnpj', 'enquadramento_tributario_cpf',
-- 'situacao_fiscal_cnpj' e 'situacao_fiscal_cpf' à CHECK constraint de
-- documentos_arquivos.tipo_documento.
--
-- Causa raiz: o checklist do Acervo Documental (client/src/components/documentos/
-- DocumentosEntidade.tsx) já tinha esses 4 campos, mas a constraint
-- documentos_arquivos_tipo_chk (recriada pela migration 067 e também no boot do
-- server/index.ts) nunca foi atualizada. Qualquer upload nesses campos falhava
-- com "new row for relation documentos_arquivos violates check constraint
-- documentos_arquivos_tipo_chk". Reproduzido com teste real em Postgres antes
-- de corrigir (INSERT com tipo_documento='enquadramento_tributario_cnpj' falhava
-- antes desta migration e passa depois, sem afetar nenhum valor já aceito).
--
-- Idempotente: DROP IF EXISTS antes de recriar. Não remove nenhum valor
-- existente -- só adiciona os 4 novos, preservando 100% de compatibilidade
-- com documentos já anexados.

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
    'enquadramento_tributario_cnpj','situacao_fiscal_cnpj',
    'scr_cnpj','ccs_cnpj','ccf_cnpj','consulta_serasa_cnpj',
    -- Certidões CPF
    'rating_bacen_cpf','cenprot_cpf','cnd_rfb_cpf','cadin_cpf','pgfn_cpf',
    'enquadramento_tributario_cpf','situacao_fiscal_cpf',
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

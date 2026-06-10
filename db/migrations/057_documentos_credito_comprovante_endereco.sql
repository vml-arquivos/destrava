-- 057_documentos_credito_comprovante_endereco.sql
-- Adiciona tipo documental de comprovante de endereço empresarial para arquivos usados em análise de crédito.
-- Mantém contrato_assessoria permitido no banco por compatibilidade histórica, mas o frontend de Arquivos de Crédito não oferece esse tipo.

ALTER TABLE public.documentos_arquivos
  DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_chk;

ALTER TABLE public.documentos_arquivos
  ADD CONSTRAINT documentos_arquivos_tipo_chk CHECK (tipo_documento IN (
    'contrato_social','alteracao_contratual','documento_socio','rg','cpf','cnh','comprovante_residencia',
    'comprovante_endereco','comprovante_faturamento','extrato_bancario','imposto_renda','balanco','dre','certidao','procuracao',
    'contrato_assessoria','declaracao_faturamento','cartao_cnpj','nire','estatuto','contrato_gerado',
    'contrato_assinado','outros'
  ));

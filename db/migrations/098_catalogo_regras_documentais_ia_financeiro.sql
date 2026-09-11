-- Migration 098 — catálogo documental, regras versionadas, IA auditável e prontidão financeira.
-- Idempotente e aditiva. Não apaga documentos, análises, tabelas ou dados legados.

CREATE TABLE IF NOT EXISTS public.documentos_catalogo (
  tipo_documento TEXT PRIMARY KEY,
  nome_amigavel TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'outros',
  escopo TEXT NOT NULL DEFAULT 'empresa',
  uploadavel BOOLEAN NOT NULL DEFAULT TRUE,
  tipo_canonico TEXT NULL,
  fonte_automatica TEXT NULL,
  analise TEXT NULL,
  prompt_codigo TEXT NULL,
  tipo_exigencia TEXT NOT NULL DEFAULT 'documento_complementar',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  catalogo_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.documentos_catalogo
  (tipo_documento, nome_amigavel, categoria, escopo, uploadavel, tipo_canonico, fonte_automatica, analise, prompt_codigo, tipo_exigencia)
VALUES
  ('cartao_cnpj','Cartão CNPJ','cadastral','empresa',true,null,null,'cartao_cnpj','cnpj_receita_cartao','obrigacao_legal'),
  ('cnpj_cartao','Cartão CNPJ (legado)','cadastral','empresa',true,'cartao_cnpj',null,'cartao_cnpj','cnpj_receita_cartao','obrigacao_legal'),
  ('qsa','QSA / Quadro societário','societario','empresa',true,null,null,'qsa','qsa_extract','obrigacao_legal'),
  ('atos_junta_comercial','Atos da Junta Comercial','societario','empresa',true,null,null,'atos_junta_comercial','atos_junta_extract','obrigacao_legal'),
  ('contrato_social','Contrato social','societario','empresa',true,null,null,'contrato_social','contrato_social_extract','obrigacao_legal'),
  ('alteracao_contratual','Alteração contratual','societario','empresa',true,null,null,'contrato_social','contrato_social_extract','obrigacao_legal'),
  ('contrato_prestacao_servicos','Contrato de prestação de serviços','contrato','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('contrato_assessoria','Contrato de assessoria','contrato','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('contrato_gerado','Contrato gerado pelo sistema','contrato','empresa',true,null,null,null,null,'documento_complementar'),
  ('contrato_assinado','Contrato assinado','contrato','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('nire','NIRE / registro empresarial','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('estatuto','Estatuto social','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('ata','Ata societária','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('procuracao','Procuração','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('registro_oab','Registro/ato da OAB','societario','empresa',true,null,null,null,null,'obrigacao_legal'),
  ('enquadramento_tributario_cnpj','Enquadramento tributário da empresa','fiscal','empresa',true,null,'receita_federal','simples_nacional','simples_extract','obrigacao_legal'),
  ('enquadramento_tributario_cpf','Enquadramento tributário do CPF','fiscal','socio',true,null,null,null,null,'documento_complementar'),
  ('situacao_fiscal_cnpj','Situação fiscal do CNPJ','regularidade','empresa',true,null,null,null,null,'documento_complementar'),
  ('situacao_fiscal_cpf','Situação fiscal do CPF','regularidade','socio',true,null,null,null,null,'documento_complementar'),
  ('documento_socio','Documento de identificação do sócio','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('rg','RG','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('cpf','CPF','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('cnh','CNH','socio','socio',true,null,null,null,null,'obrigacao_legal'),
  ('rg_socio','RG do sócio (legado)','socio','socio',true,'rg',null,null,null,'obrigacao_legal'),
  ('cpf_socio','CPF do sócio (legado)','socio','socio',true,'cpf',null,null,null,'obrigacao_legal'),
  ('cnh_socio','CNH do sócio (legado)','socio','socio',true,'cnh',null,null,null,'obrigacao_legal'),
  ('comprovante_residencia','Comprovante de residência','socio','socio',true,null,null,'comprovante_residencia','comprovante_residencia_extract','obrigacao_legal'),
  ('comprovante_endereco','Comprovante de endereço (legado)','socio','socio',true,'comprovante_residencia',null,'comprovante_residencia','comprovante_residencia_extract','obrigacao_legal'),
  ('comprovante_residencia_socio','Comprovante de residência do sócio (legado)','socio','socio',true,'comprovante_residencia',null,'comprovante_residencia','comprovante_residencia_extract','obrigacao_legal'),
  ('imposto_renda','Imposto de renda da pessoa física','socio','socio',true,null,null,'irpf','irpf_extract','documento_complementar'),
  ('irpf','IRPF','socio','socio',true,'imposto_renda',null,'irpf','irpf_extract','documento_complementar'),
  ('irpf_socio','IRPF do sócio (legado)','socio','socio',true,'imposto_renda',null,'irpf','irpf_extract','documento_complementar'),
  ('recibo_irpf','Recibo de entrega do IRPF','socio','socio',true,null,null,'irpf','irpf_extract','documento_complementar'),
  ('certidao_casamento','Certidão de casamento','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('certidao_nascimento','Certidão de nascimento','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('averbacao_divorcio','Averbação de divórcio','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('certidao_obito','Certidão de óbito','socio','socio',true,null,null,null,null,'documento_complementar'),
  ('cnd_rfb_cnpj','CND/CPEND Federal do CNPJ','regularidade','empresa',true,null,null,'cnd_cpend','cnd_cpend_extract','obrigacao_legal'),
  ('cnd_rfb_cpf','CND/CPEND Federal do CPF','regularidade','socio',true,null,null,'cnd_cpend','cnd_cpend_extract','obrigacao_legal'),
  ('cnd_cpend_federal','CND/CPEND Federal (nome explícito)','regularidade','empresa',true,'cnd_rfb_cnpj',null,'cnd_cpend','cnd_cpend_extract','obrigacao_legal'),
  ('cnd_receita_inss','CND Receita Federal/INSS (legado)','regularidade','empresa',true,'cnd_rfb_cnpj',null,null,null,'obrigacao_legal'),
  ('pgfn_cnpj','Regularidade PGFN / Dívida Ativa da União','regularidade','empresa',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('pgfn_cpf','Regularidade PGFN do CPF','regularidade','socio',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('cadin_cnpj','CADIN do CNPJ','regularidade','empresa',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('cadin_cpf','CADIN do CPF','regularidade','socio',true,null,null,'cnd_cpend','cnd_cpend_extract','politica_bancaria'),
  ('crf_fgts','Certificado de Regularidade do FGTS','regularidade','empresa',true,null,null,'crf_fgts','crf_fgts_extract','obrigacao_legal'),
  ('fgts','FGTS (legado)','regularidade','empresa',true,'crf_fgts',null,'crf_fgts','crf_fgts_extract','obrigacao_legal'),
  ('cndt','Certidão Negativa de Débitos Trabalhistas','regularidade','empresa',true,null,null,'cndt','cndt_extract','politica_bancaria'),
  ('cndt_trabalhista','CNDT Trabalhista (legado)','regularidade','empresa',true,'cndt',null,'cndt','cndt_extract','politica_bancaria'),
  ('certidao_trabalhista','Certidão trabalhista (legado)','regularidade','empresa',true,'cndt',null,'cndt','cndt_extract','politica_bancaria'),
  ('cnd_estadual','CND estadual','regularidade','empresa',true,null,null,'cnd_estadual','cnd_estadual_extract','politica_bancaria'),
  ('certidao_estadual','Certidão estadual (legado)','regularidade','empresa',true,'cnd_estadual',null,'cnd_estadual','cnd_estadual_extract','politica_bancaria'),
  ('cnd_municipal','CND municipal','regularidade','empresa',true,null,null,'cnd_municipal','cnd_municipal_extract','politica_bancaria'),
  ('certidao_municipal','Certidão municipal (legado)','regularidade','empresa',true,'cnd_municipal',null,'cnd_municipal','cnd_municipal_extract','politica_bancaria'),
  ('certidao','Certidão genérica','regularidade','empresa',true,null,null,null,null,'documento_complementar'),
  ('rating_bacen_cnpj','SCR/Rating BACEN do CNPJ','credito','empresa',true,null,null,'scr','scr_extract','boa_pratica_analise'),
  ('scr_cnpj','SCR do CNPJ','credito','empresa',true,'rating_bacen_cnpj',null,'scr','scr_extract','boa_pratica_analise'),
  ('relatorio_scr','Relatório SCR/Registrato','credito','empresa',true,'rating_bacen_cnpj',null,'scr','scr_extract','boa_pratica_analise'),
  ('rating_bacen_cpf','SCR/Rating BACEN do CPF','credito','socio',true,null,null,'scr','scr_extract','boa_pratica_analise'),
  ('scr_cpf','SCR do CPF','credito','socio',true,'rating_bacen_cpf',null,'scr','scr_extract','boa_pratica_analise'),
  ('ccs_cnpj','CCS do CNPJ','credito','empresa',true,null,null,'ccs','ccs_extract','boa_pratica_analise'),
  ('ccs_cpf','CCS do CPF','credito','socio',true,null,null,'ccs','ccs_extract','boa_pratica_analise'),
  ('ccf_cnpj','CCF do CNPJ','credito','empresa',true,null,null,'ccf','ccf_extract','boa_pratica_analise'),
  ('ccf_cpf','CCF do CPF','credito','socio',true,null,null,'ccf','ccf_extract','boa_pratica_analise'),
  ('cenprot_cnpj','CENPROT do CNPJ','credito','empresa',true,null,null,'cenprot','cenprot_extract','politica_bancaria'),
  ('cenprot_cpf','CENPROT do CPF','credito','socio',true,null,null,'cenprot','cenprot_extract','politica_bancaria'),
  ('consulta_serasa_cnpj','Consulta Serasa do CNPJ','credito','empresa',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('consulta_serasa_cpf','Consulta Serasa do CPF','credito','socio',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('score_serasa','Score Serasa (legado)','credito','empresa',true,'consulta_serasa_cnpj',null,'serasa','serasa_extract','politica_bancaria'),
  ('score_boavista','Score Boa Vista (legado)','credito','empresa',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('restricoes_cnpj','Restrições no CNPJ (legado)','credito','empresa',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('restricoes_cpf_socio','Restrições no CPF do sócio (legado)','credito','socio',true,null,null,'serasa','serasa_extract','politica_bancaria'),
  ('simples_nacional','Comprovação do Simples Nacional','fiscal','empresa',true,null,null,'simples_nacional','simples_extract','obrigacao_legal'),
  ('pgdas','PGDAS-D','fiscal','empresa',true,null,null,'pgdas','pgdas_extract','obrigacao_legal'),
  ('pgdas_d','PGDAS-D (nome explícito)','fiscal','empresa',true,'pgdas',null,'pgdas','pgdas_extract','obrigacao_legal'),
  ('recibo_pgdas','Recibo PGDAS-D','fiscal','empresa',true,'pgdas',null,'pgdas','pgdas_extract','documento_complementar'),
  ('pgmei','PGMEI','fiscal','empresa',true,null,null,'pgmei','pgmei_extract','obrigacao_legal'),
  ('recibo_pgmei','Recibo PGMEI','fiscal','empresa',true,'pgmei',null,'pgmei','pgmei_extract','documento_complementar'),
  ('das_mei','DAS-MEI','fiscal','empresa',true,null,null,'das_mei','das_mei_extract','obrigacao_legal'),
  ('ecf','ECF','fiscal','empresa',true,null,null,'ecf','ecf_extract','obrigacao_legal'),
  ('recibo_ecf','Recibo ECF','fiscal','empresa',true,'ecf',null,'ecf','ecf_extract','obrigacao_legal'),
  ('ecd','ECD','contabil','empresa',true,null,null,'ecd','ecd_extract','obrigacao_legal'),
  ('recibo_ecd','Recibo ECD','contabil','empresa',true,'ecd',null,'ecd','ecd_extract','obrigacao_legal'),
  ('defis','DEFIS','fiscal','empresa',true,null,null,'defis','defis_extract','obrigacao_legal'),
  ('recibo_defis','Recibo DEFIS','fiscal','empresa',true,'defis',null,'defis','defis_extract','obrigacao_legal'),
  ('dasn_simei','DASN-SIMEI','fiscal','empresa',true,null,null,'dasn_simei','dasn_simei_extract','obrigacao_legal'),
  ('recibo_dasn_simei','Recibo DASN-SIMEI','fiscal','empresa',true,'dasn_simei',null,'dasn_simei','dasn_simei_extract','obrigacao_legal'),
  ('ccmei','CCMEI','fiscal','empresa',true,null,null,'ccmei','ccmei_extract','obrigacao_legal'),
  ('irpj','IRPJ (legado)','fiscal','empresa',true,null,null,'irpj','irpj_extract','obrigacao_legal'),
  ('dctf','DCTF','fiscal','empresa',true,null,null,'dctf_mit','dctf_mit_extract','obrigacao_legal'),
  ('dctfweb','DCTFWeb','fiscal','empresa',true,null,null,'dctf_mit','dctf_mit_extract','obrigacao_legal'),
  ('mit','MIT','fiscal','empresa',true,null,null,'dctf_mit','dctf_mit_extract','obrigacao_legal'),
  ('darf','DARF','fiscal','empresa',true,null,null,'darf','darf_extract','obrigacao_legal'),
  ('efd_contribuicoes','EFD-Contribuições','fiscal','empresa',true,null,null,'efd','efd_extract','obrigacao_legal'),
  ('efd_icms_ipi','EFD ICMS/IPI','fiscal','empresa',true,null,null,'efd','efd_extract','obrigacao_legal'),
  ('esocial','eSocial','trabalhista','empresa',true,null,null,'esocial','esocial_extract','politica_bancaria'),
  ('efd_reinf','EFD-Reinf','trabalhista','empresa',true,null,null,'efd_reinf','efd_reinf_extract','politica_bancaria'),
  ('efd','EFD (legado)','fiscal','empresa',true,'efd_contribuicoes',null,'efd','efd_extract','obrigacao_legal'),
  ('livro_caixa','Livro Caixa','contabil','empresa',true,null,null,'livro_caixa','livro_caixa_extract','obrigacao_legal'),
  ('balanco','Balanço Patrimonial','contabil','empresa',true,null,null,'balanco','balanco_extract','boa_pratica_analise'),
  ('balanco_patrimonial','Balanço Patrimonial (legado)','contabil','empresa',true,'balanco',null,'balanco','balanco_extract','boa_pratica_analise'),
  ('dre','DRE','contabil','empresa',true,null,null,'dre','dre_extract','boa_pratica_analise'),
  ('dfc','DFC','contabil','empresa',true,null,null,'dfc','dfc_extract','boa_pratica_analise'),
  ('dmpl','DMPL','contabil','empresa',true,null,null,'dmpl','dmpl_extract','boa_pratica_analise'),
  ('notas_explicativas','Notas explicativas','contabil','empresa',true,null,null,'notas_explicativas','notas_explicativas_extract','boa_pratica_analise'),
  ('balancete','Balancete','contabil','empresa',true,null,null,'balancete','balancete_extract','boa_pratica_analise'),
  ('razao_contabil','Razão contábil','contabil','empresa',true,null,null,'razao_contabil','razao_contabil_extract','boa_pratica_analise'),
  ('faturamento_12_meses','Faturamento dos últimos 12 meses','financeiro','empresa',true,null,null,'faturamento_12_meses','faturamento_12m_extract','boa_pratica_analise'),
  ('comprovante_faturamento','Comprovante de faturamento (legado)','financeiro','empresa',true,'faturamento_12_meses',null,'faturamento_12_meses','faturamento_12m_extract','boa_pratica_analise'),
  ('declaracao_faturamento','Declaração de faturamento (legado)','financeiro','empresa',true,'faturamento_12_meses',null,'faturamento_12_meses','faturamento_12m_extract','boa_pratica_analise'),
  ('projecao_receitas','Projeção de receitas','financeiro','empresa',true,null,null,'projecao_receitas','projecao_receitas_extract','politica_bancaria'),
  ('demonstrativo_receitas_projetadas','Demonstrativo de receitas projetadas','financeiro','empresa',true,'projecao_receitas',null,'projecao_receitas','projecao_receitas_extract','politica_bancaria'),
  ('relatorio_receitas_mei','Relatório mensal de receitas do MEI','financeiro','empresa',true,null,null,'relatorio_receitas_mei','relatorio_receitas_mei_extract','boa_pratica_analise'),
  ('extrato_bancario','Extrato bancário','financeiro','empresa',true,null,null,'extrato_bancario','extrato_bancario_extract','boa_pratica_analise'),
  ('nf_e','NF-e','fiscal','empresa',true,null,null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('nfe','NF-e (legado)','fiscal','empresa',true,'nf_e',null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('nfs_e','NFS-e','fiscal','empresa',true,null,null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('nfse','NFS-e (legado)','fiscal','empresa',true,'nfs_e',null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('notas_fiscais','Notas fiscais','fiscal','empresa',true,'nf_e',null,'notas_fiscais','notas_fiscais_extract','boa_pratica_analise'),
  ('recebiveis','Recebíveis','financeiro','empresa',true,null,null,'recebiveis','recebiveis_extract','politica_bancaria'),
  ('contas_receber','Contas a receber','financeiro','empresa',true,null,null,'contas_receber','contas_receber_extract','boa_pratica_analise'),
  ('contas_pagar','Contas a pagar','financeiro','empresa',true,null,null,'contas_pagar','contas_pagar_extract','boa_pratica_analise'),
  ('estoque','Estoque','financeiro','empresa',true,null,null,'estoque','estoque_extract','boa_pratica_analise'),
  ('capital_giro','Memória de necessidade de capital de giro','financeiro','empresa',true,null,null,'capital_giro','capital_giro_extract','boa_pratica_analise'),
  ('garantia','Documento de garantia','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('documento_bem_garantia','Documento do bem em garantia (legado)','garantia','garantia',true,'garantia',null,'garantia','garantia_extract','garantia'),
  ('contrato_garantia','Contrato de garantia','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('alienacao_fiduciaria','Instrumento de alienação fiduciária','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('aval','Aval / garantidor','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('nota_promissoria','Nota promissória','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('patrimonio_garantia','Comprovação patrimonial para garantia','garantia','garantia',true,null,null,'garantia','garantia_extract','garantia'),
  ('compartilhamento_ecac','Compartilhamento eCAC','fiscal','empresa',true,null,null,null,null,'politica_bancaria'),
  ('foto_fachada','Foto da fachada','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('foto_interna_1','Foto interna 1','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('foto_interna_2','Foto interna 2','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('foto_interna_3','Foto interna 3','operacional','empresa',true,null,null,null,null,'documento_complementar'),
  ('outros','Outros documentos','outros','qualquer',true,null,null,null,null,'documento_complementar'),
  ('outro','Outro documento (legado)','outros','qualquer',true,'outros',null,null,null,'documento_complementar')
ON CONFLICT (tipo_documento) DO UPDATE SET
  nome_amigavel = EXCLUDED.nome_amigavel,
  categoria = EXCLUDED.categoria,
  escopo = EXCLUDED.escopo,
  uploadavel = EXCLUDED.uploadavel,
  tipo_canonico = EXCLUDED.tipo_canonico,
  fonte_automatica = EXCLUDED.fonte_automatica,
  analise = EXCLUDED.analise,
  prompt_codigo = EXCLUDED.prompt_codigo,
  tipo_exigencia = EXCLUDED.tipo_exigencia,
  ativo = TRUE,
  catalogo_versao = '2026.08.29',
  atualizado_em = NOW();

CREATE INDEX IF NOT EXISTS idx_documentos_catalogo_categoria ON public.documentos_catalogo (categoria, ativo);
CREATE INDEX IF NOT EXISTS idx_documentos_catalogo_canonico ON public.documentos_catalogo (tipo_canonico);

ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS tipo_exigencia TEXT NOT NULL DEFAULT 'documento_complementar';
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS regra_validacao JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS regra_cruzamento JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS bloqueia_etapa INTEGER NULL;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS vigencia_inicio DATE NULL;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS vigencia_fim DATE NULL;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS versao TEXT NOT NULL DEFAULT '2026.08.29';
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE IF EXISTS public.documentos_regras_credito ADD COLUMN IF NOT EXISTS fonte TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_regras_credito_vigencia ON public.documentos_regras_credito (tipo_documento, ativo, vigencia_inicio, vigencia_fim);

INSERT INTO public.documentos_regras_credito
  (codigo, tipo_documento, nome_amigavel, entidade_tipo, escopo, obrigatorio, permite_multiplos, validade_dias, condicao, descricao, ordem, categoria, tipo_exigencia, regra_validacao, regra_cruzamento, bloqueia_etapa, versao, ativo, fonte)
VALUES
  ('098_empresa_faturamento_12m','faturamento_12_meses','Faturamento dos últimos 12 meses','empresa','empresa',false,true,null,'{"quando_anexado":true}'::jsonb,'Documento opcional universalmente; quando anexado, deve ser analisado.',250,'financeiro','boa_pratica_analise','{"meses":12,"ultimo_mes_fechado":true,"assinaturas_mesma_modalidade":true}'::jsonb,'{"empresa_cnpj":true,"administrador":true,"contador":true}'::jsonb,null,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_pgdas','pgdas','PGDAS-D','empresa','empresa',false,true,null,'{"regime":"simples_nacional"}'::jsonb,'Aplicável ao Simples Nacional, exceto MEI/SIMEI.',260,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_defis','defis','DEFIS','empresa','empresa',false,true,null,'{"regime":"simples_nacional","exceto":"mei"}'::jsonb,'Aplicável ao Simples Nacional que não seja MEI.',270,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_dasn_simei','dasn_simei','DASN-SIMEI','empresa','empresa',false,true,null,'{"regime":"mei"}'::jsonb,'Aplicável ao MEI/SIMEI.',280,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_ecf','ecf','ECF','empresa','empresa',false,true,null,'{"regime":["lucro_presumido","lucro_real","lucro_arbitrado"]}'::jsonb,'Aplicável aos regimes não optantes conforme obrigação e operação.',290,'fiscal','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"regime_tributario":true}'::jsonb,4,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_cndt','cndt','CNDT','empresa','empresa',false,false,null,'{"somente_se":"possui_empregados_ou_linha_exigir"}'::jsonb,'Certidão trabalhista condicional, não hard gate universal.',300,'regularidade','politica_bancaria','{"documento_compativel":true}'::jsonb,'{"empregados_ou_linha":true}'::jsonb,null,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_empresa_cnd_estadual','cnd_estadual','CND estadual','empresa','empresa',false,false,null,'{"somente_se":"possui_inscricao_estadual_ou_atividade_exigir"}'::jsonb,'Certidão estadual condicional à inscrição/atividade ou política da linha.',310,'regularidade','politica_bancaria','{"documento_compativel":true}'::jsonb,'{"inscricao_estadual_ou_atividade":true}'::jsonb,null,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_socio_documento_id','documento_socio','Documento de identificação do sócio','socio','socio',true,true,null,'{"depois_etapa":2}'::jsonb,'Documento pessoal aplicado por sócio somente depois da etapa societária.',320,'socio','obrigacao_legal','{"documento_compativel":true}'::jsonb,'{"socio_id":true}'::jsonb,3,'2.0.0',true,'matriz_estrategica_2026'),
  ('098_socio_comprovante_residencia','comprovante_residencia','Comprovante de residência do sócio','socio','socio',true,false,60,'{"depois_etapa":2}'::jsonb,'Validade máxima de dois meses; titular diferente exige justificativa.',330,'socio','obrigacao_legal','{"mes_referencia":true,"titular":true}'::jsonb,'{"socio_id":true,"nome":true}'::jsonb,3,'2.0.0',true,'matriz_estrategica_2026')
ON CONFLICT (codigo) DO UPDATE SET
  tipo_documento = EXCLUDED.tipo_documento,
  nome_amigavel = EXCLUDED.nome_amigavel,
  obrigatorio = EXCLUDED.obrigatorio,
  permite_multiplos = EXCLUDED.permite_multiplos,
  validade_dias = EXCLUDED.validade_dias,
  condicao = EXCLUDED.condicao,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  tipo_exigencia = EXCLUDED.tipo_exigencia,
  regra_validacao = EXCLUDED.regra_validacao,
  regra_cruzamento = EXCLUDED.regra_cruzamento,
  bloqueia_etapa = EXCLUDED.bloqueia_etapa,
  versao = EXCLUDED.versao,
  ativo = TRUE,
  fonte = EXCLUDED.fonte,
  atualizado_em = NOW();

INSERT INTO public.ia_prompts_documentais
  (bloco_id, codigo, versao, nome, descricao, prompt_sistema, prompt_usuario_template, schema_saida, ativo)
SELECT NULL,
       'catalogo_' || c.tipo_documento,
       '2.0.0',
       'Extrair ' || c.nome_amigavel,
       'Prompt versionado do catálogo documental 2026.08.29.',
       'Analise exclusivamente o documento enviado. Retorne JSON. Separe campos comprovados, evidências com página/trecho/confiança e campos inferidos. Nunca invente dados, não tome decisão final de crédito e peça revisão humana em divergências ou baixa confiança.',
       'Documento: {{tipo_documento}}. Empresa: {{empresa_id}}. Extraia somente fatos observáveis e retorne documento_compativel, campos_comprovados, campos_inferidos, evidencias, competencia, validade, pendencias, divergencias, confianca e revisao_humana_necessaria.',
       '{"type":"object","required":["documento_compativel","campos_comprovados","campos_inferidos","evidencias","revisao_humana_necessaria"]}'::jsonb,
       TRUE
FROM public.documentos_catalogo c
WHERE c.analise IS NOT NULL
ON CONFLICT (codigo, versao) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prompt_sistema = EXCLUDED.prompt_sistema,
  prompt_usuario_template = EXCLUDED.prompt_usuario_template,
  schema_saida = EXCLUDED.schema_saida,
  ativo = TRUE,
  atualizacao_em = NOW();

ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS arquivo_hash TEXT NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS regra_versao TEXT NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS evidencias JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS campos_inferidos JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS competencia_inicio DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS competencia_fim DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS validade_inicio DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS validade_fim DATE NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS paginas_analisadas INTEGER NULL;
ALTER TABLE IF EXISTS public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS fonte_extracao TEXT NULL;

CREATE TABLE IF NOT EXISTS public.documentos_regras_shadow_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NULL,
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  motor_legado JSONB NOT NULL DEFAULT '{}'::jsonb,
  motor_novo JSONB NOT NULL DEFAULT '{}'::jsonb,
  divergencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  modo TEXT NOT NULL DEFAULT 'shadow',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_regras_shadow_empresa ON public.documentos_regras_shadow_log (empresa_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.documentos_financeiros_indicadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  competencia_inicio DATE NULL,
  competencia_fim DATE NULL,
  fonte TEXT NOT NULL DEFAULT 'documentos',
  documentos_utilizados JSONB NOT NULL DEFAULT '[]'::jsonb,
  indicadores JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualidade TEXT NOT NULL DEFAULT 'insuficiente',
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_financeiros_empresa_competencia ON public.documentos_financeiros_indicadores (empresa_id, competencia_fim DESC);

CREATE TABLE IF NOT EXISTS public.documentos_rating_interno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  nota NUMERIC(5,2) NULL,
  classificacao TEXT NULL,
  pilares JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_rating_empresa ON public.documentos_rating_interno (empresa_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS public.documentos_elegibilidade_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  programa_codigo TEXT NOT NULL,
  elegivel BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pendente',
  requisitos JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  limitacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, programa_codigo)
);
CREATE INDEX IF NOT EXISTS idx_documentos_elegibilidade_empresa ON public.documentos_elegibilidade_credito (empresa_id, status);

CREATE TABLE IF NOT EXISTS public.planos_adequacao_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'media',
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  impacto TEXT NULL,
  acao TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'motor_documental',
  status TEXT NOT NULL DEFAULT 'aberto',
  prazo_sugerido DATE NULL,
  evidencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  regra_versao TEXT NOT NULL DEFAULT '2026.08.29',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planos_adequacao_empresa_status ON public.planos_adequacao_credito (empresa_id, status, prioridade);

-- O CHECK legado era uma lista fixa e ficava sempre defasado. A validação de rota
-- e o catálogo compartilhado são a fonte de verdade. Remover apenas o CHECK antigo
-- não exclui documentos; permite aliases legados e novos tipos durante rollout.
DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL THEN
    ALTER TABLE public.documentos_arquivos DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_documento_check;
    ALTER TABLE public.documentos_arquivos DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_chk;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.validar_tipo_documento_catalogo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_documento IS NULL OR length(trim(NEW.tipo_documento)) = 0 THEN
    RAISE EXCEPTION 'tipo_documento não pode ser vazio';
  END IF;
  -- Tipos ausentes são mantidos para compatibilidade de dados históricos; novos
  -- uploads são validados no backend contra documentos_catalogo.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.documentos_arquivos') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_documentos_arquivos_tipo_catalogo ON public.documentos_arquivos;
    CREATE TRIGGER trg_documentos_arquivos_tipo_catalogo
      BEFORE INSERT OR UPDATE OF tipo_documento ON public.documentos_arquivos
      FOR EACH ROW EXECUTE FUNCTION public.validar_tipo_documento_catalogo();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_098()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT tabela FROM (VALUES
    ('documentos_catalogo'), ('documentos_financeiros_indicadores'), ('documentos_elegibilidade_credito'), ('planos_adequacao_credito')
  ) AS t(tabela)
  LOOP
    IF to_regclass('public.' || rec.tabela) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_atualizado ON public.%I', rec.tabela, rec.tabela);
      EXECUTE format('CREATE TRIGGER trg_%s_atualizado BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_098()', rec.tabela, rec.tabela);
    END IF;
  END LOOP;
END $$;

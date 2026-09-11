-- 058_documentos_credito_ia_rag_checklist.sql
-- Expande o acervo documental para análise de crédito, Cartão CNPJ, regras documentais e base RAG auditável.
-- Idempotente: não apaga documentos existentes e preserva compatibilidade com uploads atuais.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.documentos_arquivos
  DROP CONSTRAINT IF EXISTS documentos_arquivos_tipo_chk;

ALTER TABLE public.documentos_arquivos
  ADD CONSTRAINT documentos_arquivos_tipo_chk CHECK (tipo_documento IN (
    'contrato_prestacao_servicos','contrato_assessoria','cartao_cnpj','qsa','atos_junta_comercial',
    'contrato_social','alteracao_contratual','documento_socio','rg','cpf','cnh','comprovante_residencia',
    'certidao_casamento','averbacao_divorcio','certidao_obito','imposto_renda','recibo_irpf',
    'rating_bacen_cnpj','rating_bacen_cpf','cenprot_cnpj','cenprot_cpf','cnd_rfb_cnpj','cnd_rfb_cpf',
    'cadin_cnpj','cadin_cpf','pgfn_cnpj','pgfn_cpf','simples_nacional','pgdas','pgmei','ecf',
    'recibo_ecf','recibo_pgdas','recibo_pgmei','defis','dasn_simei','recibo_defis','recibo_dasn_simei',
    'scr_cnpj','ccs_cnpj','ccf_cnpj','scr_cpf','ccs_cpf','ccf_cpf','consulta_serasa_cnpj','consulta_serasa_cpf',
    'compartilhamento_ecac','foto_fachada','foto_interna_1','foto_interna_2','foto_interna_3',
    'faturamento_12_meses','comprovante_endereco','comprovante_faturamento','declaracao_faturamento',
    'extrato_bancario','balanco','dre','certidao','procuracao','nire','estatuto',
    'contrato_gerado','contrato_assinado','outros'
  ));

ALTER TABLE public.documentos_arquivos
  DROP CONSTRAINT IF EXISTS documentos_arquivos_status_chk;

ALTER TABLE public.documentos_arquivos
  ADD CONSTRAINT documentos_arquivos_status_chk CHECK (status IN (
    'ativo','arquivado','substituido','excluido','pendente_validacao','validado','recusado','desatualizado'
  ));

ALTER TABLE public.documentos_arquivos
  ADD COLUMN IF NOT EXISTS data_emissao_documento DATE,
  ADD COLUMN IF NOT EXISTS data_validade_documento DATE,
  ADD COLUMN IF NOT EXISTS validade_dias INTEGER,
  ADD COLUMN IF NOT EXISTS status_validade TEXT DEFAULT 'nao_verificado',
  ADD COLUMN IF NOT EXISTS exige_revisao_humana BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS nome_customizado TEXT,
  ADD COLUMN IF NOT EXISTS resultado_validacao JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ultima_extracao_ia_id UUID NULL,
  ADD COLUMN IF NOT EXISTS ultima_indexacao_rag_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_status_validade ON public.documentos_arquivos(status_validade);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_data_emissao ON public.documentos_arquivos(data_emissao_documento);
CREATE INDEX IF NOT EXISTS idx_documentos_arquivos_nome_customizado ON public.documentos_arquivos(nome_customizado);

-- Regras documentais usadas pelo checklist e pelo relatório de crédito.
CREATE TABLE IF NOT EXISTS public.documentos_regras_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  tipo_documento TEXT NOT NULL,
  nome_amigavel TEXT NOT NULL,
  entidade_tipo TEXT NOT NULL DEFAULT 'empresa',
  escopo TEXT NOT NULL DEFAULT 'empresa',
  obrigatorio BOOLEAN NOT NULL DEFAULT true,
  permite_multiplos BOOLEAN NOT NULL DEFAULT false,
  validade_dias INTEGER NULL,
  condicao JSONB NOT NULL DEFAULT '{}'::jsonb,
  descricao TEXT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_regras_credito_entidade ON public.documentos_regras_credito(entidade_tipo, ativo, ordem);
CREATE INDEX IF NOT EXISTS idx_documentos_regras_credito_tipo ON public.documentos_regras_credito(tipo_documento);

-- Texto extraído preserva o conteúdo pesquisável sem substituir o arquivo original.
CREATE TABLE IF NOT EXISTS public.documentos_textos_extraidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.documentos_arquivos(id) ON DELETE CASCADE,
  empresa_id UUID NULL,
  socio_id UUID NULL,
  origem TEXT NOT NULL DEFAULT 'ia_ocr',
  status TEXT NOT NULL DEFAULT 'pendente',
  texto_extraido TEXT NULL,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  erro TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(documento_id, origem)
);
CREATE INDEX IF NOT EXISTS idx_documentos_textos_extraidos_doc ON public.documentos_textos_extraidos(documento_id);
CREATE INDEX IF NOT EXISTS idx_documentos_textos_extraidos_empresa ON public.documentos_textos_extraidos(empresa_id);

-- Chunks RAG: índice derivado para perguntas/relatórios. O arquivo original continua sendo a fonte oficial.
CREATE TABLE IF NOT EXISTS public.documentos_rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.documentos_arquivos(id) ON DELETE CASCADE,
  texto_extraido_id UUID NULL REFERENCES public.documentos_textos_extraidos(id) ON DELETE CASCADE,
  empresa_id UUID NULL,
  socio_id UUID NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  conteudo TEXT NOT NULL,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding_model TEXT NULL,
  embedding JSONB NULL,
  hash_chunk TEXT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(documento_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_documentos_rag_chunks_doc ON public.documentos_rag_chunks(documento_id);
CREATE INDEX IF NOT EXISTS idx_documentos_rag_chunks_empresa ON public.documentos_rag_chunks(empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentos_rag_chunks_hash ON public.documentos_rag_chunks(hash_chunk);

-- Campos extraídos por IA: especialmente Cartão CNPJ, QSA, certidões e consultas.
CREATE TABLE IF NOT EXISTS public.documentos_campos_extraidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES public.documentos_arquivos(id) ON DELETE CASCADE,
  empresa_id UUID NULL,
  socio_id UUID NULL,
  tipo_documento TEXT NOT NULL,
  campos_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  alertas JSONB NOT NULL DEFAULT '[]'::jsonb,
  divergencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  nivel_confianca NUMERIC(5,4) NULL,
  modelo_ia TEXT NULL,
  prompt_versao TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  revisao_humana_necessaria BOOLEAN NOT NULL DEFAULT false,
  revisado_por UUID NULL,
  revisado_em TIMESTAMPTZ NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documentos_campos_extraidos_doc ON public.documentos_campos_extraidos(documento_id);
CREATE INDEX IF NOT EXISTS idx_documentos_campos_extraidos_empresa_tipo ON public.documentos_campos_extraidos(empresa_id, tipo_documento);

-- Alertas persistentes para relatório e gestão: alterações de CNAE, endereço, situação, CNPJ vencido etc.
CREATE TABLE IF NOT EXISTS public.documentos_alertas_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  socio_id UUID NULL,
  documento_id UUID NULL REFERENCES public.documentos_arquivos(id) ON DELETE SET NULL,
  extracao_id UUID NULL REFERENCES public.documentos_campos_extraidos(id) ON DELETE SET NULL,
  tipo_alerta TEXT NOT NULL,
  severidade TEXT NOT NULL DEFAULT 'media',
  campo TEXT NULL,
  valor_anterior TEXT NULL,
  valor_atual TEXT NULL,
  mensagem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ NULL,
  resolvido_por UUID NULL
);
CREATE INDEX IF NOT EXISTS idx_documentos_alertas_ia_empresa_status ON public.documentos_alertas_ia(empresa_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_documentos_alertas_ia_documento ON public.documentos_alertas_ia(documento_id);

-- Credenciais sensíveis: estrutura preparada, mas só deve ser usada com APP_ENCRYPTION_KEY e criptografia no backend.
CREATE TABLE IF NOT EXISTS public.credenciais_sensiveis_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  socio_id UUID NULL,
  tipo TEXT NOT NULL,
  identificador TEXT NULL,
  segredo_criptografado TEXT NOT NULL,
  observacoes TEXT NULL,
  criado_por UUID NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credenciais_sensiveis_empresa ON public.credenciais_sensiveis_empresa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_credenciais_sensiveis_socio ON public.credenciais_sensiveis_empresa(socio_id);

CREATE OR REPLACE FUNCTION public.set_atualizado_em_generico()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documentos_regras_credito_atualizado ON public.documentos_regras_credito;
CREATE TRIGGER trg_documentos_regras_credito_atualizado BEFORE UPDATE ON public.documentos_regras_credito
FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em_generico();

DROP TRIGGER IF EXISTS trg_documentos_textos_extraidos_atualizado ON public.documentos_textos_extraidos;
CREATE TRIGGER trg_documentos_textos_extraidos_atualizado BEFORE UPDATE ON public.documentos_textos_extraidos
FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em_generico();

DROP TRIGGER IF EXISTS trg_documentos_rag_chunks_atualizado ON public.documentos_rag_chunks;
CREATE TRIGGER trg_documentos_rag_chunks_atualizado BEFORE UPDATE ON public.documentos_rag_chunks
FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em_generico();

DROP TRIGGER IF EXISTS trg_documentos_campos_extraidos_atualizado ON public.documentos_campos_extraidos;
CREATE TRIGGER trg_documentos_campos_extraidos_atualizado BEFORE UPDATE ON public.documentos_campos_extraidos
FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em_generico();

DROP TRIGGER IF EXISTS trg_credenciais_sensiveis_empresa_atualizado ON public.credenciais_sensiveis_empresa;
CREATE TRIGGER trg_credenciais_sensiveis_empresa_atualizado BEFORE UPDATE ON public.credenciais_sensiveis_empresa
FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em_generico();

-- Catálogo inicial das regras documentais.
INSERT INTO public.documentos_regras_credito (codigo, tipo_documento, nome_amigavel, entidade_tipo, escopo, obrigatorio, permite_multiplos, validade_dias, condicao, descricao, ordem)
VALUES
  ('empresa_contrato_prestacao_servicos', 'contrato_prestacao_servicos', 'Contrato de prestação de serviços', 'empresa', 'empresa', true, false, null, '{}'::jsonb, 'Contrato entre Destrava/assessoria e cliente.', 10),
  ('empresa_cartao_cnpj_30d', 'cartao_cnpj', 'Cartão CNPJ emitido há menos de 31 dias', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Documento oficial da Receita Federal. Deve ser atual.', 20),
  ('empresa_qsa', 'qsa', 'QSA / Quadro Societário', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Quadro de sócios e administradores.', 30),
  ('empresa_atos_junta', 'atos_junta_comercial', 'Atos da Junta Comercial', 'empresa', 'empresa', true, true, null, '{}'::jsonb, 'Atos arquivados na Junta Comercial.', 40),
  ('empresa_contrato_social', 'contrato_social', 'Contrato social e alterações', 'empresa', 'empresa', true, true, null, '{}'::jsonb, 'Contrato social vigente e alterações contratuais.', 50),
  ('empresa_rating_bacen', 'rating_bacen_cnpj', 'Consulta de Rating BACEN (CNPJ)', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Consulta de rating/relatório BACEN do CNPJ.', 60),
  ('empresa_cenprot', 'cenprot_cnpj', 'Consulta CENPROT (CNPJ)', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Consulta de protestos do CNPJ.', 70),
  ('empresa_cnd_rfb', 'cnd_rfb_cnpj', 'CND RFB (CNPJ)', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Certidão negativa/positiva com efeitos de negativa da Receita Federal.', 80),
  ('empresa_cadin_se_cnd_ausente', 'cadin_cnpj', 'Nada consta CADIN (CNPJ)', 'empresa', 'empresa', false, false, 30, '{"quando":"cnd_rfb_cnpj_ausente"}'::jsonb, 'Exigido se a CND RFB CNPJ não for disponibilizada.', 90),
  ('empresa_pgfn_se_cnd_ausente', 'pgfn_cnpj', 'Nada consta PGFN (CNPJ)', 'empresa', 'empresa', false, false, 30, '{"quando":"cnd_rfb_cnpj_ausente"}'::jsonb, 'Exigido se a CND RFB CNPJ não for disponibilizada.', 100),
  ('empresa_simples_nacional', 'simples_nacional', 'Consulta de optante pelo Simples Nacional', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Comprovação do regime/opção tributária.', 110),
  ('empresa_pgdas', 'pgdas', 'PGDAS', 'empresa', 'empresa', false, true, null, '{"regime":"simples_nacional"}'::jsonb, 'Obrigatório para optantes pelo Simples Nacional quando aplicável.', 120),
  ('empresa_pgmei', 'pgmei', 'PGMEI', 'empresa', 'empresa', false, true, null, '{"regime":"mei"}'::jsonb, 'Obrigatório para MEI quando aplicável.', 130),
  ('empresa_ecf', 'ecf', 'ECF', 'empresa', 'empresa', false, true, null, '{"regime":["lucro_presumido","lucro_real","lucro_arbitrado"]}'::jsonb, 'Obrigatória para Lucro Presumido, Real ou Arbitrado.', 140),
  ('empresa_defis', 'defis', 'DEFIS', 'empresa', 'empresa', false, true, null, '{"regime":"simples_nacional","exceto":"mei"}'::jsonb, 'Obrigatória para optantes do Simples que não sejam MEI.', 150),
  ('empresa_dasn_simei', 'dasn_simei', 'DASN-SIMEI', 'empresa', 'empresa', false, true, null, '{"regime":"mei"}'::jsonb, 'Obrigatória para MEI.', 160),
  ('empresa_scr', 'scr_cnpj', 'Relatório SCR do CNPJ', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Relatório SCR da empresa.', 170),
  ('empresa_ccs', 'ccs_cnpj', 'Relatório CCS do CNPJ', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Relatório CCS da empresa.', 180),
  ('empresa_ccf', 'ccf_cnpj', 'Relatório CCF do CNPJ', 'empresa', 'empresa', true, false, 30, '{}'::jsonb, 'Relatório CCF da empresa.', 190),
  ('empresa_ecac', 'compartilhamento_ecac', 'Compartilhamento eCAC por banco', 'empresa', 'empresa', false, true, null, '{}'::jsonb, 'Compartilhamento eCAC discriminado por banco destinatário.', 200),
  ('empresa_foto_fachada', 'foto_fachada', 'Foto da fachada', 'empresa', 'empresa', false, false, null, '{}'::jsonb, 'Foto da fachada da empresa.', 210),
  ('empresa_foto_interna_1', 'foto_interna_1', 'Foto interna 1', 'empresa', 'empresa', false, false, null, '{}'::jsonb, 'Foto interna da empresa.', 220),
  ('empresa_foto_interna_2', 'foto_interna_2', 'Foto interna 2', 'empresa', 'empresa', false, false, null, '{}'::jsonb, 'Foto interna da empresa.', 230),
  ('empresa_foto_interna_3', 'foto_interna_3', 'Foto interna 3', 'empresa', 'empresa', false, false, null, '{}'::jsonb, 'Foto interna da empresa.', 240),
  ('empresa_faturamento_12m', 'faturamento_12_meses', 'Faturamento bruto dos últimos 12 meses', 'empresa', 'empresa', true, true, null, '{}'::jsonb, 'Faturamento bruto da empresa dos últimos 12 meses ou período solicitado.', 250),
  ('socio_documento_id', 'documento_socio', 'Documento de identificação do sócio', 'socio', 'socio', true, true, null, '{}'::jsonb, 'CNH ou RG do sócio.', 300),
  ('socio_comprovante_residencia', 'comprovante_residencia', 'Comprovante de endereço do sócio', 'socio', 'socio', true, false, 90, '{}'::jsonb, 'Comprovante de residência do sócio.', 310),
  ('socio_irpf', 'imposto_renda', 'IRPF do sócio', 'socio', 'socio', true, true, null, '{}'::jsonb, 'Declaração de IRPF do sócio.', 320),
  ('socio_recibo_irpf', 'recibo_irpf', 'Recibo de entrega do IRPF do sócio', 'socio', 'socio', true, true, null, '{}'::jsonb, 'Recibo de entrega do IRPF do sócio.', 330),
  ('socio_cnd_rfb', 'cnd_rfb_cpf', 'CND RFB (CPF)', 'socio', 'socio', true, false, 30, '{}'::jsonb, 'CND RFB de cada sócio.', 340),
  ('socio_cadin_se_cnd_ausente', 'cadin_cpf', 'Nada consta CADIN (CPF)', 'socio', 'socio', false, false, 30, '{"quando":"cnd_rfb_cpf_ausente"}'::jsonb, 'Exigido se a CND RFB CPF não for disponibilizada.', 350),
  ('socio_pgfn_se_cnd_ausente', 'pgfn_cpf', 'Nada consta PGFN (CPF)', 'socio', 'socio', false, false, 30, '{"quando":"cnd_rfb_cpf_ausente"}'::jsonb, 'Exigido se a CND RFB CPF não for disponibilizada.', 360),
  ('socio_rating_bacen', 'rating_bacen_cpf', 'Consulta de Rating BACEN (CPF)', 'socio', 'socio', true, false, 30, '{}'::jsonb, 'Consulta de rating/relatório BACEN do CPF.', 370),
  ('socio_cenprot', 'cenprot_cpf', 'Consulta CENPROT (CPF)', 'socio', 'socio', true, false, 30, '{}'::jsonb, 'Consulta de protestos do CPF.', 380),
  ('socio_scr', 'scr_cpf', 'Relatório SCR do CPF', 'socio', 'socio', true, false, 30, '{}'::jsonb, 'Relatório SCR de todos os sócios.', 390),
  ('socio_ccs', 'ccs_cpf', 'Relatório CCS do CPF', 'socio', 'socio', true, false, 30, '{}'::jsonb, 'Relatório CCS de todos os sócios.', 400),
  ('socio_ccf', 'ccf_cpf', 'Relatório CCF do CPF', 'socio', 'socio', true, false, 30, '{}'::jsonb, 'Relatório CCF de todos os sócios.', 410),
  ('socio_conjuge_certidao', 'certidao_casamento', 'Certidão de casamento/divórcio/óbito', 'socio', 'socio', false, true, null, '{"quando":"houver_conjuge"}'::jsonb, 'Documento civil exigido quando houver cônjuge.', 420),
  ('socio_conjuge_serasa', 'consulta_serasa_cpf', 'Consulta Serasa do cônjuge', 'socio', 'conjuge', false, true, 30, '{"quando":"houver_conjuge"}'::jsonb, 'Consulta Serasa exigida em caso de cônjuge.', 430)
ON CONFLICT (codigo) DO UPDATE SET
  tipo_documento = EXCLUDED.tipo_documento,
  nome_amigavel = EXCLUDED.nome_amigavel,
  entidade_tipo = EXCLUDED.entidade_tipo,
  escopo = EXCLUDED.escopo,
  obrigatorio = EXCLUDED.obrigatorio,
  permite_multiplos = EXCLUDED.permite_multiplos,
  validade_dias = EXCLUDED.validade_dias,
  condicao = EXCLUDED.condicao,
  descricao = EXCLUDED.descricao,
  ordem = EXCLUDED.ordem,
  ativo = true,
  atualizado_em = NOW();

-- Prompt específico do Cartão CNPJ para futura extração IA estruturada.
INSERT INTO public.ia_prompts_documentais (codigo, versao, nome, descricao, prompt_sistema, prompt_usuario_template, schema_saida)
VALUES (
  'extrair_cartao_cnpj_receita',
  '1.0.0',
  'Extrair Cartão CNPJ da Receita Federal',
  'Extrai e valida Cartão CNPJ para relatório de crédito empresarial.',
  'Você é um extrator documental de crédito empresarial. Leia somente o documento fornecido. Retorne JSON válido. Não invente campos. Se um campo não existir no documento, retorne null e adicione pendência.',
  'Extraia do Cartão CNPJ: cnpj, matriz_filial, data_abertura, tempo_abertura_meses, alerta_menos_12_meses, nome_empresarial, nome_fantasia, cnae_principal_codigo, cnae_principal_descricao, natureza_juridica_codigo, natureza_juridica_descricao, porte, endereco completo, situacao_cadastral e data_emissao. Valide se a emissão tem menos de 31 dias. Compare com o cadastro/histórico quando houver contexto. Gere alertas se nome empresarial, CNAE, endereço ou situação cadastral divergirem.',
  '{"type":"object","required":["tipo_documento","campos_extraidos","alertas","divergencias","nivel_confianca","revisao_humana_necessaria"],"properties":{"tipo_documento":{"const":"cartao_cnpj"},"campos_extraidos":{"type":"object"},"alertas":{"type":"array"},"divergencias":{"type":"array"},"nivel_confianca":{"type":"number"},"revisao_humana_necessaria":{"type":"boolean"}}}'::jsonb
)
ON CONFLICT (codigo, versao) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prompt_sistema = EXCLUDED.prompt_sistema,
  prompt_usuario_template = EXCLUDED.prompt_usuario_template,
  schema_saida = EXCLUDED.schema_saida,
  ativo = true;

-- 056_dossie_documental_credito_blocos_ia.sql
-- Camada de Dossiê Documental de Crédito Empresarial.
-- Não altera documentos_arquivos, empresas, socios_empresa, faturamento ou contratos existentes.
-- Cria blocos estruturados acima da base central de documentos para CNPJ, QSA e demais análises.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.documentacao_blocos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome_amigavel TEXT NOT NULL,
  descricao TEXT NULL,
  entidade_principal TEXT NOT NULL DEFAULT 'empresa',
  obrigatorio BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  configuracao JSONB NOT NULL DEFAULT '{}'::jsonb,
  criacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentacao_blocos_entidade_principal_chk CHECK (
    entidade_principal IN ('empresa','socio','cliente_pf','contrato','simulacao','lead','outros')
  )
);

CREATE TABLE IF NOT EXISTS public.documentacao_entidade_blocos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco_id UUID NOT NULL REFERENCES public.documentacao_blocos(id) ON DELETE RESTRICT,
  entidade_tipo TEXT NOT NULL,
  entidade_id UUID NOT NULL,
  empresa_id UUID NULL,
  cliente_pf_id UUID NULL,
  socio_id UUID NULL,
  contrato_id UUID NULL,
  simulacao_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  completo BOOLEAN NOT NULL DEFAULT false,
  validado BOOLEAN NOT NULL DEFAULT false,
  validado_por UUID NULL,
  validado_em TIMESTAMPTZ NULL,
  dados_estruturados JSONB NOT NULL DEFAULT '{}'::jsonb,
  pendencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  resultado_ia_id UUID NULL,
  origem TEXT NOT NULL DEFAULT 'sistema',
  atualizado_por UUID NULL,
  criacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentacao_entidade_blocos_entidade_tipo_chk CHECK (
    entidade_tipo IN ('empresa','socio','cliente_pf','contrato','simulacao','lead','outros')
  ),
  CONSTRAINT documentacao_entidade_blocos_status_chk CHECK (
    status IN ('nao_iniciado','pendente','em_preenchimento','em_validacao','validado','recusado','desatualizado','inconclusivo')
  ),
  CONSTRAINT documentacao_entidade_blocos_origem_chk CHECK (
    origem IN ('sistema','manual','receita','ia','migracao','sincronizacao')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_entidade_blocos_entidade_bloco
  ON public.documentacao_entidade_blocos (entidade_tipo, entidade_id, bloco_id);
CREATE INDEX IF NOT EXISTS idx_documentacao_entidade_blocos_empresa_id ON public.documentacao_entidade_blocos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentacao_entidade_blocos_socio_id ON public.documentacao_entidade_blocos (socio_id);
CREATE INDEX IF NOT EXISTS idx_documentacao_entidade_blocos_status ON public.documentacao_entidade_blocos (status);
CREATE INDEX IF NOT EXISTS idx_documentacao_entidade_blocos_dados_gin ON public.documentacao_entidade_blocos USING GIN (dados_estruturados);
CREATE INDEX IF NOT EXISTS idx_documentacao_entidade_blocos_pendencias_gin ON public.documentacao_entidade_blocos USING GIN (pendencias);

CREATE TABLE IF NOT EXISTS public.documentacao_bloco_arquivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_bloco_id UUID NOT NULL REFERENCES public.documentacao_entidade_blocos(id) ON DELETE CASCADE,
  arquivo_id UUID NOT NULL REFERENCES public.documentos_arquivos(id) ON DELETE RESTRICT,
  tipo_documento TEXT NULL,
  papel_documento TEXT NULL,
  principal BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ativo',
  observacoes TEXT NULL,
  criacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentacao_bloco_arquivos_status_chk CHECK (status IN ('ativo','pendente','validado','recusado','arquivado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_bloco_arquivos_bloco_arquivo
  ON public.documentacao_bloco_arquivos (entidade_bloco_id, arquivo_id);
CREATE INDEX IF NOT EXISTS idx_documentacao_bloco_arquivos_arquivo_id ON public.documentacao_bloco_arquivos (arquivo_id);
CREATE INDEX IF NOT EXISTS idx_documentacao_bloco_arquivos_tipo ON public.documentacao_bloco_arquivos (tipo_documento);

CREATE TABLE IF NOT EXISTS public.documentos_extracoes_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_id UUID NOT NULL REFERENCES public.documentos_arquivos(id) ON DELETE RESTRICT,
  entidade_bloco_id UUID NULL REFERENCES public.documentacao_entidade_blocos(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  modelo TEXT NULL,
  prompt_codigo TEXT NULL,
  prompt_versao TEXT NULL,
  texto_extraido TEXT NULL,
  campos_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  nivel_confianca NUMERIC(5,4) NULL,
  pendencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  erros JSONB NOT NULL DEFAULT '[]'::jsonb,
  processado_em TIMESTAMPTZ NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentos_extracoes_ia_status_chk CHECK (status IN ('pendente','processando','concluido','falhou','revisao_humana'))
);

CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_arquivo_id ON public.documentos_extracoes_ia (arquivo_id);
CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_bloco_id ON public.documentos_extracoes_ia (entidade_bloco_id);
CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_status ON public.documentos_extracoes_ia (status);

CREATE TABLE IF NOT EXISTS public.documentacao_analises_ia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo TEXT NOT NULL DEFAULT 'empresa',
  entidade_id UUID NOT NULL,
  empresa_id UUID NULL,
  simulacao_id UUID NULL,
  tipo_analise TEXT NOT NULL DEFAULT 'analise_documental_empresa',
  status TEXT NOT NULL DEFAULT 'em_analise',
  prompt_codigo TEXT NULL,
  prompt_versao TEXT NULL,
  versao_modelo TEXT NULL,
  entrada_contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  relatorio_texto TEXT NULL,
  score NUMERIC(6,2) NULL,
  nivel_confianca NUMERIC(5,4) NULL,
  risco_documental TEXT NULL,
  pendencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  comentarios_revisor TEXT NULL,
  revisado_por UUID NULL,
  revisado_em TIMESTAMPTZ NULL,
  criado_por UUID NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documentacao_analises_ia_status_chk CHECK (status IN ('aguardando','em_analise','concluido','revisao_pendente','falhou'))
);

CREATE INDEX IF NOT EXISTS idx_documentacao_analises_ia_entidade ON public.documentacao_analises_ia (entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_documentacao_analises_ia_empresa_id ON public.documentacao_analises_ia (empresa_id);
CREATE INDEX IF NOT EXISTS idx_documentacao_analises_ia_status ON public.documentacao_analises_ia (status);

CREATE TABLE IF NOT EXISTS public.ia_prompts_documentais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco_id UUID NULL REFERENCES public.documentacao_blocos(id) ON DELETE SET NULL,
  codigo TEXT NOT NULL,
  versao TEXT NOT NULL DEFAULT '1.0.0',
  nome TEXT NOT NULL,
  descricao TEXT NULL,
  prompt_sistema TEXT NOT NULL,
  prompt_usuario_template TEXT NOT NULL,
  schema_saida JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (codigo, versao)
);

CREATE INDEX IF NOT EXISTS idx_ia_prompts_documentais_codigo ON public.ia_prompts_documentais (codigo);
CREATE INDEX IF NOT EXISTS idx_ia_prompts_documentais_bloco_id ON public.ia_prompts_documentais (bloco_id);

CREATE TABLE IF NOT EXISTS public.auditoria_documentacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_bloco_id UUID NULL,
  analise_id UUID NULL,
  arquivo_id UUID NULL,
  acao TEXT NOT NULL,
  antes JSONB NULL,
  depois JSONB NULL,
  usuario_id UUID NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_documentacao_bloco_id ON public.auditoria_documentacao (entidade_bloco_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_documentacao_analise_id ON public.auditoria_documentacao (analise_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_documentacao_arquivo_id ON public.auditoria_documentacao (arquivo_id);

CREATE OR REPLACE FUNCTION public.atualizar_atualizacao_em_documentacao()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizacao_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documentacao_blocos_atualizacao_em ON public.documentacao_blocos;
CREATE TRIGGER trg_documentacao_blocos_atualizacao_em
BEFORE UPDATE ON public.documentacao_blocos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentacao_entidade_blocos_atualizacao_em ON public.documentacao_entidade_blocos;
CREATE TRIGGER trg_documentacao_entidade_blocos_atualizacao_em
BEFORE UPDATE ON public.documentacao_entidade_blocos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentacao_bloco_arquivos_atualizacao_em ON public.documentacao_bloco_arquivos;
CREATE TRIGGER trg_documentacao_bloco_arquivos_atualizacao_em
BEFORE UPDATE ON public.documentacao_bloco_arquivos
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentos_extracoes_ia_atualizacao_em ON public.documentos_extracoes_ia;
CREATE TRIGGER trg_documentos_extracoes_ia_atualizacao_em
BEFORE UPDATE ON public.documentos_extracoes_ia
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_documentacao_analises_ia_atualizacao_em ON public.documentacao_analises_ia;
CREATE TRIGGER trg_documentacao_analises_ia_atualizacao_em
BEFORE UPDATE ON public.documentacao_analises_ia
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

DROP TRIGGER IF EXISTS trg_ia_prompts_documentais_atualizacao_em ON public.ia_prompts_documentais;
CREATE TRIGGER trg_ia_prompts_documentais_atualizacao_em
BEFORE UPDATE ON public.ia_prompts_documentais
FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao();

INSERT INTO public.documentacao_blocos (codigo, nome_amigavel, descricao, entidade_principal, obrigatorio, ordem, configuracao)
VALUES
  ('cnpj_receita', 'CNPJ / Receita Federal', 'Dados oficiais e estruturados de CNPJ, situação cadastral, CNAE, capital social e sincronização da Receita.', 'empresa', true, 1, '{"prioridade":"imediata","fonte":"empresas,dados_extra_receita"}'::jsonb),
  ('qsa_quadro_societario', 'QSA / Quadro Societário', 'Quadro de sócios e administradores, origem Receita e cadastro operacional dos sócios.', 'empresa', true, 2, '{"prioridade":"imediata","fonte":"socios_empresa,empresas.socios_receita"}'::jsonb),
  ('contrato_social_alteracoes', 'Contrato Social e Alterações', 'Contrato social vigente, alterações, poderes de administração e assinatura.', 'empresa', true, 3, '{}'::jsonb),
  ('socios_representantes', 'Sócios, Administradores e Representantes', 'Documentação e dados pessoais/operacionais dos sócios e representantes.', 'socio', true, 4, '{}'::jsonb),
  ('endereco_contatos', 'Endereço, Contatos e Dados Operacionais', 'Endereços, telefones, e-mails, responsáveis e comprovantes.', 'empresa', false, 5, '{}'::jsonb),
  ('faturamento_historico', 'Faturamento Histórico', 'Histórico mensal de faturamento e documentos comprobatórios.', 'empresa', true, 6, '{}'::jsonb),
  ('previsao_faturamento', 'Previsão de Faturamento', 'Projeções e capacidade estimada de pagamento.', 'empresa', false, 7, '{}'::jsonb),
  ('demonstracoes_contabeis_fiscais', 'Demonstrações Contábeis e Fiscais', 'Balanço, DRE, balancete, ECD, ECF e documentos fiscais.', 'empresa', false, 8, '{}'::jsonb),
  ('extratos_movimentacao_bancaria', 'Extratos Bancários e Movimentação', 'Extratos e movimentação bancária para conciliação com faturamento.', 'empresa', false, 9, '{}'::jsonb),
  ('acompanhamento_bancario', 'Acompanhamento Bancário', 'Dados semanais de monitoramento bancário, rating e recomendações.', 'empresa', false, 10, '{}'::jsonb),
  ('acompanhamento_financeiro', 'Acompanhamento Financeiro', 'Pagamentos, parcelas, inadimplência, comissões e cobranças.', 'empresa', false, 11, '{}'::jsonb),
  ('certidoes_regularidade', 'Certidões e Regularidade', 'CNDs, FGTS, CNDT, protestos e consultas de restrição.', 'empresa', false, 12, '{}'::jsonb),
  ('scr_endividamento', 'SCR / Endividamento', 'Relatórios SCR/BACEN, dívidas, financiamentos, atrasos e instituições credoras.', 'empresa', false, 13, '{}'::jsonb),
  ('garantias', 'Garantias', 'Garantias vinculadas a empresa, contrato ou operação.', 'empresa', false, 14, '{}'::jsonb),
  ('contratos_gerados', 'Contratos Gerados', 'Contratos de assessoria e PDFs gerados/assinados.', 'empresa', false, 15, '{}'::jsonb),
  ('pendencias_documentais', 'Pendências Documentais', 'Consolidação de documentos faltantes, vencidos ou divergentes.', 'empresa', true, 16, '{}'::jsonb),
  ('analise_ia_credito', 'Parecer de Crédito', 'Parecer consolidado com revisão humana.', 'empresa', false, 17, '{}'::jsonb)
ON CONFLICT (codigo) DO UPDATE SET
  nome_amigavel = EXCLUDED.nome_amigavel,
  descricao = EXCLUDED.descricao,
  entidade_principal = EXCLUDED.entidade_principal,
  obrigatorio = EXCLUDED.obrigatorio,
  ordem = EXCLUDED.ordem,
  ativo = true,
  configuracao = public.documentacao_blocos.configuracao || EXCLUDED.configuracao;

INSERT INTO public.ia_prompts_documentais (bloco_id, codigo, versao, nome, descricao, prompt_sistema, prompt_usuario_template, schema_saida)
SELECT b.id, 'extrair_' || b.codigo, '1.0.0', 'Extrair ' || b.nome_amigavel,
       'Prompt inicial preparado para conferência do bloco ' || b.codigo,
       'Confira a documentação de crédito empresarial. Extraia somente informações comprovadas no bloco/documentos enviados. Nunca tome decisão final de crédito; apenas registre achados e pendências para revisão humana.',
       'Analise o bloco {{bloco_codigo}} da entidade {{entidade_tipo}}/{{entidade_id}}. Use os dados estruturados e documentos fornecidos. Retorne JSON válido com campos_extraidos, pendencias, inconsistencias, recomendacoes, nivel_confianca e revisao_humana_necessaria.',
       '{"type":"object","required":["campos_extraidos","pendencias","inconsistencias","nivel_confianca","revisao_humana_necessaria"]}'::jsonb
FROM public.documentacao_blocos b
WHERE b.codigo IN ('cnpj_receita','qsa_quadro_societario','contrato_social_alteracoes','socios_representantes','faturamento_historico','analise_ia_credito')
ON CONFLICT (codigo, versao) DO UPDATE SET
  bloco_id = EXCLUDED.bloco_id,
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prompt_sistema = EXCLUDED.prompt_sistema,
  prompt_usuario_template = EXCLUDED.prompt_usuario_template,
  schema_saida = EXCLUDED.schema_saida,
  ativo = true;

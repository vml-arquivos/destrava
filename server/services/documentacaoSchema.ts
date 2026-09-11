interface Queryable {
  query: (text: string, values?: any[]) => Promise<any>;
}

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

async function aplicarSchema(db: Queryable): Promise<void> {
  await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await db.query(`
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
      atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
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
      atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
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
      atualizacao_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
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
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
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
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
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
    )
  `);

  // Compatibilidade com instalações que receberam versões parciais da migration.
  const alteracoes = [
    `ALTER TABLE public.documentacao_entidade_blocos ADD COLUMN IF NOT EXISTS resultado_ia_id UUID NULL`,
    `ALTER TABLE public.documentacao_entidade_blocos ADD COLUMN IF NOT EXISTS atualizado_por UUID NULL`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS modelo TEXT NULL`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS texto_extraido TEXT NULL`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS campos_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS resultado JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS nivel_confianca NUMERIC(5,4) NULL`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS pendencias JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS erros JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS processado_em TIMESTAMPTZ NULL`,
    `ALTER TABLE public.documentos_extracoes_ia ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  ];
  for (const sql of alteracoes) await db.query(sql);

  // Corrige a causa do erro de recálculo em bancos com a constraint original:
  // o código antigo gravava "documento_ia", mas o schema aceitava apenas "ia".
  await db.query(`ALTER TABLE public.documentacao_entidade_blocos DROP CONSTRAINT IF EXISTS documentacao_entidade_blocos_origem_chk`);
  await db.query(`
    ALTER TABLE public.documentacao_entidade_blocos
    ADD CONSTRAINT documentacao_entidade_blocos_origem_chk
    CHECK (origem IN ('sistema','manual','receita','ia','documento_ia','migracao','sincronizacao'))
  `);

  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_entidade_blocos_entidade_bloco ON public.documentacao_entidade_blocos (entidade_tipo, entidade_id, bloco_id)`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_documentacao_bloco_arquivos_bloco_arquivo ON public.documentacao_bloco_arquivos (entidade_bloco_id, arquivo_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_documentacao_entidade_blocos_empresa_id ON public.documentacao_entidade_blocos (empresa_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_documentos_extracoes_ia_arquivo_prompt ON public.documentos_extracoes_ia (arquivo_id, prompt_codigo, atualizado_em DESC)`);

  await db.query(`
    CREATE OR REPLACE FUNCTION public.atualizar_atualizacao_em_documentacao()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.atualizacao_em = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await db.query(`
    CREATE OR REPLACE FUNCTION public.atualizar_atualizado_em_documentacao()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.atualizado_em = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Há dois padrões históricos no banco: as tabelas de blocos usam
  // "atualizacao_em" e as tabelas de resultados de IA usam "atualizado_em".
  // Um único trigger para ambos fazia o PostgreSQL lançar "record NEW has no
  // field atualizacao_em" ao iniciar a análise documental.
  const triggersAtualizacao: Array<[string, string]> = [
    ['trg_documentacao_blocos_atualizacao_em', 'documentacao_blocos'],
    ['trg_documentacao_entidade_blocos_atualizacao_em', 'documentacao_entidade_blocos'],
    ['trg_documentacao_bloco_arquivos_atualizacao_em', 'documentacao_bloco_arquivos'],
  ];
  for (const [trigger, table] of triggersAtualizacao) {
    await db.query(`DROP TRIGGER IF EXISTS ${trigger} ON public.${table}`);
    await db.query(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao()`);
  }

  const triggersAtualizado: Array<[string, string]> = [
    ['trg_documentos_extracoes_ia_atualizacao_em', 'documentos_extracoes_ia'],
    ['trg_documentacao_analises_ia_atualizacao_em', 'documentacao_analises_ia'],
  ];
  for (const [trigger, table] of triggersAtualizado) {
    await db.query(`DROP TRIGGER IF EXISTS ${trigger} ON public.${table}`);
    await db.query(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em_documentacao()`);
  }
}

export async function ensureDocumentacaoSchema(db: Queryable): Promise<void> {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = aplicarSchema(db)
      .then(() => { schemaReady = true; })
      .catch((error) => {
        schemaPromise = null;
        throw error;
      });
  }
  await schemaPromise;
}

BEGIN;

CREATE TABLE IF NOT EXISTS public.nexus_tarefas_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nexus_tarefa_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',
  prioridade TEXT,
  responsavel_nome TEXT,
  prazo TIMESTAMPTZ,
  progresso_feitos INTEGER NOT NULL DEFAULT 0,
  progresso_total INTEGER NOT NULL DEFAULT 0,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultima_observacao TEXT,
  ultima_evidencia JSONB,
  origem_url TEXT,
  criada_em TIMESTAMPTZ,
  atualizada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (empresa_id, nexus_tarefa_id)
);

CREATE TABLE IF NOT EXISTS public.nexus_tarefa_eventos_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nexus_tarefa_id TEXT NOT NULL,
  evento_key TEXT NOT NULL,
  evento TEXT NOT NULL,
  descricao TEXT NOT NULL,
  observacao TEXT,
  executor_nome TEXT,
  progresso_feitos INTEGER,
  progresso_total INTEGER,
  arquivo JSONB,
  checklist JSONB,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (empresa_id, evento_key)
);

CREATE INDEX IF NOT EXISTS idx_nexus_tarefas_empresa_status
  ON public.nexus_tarefas_empresa(empresa_id, status, atualizada_em DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_tarefa_eventos_empresa_tarefa
  ON public.nexus_tarefa_eventos_empresa(empresa_id, nexus_tarefa_id, ocorrido_em DESC);

COMMIT;

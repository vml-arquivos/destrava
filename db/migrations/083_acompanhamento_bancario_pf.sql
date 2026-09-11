-- 083_acompanhamento_bancario_pf.sql
-- Habilita o Acompanhamento Bancário também para Pessoa Física (clientes_pf),
-- além de empresa (PJ). Aplicada automaticamente no boot do servidor (ver
-- "Migration 083" em server/index.ts) -- este arquivo é a referência/registro
-- histórico da alteração, no mesmo padrão dos demais arquivos numerados desta
-- pasta.
--
-- Não altera nenhuma coluna existente (empresa_id, lead_id, tipo_cliente
-- continuam exatamente como estavam) -- só adiciona o vínculo opcional com
-- clientes_pf, do mesmo jeito que empresa_id/lead_id já são nullable.

ALTER TABLE public.acompanhamentos_bancarios
  ADD COLUMN IF NOT EXISTS pessoa_fisica_id UUID REFERENCES public.clientes_pf(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acompanhamentos_bancarios_pessoa_fisica
  ON public.acompanhamentos_bancarios(pessoa_fisica_id);

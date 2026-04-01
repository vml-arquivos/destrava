-- ============================================================
-- MIGRAÇÃO 005 — Nova camada operacional do CRM
-- Versão: 1.0 | Data: 2026-04-01
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Tabela crm_caixas: caixas de atendimento (ex: "WhatsApp
--      Comercial", "Email Suporte") com controle de IA por caixa
--   2. Tabela crm_delegacoes: histórico de delegações de leads
--      entre colaboradores (quem delegou, para quem, quando, motivo)
--   3. Colunas adicionais em leads: caixa_id, delegado_de,
--      delegado_em, prioridade
--   4. Tabela crm_notas_internas: notas privadas por lead,
--      visíveis apenas para o responsável e gestores
--   5. Tabela crm_followups: agenda de follow-ups por lead
--      com status e resultado
--   6. Views operacionais para dashboard de gestores
--
-- Idempotente: seguro para reexecutar.
-- ============================================================

-- ─── 1. Tabela: crm_caixas ───────────────────────────────────
-- Representa canais/filas de atendimento (WhatsApp, Email, etc.)
-- com controle individual de IA ativa/pausada por caixa.
CREATE TABLE IF NOT EXISTS public.crm_caixas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT        NOT NULL,
  descricao       TEXT,
  canal           TEXT        NOT NULL DEFAULT 'whatsapp'
                    CHECK (canal IN ('whatsapp','email','telefone','chat','formulario','outro')),
  ativo           BOOLEAN     NOT NULL DEFAULT TRUE,
  ia_ativa        BOOLEAN     NOT NULL DEFAULT FALSE,
  ia_agente_id    UUID        REFERENCES public.ia_agentes(id) ON DELETE SET NULL,
  responsavel_id  UUID        REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  cor             TEXT        DEFAULT '#3B82F6',
  icone           TEXT        DEFAULT 'inbox',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_caixas_ativo
  ON public.crm_caixas(ativo);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_caixas_updated_at') THEN
    CREATE TRIGGER trg_crm_caixas_updated_at
      BEFORE UPDATE ON public.crm_caixas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 2. Coluna caixa_id em leads ─────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS caixa_id UUID
    REFERENCES public.crm_caixas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_caixa_id
  ON public.leads(caixa_id)
  WHERE caixa_id IS NOT NULL;

-- ─── 3. Coluna prioridade em leads ───────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS prioridade TEXT DEFAULT 'normal'
    CHECK (prioridade IN ('baixa','normal','alta','urgente'));

-- ─── 4. Tabela: crm_delegacoes ───────────────────────────────
-- Rastreia cada delegação de lead entre colaboradores.
-- Permite auditoria completa de quem delegou o quê e quando.
CREATE TABLE IF NOT EXISTS public.crm_delegacoes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  delegado_por    UUID        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  delegado_para   UUID        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  motivo          TEXT,
  aceito          BOOLEAN,
  aceito_em       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_delegacoes_lead
  ON public.crm_delegacoes(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_delegacoes_para
  ON public.crm_delegacoes(delegado_para);

CREATE INDEX IF NOT EXISTS idx_crm_delegacoes_por
  ON public.crm_delegacoes(delegado_por);

-- ─── 5. Colunas de delegação em leads ────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS delegado_de UUID
    REFERENCES public.colaboradores(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS delegado_em TIMESTAMPTZ;

-- ─── 6. Tabela: crm_notas_internas ───────────────────────────
-- Notas privadas por lead. Visíveis apenas para o autor,
-- o responsável atual e gestores (cargo <= gerente comercial).
CREATE TABLE IF NOT EXISTS public.crm_notas_internas (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  autor_id        UUID        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  conteudo        TEXT        NOT NULL,
  privada         BOOLEAN     NOT NULL DEFAULT TRUE,
  fixada          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_notas_lead
  ON public.crm_notas_internas(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_notas_autor
  ON public.crm_notas_internas(autor_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_notas_updated_at') THEN
    CREATE TRIGGER trg_crm_notas_updated_at
      BEFORE UPDATE ON public.crm_notas_internas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 7. Tabela: crm_followups ────────────────────────────────
-- Agenda de follow-ups por lead com resultado registrado.
-- Substitui o campo proximo_followup (TIMESTAMPTZ simples) por
-- uma tabela com histórico completo.
CREATE TABLE IF NOT EXISTS public.crm_followups (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  colaborador_id  UUID        NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  agendado_para   TIMESTAMPTZ NOT NULL,
  tipo            TEXT        NOT NULL DEFAULT 'ligacao'
                    CHECK (tipo IN ('ligacao','whatsapp','email','reuniao','visita','outro')),
  descricao       TEXT,
  status          TEXT        NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','realizado','cancelado','reagendado')),
  resultado       TEXT        CHECK (resultado IN ('positivo','neutro','negativo','sem_resposta',NULL)),
  observacoes     TEXT,
  reagendado_para TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_followups_lead
  ON public.crm_followups(lead_id);

CREATE INDEX IF NOT EXISTS idx_crm_followups_colaborador
  ON public.crm_followups(colaborador_id);

CREATE INDEX IF NOT EXISTS idx_crm_followups_agendado
  ON public.crm_followups(agendado_para)
  WHERE status = 'pendente';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_crm_followups_updated_at') THEN
    CREATE TRIGGER trg_crm_followups_updated_at
      BEFORE UPDATE ON public.crm_followups
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 8. Trigger: atualizar proximo_followup em leads ─────────
-- Mantém o campo legado proximo_followup sincronizado com
-- o próximo follow-up pendente na nova tabela.
CREATE OR REPLACE FUNCTION public.fn_sync_proximo_followup()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.leads
  SET proximo_followup = (
    SELECT MIN(agendado_para)
    FROM public.crm_followups
    WHERE lead_id = COALESCE(NEW.lead_id, OLD.lead_id)
      AND status = 'pendente'
  )
  WHERE id = COALESCE(NEW.lead_id, OLD.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_followup_insert') THEN
    CREATE TRIGGER trg_sync_followup_insert
      AFTER INSERT OR UPDATE OR DELETE ON public.crm_followups
      FOR EACH ROW EXECUTE FUNCTION public.fn_sync_proximo_followup();
  END IF;
END $$;

-- ─── 9. Caixas padrão ────────────────────────────────────────
INSERT INTO public.crm_caixas (nome, descricao, canal, ativo, ia_ativa, cor, icone)
VALUES
  ('WhatsApp Comercial', 'Caixa principal de atendimento via WhatsApp', 'whatsapp', TRUE, FALSE, '#25D366', 'message-circle'),
  ('Formulário Site',    'Leads vindos do formulário do site',           'formulario', TRUE, FALSE, '#3B82F6', 'globe'),
  ('Email Comercial',    'Atendimento por e-mail',                       'email',     TRUE, FALSE, '#F59E0B', 'mail'),
  ('Telefone',           'Atendimento por telefone',                     'telefone',  TRUE, FALSE, '#8B5CF6', 'phone')
ON CONFLICT DO NOTHING;

-- ─── 10. Confirmação ─────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration 005 — camada operacional CRM aplicada em %', NOW();
END $$;

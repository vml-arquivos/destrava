-- ============================================================
-- MIGRAÇÃO 013 — Perfis operacionais em colaboradores
-- Objetivo: adicionar uma camada compatível de perfil e flags de
-- visibilidade sem substituir a lógica legada baseada em cargo.
-- ============================================================

BEGIN;

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS perfil TEXT,
  ADD COLUMN IF NOT EXISTS pode_atender_leads BOOLEAN,
  ADD COLUMN IF NOT EXISTS pode_ver_todos_leads BOOLEAN;

UPDATE public.colaboradores
   SET perfil = CASE
     WHEN LOWER(COALESCE(cargo, '')) IN ('administrador', 'admin', 'diretor') THEN 'admin'
     WHEN LOWER(COALESCE(cargo, '')) IN ('gerente comercial', 'gerente', 'gestor') THEN 'gestor'
     WHEN LOWER(COALESCE(cargo, '')) IN ('analista de crédito', 'analista de credito', 'analista') THEN 'analista'
     ELSE 'agente'
   END
 WHERE perfil IS NULL
    OR perfil NOT IN ('admin', 'gestor', 'agente', 'analista');

UPDATE public.colaboradores
   SET pode_atender_leads = CASE
     WHEN LOWER(COALESCE(cargo, '')) IN ('captador externo', 'estagiário', 'estagiario') THEN FALSE
     ELSE TRUE
   END
 WHERE pode_atender_leads IS NULL;

UPDATE public.colaboradores
   SET pode_ver_todos_leads = CASE
     WHEN LOWER(COALESCE(perfil, '')) IN ('admin', 'gestor') THEN TRUE
     ELSE FALSE
   END
 WHERE pode_ver_todos_leads IS NULL;

ALTER TABLE public.colaboradores
  ALTER COLUMN perfil SET DEFAULT 'agente',
  ALTER COLUMN pode_atender_leads SET DEFAULT TRUE,
  ALTER COLUMN pode_ver_todos_leads SET DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'colaboradores_perfil_check'
  ) THEN
    ALTER TABLE public.colaboradores
      ADD CONSTRAINT colaboradores_perfil_check
      CHECK (perfil IN ('admin', 'gestor', 'agente', 'analista'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_colaboradores_perfil
  ON public.colaboradores(perfil);

CREATE INDEX IF NOT EXISTS idx_colaboradores_pode_ver_todos_leads
  ON public.colaboradores(pode_ver_todos_leads)
  WHERE pode_ver_todos_leads = TRUE;

COMMIT;

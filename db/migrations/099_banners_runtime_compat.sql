-- ============================================================================
-- Migration 099: compatibilidade do módulo de banners
--
-- O módulo server/models/bannerModel.ts já consome public.banners. Este objeto
-- não existia no banco de produção, gerando erro não bloqueante em cada carga
-- da landing. A mudança é aditiva, idempotente e não insere conteúdo padrão.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  image_url TEXT NOT NULL,
  link_url TEXT NULL,
  position TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  start_date TIMESTAMPTZ NULL,
  end_date TIMESTAMPTZ NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT banners_position_chk CHECK (
    position IN (
      'home_top',
      'home_middle',
      'home_bottom',
      'blog_sidebar',
      'blog_top',
      'credito_empresas_banner',
      'credito_pessoal_banner'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_banners_position_active_order
  ON public.banners (position, is_active, display_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_banners_schedule
  ON public.banners (start_date, end_date);

COMMENT ON TABLE public.banners IS
  'Conteúdo de banners do site; tabela criada de forma aditiva pela migration 099.';

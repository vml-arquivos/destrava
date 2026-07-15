-- Migração 001: Criar tabelas de blog posts e banners
-- Data: 2026-07-15

-- Tabela de posts do blog
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  author VARCHAR(100) DEFAULT 'Destrava Crédito',
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_published BOOLEAN DEFAULT false,
  read_time VARCHAR(20) DEFAULT '5 min',
  featured_image_url VARCHAR(500),
  seo_title VARCHAR(255),
  seo_description VARCHAR(160),
  seo_keywords VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de banners
CREATE TABLE IF NOT EXISTS banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image_url VARCHAR(500) NOT NULL,
  link_url VARCHAR(500),
  position VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(is_published);
CREATE INDEX IF NOT EXISTS idx_banners_position ON banners(position);
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(is_active);

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(process.cwd());
const migration = fs.readFileSync(
  path.join(root, 'db/migrations/099_banners_runtime_compat.sql'),
  'utf8',
);
const aggregate = fs.readFileSync(path.join(root, 'db/migrate.sql'), 'utf8');

describe('migration de compatibilidade do módulo de banners', () => {
  it('cria o schema consumido pelo modelo existente de forma aditiva e idempotente', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.banners');
    expect(migration).toContain('idx_banners_position_active_order');
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('mantém a mesma migration no aggregate realmente executado em produção', () => {
    expect(aggregate).toContain('Migration 099: compatibilidade do módulo de banners');
    expect(aggregate).toContain('CREATE TABLE IF NOT EXISTS public.banners');
  });
});

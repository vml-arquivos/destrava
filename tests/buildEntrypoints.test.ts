import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('pontos de entrada do build de produção', () => {
  it('gera exatamente os arquivos usados pelo Docker e pelo comando de backfill', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');

    expect(packageJson.scripts.build).toContain('--outfile=dist/index.js');
    expect(packageJson.scripts.build).toContain('--outfile=dist/backfill-laudos.js');
    expect(packageJson.scripts.start).toContain('node dist/index.js');
    expect(packageJson.scripts['backfill:laudos']).toBe('node dist/backfill-laudos.js');
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
  });
});

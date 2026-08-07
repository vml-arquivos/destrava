import { describe, expect, it } from 'vitest';
import { ensureDocumentacaoSchema } from '../server/services/documentacaoSchema';

describe('schema documental compatível', () => {
  it('usa trigger atualizado_em nas tabelas de resultados de IA', async () => {
    const comandos: string[] = [];
    const db = {
      async query(text: string) {
        comandos.push(String(text).replace(/\s+/g, ' ').trim());
        return { rows: [] };
      },
    };
    await ensureDocumentacaoSchema(db);
    const sql = comandos.join('\n');
    expect(sql).toContain('NEW.atualizado_em = NOW()');
    expect(sql).toContain('trg_documentos_extracoes_ia_atualizacao_em');
    expect(sql).toContain('EXECUTE FUNCTION public.atualizar_atualizado_em_documentacao()');
    expect(sql).toContain('trg_documentacao_entidade_blocos_atualizacao_em');
    expect(sql).toContain('EXECUTE FUNCTION public.atualizar_atualizacao_em_documentacao()');
  });
});

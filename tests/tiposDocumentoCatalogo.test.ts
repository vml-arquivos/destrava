import { describe, expect, it, vi } from 'vitest';

// Regra: POST /api/documentos/upload rejeita qualquer tipo_documento que não esteja
// na whitelist TIPOS_DOCUMENTO (server/routes/documentos.ts, checado em 3 pontos --
// linhas ~734, ~673 e ~860 -- com o erro "tipo_documento inválido"). Ao acrescentar
// novos campos no checklist do Acervo Documental (CRF do FGTS, CNDT, certidões
// estadual/municipal e demonstrativo/projeção de receitas -- pesquisa de mercado
// 2026-08-12, para fechar a documentação exigida por regime tributário já calculada
// em mapaDocumentalCreditoService), é obrigatório também adicioná-los aqui --
// senão o campo aparece na tela mas o upload sempre falha com "tipo_documento
// inválido". Este teste existe para nunca mais deixar essa lacuna passar despercebida.

vi.mock('pg', () => {
  class PoolMock {
    query = vi.fn().mockResolvedValue({ rows: [] });
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});
vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({
  analiseDocumentalService: { analisarFaturamento: vi.fn(), analisarComprovanteResidencia: vi.fn() },
}));

describe('TIPOS_DOCUMENTO -- catálogo de tipos aceitos no upload', () => {
  it('inclui os novos campos do checklist adicionados em 2026-08-12 (FGTS, CNDT, certidões estadual/municipal, projeção de receitas)', async () => {
    const { TIPOS_DOCUMENTO } = await import('../server/routes/documentos');
    for (const tipo of [
      'crf_fgts', 'fgts', 'cndt', 'certidao_trabalhista',
      'cnd_estadual', 'certidao_estadual', 'cnd_municipal', 'certidao_municipal',
      'projecao_receitas', 'demonstrativo_receitas_projetadas',
    ]) {
      expect(TIPOS_DOCUMENTO, `tipo_documento "${tipo}" precisa estar na whitelist para o upload não falhar`).toContain(tipo);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  MODULOS_RELATORIO_EMPRESA,
  gerarHtmlRelatorioModular,
  moduleIds,
  validateModularReport,
} from '../server/services/relatorioModularHtml';

function relatorioFixture(modo_relatorio: 'institucional' | 'interno' = 'institucional') {
  return {
    modo_relatorio,
    empresa: { id: 'empresa-1', razao_social: 'Empresa de teste', cnpj: '00000000000100', situacao_cadastral: 'ATIVA' },
    status_aptidao_documental: 'documentalmente apta',
    pendencias_detalhadas: [],
    modulos_relatorio: MODULOS_RELATORIO_EMPRESA.map((id, index) => ({
      id,
      ordem: index + 1,
      titulo: id,
      descricao: `Descrição de ${id}`,
      visibilidade: id === 'ficha_empresa' ? 'interna' : 'institucional',
      incluida: id !== 'ficha_empresa' || modo_relatorio === 'interno',
      itens: id === 'ficha_empresa' && modo_relatorio === 'institucional' ? [] : [{
        arquivo_id: `${id}-file`,
        nome: `${id} documento`,
        status_validacao: 'Confirmado',
        status_leitura: 'Concluída',
        arquivo_original: `${id}.pdf`,
        data_documento: '2026-01-01',
        data_anexacao: '2026-01-02',
        validade: '2027-01-01',
        resumo_leitura: 'Leitura confirmada',
        versao: '1.0.0',
      }],
      submodulos: id === 'consultas' ? [{ id: 'credito', titulo: 'Consultas de crédito', itens: [] }, { id: 'fiscal_cadastral', titulo: 'Consultas fiscais e cadastrais', itens: [] }] : [],
    })),
  };
}

describe('relatório documental modular', () => {
  it('mantém os sete módulos na ordem definida e gera índice/paginação', () => {
    const relatorio = relatorioFixture();
    const html = gerarHtmlRelatorioModular(relatorio);
    expect(moduleIds(relatorio)).toEqual([...MODULOS_RELATORIO_EMPRESA]);
    expect(html).toContain('Índice');
    expect(html).toContain('counter(page)');
    expect(html).toContain('Arquivo original');
    expect(html).toContain('Data do documento');
    expect(validateModularReport(relatorio)).toEqual({ ok: true, failures: [] });
  });

  it('omite assessoria no modo institucional e permite incluí-la no modo interno', () => {
    const institucional = relatorioFixture('institucional');
    const interno = relatorioFixture('interno');
    expect(validateModularReport(institucional).ok).toBe(true);
    expect(gerarHtmlRelatorioModular(institucional)).toContain('omitidos do relatório institucional');
    expect(gerarHtmlRelatorioModular(interno)).toContain('Modo: interno');
    expect(interno.modulos_relatorio.find((module) => module.id === 'ficha_empresa')?.incluida).toBe(true);
  });
});

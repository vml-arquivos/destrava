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
    modulos_relatorio: [
      ...MODULOS_RELATORIO_EMPRESA,
      ...(modo_relatorio === 'interno' ? ['ficha_empresa'] as const : []),
    ].map((id, index) => ({
      id,
      ordem: index + 1,
      titulo: id,
      descricao: `Descrição de ${id}`,
      visibilidade: id === 'ficha_empresa' ? 'interna' : 'institucional',
      incluida: id !== 'ficha_empresa' || modo_relatorio === 'interno',
      itens: id === 'pendencias' || (id === 'ficha_empresa' && modo_relatorio === 'institucional') ? [] : [{
        arquivo_id: `${id}-file`,
        nome: `${id} documento`,
        status_validacao: 'Confirmado',
        arquivo_original: `${id}.pdf`,
        data: '2026-01-01',
        validade: '2027-01-01',
        resultado: 'Leitura confirmada',
      }],
      campos: [],
      eventos: [],
      pendencias: [],
    })),
  };
}

describe('relatório documental modular', () => {
  it('mantém os seis grupos na ordem exigida e gera índice/paginação', () => {
    const relatorio = relatorioFixture();
    const html = gerarHtmlRelatorioModular(relatorio);
    expect(moduleIds(relatorio)).toEqual([...MODULOS_RELATORIO_EMPRESA]);
    expect(html).toContain('Checklist geral');
    expect(html).toContain('counter(page)');
    expect(html).toContain('Datas disponíveis');
    expect(html).not.toMatch(/quatro documentos|analise_inicial|Resumo de atualizações/i);
    expect(html).not.toMatch(/Tipo:|Categoria:|Subtipo:|Páginas\/unidades|Confiança:|Revisão humana:|Dados extraídos:/i);
    expect(validateModularReport(relatorio)).toEqual({ ok: true, failures: [] });
  });

  it('omite assessoria no institucional e permite incluí-la no modo interno', () => {
    const institucional = relatorioFixture('institucional');
    const interno = relatorioFixture('interno');
    expect(validateModularReport(institucional).ok).toBe(true);
    expect(gerarHtmlRelatorioModular(institucional)).not.toContain('ficha_empresa');
    expect(gerarHtmlRelatorioModular(interno)).toContain('ficha_empresa');
    expect(interno.modulos_relatorio.find((module) => module.id === 'ficha_empresa')?.incluida).toBe(true);
  });


  it('oculta identificadores pessoais no institucional e não adiciona rodapé que force página vazia', () => {
    const relatorio = relatorioFixture();
    relatorio.modulos_relatorio[3].itens = [{
      arquivo_id: 'socio-file', nome: 'Documento de identificação do sócio', modulo: 'documentacao_socios',
      status_validacao: 'Informativo', resultado: 'Documento — CPF: 26886925992 — RG: 1234567', arquivo_original: 'CNH-26886925992.pdf',
    }];
    const html = gerarHtmlRelatorioModular(relatorio);
    expect(html).toContain('CPF não exibido');
    expect(html).toContain('Identificador pessoal não exibido');
    expect(html).not.toContain('26886925992');
    expect(html).not.toContain('1234567');
    expect(html).not.toContain('Datas ausentes aparecem');
  });

  it('rejeita o mesmo arquivo funcional em mais de um módulo', () => {
    const relatorio = relatorioFixture();
    relatorio.modulos_relatorio[1].itens = [{ arquivo_id: 'same-file', nome: 'Cartão do CNPJ', status_validacao: 'Confirmado' }];
    relatorio.modulos_relatorio[2].itens = [{ arquivo_id: 'same-file', nome: 'Cartão do CNPJ', status_validacao: 'Confirmado' }];
    expect(validateModularReport(relatorio)).toEqual(expect.objectContaining({ ok: false, failures: expect.arrayContaining(['documento duplicado entre módulos']) }));
  });
});

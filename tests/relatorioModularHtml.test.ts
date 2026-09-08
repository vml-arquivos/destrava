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
    expect(html).not.toMatch(/>\s*\d+\.\s+\d+\./);
    expect(html).not.toContain('Pendência: Pendência:');
    expect(validateModularReport(relatorio)).toEqual({ ok: true, failures: [] });
  });

  it('normaliza datas cadastrais e prefixos repetidos sem alterar o dado de origem', () => {
    const relatorio = relatorioFixture();
    relatorio.modulos_relatorio[0].campos = [{ campo: 'Data de criação do cadastro', valor: 'Fri May 22 2026 13:49:38 GMT+0000 (Coordinated Universal Time)' }];
    relatorio.modulos_relatorio[5].pendencias = [{ documento: 'FGTS', acao: 'Pendência: anexar Certificado de Regularidade do FGTS.' }];
    const html = gerarHtmlRelatorioModular(relatorio);
    expect(html).toContain('22/05/2026');
    expect(html).toContain('FGTS:</b> anexar Certificado de Regularidade do FGTS.');
    expect(html).not.toContain('Pendência: Pendência:');
  });

  it('mantém a classificação C- do bureau no checklist e no resultado do PDF', () => {
    const relatorio = relatorioFixture();
    relatorio.modulos_relatorio[2].itens = [{
      arquivo_id: 'rating-file',
      nome: 'Consulta de Rating',
      status_validacao: 'Informativo',
      arquivo_original: 'SPC SERASA CNPJ.pdf',
      data: '2026-08-03',
      resultado: 'Consulta de rating em bureau privado — Resultado: Relatório empresarial consolidado — rating C- — Recusado — Rating/Score: C-',
    }];
    const html = gerarHtmlRelatorioModular(relatorio);
    expect(html).toContain('rating C-');
    expect(html).toContain('Rating/Score: C-');
    expect(html).not.toContain('rating DE');
    expect(html).not.toContain('Rating/Score: DE');
  });

  it('prioriza o cadastro autoritativo para campos cadastrais corrompidos na apresentação', () => {
    const relatorio = relatorioFixture();
    relatorio.empresa = {
      ...relatorio.empresa,
      razao_social: 'PALUMA BURGER LTDA',
      nome_fantasia: 'Paluma Burger',
      natureza_juridica: 'Sociedade Empresária Limitada',
      atividade_principal: '5611203',
    };
    relatorio.modulos_relatorio[0].campos = [
      { campo: 'Razão social', valor: 'PALUM A BURGER LTDA' },
      { campo: 'Natureza jurídica', valor: '206-2 - Socie dade Em pre s ária Limitada' },
      { campo: 'Atividade principal', valor: '56.11-2-03 - Lanchone te s' },
    ];
    relatorio.modulos_relatorio[1].itens[0].resultado = 'Cartão CNPJ — Razão social: PALUM A BURGER LTDA';
    const html = gerarHtmlRelatorioModular(relatorio);
    expect(html).toContain('PALUMA BURGER LTDA');
    expect(html).toContain('206-2 - Sociedade Empresária Limitada');
    expect(html).toContain('56.11-2-03 - Lanchonetes, casas de chá, de sucos e similares');
    expect(html).not.toContain('PALUM A BURGER LTDA');
    expect(html).not.toContain('Lanchone te s');
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

  it('não renderiza módulo institucional vazio nem altera o contrato dos grupos', () => {
    const relatorio = relatorioFixture();
    relatorio.modulos_relatorio[4].itens = [];
    const html = gerarHtmlRelatorioModular(relatorio);
    expect(html).not.toContain('id="modulo-consultas_socios"');
    expect(html).toContain('id="modulo-pendencias"');
    expect(moduleIds(relatorio)).toEqual([...MODULOS_RELATORIO_EMPRESA]);
  });
});

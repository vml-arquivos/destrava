import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_TYPE_CATALOG, documentAnalysisConfig } from '../shared/documentTypes';
import { construirSecoesAnaliseDocumento } from '../shared/documentalPresentation';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { AnaliseDocumentalService, tipoLeitorLocalDocumentoCatalogado } from '../server/services/analiseDocumentalEspecializada';
import { classificarDocumentoDeterministico } from '../server/services/classificadorDocumentalCentral';

describe('cobertura integral da leitura automática documental', () => {
  it('atribui motor e prompt a todo tipo de arquivo aceito pelo catálogo', () => {
    const semAnalise = DOCUMENT_TYPE_CATALOG
      .filter((item) => item.uploadavel)
      .filter((item) => {
        const config = documentAnalysisConfig(item.tipo);
        return !config?.tipo || !config?.promptCodigo;
      });

    expect(semAnalise).toEqual([]);
    expect(DOCUMENT_TYPE_CATALOG.filter((item) => item.uploadavel).length).toBeGreaterThan(100);
  });

  it('usa parser genérico neutro fora das famílias especializadas', () => {
    expect(tipoLeitorLocalDocumentoCatalogado('cndt')).toBe('documento_generico');
    expect(tipoLeitorLocalDocumentoCatalogado('contrato_social')).toBe('contrato_social_alteracao');
    expect(tipoLeitorLocalDocumentoCatalogado('efd_contribuicoes')).toBe('efd_contribuicoes');
    expect(tipoLeitorLocalDocumentoCatalogado('extrato_bancario')).toBe('extrato_bancario');
  });

  it('identifica registros de RCPJ sem confundi-los com o estatuto anexado', () => {
    const resultado = classificarDocumentoDeterministico({
      tipoEsperado: 'registro_cartorio_pj',
      texto: 'REGISTRO CIVIL DE PESSOAS JURÍDICAS — RCPJ — registro do Estatuto Social da Associação Exemplo',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(resultado).toMatchObject({
      identidade_status: 'IDENTIFICADO',
      tipo_detectado: 'REGISTRO_CARTORIO_PJ',
      satisfaz_requisito: true,
    });
  });

  it('usa o mesmo despacho especializado no upload e no reprocessamento', async () => {
    const service = new AnaliseDocumentalService({} as any, vi.fn() as any);
    const qsa = vi.spyOn(service, 'analisarQSA').mockResolvedValue({ tipo_analise: 'qsa' } as any);
    const faturamento = vi.spyOn(service, 'analisarFaturamento').mockResolvedValue({ tipo_analise: 'faturamento_12_meses' } as any);
    const generico = vi.spyOn(service, 'analisarDocumentoCatalogado').mockResolvedValue({ tipo_analise: 'documento_generico' } as any);

    await service.analisarDocumentoAutomatico('empresa-1', 'arquivo-1', 'qsa');
    await service.analisarDocumentoAutomatico('empresa-1', 'arquivo-2', 'declaracao_faturamento');
    await service.analisarDocumentoAutomatico('empresa-1', 'arquivo-3', 'cndt');

    expect(qsa).toHaveBeenCalledWith('empresa-1', 'arquivo-1');
    expect(faturamento).toHaveBeenCalledWith('empresa-1', 'arquivo-2');
    expect(generico).toHaveBeenCalledWith('empresa-1', 'arquivo-3', 'cndt');
  });

  it('extrai somente campos explicitamente rotulados no fallback genérico', () => {
    const { dados } = analisarTextoDocumentoLocal('documento_generico', `
      CERTIDÃO NEGATIVA DE DÉBITOS
      Razão social: EMPRESA EXEMPLO LTDA
      CNPJ: 12.345.678/0001-90
      Órgão emissor: PGFN
      Número da certidão: ABC-123
      Órgão de registro: RCPJ Brasília
      Número do registro: 4567
      Data do registro: 15/08/2026
      Data de emissão: 01/09/2026
      Válida até: 30/09/2026
    `);

    expect(dados.documento_compativel).toBeUndefined();
    expect(dados.campos_comprovados).toMatchObject({
      cnpj: '12.345.678/0001-90',
      razao_social: 'EMPRESA EXEMPLO LTDA',
      entidade_consultada: 'EMPRESA EXEMPLO LTDA',
      orgao_emissor: 'PGFN',
      numero_documento: 'ABC-123',
      orgao_registro: 'RCPJ Brasília',
      numero_registro: '4567',
      data_registro: '2026-08-15',
      data_emissao: '2026-09-01',
      data_validade: '2026-09-30',
      situacao_certidao: 'negativa',
    });
    expect(dados.evidencias.length).toBeGreaterThanOrEqual(7);
  });

  it('mostra os dados genéricos comprovados no card do arquivo', () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: 'Leitura concluída; documento considerado consistente.',
      status: 'concluido',
      dados_extraidos: {
        campos_comprovados: {
          cnpj: '12.345.678/0001-90',
          numero_registro: '4567',
          data_validade: '2026-09-30',
          situacao_certidao: 'negativa',
        },
      },
    });
    const campos = secoes.find((secao) => secao.id === 'campos')?.campos || [];
    expect(campos).toEqual(expect.arrayContaining([
      { label: 'CNPJ', valor: '12.345.678/0001-90' },
      { label: 'Número do registro', valor: '4567' },
      { label: 'Data de validade', valor: '2026-09-30' },
      { label: 'Situação da certidão', valor: 'negativa' },
    ]));
  });

  it('não aprova documento vencido nem data futura', () => {
    const vencido = classificarDocumentoDeterministico({
      tipoEsperado: 'cndt',
      texto: 'CERTIDÃO NEGATIVA DE DÉBITOS TRABALHISTAS — Justiça do Trabalho',
      validadeFim: '2026-08-31',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const futuro = classificarDocumentoDeterministico({
      tipoEsperado: 'cartao_cnpj',
      texto: 'COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL — CADASTRO NACIONAL DA PESSOA JURÍDICA',
      dataEmissao: '2026-09-20',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(vencido).toMatchObject({ satisfaz_requisito: false, temporalidade_status: 'FORA_JANELA' });
    expect(futuro).toMatchObject({ satisfaz_requisito: false, temporalidade_status: 'FUTURO' });
  });

  it('aceita o último mês fechado e não confunde dois meses atrás com a situação atual', () => {
    const texto = 'PGDAS-D — Programa Gerador do Documento de Arrecadação do Simples Nacional';
    const agosto = classificarDocumentoDeterministico({
      tipoEsperado: 'pgdas', texto,
      competenciaInicio: '2026-08-01', competenciaFim: '2026-08-31',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const julho = classificarDocumentoDeterministico({
      tipoEsperado: 'pgdas', texto,
      competenciaInicio: '2026-07-01', competenciaFim: '2026-07-31',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(agosto).toMatchObject({ satisfaz_requisito: true, temporalidade_status: 'ATUAL' });
    expect(julho).toMatchObject({ satisfaz_requisito: false, temporalidade_status: 'HISTORICO' });
  });

  it('reconcilia M400 e M800 sem somar a mesma base econômica duas vezes', () => {
    const { dados } = analisarTextoDocumentoLocal('efd_contribuicoes', [
      '|0000|015|0|01082026|31082026|EMPRESA EXEMPLO LTDA|12345678000190|',
      '|M400|01|1000,00|4.1.1|Receita não tributada|',
      '|M800|01|1000,00|4.1.1|Receita não tributada|',
    ].join('\n'));

    expect(dados.totais_m400_m800_conciliados).toBe(true);
    expect(dados.receita_nao_tributada_confirmada).toBe(1000);
    expect(dados.total_receitas_nao_tributadas_pis_m400).toBe(1000);
    expect(dados.total_receitas_nao_tributadas_cofins_m800).toBe(1000);
  });
});

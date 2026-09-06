import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_TYPE_CATALOG, documentAnalysisConfig } from '../shared/documentTypes';
import { construirSecoesAnaliseDocumento } from '../shared/documentalPresentation';
import { analisarTextoDocumentoLocal } from '../server/services/extracaoDocumentalLocal';
import { AnaliseDocumentalService, tipoLeitorLocalDocumentoCatalogado } from '../server/services/analiseDocumentalEspecializada';
import { classificarDocumentoDeterministico } from '../server/services/classificadorDocumentalCentral';
import { obterPerfilAnaliseDocumental, possuiPerfilIndividualDocumental } from '../server/services/documentAnalysisProfiles';

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

  it('exige ficha de leitura interna explicitamente revisada para cada tipo do catálogo', () => {
    const semPerfilIndividual = DOCUMENT_TYPE_CATALOG
      .filter((item) => item.uploadavel)
      .filter((item) => !possuiPerfilIndividualDocumental(item.tipo))
      .map((item) => item.tipo);

    expect(semPerfilIndividual).toEqual([]);
    expect(obterPerfilAnaliseDocumental('qsa')).toMatchObject({
      perfilIndividual: true,
      camposObrigatorios: ['cnpj', 'socios', 'administrador_titular'],
    });
    expect(obterPerfilAnaliseDocumental('dasn_simei')).toMatchObject({
      perfilIndividual: true,
      politicaTemporal: 'competencia_anual',
    });
  });

  it('roteia consultas e certidões P0 para leitores internos específicos', () => {
    expect(tipoLeitorLocalDocumentoCatalogado('cndt')).toBe('certidao_regularidade');
    expect(tipoLeitorLocalDocumentoCatalogado('cnd_rfb_cnpj')).toBe('certidao_regularidade');
    expect(tipoLeitorLocalDocumentoCatalogado('situacao_fiscal_cnpj')).toBe('situacao_fiscal');
    expect(tipoLeitorLocalDocumentoCatalogado('cadin_cnpj')).toBe('consulta_cadin');
    expect(tipoLeitorLocalDocumentoCatalogado('pgfn_cnpj')).toBe('consulta_pgfn');
    expect(tipoLeitorLocalDocumentoCatalogado('rating_bacen_cnpj')).toBe('consulta_scr');
    expect(tipoLeitorLocalDocumentoCatalogado('ccs_cnpj')).toBe('consulta_ccs');
    expect(tipoLeitorLocalDocumentoCatalogado('ccf_cnpj')).toBe('consulta_ccf');
    expect(tipoLeitorLocalDocumentoCatalogado('cenprot_cnpj')).toBe('consulta_cenprot');
    expect(tipoLeitorLocalDocumentoCatalogado('consulta_serasa_cnpj')).toBe('consulta_bureau');
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

  it('prioriza o título do instrumento societário sobre a menção à Junta Comercial', () => {
    const alteracao = classificarDocumentoDeterministico({
      tipoEsperado: 'contrato_social',
      texto: `ALTERAÇÃO CONTRATUAL — SOCIEDADE EMPRESÁRIA LIMITADA
        PALUMA BURGER LTDA — CNPJ 52.008.360/0001-33
        devidamente arquivada na Junta Comercial de Goiás sob o NIRE 52206183723`,
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const atos = classificarDocumentoDeterministico({
      tipoEsperado: 'atos_junta_comercial',
      texto: 'JUNTA COMERCIAL DO ESTADO DE GOIÁS — CERTIDÃO ONLINE — HISTÓRICO DE ARQUIVAMENTOS — NIRE 52206183723',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(alteracao).toMatchObject({
      identidade_status: 'IDENTIFICADO',
      tipo_detectado: 'ALTERACAO_CONTRATUAL',
      satisfaz_requisito: true,
    });
    expect(atos).toMatchObject({
      identidade_status: 'IDENTIFICADO',
      tipo_detectado: 'ATOS_JUNTA_COMERCIAL',
      satisfaz_requisito: true,
    });
  });

  it('aceita relatório empresarial consolidado no slot de Rating mesmo com seções SCR e protestos', () => {
    const resultado = classificarDocumentoDeterministico({
      tipoEsperado: 'consulta_serasa_cnpj',
      texto: `ANÁLISE EMPRESARIAL, FINANCEIRA E SCR
        SCR + LAUDO FINANCEIRO COMPLETO + SCORE EMPRESARIAL
        CNPJ 52.008.360/0001-33
        PONTUAÇÃO RATING 985 AA
        MOTOR DE CRÉDITO — DECISÃO APROVADO
        PROTESTOS ESTADUAIS — NADA CONSTA`,
      dataEmissao: '2026-07-23',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(resultado).toMatchObject({
      identidade_status: 'IDENTIFICADO',
      tipo_detectado: 'RELATORIO_CREDITO_CONSOLIDADO',
      satisfaz_requisito: true,
    });
  });

  it('distingue contratos operacionais e aceita CPEND no requisito federal', () => {
    const assessoria = classificarDocumentoDeterministico({
      tipoEsperado: 'contrato_assessoria',
      texto: 'CONTRATO DE ASSESSORIA FINANCEIRA — CONTRATANTE E CONTRATADA',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const cpend = classificarDocumentoDeterministico({
      tipoEsperado: 'cnd_rfb_cnpj',
      texto: 'CERTIDÃO POSITIVA COM EFEITOS DE NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS',
      validadeFim: '2026-12-31',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(assessoria).toMatchObject({ identidade_status: 'IDENTIFICADO', tipo_detectado: 'CONTRATO_ASSESSORIA' });
    expect(cpend).toMatchObject({ identidade_status: 'IDENTIFICADO', tipo_detectado: 'CPEND', satisfaz_requisito: true });
  });

  it('mantém consulta PGFN separada da CND/CPEND federal', () => {
    const pgfn = classificarDocumentoDeterministico({
      tipoEsperado: 'pgfn_cnpj',
      texto: 'PROCURADORIA-GERAL DA FAZENDA NACIONAL — REGULARIZE — consulta de inscrições em dívida ativa da União',
      dataEmissao: '2026-09-05',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const cndNoSlotPgfn = classificarDocumentoDeterministico({
      tipoEsperado: 'pgfn_cnpj',
      texto: 'CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO',
      validadeFim: '2026-12-31',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const pgfnNoSlotCnd = classificarDocumentoDeterministico({
      tipoEsperado: 'cnd_rfb_cnpj',
      texto: 'PROCURADORIA-GERAL DA FAZENDA NACIONAL — REGULARIZE — consulta de inscrições em dívida ativa da União',
      dataEmissao: '2026-09-05',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(pgfn).toMatchObject({
      identidade_status: 'IDENTIFICADO',
      tipo_detectado: 'PGFN',
      temporalidade_status: 'ATUAL',
      satisfaz_requisito: true,
    });
    expect(cndNoSlotPgfn).toMatchObject({ identidade_status: 'INCOMPATIVEL', satisfaz_requisito: false });
    expect(pgfnNoSlotCnd).toMatchObject({ identidade_status: 'INCOMPATIVEL', satisfaz_requisito: false });
  });

  it('classifica SCR nos slots CNPJ e CPF sem misturar o escopo do identificador', () => {
    const scrCnpj = classificarDocumentoDeterministico({
      tipoEsperado: 'rating_bacen_cnpj',
      texto: 'RELATÓRIO DE EMPRÉSTIMOS E FINANCIAMENTOS (SCR) CNPJ: 12.345.678/0001-90',
      dataEmissao: '2026-08-01',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const scrCpf = classificarDocumentoDeterministico({
      tipoEsperado: 'rating_bacen_cpf',
      texto: 'RELATÓRIO DE EMPRÉSTIMOS E FINANCIAMENTOS (SCR) CPF: 123.456.789-00',
      dataEmissao: '2026-08-01',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const cpfNoSlotCnpj = classificarDocumentoDeterministico({
      tipoEsperado: 'rating_bacen_cnpj',
      texto: 'RELATÓRIO DE EMPRÉSTIMOS E FINANCIAMENTOS (SCR) CPF: 123.456.789-00',
      dataEmissao: '2026-08-01',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(scrCnpj).toMatchObject({ identidade_status: 'IDENTIFICADO', satisfaz_requisito: true });
    expect(scrCpf).toMatchObject({ identidade_status: 'IDENTIFICADO', satisfaz_requisito: true });
    expect(cpfNoSlotCnpj).toMatchObject({ identidade_status: 'INCOMPATIVEL', satisfaz_requisito: false });
  });

  it('rejeita CND de CPF no slot CNPJ e CND de CNPJ no slot CPF', () => {
    const cpfNoSlotCnpj = classificarDocumentoDeterministico({
      tipoEsperado: 'cnd_rfb_cnpj',
      texto: 'CERTIDÃO NEGATIVA DE DÉBITOS. CPF: 123.456.789-00',
      validadeFim: '2026-12-31',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const cnpjNoSlotCpf = classificarDocumentoDeterministico({
      tipoEsperado: 'cnd_rfb_cpf',
      texto: 'CERTIDÃO NEGATIVA DE DÉBITOS. CNPJ: 12.345.678/0001-90',
      validadeFim: '2026-12-31',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });

    expect(cpfNoSlotCnpj).toMatchObject({ identidade_status: 'INCOMPATIVEL', satisfaz_requisito: false });
    expect(cnpjNoSlotCpf).toMatchObject({ identidade_status: 'INCOMPATIVEL', satisfaz_requisito: false });
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

  it('leitor CADIN identifica consulta e preserva escopo limitado à RFB', () => {
    const { dados } = analisarTextoDocumentoLocal('consulta_cadin', `
      CADIN — Cadastro Informativo de Créditos não Quitados do Setor Público Federal
      CNPJ: 12.345.678/0001-90
      Data da consulta: 05/09/2026
      Resultado da consulta: Nada consta
      Este relatório mostra pendências incluídas pela Receita Federal.
      Quantidade de registros: 0
    `, 'cadin_cnpj');

    expect(dados).toMatchObject({
      documento_compativel: true,
      cnpj: '12.345.678/0001-90',
      data_consulta: '2026-09-05',
      resultado_consulta: 'Nada consta',
      registros: 0,
      escopo_consulta: 'RFB',
      fonte_extracao: 'local_deterministica_especializada',
    });
  });

  it('leitor PGFN não aceita CND conjunta como consulta Regularize', () => {
    const consulta = analisarTextoDocumentoLocal('consulta_pgfn', `
      PROCURADORIA-GERAL DA FAZENDA NACIONAL
      REGULARIZE — Consulta de inscrições em dívida ativa
      CNPJ: 12.345.678/0001-90
      Data da consulta: 05/09/2026
      Resultado da consulta: Nenhuma inscrição
    `, 'pgfn_cnpj').dados;
    const cnd = analisarTextoDocumentoLocal('consulta_pgfn', `
      CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO
      CNPJ: 12.345.678/0001-90
      Válida até: 01/03/2027
      PGFN
    `, 'pgfn_cnpj').dados;

    expect(consulta.documento_compativel).toBe(true);
    expect(consulta.resultado_consulta).toBe('Nenhuma inscrição');
    expect(cnd.documento_compativel).toBe(false);
  });

  it('leitores SCR, CCS e CCF extraem somente a semântica própria de cada relatório', () => {
    const scr = analisarTextoDocumentoLocal('consulta_scr', `
      RELATÓRIO DE EMPRÉSTIMOS E FINANCIAMENTOS (SCR)
      CNPJ: 12.345.678/0001-90
      Data-base: 07/2026
      Instituição: Banco A
      Instituição: Banco B
      Saldo devedor: R$ 100.000,00
      Limite total: R$ 150.000,00
      Operações em atraso: 0
    `, 'rating_bacen_cnpj').dados;
    const ccs = analisarTextoDocumentoLocal('consulta_ccs', `
      RELATÓRIO DE CONTAS E RELACIONAMENTOS EM BANCOS (CCS)
      CNPJ: 12.345.678/0001-90
      Data da consulta: 05/09/2026
      Instituição: Banco A
      Início do relacionamento: 01/01/2020
    `, 'ccs_cnpj').dados;
    const ccf = analisarTextoDocumentoLocal('consulta_ccf', `
      RELATÓRIO DE CHEQUES SEM FUNDOS (CCF)
      CNPJ: 12.345.678/0001-90
      Data da consulta: 05/09/2026
      Resultado da consulta: Sem ocorrências
      Quantidade de ocorrências: 0
    `, 'ccf_cnpj').dados;

    expect(scr.documento_compativel).toBe(true);
    expect(scr.instituicoes).toEqual(['Banco A', 'Banco B']);
    expect(scr.atrasos).toBe(0);
    expect(scr.saldo_devedor).toBe(100000);
    expect(ccs.documento_compativel).toBe(true);
    expect(ccs.instituicoes).toEqual(['Banco A']);
    expect(ccs.saldo).toBeUndefined();
    expect(ccs.limites).toBeUndefined();
    expect(ccf.documento_compativel).toBe(true);
    expect(ccf.ocorrencias).toBe(0);
    expect(ccf.resultado_consulta).toBe('Sem ocorrências');
  });

  it('reconhece os layouts reais anexados da Paluma sem confundir operador com titular', () => {
    const ccs = analisarTextoDocumentoLocal('consulta_ccs', `
      Relatório de Contas e Relacionamentos (CCS)
      Nome: PALUMA BURGER LTDA
      CPF/CNPJ: 52.008.360/0001-33
      Banco ou Instituição     Início do relacionamento     Fim do relacionamento
      08.561.701 - PAGSEGURO INTERNET IP S.A. 12/09/2023 Ativo
      Relatório emitido por: 038.211.981-92 em 20/08/2026 11:30
    `, 'ccs_cnpj').dados;
    const ccf = analisarTextoDocumentoLocal('consulta_ccf', `
      Relatório de Cheques sem Fundos (CCF)
      Nome: PALUMA BURGER LTDA
      CPF/CNPJ: 52.008.360/0001-33
      Não foi encontrado registro de cheque devolvido.
    `, 'ccf_cnpj').dados;
    const scrTexto = `
      Relatório de Empréstimos e Financiamentos (SCR)
      Nome: PALUMA BURGER LTDA
      CPF/CNPJ: 52.008.360
      Período pesquisado: 07/2026 a 07/2026
      Mês de referência: 07/2026 R$ 37.542,69 R$ 17.658,80
      ITAÚ UNIBANCO S.A. R$ 529,91
    `;
    const scr = analisarTextoDocumentoLocal('consulta_scr', scrTexto, 'rating_bacen_cnpj').dados;
    const classificacaoScr = classificarDocumentoDeterministico({
      tipoEsperado: 'rating_bacen_cnpj',
      texto: scrTexto,
      dataEmissao: '2026-08-20',
    });
    const cenprot = analisarTextoDocumentoLocal('consulta_cenprot', `
      INFORMAÇÃO SEM VALOR DE CERTIDÃO
      Documento consultado 52.008.360/0001-33
      Data e hora da consulta 20/08/2026 11:42
      ✓ Não constam protestos nos cartórios participantes do Brasil
    `, 'cenprod_cnpj').dados;
    const faturamento = analisarTextoDocumentoLocal('faturamento_12_meses', `
      DECLARAÇÃO DE FATURAMENTO DOS ÚLTIMOS 12 MESES
      Emitido em: 04 de agosto de 2026
      PALUMA BURGER LTDA | CNPJ: 52.008.360/0001-33
      agosto de 2025 R$ 39.013,56
      setembro de 2025 R$ 37.282,76
      outubro de 2025 R$ 37.274,19
      novembro de 2025 R$ 40.977,02
      dezembro de 2025 R$ 38.011,98
      janeiro de 2026 R$ 40.220,83
      fevereiro de 2026 R$ 42.203,07
      março de 2026 R$ 39.313,39
      abril de 2026 R$ 43.142,40
      maio de 2026 R$ 42.890,33
      junho de 2026 R$ 41.357,82
      julho de 2026 R$ 45.612,65
      TOTAL DO PERÍODO R$ 487.300,00
    `, 'faturamento_12_meses').dados;
    const pgdas = analisarTextoDocumentoLocal('pgdas_d', `
      Programa Gerador do Documento de Arrecadação do Simples Nacional - Declaratório
      Período de Apuração: 01/07/2026 a 31/07/2026
      CNPJ Matriz: 52.008.360/0001-33
      Optante pelo Simples Nacional: Sim
      Receita Bruta do PA (RPA) 36.923,49 0,00 36.923,49
      Número da Declaração: 52008360202607001 Número do Recibo: 01.07.26229.0440173-6
    `, 'pgdas').dados;

    expect(ccs.instituicoes).toEqual(['PAGSEGURO INTERNET IP S.A.']);
    expect(ccs.data_consulta).toBe('2026-08-20');
    expect(ccf.ocorrencias).toBe(0);
    expect(ccf.resultado_consulta).toBe('Sem ocorrências identificadas');
    expect(scr.cnpj).toBe('52.008.360');
    expect(scr.data_base).toBe('07/2026');
    expect(scr.instituicoes).toEqual(['ITAÚ UNIBANCO S.A.']);
    expect(classificacaoScr.identidade_status).toBe('IDENTIFICADO');
    expect(cenprot.protestos).toBe(0);
    expect(cenprot.resultado_consulta).toBe('Sem protestos identificados');
    expect(documentAnalysisConfig('cenprod_cnpj')?.promptCodigo).toBe('cenprot_extract');
    expect(faturamento.meses_referencia).toHaveLength(12);
    expect(faturamento.competencias_mensais).toHaveLength(12);
    expect(faturamento.total_12_meses).toBe(487300);
    expect(faturamento.data_documento).toBe('2026-08-04');
    expect(pgdas.documento_compativel).toBe(true);
    expect(pgdas.regime_tributario).toBe('Simples Nacional');
    expect(pgdas.competencia).toMatchObject({ inicio: '2026-07-01', fim: '2026-07-31' });
    expect(pgdas.recibo_ou_protocolo).toContain('52008360202607001');
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
    `, 'cnd_rfb_cnpj');

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
    expect(dados.perfil_leitura_interna).toMatchObject({
      tipo_documento: 'cnd_rfb_cnpj',
      individual: true,
      politica_temporal: 'validade_expressa',
    });
  });

  it('usa o tipo esperado somente para selecionar campos, sem tratá-lo como prova de identidade', () => {
    const { dados } = analisarTextoDocumentoLocal('documento_generico', `
      CONTRATO DE PRESTAÇÃO DE SERVIÇOS
      Contratante: EMPRESA EXEMPLO LTDA
      Contratado: PRESTADOR EXEMPLO
      Objeto: assessoria financeira
      Data da assinatura: 05/09/2026
    `, 'contrato_prestacao_servicos');

    expect(dados.campos_comprovados).toMatchObject({
      partes: ['EMPRESA EXEMPLO LTDA', 'PRESTADOR EXEMPLO'],
      objeto: 'assessoria financeira',
      data_assinatura: '2026-09-05',
    });
    expect(dados.documento_compativel).toBeUndefined();
    expect(dados.perfil_leitura_interna.individual).toBe(true);
  });

  it('mostra somente a validação objetiva dos dados genéricos comprovados no card', () => {
    const secoes = construirSecoesAnaliseDocumento({
      conclusao: 'Leitura concluída; documento considerado consistente.',
      tipo_documento: 'cndt',
      status: 'concluido',
      satisfaz_requisito: true,
      dados_extraidos: {
        campos_comprovados: {
          cnpj: '12.345.678/0001-90',
          numero_registro: '4567',
          data_validade: '2026-09-30',
          situacao_certidao: 'negativa',
        },
      },
    }, { tipo_documento: 'cndt', analisado: true, consistente: true });
    const campos = secoes.find((secao) => secao.id === 'campos')?.campos || [];
    expect(campos).toEqual(expect.arrayContaining([
      { label: 'CNPJ', valor: '12.345.678/0001-90' },
      { label: 'Situação', valor: 'negativa' },
      { label: 'Validade', valor: '2026-09-30' },
      { label: 'Validação', valor: 'Regularidade confirmada' },
    ]));
    expect(campos.some((campo) => campo.label === 'Número do registro')).toBe(false);
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
    // CORREÇÃO (Rodada 33, 05/09/2026): julho (2 meses atrás) não é mais
    // rotulado `HISTORICO` -- ainda está dentro da janela rolling de 12
    // meses, então passa a ser `WINDOW_SUPPORT` (ver `TemporalStatus` em
    // documentalLaudoVersioning.ts). O ponto original deste teste --
    // "2 meses atrás não é confundido com ATUAL" -- continua garantido por
    // `temporalidade_status: WINDOW_SUPPORT`, sem rebaixar a competência a
    // ATUAL, mas satisfazendo a evidência mensal da janela rolling.
    expect(julho).toMatchObject({ satisfaz_requisito: true, temporalidade_status: 'WINDOW_SUPPORT' });
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

  // CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
  // independentes -- Manus AI e GPT): ECD, DEFIS e DASN-SIMEI passam a ter
  // prazo de exigibilidade preciso por data (mesmo padrão já usado pela ECF),
  // em vez da regra genérica que só olhava o ano.
  it('CORREÇÃO Rodada 33: ECD do ano-calendário anterior ainda não é exigível antes do prazo (último dia útil de junho), mesmo já sendo "ano anterior"', () => {
    const antesDoPrazo = classificarDocumentoDeterministico({
      tipoEsperado: 'ecd',
      texto: 'ESCRITURAÇÃO CONTÁBIL DIGITAL',
      competenciaInicio: '2026-01-01', competenciaFim: '2026-12-31',
      hoje: new Date('2027-03-01T12:00:00.000Z'),
    });
    const depoisDoPrazo = classificarDocumentoDeterministico({
      tipoEsperado: 'ecd',
      texto: 'ESCRITURAÇÃO CONTÁBIL DIGITAL',
      competenciaInicio: '2026-01-01', competenciaFim: '2026-12-31',
      hoje: new Date('2027-08-01T12:00:00.000Z'),
    });
    expect(antesDoPrazo.temporalidade_status).toBe('AINDA_NAO_EXIGIVEL');
    expect(depoisDoPrazo.temporalidade_status).toBe('ATUAL');
  });

  it('CORREÇÃO Rodada 33: DEFIS do ano-calendário anterior segue a mesma regra de prazo preciso (31/03)', () => {
    const antesDoPrazo = classificarDocumentoDeterministico({
      tipoEsperado: 'defis',
      texto: 'DECLARAÇÃO DE INFORMAÇÕES SOCIOECONÔMICAS E FISCAIS',
      competenciaInicio: '2026-01-01', competenciaFim: '2026-12-31',
      hoje: new Date('2027-02-01T12:00:00.000Z'),
    });
    const depoisDoPrazo = classificarDocumentoDeterministico({
      tipoEsperado: 'defis',
      texto: 'DECLARAÇÃO DE INFORMAÇÕES SOCIOECONÔMICAS E FISCAIS',
      competenciaInicio: '2026-01-01', competenciaFim: '2026-12-31',
      hoje: new Date('2027-04-15T12:00:00.000Z'),
    });
    expect(antesDoPrazo.temporalidade_status).toBe('AINDA_NAO_EXIGIVEL');
    expect(depoisDoPrazo.temporalidade_status).toBe('ATUAL');
  });

  it('CORREÇÃO Rodada 33: DASN-SIMEI do ano-calendário anterior segue a mesma regra de prazo preciso (31/05)', () => {
    const antesDoPrazo = classificarDocumentoDeterministico({
      tipoEsperado: 'dasn_simei',
      texto: 'DECLARAÇÃO ANUAL DO SIMEI',
      competenciaInicio: '2026-01-01', competenciaFim: '2026-12-31',
      hoje: new Date('2027-04-01T12:00:00.000Z'),
    });
    const depoisDoPrazo = classificarDocumentoDeterministico({
      tipoEsperado: 'dasn_simei',
      texto: 'DECLARAÇÃO ANUAL DO SIMEI',
      competenciaInicio: '2026-01-01', competenciaFim: '2026-12-31',
      hoje: new Date('2027-06-15T12:00:00.000Z'),
    });
    expect(antesDoPrazo.temporalidade_status).toBe('AINDA_NAO_EXIGIVEL');
    expect(depoisDoPrazo.temporalidade_status).toBe('ATUAL');
  });

  // CORREÇÃO (Rodada 33, 05/09/2026): novo estado `WINDOW_SUPPORT` -- um
  // documento de competência mensal com mais de 1 mês (deixa de ser `ATUAL`)
  // mas ainda dentro dos últimos 12 meses fechados não é mais rotulado com o
  // mesmo `HISTORICO` genérico de um documento de anos atrás.
  it('CORREÇÃO Rodada 33: PGDAS-D de 3 meses atrás (dentro da janela de 12 meses) é WINDOW_SUPPORT, não HISTORICO; PGDAS-D de 14 meses atrás continua HISTORICO', () => {
    const dentroDaJanela = classificarDocumentoDeterministico({
      tipoEsperado: 'pgdas',
      texto: 'PGDAS-D — Programa Gerador do Documento de Arrecadação do Simples Nacional',
      competenciaInicio: '2026-06-01', competenciaFim: '2026-06-30',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    const foraDaJanela = classificarDocumentoDeterministico({
      tipoEsperado: 'pgdas',
      texto: 'PGDAS-D — Programa Gerador do Documento de Arrecadação do Simples Nacional',
      competenciaInicio: '2025-06-01', competenciaFim: '2025-06-30',
      hoje: new Date('2026-09-05T12:00:00.000Z'),
    });
    expect(dentroDaJanela).toMatchObject({ satisfaz_requisito: true, temporalidade_status: 'WINDOW_SUPPORT' });
    expect(foraDaJanela).toMatchObject({ satisfaz_requisito: false, temporalidade_status: 'HISTORICO' });
    expect(dentroDaJanela.motivo).toMatch(/janela de análise/);
  });
});

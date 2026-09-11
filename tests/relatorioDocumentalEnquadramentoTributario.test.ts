import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSIFIER_VERSION,
  EXTRACTOR_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  calcularAssinaturaAnalise,
} from '../server/services/documentalLaudoVersioning';

// Bug relatado pelo usuário (relatório da empresa ZR Construções e Reformas
// Civis LTDA, 30/08/2026): o card do "Enquadramento Tributário" no relatório
// documental aparecia "Validado"/"Leitura concluída; documento considerado
// consistente" mas sem NENHUM dado lido -- só os metadados de OCR (fonte,
// confiança, status). A causa raiz é irmã da já corrigida para QSA/societário
// em `relatorioDocumentalQsaSocios.test.ts`: `montarResultadoDetalhadoRelatorio`
// tinha blocos de campos dedicados para QSA (`ehQsa`) e para
// contrato/atos da junta (`ehSocietario`), mas NENHUM bloco equivalente para
// Enquadramento Tributário/Simples Nacional -- então mesmo quando a leitura
// (local ou IA) já preenchia `situacao_simples`/`regime_tributario`/`cnpj` em
// `dados_extraidos` (ver `analiseDocumentalEspecializada.ts`), esses dados
// nunca chegavam ao card do documento. Este teste reproduz o cenário real:
// empresa não optante do Simples, sem regime efetivo declarado no documento.
const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({
  analisarCnpjReceitaCartaoEmpresa: vi.fn(),
  buscarUltimaAnaliseCnpjEmpresa: vi.fn(),
  limparAnalisesCnpjEmpresa: vi.fn(),
}));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({
  analiseDocumentalService: { analisarQSA: vi.fn(), analisarSimplesNacional: vi.fn(), analisarAtosJuntaComercial: vi.fn(), analisarContratoComAtosJunta: vi.fn() },
}));

function dossieComEnquadramento(documento: Record<string, any>) {
  return {
    blocos: [
      {
        codigo: 'enquadramento_tributario',
        nome_amigavel: 'Enquadramento Tributário',
        status: 'validado',
        documentos: [documento],
      },
    ],
    identidade_cnpj: { documentos_iniciais: {} },
    documentacao_societaria: {},
    mapa_documental_credito: { etapas: [] },
    pendencias: [],
  };
}

function mockDocumentosExtracoesIa(resultado: any) {
  mocks.poolQuery.mockImplementation(async (text: string, params?: any[]) => {
    if (String(text).includes('FROM information_schema.tables')) return { rows: [{ '?column?': 1 }] };
    if (String(text).includes('FROM information_schema.columns')) return { rows: [{ '?column?': 1 }] };
    if (String(text).includes('FROM public.documentos_extracoes_ia')) {
      if (params?.[0] === 'enq-doc-1' && params?.[1] === 'simples_extract') {
        const promptVersao = '1.0.0';
        return {
          rows: [{
            id: 'extracao-enquadramento-1',
            resultado,
            status: resultado.status,
            prompt_versao: promptVersao,
            hash_arquivo: null,
            analysis_signature: calcularAssinaturaAnalise({
              arquivoId: 'enq-doc-1',
              arquivoHash: null,
              promptCodigo: 'simples_extract',
              promptVersao,
            }),
            classifier_version: CLASSIFIER_VERSION,
            extractor_version: EXTRACTOR_VERSION,
            rule_version: RULE_VERSION,
            schema_version: SCHEMA_VERSION,
            analysis_status: 'ATIVO',
            stale_at: null,
            satisfaz_requisito: resultado.status === 'concluido',
          }],
        };
      }
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('montarRelatorioDocumental -- Enquadramento Tributário/Simples Nacional expõe os dados lidos no card', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('mostra "Situação no Simples Nacional: Não Optante" e NÃO inventa um regime quando o documento não declara nenhum', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    mockDocumentosExtracoesIa({
      tipo_analise: 'simples_nacional',
      empresa_id: 'empresa-1',
      arquivo_id: 'enq-doc-1',
      status: 'concluido',
      dados_extraidos: {
        cnpj: '49.366.887/0001-25',
        situacao_simples: 'Não Optante',
        regime_tributario: null,
        opcao_mei: false,
      },
      alertas: [],
      divergencias: [],
      nivel_confianca: 0.9,
      modelo_ia: 'local:tesseract-v1',
      analisado_em: new Date().toISOString(),
      revisao_humana_necessaria: false,
    });

    const documento = { id: 'enq-doc-1', tipo_documento: 'enquadramento_tributario_cnpj', nome: 'ENQ. TRIB.pdf', validado: true, criado_em: new Date().toISOString() };
    const relatorio = await montarRelatorioDocumental(dossieComEnquadramento(documento));

    const item = [...relatorio.documentos_analisados, ...relatorio.documentos_pendentes_analise].find((doc: any) => doc.tipo_documento === 'enquadramento_tributario_cnpj');
    expect(item).toBeTruthy();
    expect(item.consistente).toBe(true);

    const campos: Array<{ label: string; valor: string }> = item.resultado_analise.campos;
    const porLabel = (label: string) => campos.find((campo) => campo.label === label)?.valor;

    expect(porLabel('Situação no Simples Nacional')).toBe('Não Optante');
    expect(porLabel('CNPJ do documento fiscal')).toBe('49.366.887/0001-25');
    // regime_tributario é null (documento não declara Lucro Presumido/Real/Arbitrado)
    // -- o card não deve exibir o campo, e muito menos herdar "Não Optante" como
    // se fosse um regime (essa era exatamente a confusão que o usuário reportou).
    expect(porLabel('Regime tributário declarado no documento')).toBeUndefined();
  });

  it('mostra o regime quando o documento (ex.: ECF) efetivamente declara Lucro Presumido/Real/Arbitrado', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    mockDocumentosExtracoesIa({
      tipo_analise: 'simples_nacional',
      empresa_id: 'empresa-1',
      arquivo_id: 'enq-doc-1',
      status: 'concluido',
      dados_extraidos: {
        cnpj: '49.366.887/0001-25',
        situacao_simples: 'Não Optante',
        regime_tributario: 'Lucro Presumido',
        opcao_mei: false,
      },
      alertas: [],
      divergencias: [],
      nivel_confianca: 0.9,
      modelo_ia: 'local:tesseract-v1',
      analisado_em: new Date().toISOString(),
      revisao_humana_necessaria: false,
    });

    const documento = { id: 'enq-doc-1', tipo_documento: 'enquadramento_tributario_cnpj', nome: 'ECF.pdf', validado: true, criado_em: new Date().toISOString() };
    const relatorio = await montarRelatorioDocumental(dossieComEnquadramento(documento));

    const item = [...relatorio.documentos_analisados, ...relatorio.documentos_pendentes_analise].find((doc: any) => doc.tipo_documento === 'enquadramento_tributario_cnpj');
    const campos: Array<{ label: string; valor: string }> = item.resultado_analise.campos;
    const porLabel = (label: string) => campos.find((campo) => campo.label === label)?.valor;

    expect(porLabel('Regime tributário declarado no documento')).toBe('Lucro Presumido');
  });
});

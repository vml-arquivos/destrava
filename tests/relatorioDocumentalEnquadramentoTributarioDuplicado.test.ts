import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Bug relatado pelo usuário (relatório da empresa ZR Construções e Reformas
// Civis LTDA, 30/08/2026, PDF "relatoriodocumentalzrconstrucoesereformascivisltda_1.pdf"
// + prints do modal "Relatório consolidado da análise documental"):
// "porque no relatorio gerado tem dois enquadramento tributario com as
// mesmas informações" -- o relatório mostrava DUAS entradas "ENQ. TRIB.pdf",
// ambas "Validado", com dado byte-idêntico (CNPJ, Situação Não Optante,
// Regime Não Optante, fonte local:tesseract-v1, confiança 90%).
//
// Causa raiz: o catálogo documental (`shared/documentTypes.ts`) e a regra de
// vínculo automático a blocos (`vincularDocumentosAutomaticos`, em
// `server/routes/documentacao.ts`) tratam `enquadramento_tributario_cnpj` E
// `simples_nacional` como o MESMO documento/família -- ambos com
// `bloco: 'enquadramento_tributario'` e a mesma análise especializada
// (`analise: 'simples_nacional'`, `promptCodigo: 'simples_extract'`). Uma
// empresa pode ter o arquivo catalogado com qualquer um dos dois
// `tipo_documento`, e nada nesta base impede que existam DOIS arquivos
// ativos (não excluídos) com tipos diferentes cobrindo o mesmo requisito.
//
// A função de deduplicação do relatório (`chaveDocumentoRelatorio`) já sabia
// agrupar essas duas variantes numa única chave ('enquadramento_tributario'),
// mas o regex que reconhece a variante "Simples Nacional" só previa a forma
// com ESPAÇO ("simples nacional"); o valor real gravado no banco é
// `simples_nacional`, com underscore. Um arquivo com esse `tipo_documento`
// nunca batia no regex, caía na chave genérica `${codigo}:${nome}` --
// diferente da chave do outro tipo -- e sobrevivia à deduplicação como um
// SEGUNDO card, exibindo a mesma leitura (mesmo motor de análise,
// `simples_extract`) do card que já existia.
//
// Este teste reproduz o cenário real (dois arquivos ativos, tipos
// diferentes, mesmo dado extraído) e prova que o relatório consolida em UMA
// única entrada -- sem apagar nenhum dos dois arquivos do acervo, só
// evitando a entrada espelhada no relatório.
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

function dossieComDoisArquivosDeEnquadramento(documentos: Array<Record<string, any>>) {
  return {
    blocos: [
      {
        codigo: 'enquadramento_tributario',
        nome_amigavel: 'Enquadramento Tributário',
        status: 'validado',
        documentos,
      },
    ],
    identidade_cnpj: { documentos_iniciais: {} },
    documentacao_societaria: {},
    mapa_documental_credito: { etapas: [] },
    pendencias: [],
  };
}

const RESULTADO_SIMPLES_EXTRACT = {
  tipo_analise: 'simples_nacional',
  empresa_id: 'empresa-1',
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
};

function mockDocumentosExtracoesIaParaAmbosArquivos() {
  mocks.poolQuery.mockImplementation(async (text: string, params?: any[]) => {
    if (String(text).includes('FROM information_schema.tables')) return { rows: [{ '?column?': 1 }] };
    if (String(text).includes('FROM public.documentos_extracoes_ia')) {
      if ((params?.[0] === 'enq-doc-1' || params?.[0] === 'enq-doc-2') && params?.[1] === 'simples_extract') {
        return { rows: [{ resultado: RESULTADO_SIMPLES_EXTRACT, status: RESULTADO_SIMPLES_EXTRACT.status, prompt_versao: '5.1.0' }] };
      }
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('montarRelatorioDocumental -- Enquadramento Tributário não aparece duplicado (bug real, 31/08/2026)', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('dois arquivos ativos (enquadramento_tributario_cnpj + simples_nacional) com a mesma leitura consolidam em UMA única entrada no relatório', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    mockDocumentosExtracoesIaParaAmbosArquivos();

    const documentoCnpj = {
      id: 'enq-doc-1',
      tipo_documento: 'enquadramento_tributario_cnpj',
      nome_original: 'ENQ. TRIB.pdf',
      validado: true,
      analisado: true,
      consistente: true,
      criado_em: '2026-08-30T10:00:00.000Z',
    };
    // Segundo arquivo real, mesmo requisito documental (mesmo bloco, mesma
    // análise especializada), catalogado sob o OUTRO tipo_documento válido
    // para o mesmo bloco (ver vincularDocumentosAutomaticos: tipos:
    // ['enquadramento_tributario_cnpj', 'simples_nacional']).
    const documentoSimples = {
      id: 'enq-doc-2',
      tipo_documento: 'simples_nacional',
      nome_original: 'ENQ. TRIB.pdf',
      validado: true,
      analisado: true,
      consistente: true,
      criado_em: '2026-08-30T10:05:00.000Z',
    };

    const relatorio = await montarRelatorioDocumental(dossieComDoisArquivosDeEnquadramento([documentoCnpj, documentoSimples]));

    const entradasEnquadramento = relatorio.documentos_analisados.filter((doc: any) =>
      doc.tipo_documento === 'enquadramento_tributario_cnpj' || doc.tipo_documento === 'simples_nacional'
    );
    // Antes da correção: 2 (um para cada tipo_documento, com os mesmos dados
    // lidos). Depois: 1 -- o relatório representa o REQUISITO documental
    // "Enquadramento Tributário", não cada arquivo bruto isoladamente.
    expect(entradasEnquadramento).toHaveLength(1);
    expect(relatorio.documentos_analisados.filter((doc: any) => doc.nome === 'ENQ. TRIB.pdf')).toHaveLength(1);
  });

  it('dois arquivos genuinamente diferentes (Enquadramento Tributário + QSA) continuam aparecendo como duas entradas distintas -- sem regressão', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    mockDocumentosExtracoesIaParaAmbosArquivos();

    const documentoEnquadramento = {
      id: 'enq-doc-1',
      tipo_documento: 'enquadramento_tributario_cnpj',
      nome_original: 'ENQ. TRIB.pdf',
      validado: true,
      analisado: true,
      consistente: true,
      criado_em: '2026-08-30T10:00:00.000Z',
    };
    const documentoQsa = {
      id: 'qsa-doc-1',
      tipo_documento: 'qsa',
      nome_original: 'QSA.pdf',
      validado: true,
      analisado: true,
      consistente: true,
      criado_em: '2026-08-30T10:10:00.000Z',
    };

    const relatorio = await montarRelatorioDocumental(dossieComDoisArquivosDeEnquadramento([documentoEnquadramento, documentoQsa]));

    expect(relatorio.documentos_analisados).toHaveLength(2);
    expect(relatorio.documentos_analisados.map((doc: any) => doc.nome).sort()).toEqual(['ENQ. TRIB.pdf', 'QSA.pdf']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSIFIER_VERSION,
  EXTRACTOR_VERSION,
  RULE_VERSION,
  SCHEMA_VERSION,
  calcularAssinaturaAnalise,
} from '../server/services/documentalLaudoVersioning';

// CORREÇÃO (2026-08-31, feedback do usuário sobre a Rodada 7 -- "não é mais
// aceitável que um documento fique no local de outro documento... como um
// documento validado, como lido"): mesmo depois de `extrairHibrido` parar de
// "lavar" um PGDAS-D anexado no slot do ECF (Rodada 7), a tela do Acervo
// Documental continuava mostrando o selo genérico "Revisão necessária" e o
// texto "Leitura concluída com observações ou necessidade de revisão." --
// nunca dizendo explicitamente que o arquivo NÃO É o documento esperado nem
// que não foi validado para aquele campo.
//
// Causa raiz: `montarResultadoDetalhadoRelatorio` (server/routes/documentacao.ts)
// calculava a conclusão só a partir de `documento.consistente` (sim/não
// genérico) e NUNCA repassava `documento_compativel`/`identidade_status` (que
// `normalizarDocumentoCatalogado`, em analiseDocumentalEspecializada.ts, já
// calculava corretamente) para o objeto `resultado_analise` consumido pela
// tela -- por isso `estadoVisualDocumento` (shared/documentalPresentation.ts),
// que SABIA checar esses campos, nunca os recebia e caía no estado genérico
// "revisao" em vez de "incompativel".
//
// Este teste prova, de ponta a ponta (persistência mocada -> `montarRelatorioDocumental`
// -> `estadoVisualDocumento`/`rotuloEstadoDocumento`), que agora: (1) a
// conclusão do campo diz explicitamente que o documento é inválido e nomeia
// o documento esperado; (2) o selo visual passa a ser "Documento
// incompatível", não mais "Revisão necessária"; e que um documento realmente
// consistente continua mostrando o selo de sucesso normalmente (sem
// regressão).
//
// ATUALIZAÇÃO (2026-08-31, feedback seguinte do mesmo usuário -- "não é pra
// ele ler o que está nesse documento do simples, pra ele ler só se for o
// s f... tire esse monte de texto"): não basta a conclusão e o selo estarem
// certos -- NENHUM dado lido do documento errado pode aparecer na tela
// (nem diagnóstico, nem "amostra objetiva dos dados lidos", nem os alertas
// explicando o motivo). `construirSecoesAnaliseDocumento`
// (shared/documentalPresentation.ts) agora devolve SÓ a seção "Resultado da
// análise" para um documento incompatível -- testado abaixo também.

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

function dossieComDocumento(documento: Record<string, any>) {
  return {
    blocos: [
      {
        codigo: 'regime_tributario',
        nome_amigavel: 'Regime Tributário',
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
      if (params?.[0] === 'ecf-doc-1' && params?.[1] === 'ecf_extract') {
        const promptVersao = '1.0.0';
        return {
          rows: [{
            id: 'extracao-ecf-1',
            resultado,
            status: resultado.status,
            prompt_versao: promptVersao,
            hash_arquivo: null,
            analysis_signature: calcularAssinaturaAnalise({
              arquivoId: 'ecf-doc-1',
              arquivoHash: null,
              promptCodigo: 'ecf_extract',
              promptVersao,
            }),
            classifier_version: CLASSIFIER_VERSION,
            extractor_version: EXTRACTOR_VERSION,
            rule_version: RULE_VERSION,
            schema_version: SCHEMA_VERSION,
            analysis_status: 'ATIVO',
            stale_at: null,
            satisfaz_requisito: resultado?.dados_extraidos?.satisfaz_requisito ?? resultado.status === 'concluido',
          }],
        };
      }
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('montarResultadoDetalhadoRelatorio -- conclusão e selo visual de documento incompatível com o slot', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('um PGDAS-D no slot do ECF vira "Documento inválido... anexe o ECF" -- sem nenhum dado lido do PGDAS na tela -- e o selo visual "Documento incompatível"', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    const { estadoVisualDocumento, rotuloEstadoDocumento, construirSecoesAnaliseDocumento } = await import('../shared/documentalPresentation');
    mockDocumentosExtracoesIa({
      tipo_analise: 'documento_generico',
      empresa_id: 'empresa-1',
      arquivo_id: 'ecf-doc-1',
      status: 'revisao_humana',
      dados_extraidos: {
        documento_compativel: false,
        tipo_esperado: 'ecf',
        tipo_detectado: 'PGDAS_D',
        identidade_status: 'INCOMPATIVEL',
        satisfaz_requisito: false,
        cobertura_status: 'NAO_SATISFAZ',
        // Dados de fato lidos do PGDAS-D errado -- presentes no laudo (o
        // motor continua lendo o arquivo para poder classificá-lo), mas que
        // NÃO podem chegar à tela: é exatamente esse vazamento que o usuário
        // reportou ("não é pra ele ler o que está nesse documento do
        // simples").
        situacao_simples: 'Optante',
        regime_tributario: 'Simples Nacional',
      },
      diagnostico_factual: 'O arquivo é um PGDAS-D (Simples Nacional), não um ECF.',
      alertas: [{ codigo: 'documento_catalogado_tipo_incompativel', mensagem: 'Documento incorreto para "ECF" -- conteúdo identificado: PGDAS-D (Simples Nacional). Não validado.', severidade: 'alta' }],
      divergencias: [],
      nivel_confianca: 0.8,
      modelo_ia: 'local:tesseract-v1',
      analisado_em: new Date().toISOString(),
      revisao_humana_necessaria: true,
    });

    const documento = { id: 'ecf-doc-1', tipo_documento: 'ecf', nome: 'ECF.pdf', validado: true, criado_em: new Date().toISOString() };
    const relatorio = await montarRelatorioDocumental(dossieComDocumento(documento));

    const item = [...relatorio.documentos_analisados, ...relatorio.documentos_pendentes_analise].find((doc: any) => doc.tipo_documento === 'ecf');
    expect(item).toBeTruthy();

    // A conclusão não pode mais ser o texto genérico de revisão -- tem que
    // dizer explicitamente que o documento é inválido e qual é o documento
    // esperado (nomeado, não só "o documento correto" genérico).
    expect(item.resultado_analise.conclusao).toMatch(/inv[áa]lido/i);
    expect(item.resultado_analise.conclusao).toMatch(/ECF/);
    expect(item.resultado_analise.conclusao).not.toBe('Leitura concluída com observações ou necessidade de revisão.');

    // A identidade/compatibilidade calculada pelo serviço de análise agora
    // chega ao objeto consumido pela tela.
    expect(item.resultado_analise.dados_extraidos?.documento_compativel).toBe(false);
    expect(item.resultado_analise.dados_extraidos?.identidade_status).toBe('INCOMPATIVEL');

    // CORE: nenhum dado lido do PGDAS-D errado pode chegar à tela -- só a
    // seção "Resultado da análise" com a mensagem mínima. Nem o diagnóstico,
    // nem a "amostra objetiva dos dados lidos" (que teria "Situação no
    // Simples Nacional"/"Regime tributário" se não fosse suprimida), nem o
    // alerta explicando o motivo.
    const secoes = construirSecoesAnaliseDocumento(item.resultado_analise, item);
    expect(secoes).toHaveLength(1);
    expect(secoes[0].id).toBe('resultado');
    expect(secoes[0].texto).toMatch(/inv[áa]lido/i);
    expect(secoes.some((s: any) => s.id === 'diagnostico_factual')).toBe(false);
    expect(secoes.some((s: any) => s.id === 'campos')).toBe(false);
    expect(secoes.some((s: any) => s.id === 'alertas')).toBe(false);

    // E o selo visual (o mesmo usado em ResultadoAnaliseDocumento.tsx) passa a
    // refletir isso -- não mais o genérico "Revisão necessária".
    const estado = estadoVisualDocumento(item.resultado_analise, item);
    expect(estado).toBe('incompativel');
    expect(rotuloEstadoDocumento(estado)).toBe('Documento incompatível');
  });

  it('um ECF de verdade, lido e consistente, continua com a conclusão de sucesso, o selo "Requisito satisfeito" e os dados lidos visíveis (sem regressão)', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    const { estadoVisualDocumento, rotuloEstadoDocumento, construirSecoesAnaliseDocumento } = await import('../shared/documentalPresentation');
    mockDocumentosExtracoesIa({
      tipo_analise: 'documento_generico',
      empresa_id: 'empresa-1',
      arquivo_id: 'ecf-doc-1',
      status: 'concluido',
      dados_extraidos: {
        documento_compativel: true,
        tipo_esperado: 'ecf',
        tipo_detectado: 'ECF',
        identidade_status: 'IDENTIFICADO',
        satisfaz_requisito: true,
        cobertura_status: 'SATISFAZ',
        regime_tributario: 'Lucro Presumido',
      },
      alertas: [],
      divergencias: [],
      nivel_confianca: 0.95,
      modelo_ia: 'local:tesseract-v1',
      analisado_em: new Date().toISOString(),
      revisao_humana_necessaria: false,
    });

    const documento = { id: 'ecf-doc-1', tipo_documento: 'ecf', nome: 'ECF.pdf', validado: true, criado_em: new Date().toISOString() };
    const relatorio = await montarRelatorioDocumental(dossieComDocumento(documento));

    const item = [...relatorio.documentos_analisados, ...relatorio.documentos_pendentes_analise].find((doc: any) => doc.tipo_documento === 'ecf');
    expect(item).toBeTruthy();
    expect(item.consistente).toBe(true);
    expect(item.resultado_analise.conclusao).toBe('Leitura concluída; documento considerado consistente.');

    const estado = estadoVisualDocumento(item.resultado_analise, item);
    expect(estado).toBe('aprovado');
    expect(rotuloEstadoDocumento(estado)).toBe('Requisito satisfeito');

    // Contraste explícito com o teste anterior: quando o documento CORRETO é
    // o que está anexado, os dados lidos (regime tributário, neste caso)
    // continuam aparecendo normalmente -- a supressão de dados é exclusiva
    // do caso "documento errado no slot", nunca do caso "documento certo".
    const secoes = construirSecoesAnaliseDocumento(item.resultado_analise, item);
    const secaoCampos = secoes.find((s: any) => s.id === 'campos');
    expect(secaoCampos).toBeTruthy();
    expect(secaoCampos!.campos?.some((c: any) => c.label === 'Regime tributário declarado no documento' && c.valor === 'Lucro Presumido')).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Bug relatado pelo usuário (zip 10): um QSA anexado, com a flag manual
// `documentos_arquivos.validado = true`, aparecia no relatório documental como
// "Validado" / "Leitura concluída; documento considerado consistente" mesmo
// quando a extração de IA (persistida em `documentos_extracoes_ia`) não achou
// nenhum sócio -- e, inversamente, quando a leitura realmente encontrava o
// sócio, o nome não aparecia em nenhum lugar do relatório. A causa raiz:
// `montarRelatorioDocumental` só conhecia a análise especializada dos
// documentos societários (contrato/alteração + atos da Junta); para QSA (e
// qualquer outro tipo com análise especializada própria) ele caía de volta na
// flag manual `documento.validado`, que é administrativa e não confirma que a
// IA leu o conteúdo. Este teste reproduz os dois lados do bug diretamente
// contra a função exportada, sem depender de todo o pipeline de
// `montarDossieCreditoEmpresa`.

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

function dossieComQsa(documentoQsa: Record<string, any>) {
  return {
    blocos: [
      {
        codigo: 'documentacao_societaria',
        nome_amigavel: 'Documentação societária',
        status: 'validado',
        documentos: [documentoQsa],
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
    if (String(text).includes('FROM public.documentos_extracoes_ia')) {
      if (params?.[0] === 'qsa-doc-1' && params?.[1] === 'qsa_extract') return { rows: [{ resultado, status: resultado.status, prompt_versao: '5.1.0' }] };
      return { rows: [] };
    }
    return { rows: [] };
  });
}

describe('montarRelatorioDocumental -- QSA usa a análise especializada da IA, não a flag manual de validado', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('NÃO mostra "Validado"/consistente para um QSA marcado validado=true no banco quando a IA não achou nenhum sócio', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    mockDocumentosExtracoesIa({
      tipo_analise: 'qsa',
      empresa_id: 'empresa-1',
      arquivo_id: 'qsa-doc-1',
      status: 'revisao_humana',
      dados_extraidos: { cnpj: '12.345.678/0001-90', socios: [] },
      alertas: [{ codigo: 'qsa_socios_nao_extraidos', mensagem: 'Nenhum sócio foi identificado no QSA.', severidade: 'alta' }],
      divergencias: [],
      nivel_confianca: 0.4,
      modelo_ia: 'gemini-2.5-flash',
      analisado_em: new Date().toISOString(),
      revisao_humana_necessaria: true,
    });

    const documentoQsa = { id: 'qsa-doc-1', tipo_documento: 'qsa', nome: 'QSA anexado', validado: true, criado_em: new Date().toISOString() };
    const relatorio = await montarRelatorioDocumental(dossieComQsa(documentoQsa));

    const item = [...relatorio.documentos_analisados, ...relatorio.documentos_pendentes_analise].find((doc: any) => doc.tipo_documento === 'qsa');
    expect(item).toBeTruthy();
    expect(item.consistente).toBe(false);
    expect(item.status).not.toBe('Validado');
    expect(item.resultado_analise.conclusao).not.toMatch(/considerado consistente/);
    expect(item.resultado_analise.socios_lidos).toEqual([]);
  });

  it('mostra o nome do sócio lido no QSA e marca consistente quando a IA confirma a leitura', async () => {
    const { montarRelatorioDocumental } = await import('../server/routes/documentacao');
    mockDocumentosExtracoesIa({
      tipo_analise: 'qsa',
      empresa_id: 'empresa-1',
      arquivo_id: 'qsa-doc-1',
      status: 'concluido',
      dados_extraidos: {
        cnpj: '12.345.678/0001-90',
        razao_social: 'PALUMA BURGER LTDA',
        socios: [{ nome: 'Jonnathas Rodrigues Pires', qualificacao: 'Sócio-Administrador', administrador: true }],
      },
      alertas: [],
      divergencias: [],
      nivel_confianca: 0.95,
      modelo_ia: 'gemini-2.5-flash',
      analisado_em: new Date().toISOString(),
      revisao_humana_necessaria: false,
    });

    const documentoQsa = { id: 'qsa-doc-1', tipo_documento: 'qsa', nome: 'QSA anexado', validado: true, criado_em: new Date().toISOString() };
    const relatorio = await montarRelatorioDocumental(dossieComQsa(documentoQsa));

    const item = [...relatorio.documentos_analisados, ...relatorio.documentos_pendentes_analise].find((doc: any) => doc.tipo_documento === 'qsa');
    expect(item).toBeTruthy();
    expect(item.consistente).toBe(true);
    expect(item.status).toBe('Validado');
    const nomes = item.resultado_analise.socios_lidos.map((socio: any) => socio.nome);
    expect(nomes).toContain('Jonnathas Rodrigues Pires');
  });
});

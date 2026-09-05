import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CORREÇÃO (31/08/2026, pedido explícito do usuário -- "quero saber o motivo
// por que que está dando pendência"): no Acervo Documental, um documento cuja
// análise automática JÁ TINHA FALHADO (status 'falhou' persistido em
// documentos_extracoes_ia -- ver executarAnaliseDocumentalEspecializada) era
// indistinguível de um documento que simplesmente ainda não tinha sido
// processado: os dois mostravam a mesma mensagem genérica "Anexo recebido,
// aguardando análise documental." / "O arquivo foi anexado, mas ainda não
// existe laudo concluído para este documento." -- exatamente o texto visto
// nas capturas de tela do usuário para "Atos da Junta Comercial" e
// "Enquadramento Tributário". O motivo real da falha já era persistido e já
// era consultado em outras telas (buscarFalhaAnaliseEspecializada); só
// faltava consultá-lo também aqui.
//
// Este teste prova que: (1) quando existe uma falha real persistida, a
// conclusão/diagnóstico agora diz isso explicitamente, citando o motivo; (2)
// quando não existe nenhuma tentativa registrada (nunca processado), o texto
// genérico "aguardando análise documental" continua exatamente como antes
// (sem regressão).
//
// ATUALIZADO (2026-09-02, Rodada 18, pedido explícito do usuário -- print
// anotado "não precisa desse tanto de texto, deixar menos poluido e sem
// repetição" apontando para o card de falha do Cartão CNPJ): `conclusao` e
// `diagnostico` passaram a receber a MESMA mensagem específica (em vez de um
// texto genérico em `conclusao` e o motivo real só em `diagnostico`), para
// que a tela (construirSecoesAnaliseDocumento) não renderize duas caixas de
// texto repetindo a mesma informação. Nenhuma das mensagens de
// `mensagemSeguraFalhaLeitura` contém literalmente a palavra "falha", então
// a asserção abaixo passou a checar (a) que os dois campos são idênticos
// (prova de que não há mais duplicação) e (b) que o conteúdo é o motivo
// real específico (mecanismo externo/gemini), não o texto genérico antigo.

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

function bloco(documento: Record<string, any>) {
  return [{ codigo: 'atos_junta_comercial', nome_amigavel: 'Atos da Junta Comercial', status: 'pendente', documentos: [documento] }];
}

describe('enriquecerDocumentosAcervoComAnalise -- distingue "falhou de verdade" de "ainda não processado"', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('quando a análise já falhou (status "falhou" persistido), a conclusão cita o motivo real -- não o texto genérico de "aguardando"', async () => {
    const { enriquecerDocumentosAcervoComAnalise } = await import('../server/routes/documentacao');
    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM information_schema.columns')) return { rows: [] };
      if (sql.includes('SELECT erros, pendencias')) {
        return { rows: [{ erros: [{ mensagem: 'gemini: 429 quota excedida' }], pendencias: [], processado_em: '2026-08-20T10:00:00Z' }] };
      }
      if (sql.includes('FROM public.documentos_extracoes_ia')) return { rows: [] };
      return { rows: [] };
    });

    const documento = { id: 'atos-1', tipo_documento: 'atos_junta_comercial', nome: 'ATOS DA JUNTA COMERCIAL.pdf', status: 'validado', validado: true, criado_em: new Date().toISOString() };
    const resultado = await enriquecerDocumentosAcervoComAnalise(bloco(documento));

    const item = resultado[0].documentos[0];
    expect(item.analisado).toBe(false);
    // conclusao e diagnostico devem ser IDÊNTICOS -- prova de que não há mais
    // duas caixas de texto repetindo a mesma falha (ver comentário acima).
    expect(item.resultado_analise.conclusao).toBe(item.resultado_analise.diagnostico);
    expect(item.resultado_analise.conclusao).toMatch(/mecanismo externo de apoio/i);
    expect(item.resultado_analise.conclusao).not.toBe('Anexo recebido, aguardando análise documental.');
    expect(item.resultado_analise.conclusao).not.toBe('Falha na análise automática deste documento.');
    expect(item.resultado_analise.diagnostico).not.toBe('O arquivo foi anexado, mas ainda não existe laudo concluído para este documento.');
  });

  it('quando não existe nenhuma tentativa registrada, mantém o texto genérico "aguardando análise documental" (sem regressão)', async () => {
    const { enriquecerDocumentosAcervoComAnalise } = await import('../server/routes/documentacao');
    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM information_schema.columns')) return { rows: [] };
      return { rows: [] };
    });

    const documento = { id: 'atos-2', tipo_documento: 'atos_junta_comercial', nome: 'ATOS DA JUNTA COMERCIAL.pdf', status: 'ativo', criado_em: new Date().toISOString() };
    const resultado = await enriquecerDocumentosAcervoComAnalise(bloco(documento));

    const item = resultado[0].documentos[0];
    expect(item.analisado).toBe(false);
    expect(item.resultado_analise.conclusao).toBe('Anexo recebido, aguardando análise documental.');
    expect(item.resultado_analise.diagnostico).toBe('O arquivo foi anexado, mas ainda não existe laudo concluído para este documento.');
  });
});

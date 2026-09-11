import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Regra de negócio (Rodada 27, 02/09/2026) -- pedido explícito do usuário,
// depois de confirmar que a correção automática do nome empresarial (Rodada
// 26) funcionou: "quero que coloque, pode ser em cada modal mesmo, um botão
// pra reler... pra reanalisar os dados. Caso não atualize automaticamente e
// também pra não precisar ficar trocando toda a documentação".
//
// Até esta rodada, depois que a Etapa 1 (Cartão CNPJ/QSA/Enquadramento
// Tributário) já tinha alguma análise registrada, não existia mais nenhum
// botão para forçar uma releitura -- só um jeito de forçar TODOS os três de
// uma vez (o botão "Analisar documentos", escondido depois da primeira
// análise) ou excluir e reanexar o mesmo arquivo (o que já dispara a
// releitura automática desde a Rodada 23). A nova rota
// `POST /empresa/:empresaId/identidade/:tipo/reler` permite reler, isolada e
// manualmente, UM dos três tipos por vez, a qualquer momento.
//
// Este teste cobre a parte de roteamento/validação da rota (testável com
// mock leve de banco, sem precisar montar toda a árvore de chamadas de
// `montarDossieCreditoEmpresa`) e a função pura `tipoIdentidadeTemReleituraManual`
// isoladamente. O caminho de sucesso (que de fato aciona
// `analisarCnpjReceitaCartaoEmpresa`/`montarQsaDocumentalDados`/
// `montarEnquadramentoDados` e remonta o dossiê) reaproveita 100% de funções
// já existentes e já cobertas indiretamente por outros testes -- verificado
// por leitura direta do código, mesma convenção já usada para
// `aplicarConfirmacaoCadastralDocumentoEmpresa`/`aplicarConfirmacaoNomeEmpresarialDocumentoEmpresa`
// (funções impuras de gravação, sem teste unitário direto neste projeto).
//
// Regra geral, válida para qualquer empresa/regime/porte: os três tipos
// aceitos nunca dependem de qual documentação aquela empresa específica
// precisa anexar -- só de o tipo pedido ser um dos três da Etapa 1.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
    connect = async () => ({ query: mocks.poolQuery, release: () => undefined });
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});
vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({ analisarCnpjReceitaCartaoEmpresa: vi.fn(), buscarUltimaAnaliseCnpjEmpresa: vi.fn(), limparAnalisesCnpjEmpresa: vi.fn() }));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({ analiseDocumentalService: { analisarQSA: vi.fn(), analisarSimplesNacional: vi.fn(), analisarAtosJuntaComercial: vi.fn(), analisarContratoComAtosJunta: vi.fn(), analisarDocumentoCatalogado: vi.fn() } }));

function appTeste(documentacaoRouter: any) {
  const app = express();
  app.use(express.json());
  app.use('/api/documentacao', documentacaoRouter);
  return app;
}

describe('tipoIdentidadeTemReleituraManual — gate puro da releitura manual (Rodada 27)', () => {
  it('autoriza releitura manual para os três tipos da Etapa 1', async () => {
    const { tipoIdentidadeTemReleituraManual } = await import('../server/routes/documentacao');
    for (const tipo of ['cartao_cnpj', 'qsa', 'enquadramento_tributario_cnpj']) {
      expect(tipoIdentidadeTemReleituraManual(tipo)).toBe(true);
    }
  });

  it('nega para qualquer outro tipo de documento catalogado, ou string vazia/inválida', async () => {
    const { tipoIdentidadeTemReleituraManual } = await import('../server/routes/documentacao');
    for (const tipo of ['scr', 'ccs', 'ccf', 'atos_junta_comercial', 'contrato_social', 'simples_nacional', 'cnpj_cartao', '']) {
      expect(tipoIdentidadeTemReleituraManual(tipo)).toBe(false);
    }
  });
});

describe('POST /empresa/:empresaId/identidade/:tipo/reler — validações de rota', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recusa com 422 um tipo fora dos três aceitos, sem nenhuma consulta ao banco', async () => {
    const documentacaoRouter = (await import('../server/routes/documentacao')).default;
    mocks.poolQuery.mockImplementation(async () => {
      throw new Error('Não deveria consultar o banco para um tipo inválido');
    });

    const response = await request(appTeste(documentacaoRouter))
      .post('/api/documentacao/empresa/empresa-1/identidade/scr/reler')
      .send({});

    expect(response.status).toBe(422);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('responde 404 quando a empresa não existe', async () => {
    const documentacaoRouter = (await import('../server/routes/documentacao')).default;
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (String(text).includes('FROM public.empresas')) return { rows: [] };
      return { rows: [] };
    });

    const response = await request(appTeste(documentacaoRouter))
      .post('/api/documentacao/empresa/empresa-inexistente/identidade/cartao_cnpj/reler')
      .send({});

    expect(response.status).toBe(404);
  });

  it.each([
    ['cartao_cnpj', 'Cartão CNPJ'],
    ['qsa', 'QSA'],
    ['enquadramento_tributario_cnpj', 'Enquadramento Tributário'],
  ])('responde 422 pedindo para anexar o documento quando %s ainda não foi anexado', async (tipo, _label) => {
    const documentacaoRouter = (await import('../server/routes/documentacao')).default;
    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM public.empresas')) return { rows: [{ id: 'empresa-1', cnpj: '11222333000181' }] };
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM public.documentos_arquivos') && sql.includes('tipo_documento = ANY')) return { rows: [] };
      return { rows: [] };
    });

    const response = await request(appTeste(documentacaoRouter))
      .post(`/api/documentacao/empresa/empresa-1/identidade/${tipo}/reler`)
      .send({});

    expect(response.status).toBe(422);
    expect(response.body?.error || '').toMatch(/anexe/i);
  });
});

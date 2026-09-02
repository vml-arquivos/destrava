import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regra de negócio (2026-09-02, Rodada 17 -- ver comentário completo em
// tests/leituraAutomaticaQsaEnquadramentoAlimentaEtapa1.test.ts e em
// server/routes/documentos.ts, `TIPOS_ETAPA1_PROMPT_CODIGO`): este teste
// prova a outra ponta da correção -- que a leitura automática disparada pelo
// próprio upload (`agendarAnaliseRegraDocumental`) realmente grava o laudo em
// `documentos_extracoes_ia` (via `persistirAnaliseEspecializada`, importada
// de server/routes/documentacao.ts), para QSA e para Enquadramento
// Tributário/Simples Nacional -- os dois blocos que o print da tela em
// produção mostrou presos em "aguardando análise" mesmo já lidos. Sem essa
// gravação, a Etapa 1 nunca saberia que a leitura automática já tinha
// concluído (ver o outro teste para a prova de que a leitura, uma vez
// gravada, já é suficiente).
//
// A regra testada é genérica -- aplica-se a qualquer empresa/tipo de
// documento coberto por TIPOS_ETAPA1_PROMPT_CODIGO, não a uma empresa
// específica; os dois casos abaixo (QSA e Enquadramento Tributário) cobrem
// os dois tipos de documento envolvidos no print original.

const EMPRESA_ID = '74ab11d8-f53f-46b0-b4d7-48abef7c7ff6';
const USER_ID = '9c1c8b8e-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  saveDocumentBuffer: vi.fn(),
  analisarQSA: vi.fn(),
  analisarSimplesNacional: vi.fn(),
  persistirAnaliseEspecializada: vi.fn(),
}));

vi.mock('pg', () => {
  class PoolMock { query = mocks.poolQuery; }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock('../server/middleware/auth', () => ({
  auth: (req: any, _res: any, next: any) => {
    req.colaborador = { id: USER_ID, role: 'colaborador' };
    next();
  },
}));

vi.mock('../server/services/documentStorage', () => ({
  PersistentStorageError: class PersistentStorageError extends Error {
    statusCode = 503;
  },
  getDocumentStorageHealth: vi.fn(),
  resolveDocumentPath: vi.fn(() => ({ absolutePath: null, relativePath: null, candidates: [] })),
  saveDocumentBuffer: mocks.saveDocumentBuffer,
}));

vi.mock('../server/services/analiseDocumentalEspecializada', async (importOriginal) => {
  const original = await importOriginal<typeof import('../server/services/analiseDocumentalEspecializada')>();
  return {
    ...original,
    analiseDocumentalService: {
      ...original.analiseDocumentalService,
      analisarQSA: mocks.analisarQSA,
      analisarSimplesNacional: mocks.analisarSimplesNacional,
    },
  };
});

vi.mock('../server/routes/documentacao', async (importOriginal) => {
  const original = await importOriginal<typeof import('../server/routes/documentacao')>();
  return { ...original, persistirAnaliseEspecializada: mocks.persistirAnaliseEspecializada };
});

async function subirDocumento(tipoDocumento: string, documentoId: string) {
  mocks.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('information_schema.tables')) return { rows: [{ 1: 1 }] };
    if (sql.includes('FROM public.empresas')) return { rows: [{ 1: 1 }] };
    if (sql.includes('INSERT INTO public.documentos_arquivos')) {
      return {
        rows: [{
          id: documentoId,
          entidade_tipo: 'empresa',
          entidade_id: EMPRESA_ID,
          empresa_id: EMPRESA_ID,
          tipo_documento: tipoDocumento,
          status: 'ativo',
        }],
      };
    }
    if (sql.includes('UPDATE public.documentos_arquivos')) return { rows: [] };
    throw new Error(`SQL inesperado no teste: ${sql.slice(0, 120)}`);
  });

  const { default: documentosRouter } = await import('../server/routes/documentos');
  const app = express();
  app.use(express.json());
  app.use('/api/documentos', documentosRouter);

  return request(app)
    .post('/api/documentos/upload')
    .field('entidade_tipo', 'empresa')
    .field('entidade_id', EMPRESA_ID)
    .field('tipo_documento', tipoDocumento)
    .attach('file', Buffer.from('%PDF-1.4 conteudo de teste'), { filename: `${tipoDocumento}.pdf`, contentType: 'application/pdf' });
}

describe('upload de QSA/Enquadramento Tributário já alimenta a Etapa 1 sem esperar "Iniciar análise documental"', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    mocks.saveDocumentBuffer.mockReset();
    mocks.analisarQSA.mockReset();
    mocks.analisarSimplesNacional.mockReset();
    mocks.persistirAnaliseEspecializada.mockReset();

    mocks.saveDocumentBuffer.mockResolvedValue({ relativePath: 'empresa/doc.pdf', absolutePath: '/tmp/empresa/doc.pdf' });
    mocks.persistirAnaliseEspecializada.mockResolvedValue(undefined);
  });

  it('QSA: a leitura automática do upload grava o laudo em documentos_extracoes_ia com o promptCodigo "qsa_extract"', async () => {
    const documentoId = 'doc-qsa-auto-1';
    mocks.analisarQSA.mockResolvedValue({
      tipo_analise: 'qsa', status: 'concluido', modelo_ia: 'teste', nivel_confianca: 0.9,
      dados_extraidos: { socios: [] }, alertas: [], revisao_humana_necessaria: false,
    });

    const resposta = await subirDocumento('qsa', documentoId);
    expect(resposta.status).toBe(201);

    // A leitura automática roda em segundo plano (setTimeout(0), depois da
    // resposta do upload já enviada) -- aguarda ela terminar.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mocks.analisarQSA).toHaveBeenCalledWith(EMPRESA_ID, documentoId);
    expect(mocks.persistirAnaliseEspecializada).toHaveBeenCalledWith(
      documentoId,
      'qsa_extract',
      expect.objectContaining({ tipo_analise: 'qsa', status: 'concluido' }),
    );
  });

  it('Enquadramento Tributário (consulta CNPJ): a leitura automática do upload grava o laudo em documentos_extracoes_ia com o promptCodigo "simples_extract"', async () => {
    const documentoId = 'doc-enquadramento-auto-1';
    mocks.analisarSimplesNacional.mockResolvedValue({
      tipo_analise: 'simples_nacional', status: 'concluido', modelo_ia: 'teste', nivel_confianca: 0.9,
      dados_extraidos: { regime_tributario: 'MEI' }, alertas: [], revisao_humana_necessaria: false,
    });

    const resposta = await subirDocumento('enquadramento_tributario_cnpj', documentoId);
    expect(resposta.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mocks.analisarSimplesNacional).toHaveBeenCalledWith(EMPRESA_ID, documentoId);
    expect(mocks.persistirAnaliseEspecializada).toHaveBeenCalledWith(
      documentoId,
      'simples_extract',
      expect.objectContaining({ tipo_analise: 'simples_nacional', status: 'concluido' }),
    );
  });
});

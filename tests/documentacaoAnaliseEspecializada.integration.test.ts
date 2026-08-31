import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  analisarQSA: vi.fn(),
  analisarSimples: vi.fn(),
  analisarAtos: vi.fn(),
  analisarGenerico: vi.fn(),
}));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
    connect = mocks.connect;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock('../server/middleware/auth', () => ({
  auth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({
  analisarCnpjReceitaCartaoEmpresa: vi.fn(),
  buscarUltimaAnaliseCnpjEmpresa: vi.fn(),
  limparAnalisesCnpjEmpresa: vi.fn(),
}));

vi.mock('../server/services/analiseDocumentalEspecializada', () => ({
  analiseDocumentalService: {
    analisarQSA: mocks.analisarQSA,
    analisarSimplesNacional: mocks.analisarSimples,
    analisarAtosJuntaComercial: mocks.analisarAtos,
    analisarDocumentoCatalogado: mocks.analisarGenerico,
  },
}));

import documentacaoRouter from '../server/routes/documentacao';

function appTeste() {
  const app = express();
  app.use(express.json());
  app.use('/api/documentacao', documentacaoRouter);
  return app;
}

const resultadoQsa = {
  tipo_analise: 'qsa',
  empresa_id: 'empresa-1',
  arquivo_id: 'doc-1',
  status: 'revisao_humana',
  dados_extraidos: { cnpj: '12.345.678/0001-90' },
  alertas: [{ codigo: 'qsa_teste', mensagem: 'Divergência', severidade: 'alta' }],
  divergencias: [],
  nivel_confianca: 0.9,
  modelo_ia: 'gemini-2.5-flash',
  analisado_em: new Date().toISOString(),
  revisao_humana_necessaria: true,
};

describe('POST /api/documentacao/ia/documentos/:documentoId/extrair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
    mocks.analisarQSA.mockResolvedValue(resultadoQsa);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('usa prompt canônico, registra de forma idempotente e processa QSA em segundo plano', async () => {
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_arquivos')) {
        return { rows: [{ id: 'doc-1', empresa_id: 'empresa-1', entidade_id: 'empresa-1', entidade_tipo: 'empresa', tipo_documento: 'qsa' }] };
      }
      return { rows: [] };
    });
    mocks.clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_extracoes_ia')) return { rows: [] };
      if (text.includes('INSERT INTO public.documentos_extracoes_ia')) {
        return { rows: [{ id: 'extracao-1', arquivo_id: 'doc-1', prompt_codigo: 'qsa_extract', status: 'pendente' }] };
      }
      return { rows: [] };
    });

    const response = await request(appTeste())
      .post('/api/documentacao/ia/documentos/doc-1/extrair')
      .send({ prompt_codigo: 'prompt_inseguro_ignorado' });

    expect(response.status).toBe(202);
    expect(response.body.tipo_analise).toBe('qsa');
    expect(response.body.extracao.prompt_codigo).toBe('qsa_extract');
    const insertCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO public.documentos_extracoes_ia'));
    expect(insertCall?.[1]?.[2]).toBe('qsa_extract');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.analisarQSA).toHaveBeenCalledWith('empresa-1', 'doc-1');
    expect(mocks.poolQuery.mock.calls.some(([sql]) => String(sql).includes("SET status = 'processando'"))).toBe(true);
    expect(mocks.poolQuery.mock.calls.some(([sql]) => String(sql).includes('campos_extraidos = $4::jsonb'))).toBe(true);
  });


  it('reconhece o comprovante de enquadramento como análise do Simples Nacional', async () => {
    mocks.analisarSimples.mockResolvedValue({
      ...resultadoQsa,
      tipo_analise: 'simples_nacional',
      dados_extraidos: { cnpj: '12.345.678/0001-90', situacao_simples: 'Optante' },
      alertas: [],
      status: 'concluido',
    });
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_arquivos')) {
        return { rows: [{ id: 'doc-simples', empresa_id: 'empresa-1', entidade_id: 'empresa-1', entidade_tipo: 'empresa', tipo_documento: 'enquadramento_tributario_cnpj' }] };
      }
      return { rows: [] };
    });
    mocks.clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_extracoes_ia')) return { rows: [] };
      if (text.includes('INSERT INTO public.documentos_extracoes_ia')) {
        return { rows: [{ id: 'extracao-simples', arquivo_id: 'doc-simples', prompt_codigo: 'simples_extract', status: 'pendente' }] };
      }
      return { rows: [] };
    });

    const response = await request(appTeste())
      .post('/api/documentacao/ia/documentos/doc-simples/extrair')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.tipo_analise).toBe('simples_nacional');
    expect(response.body.extracao.prompt_codigo).toBe('simples_extract');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.analisarSimples).toHaveBeenCalledWith('empresa-1', 'doc-simples');
  });

  it('não dispara análise duplicada quando já existe extração pendente recente', async () => {
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_arquivos')) {
        return { rows: [{ id: 'doc-1', empresa_id: 'empresa-1', entidade_id: 'empresa-1', entidade_tipo: 'empresa', tipo_documento: 'qsa' }] };
      }
      return { rows: [] };
    });
    mocks.clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_extracoes_ia')) {
        // prompt_versao precisa bater com a versão atual do prompt QSA (ver
        // versaoPromptDocumental/qsa_extract em documentacao.ts) -- do contrário
        // a extração é tratada como de uma versão anterior e reprocessada, o que
        // é o comportamento correto pós-deploy de uma correção do parser, não
        // uma duplicidade indevida. Este teste cobre o caso de dedup dentro da
        // MESMA versão do prompt.
        return { rows: [{ id: 'extracao-1', arquivo_id: 'doc-1', prompt_codigo: 'qsa_extract', prompt_versao: '5.1.0', status: 'pendente', atualizado_em: new Date().toISOString() }] };
      }
      if (text.includes('UPDATE public.documentos_extracoes_ia')) {
        return { rows: [{ id: 'extracao-1', arquivo_id: 'doc-1', prompt_codigo: 'qsa_extract', status: 'pendente' }] };
      }
      return { rows: [] };
    });

    const response = await request(appTeste())
      .post('/api/documentacao/ia/documentos/doc-1/extrair')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.message).toBe('Documento já está em processamento.');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.analisarQSA).not.toHaveBeenCalled();
  });

  it('processa tipos novos do catálogo pelo analisador genérico sem perder revisão humana', async () => {
    mocks.analisarGenerico.mockResolvedValue({
      ...resultadoQsa,
      tipo_analise: 'documento_generico',
      tipo_documento: 'balanco',
      tipo_documento_canonico: 'balanco',
      dados_extraidos: { campos_comprovados: { ativo_circulante: 1000 }, evidencias: [] },
      evidencias: [],
      campos_inferidos: {},
      status: 'revisao_humana',
    });
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_arquivos')) {
        return { rows: [{ id: 'doc-2', empresa_id: 'empresa-1', entidade_id: 'empresa-1', entidade_tipo: 'empresa', tipo_documento: 'balanco' }] };
      }
      return { rows: [] };
    });
    mocks.clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_extracoes_ia')) return { rows: [] };
      if (text.includes('INSERT INTO public.documentos_extracoes_ia')) {
        return { rows: [{ id: 'extracao-generica', arquivo_id: 'doc-2', prompt_codigo: 'balanco_extract', status: 'pendente' }] };
      }
      return { rows: [] };
    });

    const response = await request(appTeste())
      .post('/api/documentacao/ia/documentos/doc-2/extrair')
      .send({ prompt_codigo: 'balanco_extract' });

    expect(response.status).toBe(202);
    expect(response.body.tipo_analise).toBe('documento_generico');
    expect(response.body.extracao.prompt_codigo).toBe('balanco_extract');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mocks.analisarGenerico).toHaveBeenCalledWith('empresa-1', 'doc-2', 'balanco');
  });

  // CORREÇÃO (2026-08-31, bug real reportado em produção): um documento já
  // analisado (ex.: ECF) com laudo "concluido" persistido de ANTES de uma
  // correção do motor de análise (ex.: a correção de identidade documental
  // desta sessão) precisa poder ser relido sem reanexar o arquivo -- senão
  // deployar a correção no servidor não muda em nada o que já foi lido.
  // Este teste prova que /extrair dispara nova análise mesmo quando já
  // existe um laudo "concluido" (não só quando não existe análise nenhuma
  // ou quando está "pendente"/"processando").
  it('reprocessa um documento já concluído (ex.: ECF) quando /extrair é chamado de novo -- correção do motor pós-deploy não fica presa no laudo antigo', async () => {
    mocks.analisarGenerico.mockResolvedValue({
      ...resultadoQsa,
      tipo_analise: 'documento_generico',
      tipo_documento: 'ecf',
      tipo_documento_canonico: 'ecf',
      dados_extraidos: { documento_compativel: false, tipo_detectado: null, tipo_esperado: 'ecf' },
      alertas: [{ codigo: 'documento_catalogado_incompativel', mensagem: 'O arquivo não foi reconhecido como ECF (Escrituração Contábil Fiscal).', severidade: 'alta' }],
      status: 'revisao_humana',
    });
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_arquivos')) {
        return { rows: [{ id: 'doc-ecf-antigo', empresa_id: 'empresa-1', entidade_id: 'empresa-1', entidade_tipo: 'empresa', tipo_documento: 'ecf' }] };
      }
      return { rows: [] };
    });
    mocks.clientQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM public.documentos_extracoes_ia')) {
        // Laudo antigo já CONCLUÍDO (não pendente/processando) -- exatamente o
        // caso de um PGDAS lido como "válido" pelo motor antigo antes da
        // correção de identidade documental ser deployada.
        return { rows: [{ id: 'extracao-ecf-1', arquivo_id: 'doc-ecf-antigo', prompt_codigo: 'ecf_extract', prompt_versao: '1.0.0', status: 'concluido', atualizado_em: new Date(Date.now() - 60 * 60 * 1000).toISOString() }] };
      }
      if (text.includes('UPDATE public.documentos_extracoes_ia')) {
        return { rows: [{ id: 'extracao-ecf-1', arquivo_id: 'doc-ecf-antigo', prompt_codigo: 'ecf_extract', status: 'pendente' }] };
      }
      return { rows: [] };
    });

    const response = await request(appTeste())
      .post('/api/documentacao/ia/documentos/doc-ecf-antigo/extrair')
      .send({});

    expect(response.status).toBe(202);
    expect(response.body.message).toBe('Processamento especializado registrado como pendente.');
    await new Promise((resolve) => setTimeout(resolve, 20));
    // A garantia central deste teste: mesmo com um laudo "concluido" já
    // persistido, a nova chamada dispara `analisarDocumentoCatalogado` de
    // novo -- o resultado antigo nunca fica congelado para sempre.
    expect(mocks.analisarGenerico).toHaveBeenCalledWith('empresa-1', 'doc-ecf-antigo', 'ecf');
  });
});

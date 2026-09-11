import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// CORREÇÃO (Rodada 25, 09/09/2026 -- pedido explícito do usuário, com print
// real mostrando "Documentos dos sócios" ainda travado em 0/14 depois da
// Rodada 24): a Rodada 24 ligou a reconciliação do titular de Empresário
// Individual/MEI (`garantirTitularEmpresaIndividual`) só dentro do dossiê
// (`montarDossieCreditoEmpresa`). Mas a tela de Acervo Documental
// (`DocumentosEntidade.tsx`) NÃO lê a lista de sócios do dossiê -- ela busca
// direto em `GET /api/empresas/:id/socios` (`server/routes/socios_documentos.ts`),
// de forma totalmente independente. Por isso o bug continuava: o titular
// nunca era criado no caminho que a tela realmente usa. Este teste garante
// que ESSA rota também aciona a reconciliação.

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  getEmpresa: vi.fn(),
  garantirTitularEmpresaIndividual: vi.fn(),
}));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock('../server/middleware/auth', () => ({
  auth: (req: any, _res: any, next: any) => {
    req.colaborador = { id: 'colab-1', perfil: 'admin' };
    next();
  },
}));

vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));

// Mocka o módulo inteiro que a rota importa dinamicamente -- controla
// exatamente o que `getEmpresa`/`garantirTitularEmpresaIndividual` devolvem,
// sem precisar montar o dossiê inteiro (CNPJ/QSA/enquadramento/societário).
vi.mock('../server/routes/documentacao', () => ({
  getEmpresa: mocks.getEmpresa,
  garantirTitularEmpresaIndividual: mocks.garantirTitularEmpresaIndividual,
}));

const EMPRESA_ID = '74ab11d8-f53f-46b0-b4d7-48abef7c7ff6';
const EMPRESA_MEI = { id: EMPRESA_ID, natureza_juridica: 'Empresário Individual', opcao_mei: true };

function setupPoolMock(sociosPorChamada: any[][]) {
  let chamadaSelectSocios = 0;
  mocks.poolQuery.mockImplementation(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    if (text.includes('CREATE EXTENSION') || text.includes('CREATE TABLE') || text.includes('ALTER TABLE') || text.includes('CREATE INDEX')) {
      return { rows: [] };
    }
    if (text.includes('information_schema.columns')) return { rows: [] };
    if (text.includes('FROM empresas WHERE id=$1')) return { rows: [{ 1: 1 }] }; // empresaExiste -> true
    if (text.startsWith('SELECT * FROM socios_empresa')) {
      const rows = sociosPorChamada[chamadaSelectSocios] ?? sociosPorChamada[sociosPorChamada.length - 1] ?? [];
      chamadaSelectSocios += 1;
      return { rows };
    }
    return { rows: [] };
  });
}

async function buildApp() {
  const { default: sociosRouter } = await import('../server/routes/socios_documentos');
  const app = express();
  app.use(express.json());
  app.use('/api/empresas', sociosRouter);
  return app;
}

describe('GET /api/empresas/:id/socios -- reconciliação do titular de empresa individual/MEI', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    mocks.getEmpresa.mockReset();
    mocks.garantirTitularEmpresaIndividual.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('empresa MEI sem nenhum sócio: chama a reconciliação e, se ela criar o titular, relê socios_empresa e devolve o titular já criado', async () => {
    setupPoolMock([[], [{ id: 'titular-1', empresa_id: EMPRESA_ID, nome: 'Titular da empresa (nome a confirmar)', fonte_dados: 'titular_empresa_individual_auto' }]]);
    mocks.getEmpresa.mockResolvedValue(EMPRESA_MEI);
    mocks.garantirTitularEmpresaIndividual.mockResolvedValue(true);

    const app = await buildApp();
    const res = await request(app).get(`/api/empresas/${EMPRESA_ID}/socios`);

    expect(res.status).toBe(200);
    expect(mocks.getEmpresa).toHaveBeenCalledWith(EMPRESA_ID);
    expect(mocks.garantirTitularEmpresaIndividual).toHaveBeenCalledWith(EMPRESA_ID, EMPRESA_MEI, []);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nome).toBe('Titular da empresa (nome a confirmar)');
  });

  it('quando a reconciliação não muda nada (retorna false), não relê socios_empresa de novo', async () => {
    const sociosExistentes = [{ id: 'socio-1', empresa_id: EMPRESA_ID, nome: 'Sócio Já Cadastrado' }];
    setupPoolMock([sociosExistentes]);
    mocks.getEmpresa.mockResolvedValue(EMPRESA_MEI);
    mocks.garantirTitularEmpresaIndividual.mockResolvedValue(false);

    const app = await buildApp();
    const res = await request(app).get(`/api/empresas/${EMPRESA_ID}/socios`);

    expect(res.status).toBe(200);
    const chamadasSelectSocios = mocks.poolQuery.mock.calls.filter(([sql]) => String(sql).startsWith('SELECT * FROM socios_empresa'));
    expect(chamadasSelectSocios).toHaveLength(1);
    expect(res.body[0].nome).toBe('Sócio Já Cadastrado');
  });

  it('LTDA (não é empresa individual): a reconciliação é chamada (decide sozinha que não se aplica) mas nunca recria a lista', async () => {
    const sociosExistentes = [{ id: 'socio-1', empresa_id: EMPRESA_ID, nome: 'Sócio LTDA' }];
    setupPoolMock([sociosExistentes]);
    mocks.getEmpresa.mockResolvedValue({ id: EMPRESA_ID, natureza_juridica: 'Sociedade Empresária Limitada' });
    mocks.garantirTitularEmpresaIndividual.mockResolvedValue(false);

    const app = await buildApp();
    const res = await request(app).get(`/api/empresas/${EMPRESA_ID}/socios`);

    expect(res.status).toBe(200);
    expect(res.body[0].nome).toBe('Sócio LTDA');
  });

  it('falha na reconciliação não derruba a listagem de sócios (best-effort)', async () => {
    const sociosExistentes = [{ id: 'socio-1', empresa_id: EMPRESA_ID, nome: 'Sócio Existente' }];
    setupPoolMock([sociosExistentes]);
    mocks.getEmpresa.mockRejectedValue(new Error('falha de conexão'));

    const app = await buildApp();
    const res = await request(app).get(`/api/empresas/${EMPRESA_ID}/socios`);

    expect(res.status).toBe(200);
    expect(res.body[0].nome).toBe('Sócio Existente');
  });
});

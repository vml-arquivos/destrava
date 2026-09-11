import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Regressão do bug "Erro ao atualizar sócio": o frontend mostra um sócio-administrador
// "inferido" (id sintético "socio-admin-<empresaId>") enquanto a empresa não tem nenhum
// sócio real salvo. Se esse id sintético chegar num PUT /:id/socios/:sid, o Postgres
// rejeita com 22P02 (invalid input syntax for type uuid) e a rota devolvia um 500 cru.
// Este teste garante que a rota passa a responder 404 de forma limpa para ids inválidos,
// e continua funcionando normalmente (200) para um UUID real -- sem regressão.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

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

const EMPRESA_ID = '74ab11d8-f53f-46b0-b4d7-48abef7c7ff6';
const SOCIO_ID_REAL = '1c9d662d-38b8-4435-bc1b-3bdd673e2b2a';
const SOCIO_ID_SINTETICO = `socio-admin-${EMPRESA_ID}`;

const SOCIO_COLUMNS = [
  'empresa_id', 'nome', 'cpf_cnpj', 'qualificacao_socio', 'percentual_capital', 'representante_legal',
  'nome_representante', 'qualificacao_representante', 'data_entrada_sociedade', 'pais', 'rg',
  'rg_orgao_emissor', 'rg_uf_emissao', 'rg_data_emissao', 'data_nascimento', 'nacionalidade',
  'estado_civil', 'profissao', 'email', 'telefone', 'whatsapp', 'cep', 'logradouro', 'numero',
  'complemento', 'bairro', 'cidade', 'uf', 'conjuge_nome', 'conjuge_cpf', 'conjuge_rg',
  'conjuge_data_nasc', 'conjuge_profissao', 'conjuge_email', 'conjuge_telefone', 'regime_bens',
  'pep', 'ativo', 'fonte_dados', 'cpf_completo_manual', 'cpf_validado', 'cpf_fonte',
  'ultima_atualizacao_pessoal', 'assinante_contrato', 'pendencias_contrato', 'cadastro_completo_contrato',
  'dados_extra', 'genero', 'cpfhub_consultado_at', 'cpfhub_status', 'cpfcnpj_consultado_at',
  'cpfcnpj_status', 'cpfcnpj_fonte', 'cpfcnpj_payload_resumo',
];

function setupPoolMock() {
  mocks.poolQuery.mockImplementation(async (sql: string, _params?: unknown[]) => {
    const text = String(sql);
    if (text.includes('CREATE EXTENSION') || text.includes('CREATE TABLE') || text.includes('ALTER TABLE') || text.includes('CREATE INDEX')) {
      return { rows: [] };
    }
    if (text.includes("information_schema.columns")) {
      return { rows: SOCIO_COLUMNS.map((column_name) => ({ column_name })) };
    }
    if (text.includes('FROM empresas WHERE id=$1')) {
      return { rows: [{ 1: 1 }] }; // empresaExiste -> true
    }
    if (text.startsWith('UPDATE public.socios_empresa')) {
      return { rows: [{ id: SOCIO_ID_REAL, empresa_id: EMPRESA_ID, nome: 'Sócio Real Atualizado' }] };
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

describe('PUT /api/empresas/:id/socios/:sid', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    setupPoolMock();
  });
  afterEach(() => vi.clearAllMocks());

  it('devolve 404 tratado (não um 500 cru do Postgres) quando o id é o sócio-administrador inferido/sintético', async () => {
    const app = await buildApp();
    const res = await request(app)
      .put(`/api/empresas/${EMPRESA_ID}/socios/${SOCIO_ID_SINTETICO}`)
      .send({ nome: 'Paluma Burger', email: 'paluma@gmail.com' });

    expect(res.status).toBe(404);
    expect(res.body.error).not.toMatch(/erro ao atualizar sócio/i);
    expect(res.body.code).toBe('SOCIO_NAO_CADASTRADO');
    // Nenhuma query UPDATE deve ter sido tentada contra o Postgres com o id inválido.
    expect(mocks.poolQuery.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE public.socios_empresa'))).toBe(false);
  });

  it('continua atualizando normalmente um sócio real (UUID válido) -- zero regressão', async () => {
    const app = await buildApp();
    const res = await request(app)
      .put(`/api/empresas/${EMPRESA_ID}/socios/${SOCIO_ID_REAL}`)
      .send({ nome: 'Sócio Real Atualizado', email: 'socio@exemplo.com' });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Sócio Real Atualizado');
  });
});

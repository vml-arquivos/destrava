import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regra de negócio: ordem obrigatória de leitura das consultas cadastrais --
// 1º SCR/Registrato, 2º CCS, 3º CCF -- tanto para CNPJ quanto para CPF (por sócio).
// Antes desta correção os três campos eram totalmente independentes: nada no backend
// impedia anexar o CCF sem nunca ter anexado o SCR ou o CCS (a frase "Sequência de
// análise: SCR, CCS e CCF" era só um texto informativo na tela, sem nenhuma imposição
// de código). Este teste cobre a validação `assertOrdemConsultaCadastralPermitida`,
// usada dentro de POST /api/documentos/upload antes de gravar o arquivo.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

const EMPRESA_ID = '74ab11d8-f53f-46b0-b4d7-48abef7c7ff6';
const SOCIO_ID = '1c9d662d-38b8-4435-bc1b-3bdd673e2b2a';

describe('assertOrdemConsultaCadastralPermitida', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it('não bloqueia tipos fora da sequência controlada (ex: SCR em si, ou qualquer outro documento)', async () => {
    const { assertOrdemConsultaCadastralPermitida } = await import('../server/routes/documentos');
    await expect(assertOrdemConsultaCadastralPermitida('rating_bacen_cnpj', EMPRESA_ID, null)).resolves.toBeUndefined();
    await expect(assertOrdemConsultaCadastralPermitida('cartao_cnpj', EMPRESA_ID, null)).resolves.toBeUndefined();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('bloqueia CCS (CNPJ) quando não há SCR/Registrato anexado para a empresa', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const { assertOrdemConsultaCadastralPermitida } = await import('../server/routes/documentos');
    await expect(assertOrdemConsultaCadastralPermitida('ccs_cnpj', EMPRESA_ID, null))
      .rejects.toMatchObject({ code: 'ORDEM_CONSULTA_CADASTRAL_REQUERIDA', statusCode: 423 });
  });

  it('libera CCS (CNPJ) quando já existe SCR/Registrato anexado para a empresa', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ 1: 1 }] });
    const { assertOrdemConsultaCadastralPermitida } = await import('../server/routes/documentos');
    await expect(assertOrdemConsultaCadastralPermitida('ccs_cnpj', EMPRESA_ID, null)).resolves.toBeUndefined();
    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(String(sql)).toContain('empresa_id = $2');
    expect(params).toEqual([['rating_bacen_cnpj', 'scr_cnpj'], EMPRESA_ID]);
  });

  it('bloqueia CCF (CNPJ) quando não há CCS anexado, mesmo que exista SCR', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const { assertOrdemConsultaCadastralPermitida } = await import('../server/routes/documentos');
    await expect(assertOrdemConsultaCadastralPermitida('ccf_cnpj', EMPRESA_ID, null))
      .rejects.toMatchObject({ code: 'ORDEM_CONSULTA_CADASTRAL_REQUERIDA' });
    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(params).toEqual([['ccs_cnpj'], EMPRESA_ID]);
  });

  it('escopa CCS/CCF (CPF) por sócio -- SCR anexado para outro sócio não libera este', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    const { assertOrdemConsultaCadastralPermitida } = await import('../server/routes/documentos');
    await expect(assertOrdemConsultaCadastralPermitida('ccs_cpf', EMPRESA_ID, SOCIO_ID))
      .rejects.toMatchObject({ code: 'ORDEM_CONSULTA_CADASTRAL_REQUERIDA' });
    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(String(sql)).toContain('socio_id = $2');
    expect(params).toEqual([['rating_bacen_cpf', 'scr_cpf'], SOCIO_ID]);
  });

  it('libera CCS (CPF) quando o SCR já foi anexado para o mesmo sócio', async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ 1: 1 }] });
    const { assertOrdemConsultaCadastralPermitida } = await import('../server/routes/documentos');
    await expect(assertOrdemConsultaCadastralPermitida('ccs_cpf', EMPRESA_ID, SOCIO_ID)).resolves.toBeUndefined();
  });

  it('não bloqueia por segurança quando falta contexto (sem empresa_id ou sem socio_id) em vez de travar o upload por engano', async () => {
    const { assertOrdemConsultaCadastralPermitida } = await import('../server/routes/documentos');
    await expect(assertOrdemConsultaCadastralPermitida('ccs_cnpj', null, null)).resolves.toBeUndefined();
    await expect(assertOrdemConsultaCadastralPermitida('ccs_cpf', EMPRESA_ID, null)).resolves.toBeUndefined();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});

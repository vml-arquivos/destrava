import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regressão da lacuna "multi-sócio": antes desta correção, o QSA extraído do
// documento (PDF/OCR) só era COMPARADO contra `socios_empresa` (gerando alertas de
// divergência) -- nunca criava um sócio novo lá. Se a sincronização com a Receita
// estivesse incompleta e o QSA físico mostrasse um segundo sócio, esse sócio nunca
// aparecia na aba "Documentação dos Sócios" (que lê exclusivamente de
// `socios_empresa`), então nenhum campo de documento pessoal era exibido para ele.
// `sincronizarSociosExtraidosDoQsa` concilia os sócios do QSA com `socios_empresa`
// via `upsertSocioEmpresa` -- este teste garante que ela (a) chama o upsert para
// cada sócio com nome válido, (b) nunca envia dado pessoal (CPF, RG, endereço...)
// extraído do QSA, preservando a regra "Fase 1 = zero dados pessoais", e (c) nunca
// deixa uma falha de conciliação estourar para quem chamou.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn().mockResolvedValue({ rows: [] }), upsertSocioEmpresa: vi.fn().mockResolvedValue({ id: 'novo-socio' }) }));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock('../server/routes/socios_documentos', () => ({
  upsertSocioEmpresa: mocks.upsertSocioEmpresa,
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn(), use: vi.fn() },
}));

const EMPRESA_ID = '74ab11d8-f53f-46b0-b4d7-48abef7c7ff6';

describe('sincronizarSociosExtraidosDoQsa', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockClear();
    mocks.upsertSocioEmpresa.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('concilia cada sócio do QSA com socios_empresa, enviando só nome/qualificação/administrador', async () => {
    const { sincronizarSociosExtraidosDoQsa } = await import('../server/routes/documentacao');
    await sincronizarSociosExtraidosDoQsa(EMPRESA_ID, [
      { nome: 'Jonnathas Rodrigues Pires', qualificacao: 'Sócio-Administrador', administrador: true, cpf: '123.456.789-00' },
      { nome: 'Maria Souza', qualificacao: 'Sócia', administrador: false },
    ]);

    expect(mocks.upsertSocioEmpresa).toHaveBeenCalledTimes(2);
    const [empresaId1, payload1] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(empresaId1).toBe(EMPRESA_ID);
    expect(payload1).toMatchObject({ nome: 'Jonnathas Rodrigues Pires', qualificacao_socio: 'Sócio-Administrador', representante_legal: true, fonte_dados: 'qsa_documento' });
    // Nenhum dado pessoal do QSA (CPF, RG, endereço etc.) pode ser propagado --
    // a Fase 1 é estritamente institucional.
    expect(payload1).not.toHaveProperty('cpf_cnpj');
    expect(payload1).not.toHaveProperty('rg');
    expect(payload1).not.toHaveProperty('endereco');
    expect(JSON.stringify(payload1)).not.toMatch(/123\.456\.789-00/);

    const [, payload2] = mocks.upsertSocioEmpresa.mock.calls[1];
    expect(payload2).toMatchObject({ nome: 'Maria Souza', representante_legal: false });
  });

  it('ignora entradas sem nome e listas vazias/ inválidas sem chamar o upsert', async () => {
    const { sincronizarSociosExtraidosDoQsa } = await import('../server/routes/documentacao');
    await sincronizarSociosExtraidosDoQsa(EMPRESA_ID, [{ nome: '   ' }, { qualificacao: 'Sócio' }]);
    await sincronizarSociosExtraidosDoQsa(EMPRESA_ID, null);
    await sincronizarSociosExtraidosDoQsa(EMPRESA_ID, undefined);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
  });

  it('não propaga exceção quando a conciliação de um sócio falha (best-effort)', async () => {
    mocks.upsertSocioEmpresa.mockRejectedValueOnce(new Error('falha de conexão'));
    const { sincronizarSociosExtraidosDoQsa } = await import('../server/routes/documentacao');
    await expect(sincronizarSociosExtraidosDoQsa(EMPRESA_ID, [{ nome: 'Sócio Único' }])).resolves.toBeUndefined();
  });
});

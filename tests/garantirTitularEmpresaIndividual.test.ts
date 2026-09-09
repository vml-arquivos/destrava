import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CORREÇÃO (Rodada 24, 09/09/2026): uma empresa Empresário Individual/MEI
// legitimamente não tem sócio no QSA -- tem um TITULAR. Sem uma linha em
// `socios_empresa` para esse titular, a documentação pessoal (RG, CNH,
// comprovante de residência, IRPF...) nunca é liberada: o frontend
// (`DocumentosEntidade.tsx`) usa `socios[0]?.id` para vincular o documento a
// um sócio, e o banco (`documentos_arquivos_sem_pessoal_na_empresa_chk`,
// migration 055) exige um `socio_id` válido para qualquer documento pessoal
// de empresa. `garantirTitularEmpresaIndividual` resolve isso reaproveitando
// 100% a tabela/fluxo `socios_empresa` já existente -- nunca cria tabela,
// migration ou tipo novo, nunca inventa CPF, nunca duplica pessoa.

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn().mockResolvedValue({ rows: [] }),
  upsertSocioEmpresa: vi.fn().mockResolvedValue({ id: 'titular-novo' }),
}));

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

const EMPRESA_ID = '55497701-0001-0000-0000-000000000000';

const empresaMei = (overrides: Record<string, unknown> = {}) => ({
  id: EMPRESA_ID,
  natureza_juridica: 'Empresário Individual',
  opcao_mei: true,
  ...overrides,
});

const empresaLtda = (overrides: Record<string, unknown> = {}) => ({
  id: EMPRESA_ID,
  natureza_juridica: 'Sociedade Empresária Limitada',
  opcao_mei: false,
  ...overrides,
});

describe('garantirTitularEmpresaIndividual', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockClear();
    mocks.poolQuery.mockResolvedValue({ rows: [] });
    mocks.upsertSocioEmpresa.mockClear();
    mocks.upsertSocioEmpresa.mockResolvedValue({ id: 'titular-novo' });
  });
  afterEach(() => vi.clearAllMocks());

  it('MEI sem QSA e sem nome resolvido: cria titular com nome-placeholder e SEM inventar CPF', async () => {
    const { garantirTitularEmpresaIndividual, TITULAR_EMPRESA_INDIVIDUAL_FONTE, TITULAR_EMPRESA_INDIVIDUAL_NOME_PLACEHOLDER } =
      await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(EMPRESA_ID, empresaMei({ nome_fantasia: 'JOAO SILVA MEI', razao_social: '55497701 JOAO SILVA' }), []);

    expect(criou).toBe(true);
    expect(mocks.upsertSocioEmpresa).toHaveBeenCalledTimes(1);
    const [empresaIdChamada, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(empresaIdChamada).toBe(EMPRESA_ID);
    expect(payload).toMatchObject({
      nome: TITULAR_EMPRESA_INDIVIDUAL_NOME_PLACEHOLDER,
      cpf_cnpj: null,
      qualificacao_socio: 'Titular (MEI)',
      representante_legal: true,
      fonte_dados: TITULAR_EMPRESA_INDIVIDUAL_FONTE,
    });
    // Nome fantasia/razão social nunca são usados para inventar CPF.
    expect(JSON.stringify(payload)).not.toMatch(/joao/i);
  });

  it('MEI com nome do titular já no cadastro estruturado: usa esse nome, sem inventar CPF quando ausente', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({ responsavel_nome: 'Natalya Martins Lobo', responsavel_cpf: null }),
      [],
    );

    expect(criou).toBe(true);
    const [, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(payload).toMatchObject({ nome: 'Natalya Martins Lobo', cpf_cnpj: null, representante_legal: true });
  });

  it('MEI com nome E CPF no cadastro estruturado: usa ambos (não é invenção, é dado já cadastrado)', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({ responsavel_nome: 'Natalya Martins Lobo', responsavel_cpf: '111.222.333-44' }),
      [],
    );

    const [, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(payload).toMatchObject({ nome: 'Natalya Martins Lobo', cpf_cnpj: '111.222.333-44' });
  });

  it('MEI sem cadastro estruturado, mas com o nome empresarial no padrão "raiz do CNPJ + nome civil" (caso real relatado): extrai o nome, nunca inventa CPF', async () => {
    const { garantirTitularEmpresaIndividual, TITULAR_EMPRESA_INDIVIDUAL_FONTE } = await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({ cnpj: '55497701000170', razao_social: '55.497.701 NATALYA MARTINS LOBO' }),
      [],
    );

    expect(criou).toBe(true);
    const [, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(payload).toMatchObject({
      nome: 'NATALYA MARTINS LOBO',
      cpf_cnpj: null,
      fonte_dados: TITULAR_EMPRESA_INDIVIDUAL_FONTE,
    });
  });

  it('nome empresarial cujo prefixo numérico NÃO bate com a raiz do CNPJ da empresa: heurística não é aplicada, cai no placeholder', async () => {
    const { garantirTitularEmpresaIndividual, TITULAR_EMPRESA_INDIVIDUAL_NOME_PLACEHOLDER } = await import('../server/routes/documentacao');

    await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({ cnpj: '11222333000181', razao_social: '55.497.701 NATALYA MARTINS LOBO' }),
      [],
    );

    const [, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(payload).toMatchObject({ nome: TITULAR_EMPRESA_INDIVIDUAL_NOME_PLACEHOLDER, cpf_cnpj: null });
  });

  it('nome estruturado no cadastro tem prioridade sobre o nome empresarial (heurística só é usada quando não há outra evidência)', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({
        cnpj: '55497701000170',
        razao_social: '55.497.701 NOME ANTIGO DESATUALIZADO',
        responsavel_nome: 'Natalya Martins Lobo',
      }),
      [],
    );

    const [, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(payload).toMatchObject({ nome: 'Natalya Martins Lobo' });
  });

  it('nome empresarial no nome_fantasia (não na razão social) também é reconhecido', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({ cnpj: '55497701000170', razao_social: null, nome_fantasia: '55497701 Natalya Martins Lobo' }),
      [],
    );

    const [, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(payload).toMatchObject({ nome: 'Natalya Martins Lobo' });
  });

  it('Empresário Individual (não-MEI) sem QSA também recebe titular, com qualificação distinta', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    await garantirTitularEmpresaIndividual(EMPRESA_ID, empresaMei({ opcao_mei: false }), []);

    const [, payload] = mocks.upsertSocioEmpresa.mock.calls[0];
    expect(payload).toMatchObject({ qualificacao_socio: 'Titular (Empresário Individual)' });
  });

  it('LTDA (não é empresa individual) nunca recebe titular sintético, mesmo com QSA vazio', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(EMPRESA_ID, empresaLtda(), []);

    expect(criou).toBe(false);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('LTDA com 1 sócio real não é afetada (sócio único de LTDA/SLU continua válido, não é confundido com MEI)', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(EMPRESA_ID, empresaLtda(), [
      { id: 'socio-1', nome: 'Sócio Único', fonte_dados: 'receita_json' },
    ]);

    expect(criou).toBe(false);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
  });

  it('MEI que já tem sócio cadastrado por outra via (ex.: QSA legado, cadastro manual): nunca cria nem sobrepõe', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(EMPRESA_ID, empresaMei(), [
      { id: 'socio-existente', nome: 'Cadastrado Manualmente', fonte_dados: 'cadastro_manual' },
    ]);

    expect(criou).toBe(false);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('titular automático já existe com placeholder e um nome melhor ficou disponível: atualiza o MESMO registro, nunca cria um segundo', async () => {
    const { garantirTitularEmpresaIndividual, TITULAR_EMPRESA_INDIVIDUAL_FONTE, TITULAR_EMPRESA_INDIVIDUAL_NOME_PLACEHOLDER } =
      await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({ responsavel_nome: 'Natalya Martins Lobo' }),
      [{ id: 'titular-existente', nome: TITULAR_EMPRESA_INDIVIDUAL_NOME_PLACEHOLDER, cpf_cnpj: null, fonte_dados: TITULAR_EMPRESA_INDIVIDUAL_FONTE }],
    );

    expect(criou).toBe(true);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    const [sql, values] = mocks.poolQuery.mock.calls[0];
    expect(sql).toMatch(/UPDATE public\.socios_empresa/);
    expect(values).toEqual(['Natalya Martins Lobo', null, 'titular-existente', EMPRESA_ID]);
  });

  it('titular automático já existe com nome real e sem CPF; CPF passa a existir no cadastro: atualiza só o CPF, preservando o nome', async () => {
    const { garantirTitularEmpresaIndividual, TITULAR_EMPRESA_INDIVIDUAL_FONTE } = await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(
      EMPRESA_ID,
      empresaMei({ responsavel_nome: 'Natalya Martins Lobo', responsavel_cpf: '111.222.333-44' }),
      [{ id: 'titular-existente', nome: 'Natalya Martins Lobo', cpf_cnpj: null, fonte_dados: TITULAR_EMPRESA_INDIVIDUAL_FONTE }],
    );

    expect(criou).toBe(true);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
    const [, values] = mocks.poolQuery.mock.calls[0];
    expect(values).toEqual(['Natalya Martins Lobo', '111.222.333-44', 'titular-existente', EMPRESA_ID]);
  });

  it('titular automático já existe e nada mudou: não chama upsert nem UPDATE (idempotente, nunca duplica)', async () => {
    const { garantirTitularEmpresaIndividual, TITULAR_EMPRESA_INDIVIDUAL_FONTE } = await import('../server/routes/documentacao');

    const criou = await garantirTitularEmpresaIndividual(EMPRESA_ID, empresaMei(), [
      { id: 'titular-existente', nome: 'Titular Já Confirmado', cpf_cnpj: '999.888.777-66', fonte_dados: TITULAR_EMPRESA_INDIVIDUAL_FONTE },
    ]);

    expect(criou).toBe(false);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('não propaga exceção quando a criação do titular falha (best-effort, não interrompe o dossiê)', async () => {
    mocks.upsertSocioEmpresa.mockRejectedValueOnce(new Error('falha de conexão'));
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    await expect(garantirTitularEmpresaIndividual(EMPRESA_ID, empresaMei(), [])).resolves.toBe(false);
  });

  it('empresaId ou empresa ausentes: retorna false sem chamar nada', async () => {
    const { garantirTitularEmpresaIndividual } = await import('../server/routes/documentacao');

    expect(await garantirTitularEmpresaIndividual('', empresaMei(), [])).toBe(false);
    expect(await garantirTitularEmpresaIndividual(EMPRESA_ID, null, [])).toBe(false);
    expect(mocks.upsertSocioEmpresa).not.toHaveBeenCalled();
  });
});

// Mockar `montarDossieCreditoEmpresa` fim-a-fim exigiria simular CNPJ, QSA,
// enquadramento, societário e o motor de regras inteiro (convenção já
// registrada em `mapaDocumentalCredito.test.ts`). Em vez de duplicar esse
// mock gigante só para provar 2 linhas de fiação, este teste audita o
// código-fonte: confirma que `montarDossieCreditoEmpresa` chama a
// reconciliação logo depois de carregar `socios` (mesmo padrão de
// "reconciliação-na-leitura" já usado por `reconciliarFollowupMaturidadeEmpresa`
// na rota de Inteligência 360) e relê `socios` quando ela cria/atualiza o
// titular -- para que a lista que chega ao frontend já inclua o titular.
describe('fiação de garantirTitularEmpresaIndividual dentro de montarDossieCreditoEmpresa', () => {
  it('chama a reconciliação com empresa/socios já carregados e relê socios quando algo muda', () => {
    const codigo = readFileSync(resolve(process.cwd(), 'server/routes/documentacao.ts'), 'utf8');
    const inicio = codigo.indexOf('export async function montarDossieCreditoEmpresa');
    expect(inicio).toBeGreaterThan(-1);
    const corpo = codigo.slice(inicio, inicio + 5000);

    expect(corpo).toMatch(/let socios = await getSociosEmpresa\(empresaId\);/);
    expect(corpo).toMatch(/garantirTitularEmpresaIndividual\(empresaId, empresa, socios\)/);
    expect(corpo).toMatch(/if \(titularFoiCriadoOuAtualizado\)\s*\{\s*socios = await getSociosEmpresa\(empresaId\);/);
  });
});

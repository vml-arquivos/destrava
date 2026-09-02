import { describe, expect, it, vi } from 'vitest';

// CORREÇÃO (Rodada 29, 02/09/2026, auditoria própria de consistência entre
// tipos de empresa -- pedido explícito do usuário: "vão garantir que o
// visual... e os modais vão ser totalmente iguais, só a única diferença vai
// ser carregamento dos dados, do tipo da empresa, e a leitura da
// documentação, mas garantindo que seja idêntico, e garantindo que saiba
// entender e separar e analisar e dar o diagnóstico também de cada tipo de
// empresa corretamente").
//
// `isEmpresaIndividual` (server/routes/documentacao.ts) decide se, na
// ausência de qualquer sócio real (nem no cadastro, nem na Receita), o
// sistema infere um "sócio" único a partir do nome do responsável/empresa
// (`montarProprietarioInferido`) -- comportamento correto só para uma
// empresa que de fato é Empresário Individual/MEI, que não tem QSA no
// sentido societário. Antes desta rodada, a função varria um texto que
// incluía `razao_social`/`nome_fantasia` -- o NOME da empresa, escolhido
// livremente pelo empreendedor -- com um `.includes('individual')` solto,
// que também casava qualquer substring (ex.: "individualizado"). Isso é
// exatamente a classe de bug que a regra deste projeto proíbe: uma decisão
// de diagnóstico que muda dependendo do nome específico de uma empresa, não
// de um dado estruturado sobre o seu tipo/regime.
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

describe('isEmpresaIndividual — nunca decide pelo nome da empresa, só por campos estruturados (Rodada 29)', () => {
  it('reconhece MEI/Empresário Individual pela natureza jurídica (campo estruturado da Receita)', async () => {
    const { isEmpresaIndividual } = await import('../server/routes/documentacao');
    expect(isEmpresaIndividual({ natureza_juridica: 'Microempreendedor Individual (MEI)' })).toBe(true);
    expect(isEmpresaIndividual({ natureza_juridica: 'Empresário Individual' })).toBe(true);
    expect(isEmpresaIndividual({ natureza_juridica: 'Empresa Individual de Responsabilidade Limitada (EIRELI)', porte: 'MEI' })).toBe(true);
  });

  it('reconhece pelo campo estruturado opcao_mei, mesmo sem texto nenhum na natureza jurídica', async () => {
    const { isEmpresaIndividual } = await import('../server/routes/documentacao');
    expect(isEmpresaIndividual({ opcao_mei: true, natureza_juridica: null })).toBe(true);
  });

  it('CORREÇÃO: uma Sociedade Empresária Limitada (LTDA) comum NUNCA é tratada como Empresário Individual, mesmo que o nome fantasia ou a razão social contenha a palavra "individual"', async () => {
    const { isEmpresaIndividual } = await import('../server/routes/documentacao');
    expect(isEmpresaIndividual({
      natureza_juridica: 'Sociedade Empresária Limitada',
      razao_social: 'INDIVIDUAL COMERCIO E REPRESENTACOES LTDA',
      nome_fantasia: 'Grupo Individual',
    })).toBe(false);
  });

  it('CORREÇÃO: substring solta ("individualizado" etc.) na razão social não engana mais a detecção, mesmo antes de remover os campos de nome -- a regra passou a exigir a frase inteira com limite de palavra', async () => {
    const { isEmpresaIndividual } = await import('../server/routes/documentacao');
    expect(isEmpresaIndividual({
      natureza_juridica: 'Sociedade Anônima',
      razao_social: 'Atendimento Individualizado Saúde S.A.',
    })).toBe(false);
  });

  it('uma Sociedade Anônima ou Cooperativa comum, sem nenhum indício de MEI/Empresário Individual, continua false', async () => {
    const { isEmpresaIndividual } = await import('../server/routes/documentacao');
    expect(isEmpresaIndividual({ natureza_juridica: 'Sociedade Anônima Fechada' })).toBe(false);
    expect(isEmpresaIndividual({ natureza_juridica: 'Cooperativa' })).toBe(false);
  });
});

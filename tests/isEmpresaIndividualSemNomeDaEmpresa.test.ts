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

describe('dadosQsa — EI/MEI usam titular próprio e nunca sócio fictício', () => {
  it('mantém o quadro de sócios vazio e usa o responsável estruturado como titular do MEI', async () => {
    const { dadosQsa } = await import('../server/routes/documentacao');
    const dados = dadosQsa({
      id: 'mei-1',
      cnpj: '29.705.345/0001-22',
      natureza_juridica: '213-5 - Empresário (Individual)',
      opcao_mei: true,
      responsavel_nome: 'Vilson Marcio de Lima',
    }, []);

    expect(dados.empresa_individual_detectada).toBe(true);
    expect(dados.socios).toEqual([]);
    expect(dados.total_socios_consolidados).toBe(0);
    expect(dados.proprietario_inferido).toBe(false);
    expect(dados.titular_individual).toMatchObject({
      nome: 'Vilson Marcio de Lima',
      administrador: true,
      fonte_dados: 'cadastro_responsavel_empresa_individual',
    });
  });

  it('não transforma razão social ou nome fantasia em pessoa quando o titular não está cadastrado', async () => {
    const { dadosQsa } = await import('../server/routes/documentacao');
    const dados = dadosQsa({
      id: 'mei-2',
      natureza_juridica: 'Microempreendedor Individual (MEI)',
      razao_social: 'EMPRESA EXEMPLO 12345678900',
      nome_fantasia: 'LOJA EXEMPLO',
      opcao_mei: true,
    }, []);

    expect(dados.socios).toEqual([]);
    expect(dados.titular_individual).toBeNull();
    expect(JSON.stringify(dados)).not.toContain('LOJA EXEMPLO');
  });

  it('preserva o quadro real de uma LTDA', async () => {
    const { dadosQsa } = await import('../server/routes/documentacao');
    const dados = dadosQsa({ natureza_juridica: 'Sociedade Empresária Limitada' }, [
      { id: 's1', nome: 'Ana Souza', qualificacao_socio: 'Sócia-Administradora', administrador: true },
    ]);

    expect(dados.empresa_individual_detectada).toBe(false);
    expect(dados.socios).toHaveLength(1);
    expect(dados.socios[0]).toMatchObject({ nome: 'Ana Souza', administrador: true });
    expect(dados.titular_individual).toBeNull();
  });
});

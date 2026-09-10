import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CORREÇÃO (09/09/2026, Rodada 09/09 parte 7 -- pedido explícito do usuário:
// "o mei tambem como se fosse o contrato social que o CCmei, la esta o nome
// e dados do socio, então não tem atos da junta mas quando mei em contrato
// social coloca o ccmei, e avança, entendido faça a atualização"):
//
// MEI não tem Atos da Junta/Contrato Social no formato de LTDA -- o
// documento equivalente, que comprova a constituição e traz os dados do
// titular, é o CCMEI. Antes desta correção, `montarValidacaoSocietaria`
// tinha DOIS problemas: (1) sua própria detecção local de MEI (`empresaMei`)
// era mais estreita que a detecção canônica `isEmpresaIndividual` -- não
// reconhecia "Empresário (Individual)" com parênteses, o mesmo bug já
// corrigido na Rodada 09/09 parte 6 para a detecção canônica -- então nunca
// reconhecia esta empresa real como MEI; (2) mesmo quando reconhecia MEI (ex:
// com opcao_mei explícito), a dispensa dos Atos da Junta/Contrato Social era
// em BRANCO, sem exigir nenhuma evidência documental. Esta correção unifica a
// detecção com `isEmpresaIndividual` e condiciona a dispensa à presença real
// do CCMEI anexado (com conteúdo legível) -- comprovação documental, só que
// com o documento correto para este tipo de empresa.
describe('montarValidacaoSocietaria -- MEI usa o CCMEI como equivalente do Contrato Social/Atos da Junta', () => {
  const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));
  vi.mock('pg', () => {
    class PoolMock { query = mocks.poolQuery; }
    return { default: { Pool: PoolMock }, Pool: PoolMock };
  });
  vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
  vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
  vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
  vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({ analisarCnpjReceitaCartaoEmpresa: vi.fn(), buscarUltimaAnaliseCnpjEmpresa: vi.fn(), limparAnalisesCnpjEmpresa: vi.fn() }));
  vi.mock('../server/services/analiseDocumentalEspecializada', () => ({ analiseDocumentalService: { analisarQSA: vi.fn(), analisarSimplesNacional: vi.fn(), analisarAtosJuntaComercial: vi.fn(), analisarContratoComAtosJunta: vi.fn() } }));

  beforeEach(() => { vi.resetModules(); mocks.poolQuery.mockReset(); });
  afterEach(() => vi.clearAllMocks());

  // Caso real relatado (Rodada 26/09/09/2026): empresa "55.497.701 NATALYA
  // MARTINS LOBO" -- natureza jurídica no formato oficial da Receita, com
  // parênteses, e SEM opcao_mei preenchido no cadastro.
  const empresaMeiReal = () => ({
    id: 'empresa-mei-1',
    natureza_juridica: '213-5 - Empresário (Individual)',
    cnpj: '55497701000170',
    razao_social: '55.497.701 NATALYA MARTINS LOBO',
    porte: 'ME',
  });

  const empresaLtda = () => ({
    id: 'empresa-ltda-1',
    natureza_juridica: 'Sociedade Empresária Limitada',
    opcao_mei: false,
  });

  function mockPoolQueryComDocumentos(documentosPorTipo: Record<string, any[]>) {
    mocks.poolQuery.mockImplementation(async (text: string, params?: any[]) => {
      const sql = String(text);
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM public.documentos_arquivos')) {
        const tipos: string[] = Array.isArray(params?.[1]) ? params[1] : [];
        const linhas = tipos.flatMap((tipo) => documentosPorTipo[tipo] || []);
        return { rows: linhas };
      }
      return { rows: [] };
    });
  }

  it('MEI sem CCMEI anexado: etapa fica pendente, exige o CCMEI, e não avança', async () => {
    const { montarValidacaoSocietaria } = await import('../server/routes/documentacao');
    mockPoolQueryComDocumentos({});

    const resultado = await montarValidacaoSocietaria('empresa-mei-1', false, { empresa: empresaMeiReal(), enquadramentoDados: {} });

    expect(resultado.atos_dispensados_por_mei).toBe(false);
    expect(resultado.consistente).toBe(false);
    expect(resultado.apto_para_avancar).toBe(false);
    expect((resultado as any).ccmei_anexado).toBe(false);
    expect(resultado.bloqueios).toEqual(
      expect.arrayContaining([expect.stringMatching(/anexe o ccmei/i)])
    );
    // Não deve reaparecer o bloqueio genérico de LTDA (Contrato Social/Atos da
    // Junta) para MEI -- só o bloqueio específico do CCMEI.
    expect(resultado.bloqueios).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/Contrato Social ou Alteração Contratual ainda não anexado/)])
    );
  });

  it('MEI com CCMEI anexado (com conteúdo): etapa fica consistente e avança', async () => {
    const { montarValidacaoSocietaria } = await import('../server/routes/documentacao');
    mockPoolQueryComDocumentos({
      ccmei: [{ id: 'doc-ccmei-1', tipo_documento: 'ccmei', tamanho_bytes: 12345 }],
    });

    const resultado = await montarValidacaoSocietaria('empresa-mei-1', false, { empresa: empresaMeiReal(), enquadramentoDados: {} });

    expect(resultado.atos_dispensados_por_mei).toBe(true);
    expect(resultado.analisado).toBe(true);
    expect(resultado.consistente).toBe(true);
    expect(resultado.apto_para_avancar).toBe(true);
    expect(resultado.botao_avancar_disponivel).toBe(true);
    expect((resultado as any).ccmei_anexado).toBe(true);
    expect((resultado as any).ccmei_arquivo_id).toBe('doc-ccmei-1');
    expect(resultado.bloqueios).toEqual([]);
  });

  it('MEI com CCMEI anexado mas vazio (sem conteúdo legível): continua pendente', async () => {
    const { montarValidacaoSocietaria } = await import('../server/routes/documentacao');
    mockPoolQueryComDocumentos({
      ccmei: [{ id: 'doc-ccmei-vazio', tipo_documento: 'ccmei', tamanho_bytes: 0 }],
    });

    const resultado = await montarValidacaoSocietaria('empresa-mei-1', false, { empresa: empresaMeiReal(), enquadramentoDados: {} });

    expect((resultado as any).ccmei_anexado).toBe(false);
    expect(resultado.atos_dispensados_por_mei).toBe(false);
    expect(resultado.consistente).toBe(false);
    expect(resultado.bloqueios).toEqual(
      expect.arrayContaining([expect.stringMatching(/anexe o ccmei/i)])
    );
  });

  // CORREÇÃO (09/09/2026, Rodada 09/09 parte 8 -- pedido explícito do usuário,
  // com print real): o usuário anexou o CCMEI diretamente no campo "Contrato
  // social e alterações contratuais" (em vez do campo dedicado de CCMEI) --
  // exatamente a orientação dada: "quando mei em contrato social coloca o
  // ccmei, e avança". O upload grava `tipo_documento = 'contrato_social'`
  // (o campo usado), mas a classificação automática do conteúdo já reconhece
  // e persiste o tipo detectado (ver `classificadorCcmeiComoContratoSocialMei.
  // test.ts`).
  //
  // O formato exato do laudo persistido abaixo (`dados_extraidos.tipo_
  // detectado`, NÃO `tipo_detectado` solto no nível raiz) reproduz fielmente
  // o que `analisarDocumentoCatalogado`/`normalizarDocumentoCatalogado`
  // (`server/services/analiseDocumentalEspecializada.ts`) realmente grava --
  // um print real (Rodada 09/09 parte 9) mostrou que a etapa continuava
  // pedindo o CCMEI mesmo já anexado, porque a versão anterior deste teste
  // usava um formato simplificado (`tipo_detectado` direto) que não existe de
  // verdade em produção, e por isso não pegou o caminho errado que o código
  // usava.
  it('MEI com o CCMEI anexado no campo "Contrato social" (não no campo dedicado de CCMEI): reconhecido pelo tipo detectado, etapa avança', async () => {
    const { montarValidacaoSocietaria } = await import('../server/routes/documentacao');
    mockPoolQueryComDocumentos({
      contrato_social: [{
        id: 'doc-contrato-com-ccmei',
        tipo_documento: 'contrato_social',
        tamanho_bytes: 45000,
        resultado_validacao: {
          analise_regra_documental: {
            tipo_analise: 'documento_generico',
            dados_extraidos: { tipo_esperado: 'CONTRATO_SOCIAL', tipo_detectado: 'CCMEI', satisfaz_requisito: true, status_documental: 'DADO_COMPROVADO' },
          },
        },
      }],
    });

    const resultado = await montarValidacaoSocietaria('empresa-mei-1', false, { empresa: empresaMeiReal(), enquadramentoDados: {} });

    expect((resultado as any).ccmei_anexado).toBe(true);
    expect((resultado as any).ccmei_arquivo_id).toBe('doc-contrato-com-ccmei');
    expect(resultado.atos_dispensados_por_mei).toBe(true);
    expect(resultado.consistente).toBe(true);
    expect(resultado.apto_para_avancar).toBe(true);
    expect(resultado.bloqueios).toEqual([]);
  });

  it('empresa não-MEI (LTDA) não é afetada pela regra do CCMEI', async () => {
    const { montarValidacaoSocietaria } = await import('../server/routes/documentacao');
    mockPoolQueryComDocumentos({
      ccmei: [{ id: 'doc-ccmei-ltda', tipo_documento: 'ccmei', tamanho_bytes: 999 }],
    });

    const resultado = await montarValidacaoSocietaria('empresa-ltda-1', false, { empresa: empresaLtda(), enquadramentoDados: {} });

    // Mesmo com um CCMEI anexado por engano, uma LTDA continua exigindo
    // Contrato Social e Atos da Junta normalmente -- a regra é exclusiva de MEI.
    expect(resultado.atos_dispensados_por_mei).toBe(false);
    expect(resultado.bloqueios).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Contrato Social ou Alteração Contratual ainda não anexado/),
        expect.stringMatching(/Nenhum Ato da Junta foi localizado/),
      ])
    );
    expect(resultado.bloqueios).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/anexe o ccmei/i)])
    );
  });
});

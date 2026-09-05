import { describe, expect, it } from 'vitest';
import { documentosSocietariosPorNatureza, gerarMapaDocumentalCredito, identificarRegimeCredito, montarHistoricoRegimeTributarioParaMapa } from '../server/services/mapaDocumentalCreditoService';

describe('mapa documental de crédito', () => {
  it('identifica Simples Nacional e monta PGDAS/DEFIS', () => {
    const regime = identificarRegimeCredito({ regime_tributario: 'Simples Nacional', opcao_simples: true });
    expect(regime).toBe('simples_nacional');
    const mapa = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'Simples Nacional', opcao_simples: true },
      etapa1Aprovada: true,
      etapa2Aprovada: false,
      tiposAnexados: ['cartao_cnpj', 'qsa', 'simples_nacional'],
    });
    expect(mapa.etapa_atual).toBe(2);
    expect(mapa.etapas.find((e) => e.numero === 4)?.documentos.some((d) => d.codigo === 'pgdas_12m')).toBe(true);
    expect(mapa.etapas.find((e) => e.numero === 4)?.documentos.some((d) => d.codigo === 'defis')).toBe(true);
  });

  // É o regime que decide a documentação: o mesmo CNPJ, lido como Lucro
  // Presumido ou como "não optante sem regime definido", produz listas
  // diferentes de documentos obrigatórios. Foi exatamente isso que o
  // "Regime: Não Optante" na tela escondia.
  it('regime lido do documento muda a documentação exigida', () => {
    const anexados = ['cartao_cnpj', 'qsa', 'atos_junta_comercial', 'contrato_social'];

    // Documento não informou o regime: o sistema exige o comprovante que o define.
    const pendente = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: null },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: anexados,
    });
    expect(pendente.regime_identificado).toBe('nao_optante_regime_a_confirmar');
    const fiscalPendente = pendente.etapas.find((e) => e.numero === 4)?.documentos || [];
    expect(fiscalPendente.some((d) => d.codigo === 'confirmacao_regime_nao_optante')).toBe(true);

    // Documento informou Lucro Presumido: a trilha fiscal correta é exigida.
    const presumido = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: 'Lucro Presumido' },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: anexados,
    });
    expect(presumido.regime_identificado).toBe('lucro_presumido');
    expect(presumido.regime_a_confirmar).toBe(false);
    expect(presumido.pendencias).toEqual([]);
    const fiscalPresumido = presumido.etapas.find((e) => e.numero === 4)?.documentos || [];
    expect(fiscalPresumido.some((d) => d.codigo === 'ecf_presumido')).toBe(true);
    expect(fiscalPresumido.some((d) => d.codigo === 'bp_dre_presumido')).toBe(true);
    // Nada de PGDAS/DEFIS: são do Simples, não se aplicam ao Presumido.
    expect(fiscalPresumido.some((d) => d.codigo === 'pgdas_12m')).toBe(false);

    // Lucro Real tem a sua própria trilha, distinta do Presumido.
    const real = gerarMapaDocumentalCredito({
      empresa: { razao_social: 'Teste' },
      enquadramento: { situacao_simples: 'Não Optante', regime_tributario: 'Lucro Real' },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: anexados,
    });
    expect(real.regime_identificado).toBe('lucro_real');
  });

  it('continua identificando não optante mesmo sem regime_tributario preenchido', () => {
    // parseSimples deixou de devolver "Não Optante" como regime; a detecção
    // precisa continuar funcionando pela situação do Simples.
    expect(identificarRegimeCredito({}, { situacao_simples: 'Não Optante', regime_tributario: null }))
      .toBe('nao_optante_regime_a_confirmar');
  });

  it('não classifica como MEI quando o comprovante informa não optante pelo SIMEI', () => {
    const regime = identificarRegimeCredito(
      { regime_tributario: 'Simples Nacional', opcao_simples: true, opcao_mei: false },
      { situacao_simples: 'Optante pelo Simples Nacional', regime_tributario: 'Simples Nacional', opcao_mei: false, observacao: 'NÃO optante pelo SIMEI' },
    );
    expect(regime).toBe('simples_nacional');
  });

  it('direciona empresa não optante para ECF e não solicita PGDAS/DEFIS', () => {
    const empresa = { regime_tributario: 'Não optante pelo Simples Nacional', opcao_simples: false };
    expect(identificarRegimeCredito(empresa)).toBe('nao_optante_regime_a_confirmar');
    const mapa = gerarMapaDocumentalCredito({ empresa, etapa1Aprovada: true, etapa2Aprovada: true, tiposAnexados: [] });
    const documentos = mapa.etapas.find((e) => e.numero === 4)?.documentos || [];
    const codigos = documentos.map((documento) => documento.codigo);
    expect(codigos).toContain('confirmacao_regime_nao_optante');
    expect(codigos).not.toContain('pgdas_12m');
    expect(codigos).not.toContain('defis');
  });

  it('expõe pendência prioritária de regime e aceita ECF, DCTF/DCTFWeb, DARF ou Livro Caixa', () => {
    const pendente = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'Não optante pelo Simples Nacional', opcao_simples: false },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: [],
    });
    expect(pendente.regime_a_confirmar).toBe(true);
    expect(pendente.pendencias).toEqual([
      expect.objectContaining({
        codigo: 'nao_optante_regime_a_confirmar',
        prioridade: 'alta',
        status: 'pendente',
        nao_bloqueia_etapa_1: false,
        tipos_documento_aceitos: expect.arrayContaining(['ecf', 'dctf', 'dctfweb', 'darf', 'livro_caixa']),
      }),
    ]);
    expect(pendente.proxima_acao).toMatch(/ECF, DCTF\/DCTFWeb, DARF ou Livro Caixa/);

    const comDarf = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'Não optante pelo Simples Nacional', opcao_simples: false },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: ['darf'],
      regimeComprovado: true,
    });
    expect(comDarf.regime_a_confirmar).toBe(false);
    expect(comDarf.pendencias).toEqual([]);
    expect(comDarf.proxima_acao).not.toMatch(/Anexar ECF/);
  });

  it('monta ECF/ECD e demonstrações para Lucro Real', () => {
    const mapa = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'Lucro Real' },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: [],
    });
    const codigos = mapa.etapas.find((e) => e.numero === 4)?.documentos.map((d) => d.codigo) || [];
    expect(codigos).toContain('ecf_real');
    expect(codigos).toContain('ecd_real');
    expect(codigos).toContain('demonstracoes_real');
    expect(mapa.etapa_atual).toBe(3);
  });

  it('inclui CNDT, projeção de receitas, rating de bureau privado e CENPROT no núcleo universal (pesquisa de mercado 2026-08-12)', () => {
    // CNDT (trabalhista), rating de bureau privado (Serasa) e CENPROT (protestos)
    // já eram campos do checklist do Acervo Documental sem nenhum documento
    // correspondente no mapa; e o demonstrativo/projeção de receitas é exigido por
    // bancos no lugar do faturamento de 12 meses para empresas com menos de 12
    // meses de constituição -- nenhum dos quatro existia antes desta correção.
    const mapa = gerarMapaDocumentalCredito({
      empresa: { regime_tributario: 'Simples Nacional', opcao_simples: true },
      etapa1Aprovada: true,
      etapa2Aprovada: true,
      tiposAnexados: [],
    });
    const codigosFase3 = mapa.etapas.find((e) => e.numero === 3)?.documentos.map((d) => d.codigo) || [];
    const codigosFase4 = mapa.etapas.find((e) => e.numero === 4)?.documentos.map((d) => d.codigo) || [];
    expect(codigosFase3).toContain('cndt');
    expect(codigosFase4).toContain('projecao_receitas');
    expect(codigosFase4).toContain('rating_bureau_privado');
    expect(codigosFase4).toContain('consulta_protestos');
    // CNDT, projeção, bureau e CENPROT são complementares/condicionais;
    // nenhum deve virar hard gate universal sem contexto que justifique a exigência.
    const cndt = mapa.etapas.find((e) => e.numero === 3)?.documentos.find((d) => d.codigo === 'cndt');
    expect(cndt?.obrigatorio).toBe(false);
    const projecao = mapa.etapas.find((e) => e.numero === 4)?.documentos.find((d) => d.codigo === 'projecao_receitas');
    expect(projecao?.obrigatorio).toBe(false);
  });

  it('mantém programas bancários como sobreposição configurável', () => {
    const mapa = gerarMapaDocumentalCredito({ empresa: {}, etapa1Aprovada: false, etapa2Aprovada: false });
    expect(mapa.programas_referencia.some((p) => p.codigo === 'pronampe_bb')).toBe(true);
    expect(mapa.programas_referencia.some((p) => p.codigo === 'procred_360_bb')).toBe(true);
    expect(mapa.programas_referencia.some((p) => p.codigo === 'credito_bancario_padrao')).toBe(true);
    expect(mapa.programas_referencia.some((p) => p.codigo === 'bndes_indireto')).toBe(true);
    expect(mapa.programas_referencia.some((p) => p.codigo === 'fne_bnb')).toBe(true);
    expect(mapa.indicadores.some((i) => i.codigo === 'dscr')).toBe(true);
    expect(mapa.operacoes_disponiveis.find((o) => o.codigo === 'investimento')?.documentos_adicionais).toContain('Projeto de investimento');
  });
});

// CORREÇÃO (2026-08-31, "se ela era optante do simples ... vai precisar
// anexar os documentos do simples também. Mas, com a ressalva de que agora
// ela é de outro regime"): `documentacao.ts` anexa este campo ao mapa
// documental do dossiê (`historico_regime_tributario`), a partir da linha do
// tempo persistida em `empresas_regime_tributario_historico`
// (regimeTributarioTemporalService.ts). Esta função só molda essa lista para
// a tela de documentos -- testada isoladamente porque montar o dossiê inteiro
// (`montarDossieCreditoEmpresa`) exigiria mockar CNPJ, QSA, societário e o
// motor de regras documentais só para provar um mapeamento de campos.
describe('montarHistoricoRegimeTributarioParaMapa', () => {
  it('mantém regime/data_inicio/data_fim e descarta os campos internos do registro (id, fonte, confiança, documento_evidencia_id, observação)', () => {
    const resultado = montarHistoricoRegimeTributarioParaMapa([
      { id: 'p1', empresa_id: 'e1', regime: 'Simples Nacional', data_inicio: '2023-01-01', data_fim: '2025-12-31', fonte: 'consulta_optantes', confianca: 0.9, documento_evidencia_id: null, observacao: null } as any,
      { id: 'p2', empresa_id: 'e1', regime: 'Lucro Presumido', data_inicio: '2026-01-01', data_fim: null, fonte: 'darf', confianca: 0.85, documento_evidencia_id: 'doc-darf-1', observacao: null } as any,
    ]);
    expect(resultado.linha_do_tempo).toEqual([
      { regime: 'Simples Nacional', data_inicio: '2023-01-01', data_fim: '2025-12-31' },
      { regime: 'Lucro Presumido', data_inicio: '2026-01-01', data_fim: null },
    ]);
    expect((resultado.linha_do_tempo[0] as any).fonte).toBeUndefined();
    expect((resultado.linha_do_tempo[0] as any).id).toBeUndefined();
  });

  it('devolve linha do tempo vazia quando a empresa ainda não tem nenhuma evidência de regime registrada (estado inicial, não é erro)', () => {
    expect(montarHistoricoRegimeTributarioParaMapa([])).toEqual({ linha_do_tempo: [], regime_vigente_desde: null });
  });

  // CORREÇÃO (2026-08-31, "só ser nesse necessário, senão não é nem pra
  // aparecer a conta de anexar esses documentos"): `regime_vigente_desde`
  // alimenta a decisão de "transição recente" em `slotCompativelComRegimeTributario`
  // (shared/documentalPresentation.ts) -- precisa identificar corretamente o
  // período ABERTO (sem data_fim) como o vigente, mesmo quando ele não é o
  // último da lista por algum motivo de ordenação.
  it('regime_vigente_desde é a data de início do período aberto (sem data_fim)', () => {
    const resultado = montarHistoricoRegimeTributarioParaMapa([
      { regime: 'Simples Nacional', data_inicio: '2023-01-01', data_fim: '2025-12-31' } as any,
      { regime: 'Lucro Presumido', data_inicio: '2026-01-01', data_fim: null } as any,
    ]);
    expect(resultado.regime_vigente_desde).toBe('2026-01-01');
  });

  it('regime_vigente_desde cai para o último período da lista quando não há nenhum período aberto', () => {
    const resultado = montarHistoricoRegimeTributarioParaMapa([
      { regime: 'Simples Nacional', data_inicio: '2023-01-01', data_fim: '2024-12-31' } as any,
      { regime: 'Lucro Presumido', data_inicio: '2025-01-01', data_fim: '2025-12-31' } as any,
    ]);
    expect(resultado.regime_vigente_desde).toBe('2025-01-01');
  });
});

// CORREÇÃO (Rodada 29, 02/09/2026, auditoria própria de consistência entre
// tipos de empresa, pedido explícito do usuário: "vão garantir que o
// visual... vai ser totalmente iguais, só a única diferença vai ser
// carregamento dos dados, do tipo da empresa"): `documentosSocietariosPorNatureza`
// dispensava a exigência de Atos da Junta/Contrato Social para QUALQUER
// empresa cuja natureza jurídica contivesse o texto "empresario individual",
// mesmo quando o regime tributário real não era MEI -- conflando um tipo
// societário (natureza jurídica) com um regime tributário. Só o MEI de fato
// usa CCMEI e fica dispensado desse fluxo; um Empresário Individual não-MEI
// continua registrado por Requerimento de Empresário na Junta Comercial e
// deveria exigir a mesma comprovação de qualquer outra natureza jurídica.
describe('documentosSocietariosPorNatureza (Rodada 29 -- MEI é regime tributário, "Empresário Individual" é natureza jurídica, não são a mesma coisa)', () => {
  it('MEI (pelo regime) não exige nenhum documento societário -- comportamento inalterado', () => {
    expect(documentosSocietariosPorNatureza({ natureza_juridica: 'Empresário Individual' }, 'mei')).toEqual([]);
  });

  it('natureza jurídica com "MEI"/"microempreendedor" no texto não exige nenhum documento societário, independentemente do regime devolvido -- reforço para quando o regime não foi identificado por outra via', () => {
    expect(documentosSocietariosPorNatureza({ natureza_juridica: 'Microempreendedor Individual' }, 'nao_identificado')).toEqual([]);
  });

  it('CORREÇÃO: Empresário Individual que NÃO é MEI (regime Simples Nacional comum, por exemplo) continua exigindo Contrato Social/Atos da Junta, como qualquer outra natureza jurídica -- antes desta rodada, isto devolvia [] indevidamente', () => {
    const resultado = documentosSocietariosPorNatureza({ natureza_juridica: 'Empresário Individual' }, 'simples_nacional');
    expect(resultado.some((d) => d.codigo === 'atos_junta')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'requerimento_empresario_vigente')).toBe(true);
  });

  it('CORREÇÃO: Empresário Individual em Lucro Presumido também continua exigindo a documentação societária padrão', () => {
    const resultado = documentosSocietariosPorNatureza({ natureza_juridica: 'Empresário Individual' }, 'lucro_presumido');
    expect(resultado.some((d) => d.codigo === 'atos_junta')).toBe(true);
  });

  it('Sociedade Anônima continua com a trilha própria (estatuto + atos da Junta), sem relação com este ponto', () => {
    const resultado = documentosSocietariosPorNatureza({ natureza_juridica: 'Sociedade Anônima' }, 'lucro_real');
    expect(resultado.some((d) => d.codigo === 'estatuto_ata_natureza')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'atos_junta')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'contrato_social_vigente')).toBe(false);
  });

  it('LTDA (natureza jurídica padrão, sem nenhum texto especial) exige a documentação societária universal, para qualquer regime', () => {
    for (const regime of ['simples_nacional', 'lucro_presumido', 'lucro_real', 'lucro_arbitrado'] as const) {
      const resultado = documentosSocietariosPorNatureza({ natureza_juridica: 'Sociedade Empresária Limitada' }, regime);
      expect(resultado.some((d) => d.codigo === 'atos_junta')).toBe(true);
      expect(resultado.some((d) => d.codigo === 'contrato_social_vigente')).toBe(true);
    }
  });

  it('cooperativa usa estatuto/atas e mantém o registro na Junta Comercial', () => {
    const resultado = documentosSocietariosPorNatureza({ natureza_juridica: 'Cooperativa' }, 'lucro_real');
    expect(resultado.some((d) => d.codigo === 'estatuto_ata_natureza')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'atos_junta')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'registro_cartorio_pj')).toBe(false);
  });

  it.each(['Associação Privada', 'Fundação Privada'])('%s usa RCPJ e não exige Junta Comercial', (naturezaJuridica) => {
    const resultado = documentosSocietariosPorNatureza({ natureza_juridica: naturezaJuridica }, 'isenta');
    expect(resultado.some((d) => d.codigo === 'estatuto_ata_natureza')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'registro_cartorio_pj')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'atos_junta')).toBe(false);
  });

  it('sociedade de advocacia usa ato constitutivo e registro na OAB, sem exigir Junta Comercial', () => {
    const resultado = documentosSocietariosPorNatureza({ natureza_juridica: 'Sociedade Unipessoal de Advocacia - OAB' }, 'simples_nacional');
    expect(resultado.some((d) => d.codigo === 'ato_constitutivo_oab')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'registro_oab')).toBe(true);
    expect(resultado.some((d) => d.codigo === 'atos_junta')).toBe(false);
  });

  // CORREÇÃO (Rodada 33, 05/09/2026, diagnóstico cruzado de duas pesquisas
  // independentes -- Manus AI e GPT -- que citam, de forma idêntica, a Lei nº
  // 8.906/1994 (arts. 15-16) como fonte de que sociedade de advocacia se
  // registra na OAB, nunca em Junta/RCPJ.
  it('CORREÇÃO Rodada 33: exigências de sociedade de advocacia carregam a citação legal (Lei 8.906/1994) em fonte_normativa', () => {
    const resultado = documentosSocietariosPorNatureza({ natureza_juridica: 'Sociedade Unipessoal de Advocacia - OAB' }, 'simples_nacional');
    const ato = resultado.find((d) => d.codigo === 'ato_constitutivo_oab');
    const registro = resultado.find((d) => d.codigo === 'registro_oab');
    expect(ato?.fonte_normativa).toMatch(/8\.906\/1994/);
    expect(registro?.fonte_normativa).toMatch(/8\.906\/1994/);
  });
});

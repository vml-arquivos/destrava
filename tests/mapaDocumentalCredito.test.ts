import { describe, expect, it } from 'vitest';
import { gerarMapaDocumentalCredito, identificarRegimeCredito } from '../server/services/mapaDocumentalCreditoService';

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

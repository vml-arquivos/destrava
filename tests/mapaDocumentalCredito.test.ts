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

  it('não classifica como MEI quando o comprovante informa não optante pelo SIMEI', () => {
    const regime = identificarRegimeCredito(
      { regime_tributario: 'Simples Nacional', opcao_simples: true, opcao_mei: false },
      { situacao_simples: 'Optante pelo Simples Nacional', regime_tributario: 'Simples Nacional', opcao_mei: false, observacao: 'NÃO optante pelo SIMEI' },
    );
    expect(regime).toBe('simples_nacional');
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

import { describe, expect, it } from 'vitest';
import { buildEmpresaCnpjUpdate } from '../server/services/empresaCnpjEnrichment';

describe('enriquecimento CNPJ de empresas', () => {
  it('monta atualização aditiva apenas para colunas existentes', () => {
    const resultado = buildEmpresaCnpjUpdate(
      new Set([
        'nome_fantasia',
        'cidade',
        'estado',
        'cnae_principal',
        'cnaes_secundarios',
        'dados_extra_receita',
        'ultima_sincronizacao_receita',
        'updated_at',
      ]),
      {
        nome_fantasia: 'Empresa Teste',
        municipio: 'São Paulo',
        uf: 'SP',
        cnae_fiscal: 6201500,
        cnaes_secundarios: [{ codigo: '6202300', descricao: 'Desenvolvimento de software' }],
        data_sincronizacao: '2026-08-27T00:00:00.000Z',
        provedor_principal: 'brasilapi',
        fontes_consulta: [{ name: 'brasilapi', ok: true }],
        qsa_count: 0,
      },
      '2026-08-27T00:00:00.000Z',
    );

    expect(resultado.assignments.join(' ')).toContain('"nome_fantasia"');
    expect(resultado.assignments.join(' ')).toContain('"cidade"');
    expect(resultado.assignments.join(' ')).toContain('"cnaes_secundarios"');
    expect(resultado.assignments.join(' ')).toContain('"dados_extra_receita"');
    expect(resultado.assignments.join(' ')).not.toContain('"capital_social"');
    expect(resultado.values).toEqual(expect.arrayContaining(['Empresa Teste', 'São Paulo', 'SP', 6201500]));
    expect(resultado.values).toEqual(expect.arrayContaining([expect.stringContaining('enriquecimento_automatico_simulador')]));
  });

  it('não cria atualização quando nenhuma coluna de destino está disponível', () => {
    const resultado = buildEmpresaCnpjUpdate(new Set(), { razao_social: 'Empresa Teste' });

    expect(resultado).toEqual({ assignments: [], values: [] });
  });
});

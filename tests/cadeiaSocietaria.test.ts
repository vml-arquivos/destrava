import { describe, expect, it } from 'vitest';
import { calcularCadeiaComprovacaoSocietaria } from '../server/services/cadeiaSocietariaService';

describe('cadeia societária mínima de 12 meses', () => {
  const referencia = new Date('2026-08-06T12:00:00Z');

  it('exige somente o último documento quando o último registro já tem mais de 12 meses', () => {
    const resultado = calcularCadeiaComprovacaoSocietaria(
      [
        { numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' },
        { numero: '20232527288', data: '2023-08-30', tipo_ato: 'CONTRATO' },
      ],
      [{ arquivo_id: 'doc-1', nire: '52206183723', data_registro: '2025-06-06', consistente: true }],
      referencia,
    );
    expect(resultado.registros_requeridos).toHaveLength(1);
    expect(resultado.continuidade_12_meses_comprovada).toBe(true);
  });

  it('pede alterações anteriores até cruzar o corte de 12 meses', () => {
    const resultado = calcularCadeiaComprovacaoSocietaria(
      [
        { numero: 'A3', data: '2026-07-01', tipo_ato: 'ALTERAÇÃO' },
        { numero: 'A2', data: '2026-02-01', tipo_ato: 'ALTERAÇÃO' },
        { numero: 'A1', data: '2025-05-01', tipo_ato: 'ALTERAÇÃO' },
      ],
      [
        { arquivo_id: 'doc-3', data_registro: '2026-07-01', consistente: true },
        { arquivo_id: 'doc-2', data_registro: '2026-02-01', consistente: true },
      ],
      referencia,
    );
    expect(resultado.registros_requeridos.map((r) => r.data)).toEqual(['2026-07-01', '2026-02-01', '2025-05-01']);
    expect(resultado.registros_faltantes.map((r) => r.data)).toEqual(['2025-05-01']);
    expect(resultado.continuidade_12_meses_comprovada).toBe(false);
  });

  it('aprova quando todos os registros necessários estão comprovados', () => {
    const historico = [
      { numero: 'A3', data: '2026-07-01', tipo_ato: 'ALTERAÇÃO' },
      { numero: 'A2', data: '2026-02-01', tipo_ato: 'ALTERAÇÃO' },
      { numero: 'A1', data: '2025-05-01', tipo_ato: 'CONTRATO' },
    ];
    const documentos = historico.map((item, index) => ({ arquivo_id: `doc-${index}`, data_registro: item.data, consistente: true }));
    const resultado = calcularCadeiaComprovacaoSocietaria(historico, documentos, referencia);
    expect(resultado.registros_faltantes).toEqual([]);
    expect(resultado.historico_cobre_12_meses).toBe(true);
    expect(resultado.continuidade_12_meses_comprovada).toBe(true);
  });
});

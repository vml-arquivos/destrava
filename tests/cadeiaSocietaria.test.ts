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
      [{ arquivo_id: 'doc-1', nire: '52206183723', data_registro: '2025-06-06', numero_arquivamento: '20251505987', consistente: true }],
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
        { arquivo_id: 'doc-3', data_registro: '2026-07-01', numero_arquivamento: 'A3', consistente: true },
        { arquivo_id: 'doc-2', data_registro: '2026-02-01', numero_arquivamento: 'A2', consistente: true },
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
    const documentos = historico.map((item, index) => ({ arquivo_id: `doc-${index}`, data_registro: item.data, numero_arquivamento: item.numero, consistente: true }));
    const resultado = calcularCadeiaComprovacaoSocietaria(historico, documentos, referencia);
    expect(resultado.registros_faltantes).toEqual([]);
    expect(resultado.historico_cobre_12_meses).toBe(true);
    expect(resultado.continuidade_12_meses_comprovada).toBe(true);
  });

  it('dispensa atos quando a empresa é MEI e não há registros', () => {
    const resultado = calcularCadeiaComprovacaoSocietaria([], [], referencia, { empresaMei: true });
    expect(resultado.atos_dispensados_por_mei).toBe(true);
    expect(resultado.continuidade_12_meses_comprovada).toBe(true);
    expect(resultado.permite_seguir_com_inclusao_documental).toBe(true);
  });

  it('aceita inclusão com alerta quando não há atos e a empresa não é MEI', () => {
    const resultado = calcularCadeiaComprovacaoSocietaria([], [], referencia);
    expect(resultado.possivel_registro_em_outro_orgao).toBe(true);
    expect(resultado.permite_seguir_com_inclusao_documental).toBe(true);
    expect(resultado.continuidade_12_meses_comprovada).toBe(false);
  });

  it('solicita todos os atos e alerta tempo mínimo quando nenhum alcança 12 meses', () => {
    const resultado = calcularCadeiaComprovacaoSocietaria(
      [
        { numero: 'A2', data: '2026-07-01', tipo_ato: 'ALTERAÇÃO' },
        { numero: 'A1', data: '2026-01-01', tipo_ato: 'CONTRATO' },
      ],
      [],
      referencia,
    );
    expect(resultado.todos_atos_devem_ser_anexados).toBe(true);
    expect(resultado.empresa_sem_tempo_minimo_constituicao).toBe(true);
    expect(resultado.registros_requeridos).toHaveLength(2);
  });
  it('não presume correspondência só pela data quando a Junta informa número de arquivamento', () => {
    const resultado = calcularCadeiaComprovacaoSocietaria(
      [{ numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' }],
      [{ arquivo_id: 'doc-sem-numero', data_registro: '2025-06-06', consistente: true }],
      referencia,
    );
    expect(resultado.registros_faltantes).toHaveLength(1);
    expect(resultado.registros_faltantes[0]?.criterio_correspondencia).toBe('data_e_numero_arquivamento');
    expect(resultado.continuidade_12_meses_comprovada).toBe(false);
  });

  it('rejeita número de arquivamento divergente mesmo quando a data coincide', () => {
    const resultado = calcularCadeiaComprovacaoSocietaria(
      [{ numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' }],
      [{ arquivo_id: 'doc-errado', data_registro: '2025-06-06', numero_arquivamento: '20251505988', consistente: true }],
      referencia,
    );
    expect(resultado.registros_faltantes).toHaveLength(1);
    expect(resultado.continuidade_12_meses_comprovada).toBe(false);
  });

});

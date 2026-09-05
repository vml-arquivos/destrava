import { describe, expect, it } from 'vitest';
import {
  calcularCoberturaDocumentalSocios,
  validarComprovanteEnderecoExtraido,
  validarFaturamentoExtraido,
} from '../server/services/regrasDocumentaisCredito';

const referencia = new Date('2026-08-11T12:00:00Z');
const empresa = { cnpj: '12.345.678/0001-90' };
const socios = [
  { id: 's1', nome: 'Maria da Silva', administrador: true, ativo: true },
  { id: 's2', nome: 'João Souza', administrador: false, ativo: true },
];

describe('regras documentais de crédito', () => {
  it('aceita faturamento até o último mês fechado com assinaturas equivalentes', () => {
    const meses = Array.from({ length: 12 }, (_, indice) => {
      const data = new Date(Date.UTC(2025, 7 + indice, 1));
      return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const resultado = validarFaturamentoExtraido(empresa, socios, {
      cnpj: '12345678000190',
      meses_referencia: meses,
      data_assinatura: '2026-08-05',
      assinatura_socio_administrador: { presente: true, nome: 'Maria da Silva', tipo: 'eletrônica' },
      assinatura_contador: { presente: true, nome: 'Contador Teste', tipo: 'digital' },
    }, referencia);
    expect(resultado.alertas.filter((a) => ['alta', 'critica'].includes(a.severidade))).toEqual([]);
    expect(resultado.dados.ultimo_mes_identificado).toBe('2026-07');
    expect(resultado.dados.documento_obrigatorio).toBe(false);
  });

  it('reprova faturamento que inclui o mês corrente e assinaturas de modalidades diferentes', () => {
    const resultado = validarFaturamentoExtraido(empresa, socios, {
      cnpj: '12345678000190',
      meses_referencia: ['2026-08'],
      data_assinatura: '2026-08-11',
      assinatura_socio_administrador: { presente: true, nome: 'Maria da Silva', tipo: 'manual' },
      assinatura_contador: { presente: true, tipo: 'eletrônica' },
    }, referencia);
    expect(resultado.alertas.map((a) => a.codigo)).toContain('faturamento_mes_ainda_nao_fechado');
    expect(resultado.alertas.map((a) => a.codigo)).toContain('faturamento_assinaturas_modalidades_divergentes');
  });

  it('aceita comprovante de junho em agosto e pede justificativa para terceiro', () => {
    const resultado = validarComprovanteEnderecoExtraido(socios, { mes_referencia: '06/2026', nome_titular: 'Terceiro da Silva' }, 's1', referencia);
    expect(resultado.dados.comprovante_dentro_validade).toBe(true);
    expect(resultado.dados.exige_justificativa_titular).toBe(true);
    expect(resultado.alertas.map((a) => a.codigo)).toContain('endereco_titular_diferente_socio');
  });

  it('reprova comprovante anterior a dois meses', () => {
    const resultado = validarComprovanteEnderecoExtraido(socios, { mes_referencia: '05/2026', nome_titular: 'Maria da Silva' }, 's1', referencia);
    expect(resultado.alertas.map((a) => a.codigo)).toContain('endereco_fora_validade_dois_meses');
  });

  it('calcula cobertura separada para todos os sócios', () => {
    const cobertura = calcularCoberturaDocumentalSocios(socios, [
      { socio_id: 's1', tipo_documento: 'documento_socio' },
      { socio_id: 's1', tipo_documento: 'comprovante_residencia' },
      { socio_id: 's2', tipo_documento: 'documento_socio' },
    ], ['documento_socio', 'comprovante_residencia']);
    expect(cobertura.total_socios).toBe(2);
    expect(cobertura.socios_completos).toBe(1);
    expect(cobertura.por_socio[1].tipos_faltantes).toEqual(['comprovante_residencia']);
  });
});

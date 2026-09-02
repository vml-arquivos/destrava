import { describe, expect, it } from 'vitest';
import { normalizarNomeEmpresarial } from '../server/utils/helpers';

// Rodada 21 (02/09/2026) -- print real mostrando "Cartão CNPJ diverge dos
// dados da Receita Federal" e "A razão social do QSA diverge da razão social
// sincronizada" para uma empresa Empresário Individual (CNPJ 29.705.345/0001-22)
// cujo Cartão CNPJ oficial mostra exatamente a mesma pessoa que já está
// cadastrada na Receita/sistema -- a única diferença é que o documento oficial
// imprime o radical do CNPJ na frente do nome ("29.705.345 VILSON MARCIO DE
// LIMA"), convenção padrão da Receita Federal para Empresário Individual, que
// as APIs gratuitas (BrasilAPI/OpenCNPJ) não replicam ao sincronizar
// `razao_social` (só "VILSON MARCIO DE LIMA"). Esses testes provam que a
// normalização passa a tratar as duas formas como equivalentes -- para
// QUALQUER empresa nesse formato, não só para este CNPJ específico.
describe('normalizarNomeEmpresarial -- radical do CNPJ de Empresário Individual não gera falso positivo de divergência', () => {
  it('trata "29.705.345 VILSON MARCIO DE LIMA" (documento oficial) e "VILSON MARCIO DE LIMA" (API gratuita) como o mesmo nome', () => {
    const doDocumento = normalizarNomeEmpresarial('29.705.345 VILSON MARCIO DE LIMA');
    const daReceita = normalizarNomeEmpresarial('VILSON MARCIO DE LIMA');
    expect(doDocumento).toBe(daReceita);
  });

  it('funciona com o radical sem pontuação também (29705345 VILSON MARCIO DE LIMA)', () => {
    const doDocumento = normalizarNomeEmpresarial('29705345 VILSON MARCIO DE LIMA');
    const daReceita = normalizarNomeEmpresarial('VILSON MARCIO DE LIMA');
    expect(doDocumento).toBe(daReceita);
  });

  it('é uma regra geral -- funciona para qualquer outro CNPJ/nome de Empresário Individual, não só o do caso relatado', () => {
    const doDocumento = normalizarNomeEmpresarial('11.222.333 MARIA JOSE DA SILVA');
    const daReceita = normalizarNomeEmpresarial('MARIA JOSE DA SILVA');
    expect(doDocumento).toBe(daReceita);
  });

  it('continua identificando uma divergência real de nome (não mascara um problema genuíno)', () => {
    const doDocumento = normalizarNomeEmpresarial('29.705.345 VILSON MARCIO DE LIMA');
    const daReceita = normalizarNomeEmpresarial('OUTRA PESSOA COMPLETAMENTE DIFERENTE');
    expect(doDocumento).not.toBe(daReceita);
  });

  it('não remove um número que não seja um radical de CNPJ completo (menos de 8 dígitos) mesmo no início do nome', () => {
    // Garante que a regra só atua num radical de exatamente 8 dígitos (com ou
    // sem pontuação) seguido de espaço no INÍCIO do texto -- nunca em números
    // mais curtos que fazem parte do próprio nome fantasia, como "24 Horas".
    expect(normalizarNomeEmpresarial('24 Horas Comercio Ltda')).toBe(normalizarNomeEmpresarial('24 Horas Comercio Ltda'));
    expect(normalizarNomeEmpresarial('24 Horas Comercio Ltda')).toContain('24horascomercioltda');
  });

  it('mantém o comportamento anterior para razão social comum (empresa LTDA, sem radical no início)', () => {
    const a = normalizarNomeEmpresarial('Comercio de Alimentos Silva Ltda');
    const b = normalizarNomeEmpresarial('COMERCIO DE ALIMENTOS SILVA LTDA');
    expect(a).toBe(b);
  });
});

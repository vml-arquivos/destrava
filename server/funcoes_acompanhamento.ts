/**
 * funcoes_acompanhamento.ts
 * Funções de cálculo para o módulo de Acompanhamento Bancário
 * Sistema: Destrava Crédito
 *
 * REGRA OFICIAL:
 *   teto_anual = faturamento_anual * 1.30
 *   faturamento_mensal_base = faturamento_anual / 12
 *   teto_mensal = teto_anual / 12
 *   referencia_semanal_base = faturamento_mensal_base / semanas_no_mes (padrão 4)
 *   teto_semanal = teto_mensal / semanas_no_mes
 */

// ─── Arredondamento seguro ────────────────────────────────────────────────────
export function round2(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

// ─── Quantidade de semanas do mês ─────────────────────────────────────────────
/**
 * Conta quantas semanas (segunda-feira como início) começam dentro do mês.
 * Retorna no mínimo 4 (padrão operacional).
 */
export function calcularSemanasDoMes(ano: number, mes: number): number {
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  let semanas = 0;
  const d = new Date(primeiroDia);
  while (d <= ultimoDia) {
    if (d.getDay() === 1) semanas++; // segunda-feira
    d.setDate(d.getDate() + 1);
  }
  return semanas > 0 ? semanas : 4;
}

// ─── Calcular referências de acompanhamento ───────────────────────────────────
export interface ReferenciasAcompanhamento {
  faturamento_anual_ref: number;
  teto_anual_movimentacao: number;
  faturamento_mensal_base: number;
  teto_mensal_movimentacao: number;
  referencia_semanal_base: number;
  teto_semanal_movimentacao: number;
  semanas_no_mes: number;
}

export function calcularReferenciasAcompanhamento(
  faturamentoAnual: number,
  anoRef?: number,
  mesRef?: number
): ReferenciasAcompanhamento {
  const fat = round2(faturamentoAnual);
  if (!fat || fat <= 0) {
    return {
      faturamento_anual_ref: 0,
      teto_anual_movimentacao: 0,
      faturamento_mensal_base: 0,
      teto_mensal_movimentacao: 0,
      referencia_semanal_base: 0,
      teto_semanal_movimentacao: 0,
      semanas_no_mes: 4,
    };
  }
  const ano = anoRef ?? new Date().getFullYear();
  const mes = mesRef ?? new Date().getMonth() + 1;
  const semanasNoMes = calcularSemanasDoMes(ano, mes);

  const tetoAnual = round2(fat * 1.30);
  const fatMensalBase = round2(fat / 12);
  const tetoMensal = round2(tetoAnual / 12);
  const refSemanal = round2(fatMensalBase / semanasNoMes);
  const tetoSemanal = round2(tetoMensal / semanasNoMes);

  return {
    faturamento_anual_ref: fat,
    teto_anual_movimentacao: tetoAnual,
    faturamento_mensal_base: fatMensalBase,
    teto_mensal_movimentacao: tetoMensal,
    referencia_semanal_base: refSemanal,
    teto_semanal_movimentacao: tetoSemanal,
    semanas_no_mes: semanasNoMes,
  };
}

// ─── Calcular totais da semana ─────────────────────────────────────────────────
export interface TotaisSemana {
  total_entradas: number;
  total_saidas: number;
  saldo_semanal: number;
}

export function calcularTotaisSemana(semana: Record<string, unknown>): TotaisSemana {
  const totalEntradas = round2(
    Number(semana.entrada_maquininha ?? 0) +
    Number(semana.entrada_pix ?? 0) +
    Number(semana.entrada_boleto ?? 0) +
    Number(semana.entrada_ted ?? 0) +
    Number(semana.entrada_dinheiro ?? 0) +
    Number(semana.outras_entradas ?? 0)
  );
  const totalSaidas = round2(Number(semana.total_saidas ?? 0));
  const saldoSemanal = round2(totalEntradas - totalSaidas);
  return { total_entradas: totalEntradas, total_saidas: totalSaidas, saldo_semanal: saldoSemanal };
}

// ─── Status de aderência da semana ────────────────────────────────────────────
export type StatusAderencia =
  | 'abaixo_da_referencia'
  | 'dentro_da_faixa'
  | 'acima_do_teto'
  | 'critico'
  | 'aguardando_atualizacao';

export function calcularStatusAderencia(
  totalEntradas: number,
  referenciaSemanal: number,
  tetoSemanal: number
): StatusAderencia {
  if (!referenciaSemanal || !tetoSemanal) return 'aguardando_atualizacao';
  if (totalEntradas < referenciaSemanal) return 'abaixo_da_referencia';
  if (totalEntradas <= tetoSemanal) return 'dentro_da_faixa';
  // Acima do teto
  const percentualExcedente = (totalEntradas / tetoSemanal) * 100;
  if (percentualExcedente > 200) return 'critico';
  return 'acima_do_teto';
}

// ─── Calcular compensação mensal dinâmica ─────────────────────────────────────
export interface CompensacaoMensal {
  acumulado_mensal: number;
  saldo_faltante_ref_mensal: number;
  saldo_disponivel_teto_mensal: number;
  semanas_restantes_mes: number;
  meta_base_dinamica: number;
  teto_dinamico_proxima: number;
  valor_abaixo_semana: number;
  valor_excedente_semana: number;
  percentual_uso_semanal: number;
  percentual_uso_mensal: number;
  percentual_uso_anual: number;
  status_aderencia: StatusAderencia;
  alerta_aderencia: boolean;
  motivo_alerta_aderencia: string;
}

export function calcularCompensacaoMensal(
  totalEntradasSemana: number,
  acumuladoMensalAnterior: number,
  acumuladoAnual: number,
  numeroSemanaAtual: number,
  refs: ReferenciasAcompanhamento
): CompensacaoMensal {
  const acumuladoMensal = round2(acumuladoMensalAnterior + totalEntradasSemana);
  const acumuladoAnualTotal = round2(acumuladoAnual + totalEntradasSemana);

  const saldoFaltante = round2(refs.faturamento_mensal_base - acumuladoMensal);
  const saldoDisponivel = round2(refs.teto_mensal_movimentacao - acumuladoMensal);

  const semanasRestantes = Math.max(0, refs.semanas_no_mes - numeroSemanaAtual);

  const metaBaseDinamica = semanasRestantes > 0
    ? round2(Math.max(0, saldoFaltante) / semanasRestantes)
    : 0;
  const tetoDinamico = semanasRestantes > 0
    ? round2(Math.max(0, saldoDisponivel) / semanasRestantes)
    : 0;

  const valorAbaixo = totalEntradasSemana < refs.referencia_semanal_base
    ? round2(refs.referencia_semanal_base - totalEntradasSemana)
    : 0;
  const valorExcedente = totalEntradasSemana > refs.teto_semanal_movimentacao
    ? round2(totalEntradasSemana - refs.teto_semanal_movimentacao)
    : 0;

  const pctSemanal = refs.teto_semanal_movimentacao > 0
    ? round2((totalEntradasSemana / refs.teto_semanal_movimentacao) * 100)
    : 0;
  const pctMensal = refs.teto_mensal_movimentacao > 0
    ? round2((acumuladoMensal / refs.teto_mensal_movimentacao) * 100)
    : 0;
  const pctAnual = refs.teto_anual_movimentacao > 0
    ? round2((acumuladoAnualTotal / refs.teto_anual_movimentacao) * 100)
    : 0;

  const statusAderencia = calcularStatusAderencia(
    totalEntradasSemana,
    refs.referencia_semanal_base,
    refs.teto_semanal_movimentacao
  );

  const alertaAderencia = pctMensal > 100 || pctAnual > 100 || pctSemanal > 150;
  let motivoAlerta = '';
  if (statusAderencia === 'abaixo_da_referencia') {
    motivoAlerta = `Alerta de rating: a movimentação semanal ficou abaixo da referência esperada. Faltou movimentar aproximadamente ${moneyBRServer(valorAbaixo)} para atingir a referência semanal base. Recomenda-se reforçar a movimentação das próximas semanas para manter coerência com o faturamento declarado.`;
  } else if (statusAderencia === 'acima_do_teto' || statusAderencia === 'critico') {
    motivoAlerta = `Alerta de aderência financeira: a movimentação semanal ultrapassou o teto permitido para o período em aproximadamente ${moneyBRServer(valorExcedente)}. Recomenda-se controlar as próximas semanas para manter compatibilidade com o faturamento declarado.`;
  } else if (alertaAderencia) {
    motivoAlerta = 'Movimentação acima da referência configurada para o período. Recomenda-se revisar os lançamentos e a documentação comprobatória.';
  }

  return {
    acumulado_mensal: acumuladoMensal,
    saldo_faltante_ref_mensal: saldoFaltante,
    saldo_disponivel_teto_mensal: saldoDisponivel,
    semanas_restantes_mes: semanasRestantes,
    meta_base_dinamica: metaBaseDinamica,
    teto_dinamico_proxima: tetoDinamico,
    valor_abaixo_semana: valorAbaixo,
    valor_excedente_semana: valorExcedente,
    percentual_uso_semanal: pctSemanal,
    percentual_uso_mensal: pctMensal,
    percentual_uso_anual: pctAnual,
    status_aderencia: statusAderencia,
    alerta_aderencia: alertaAderencia,
    motivo_alerta_aderencia: motivoAlerta,
  };
}

// ─── Gerar diagnóstico técnico ─────────────────────────────────────────────────
export function gerarDiagnosticoSemana(
  comp: CompensacaoMensal,
  refs: ReferenciasAcompanhamento,
  numeroSemana: number
): string {
  const linhas: string[] = [];
  linhas.push(`Semana ${numeroSemana} — Diagnóstico técnico de aderência financeira.`);

  if (comp.status_aderencia === 'abaixo_da_referencia') {
    linhas.push(`Movimentação abaixo da referência semanal base (${moneyBRServer(refs.referencia_semanal_base)}).`);
    linhas.push(`Faltou movimentar ${moneyBRServer(comp.valor_abaixo_semana)}.`);
    linhas.push(`Recomenda-se reforçar a movimentação nas próximas semanas para manter coerência com o faturamento declarado e melhorar o acompanhamento bancário.`);
  } else if (comp.status_aderencia === 'dentro_da_faixa') {
    linhas.push(`Movimentação dentro da faixa esperada (entre ${moneyBRServer(refs.referencia_semanal_base)} e ${moneyBRServer(refs.teto_semanal_movimentacao)}).`);
  } else if (comp.status_aderencia === 'acima_do_teto') {
    linhas.push(`Movimentação acima do teto semanal permitido (${moneyBRServer(refs.teto_semanal_movimentacao)}).`);
    linhas.push(`Excedeu ${moneyBRServer(comp.valor_excedente_semana)} acima do teto.`);
    linhas.push(`Recomenda-se controlar/reduzir a movimentação das próximas semanas para manter aderência ao teto mensal.`);
  } else if (comp.status_aderencia === 'critico') {
    linhas.push(`CRÍTICO: Movimentação muito acima do teto semanal permitido.`);
    linhas.push(`Excedeu ${moneyBRServer(comp.valor_excedente_semana)} acima do teto.`);
    linhas.push(`Ação imediata necessária para controle de aderência financeira.`);
  }

  if (comp.semanas_restantes_mes > 0) {
    linhas.push(`Semanas restantes no mês: ${comp.semanas_restantes_mes}.`);
    linhas.push(`Meta base para próximas semanas: ${moneyBRServer(comp.meta_base_dinamica)}/semana.`);
    linhas.push(`Teto dinâmico para próximas semanas: ${moneyBRServer(comp.teto_dinamico_proxima)}/semana.`);
  } else {
    const fechamento =
      comp.acumulado_mensal >= refs.faturamento_mensal_base &&
      comp.acumulado_mensal <= refs.teto_mensal_movimentacao
        ? 'dentro da referência'
        : comp.acumulado_mensal < refs.faturamento_mensal_base
        ? 'abaixo da referência'
        : 'acima do teto';
    linhas.push(`Fechamento do mês: ${fechamento}.`);
  }

  return linhas.join(' ');
}

// ─── Helper de formatação monetária para o servidor ───────────────────────────
function moneyBRServer(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Calcular acumulado mensal e anual a partir de lista de atualizações ───────
export function calcularAcumulados(
  atualizacoes: Array<Record<string, unknown>>,
  numeroSemanaAtual: number,
  mesRef: number,
  anoRef: number
): { acumuladoMensalAnterior: number; acumuladoAnual: number } {
  let acumuladoMensalAnterior = 0;
  let acumuladoAnual = 0;

  for (const s of atualizacoes) {
    const numSem = Number(s.numero_semana ?? 0);
    if (numSem >= numeroSemanaAtual) continue; // não inclui a semana atual

    const dataInicio = s.data_referencia_inicio
      ? new Date(String(s.data_referencia_inicio) + 'T00:00:00Z')
      : null;

    const entradas = round2(
      Number(s.total_entradas ?? 0) ||
      (Number(s.entrada_maquininha ?? 0) +
        Number(s.entrada_pix ?? 0) +
        Number(s.entrada_boleto ?? 0) +
        Number(s.entrada_ted ?? 0) +
        Number(s.entrada_dinheiro ?? 0) +
        Number(s.outras_entradas ?? 0))
    );

    // Acumulado anual: todas as semanas do ano
    if (dataInicio && dataInicio.getUTCFullYear() === anoRef) {
      acumuladoAnual = round2(acumuladoAnual + entradas);
    }

    // Acumulado mensal: semanas do mesmo mês
    if (
      dataInicio &&
      dataInicio.getUTCFullYear() === anoRef &&
      dataInicio.getUTCMonth() + 1 === mesRef
    ) {
      acumuladoMensalAnterior = round2(acumuladoMensalAnterior + entradas);
    }
  }

  return { acumuladoMensalAnterior, acumuladoAnual };
}

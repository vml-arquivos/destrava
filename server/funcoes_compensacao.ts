export type StatusCompensacao =
  | "dentro_referencia"
  | "acima_referencia"
  | "abaixo_referencia"
  | "risco_rating"
  | "alerta_aderencia"
  | "critico"
  | "aguardando_atualizacao";

export type AnaliseAcompanhamentoDinamico = {
  media_mensal_referencia: number;
  limite_mensal_referencia: number;
  media_semanal_referencia: number;
  quantidade_semanas_mes: number;
  compensacao_semana_anterior: number;
  entrada_com_compensacao: number;
  diferenca_referencia_semanal: number;
  compensacao_necessaria_proxima: number;
  saldo_semanal: number;
  saldo_faltante_mes: number;
  meta_dinamica_proxima_semana: number;
  valor_excedente_mes: number;
  percentual_limite_semanal: number;
  percentual_limite_mensal: number;
  percentual_limite_anual: number;
  alerta_aderencia: boolean;
  alerta_rating: boolean;
  motivo_alerta_aderencia: string | null;
  status_compensacao: StatusCompensacao;
  diagnostico_compensacao: string;
};

export function round2(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function calcularQuantidadeSemanasDoMes(_dataReferencia?: string | Date | null, quantidadeConfigurada = 4): number {
  const n = Number(quantidadeConfigurada || 4);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return Math.round(n);
  return 4;
}

export function calcularReferenciasFaturamento(
  faturamentoAnual: number,
  percentualMargem = 30,
  quantidadeSemanasMes = 4
) {
  const mediaMensal = round2(Number(faturamentoAnual || 0) / 12);
  const margem = Number(percentualMargem || 30);
  const margemDecimal = margem > 1 ? margem / 100 : margem;
  const limiteMensal = round2(mediaMensal * (1 + margemDecimal));
  const semanas = calcularQuantidadeSemanasDoMes(null, quantidadeSemanasMes);
  const mediaSemanal = round2(limiteMensal / semanas);

  return {
    mediaMensal,
    limiteMensal,
    mediaSemanal,
    media_mensal_referencia: mediaMensal,
    limite_mensal_referencia: limiteMensal,
    media_semanal_referencia: mediaSemanal,
    quantidade_semanas_mes: semanas,
  };
}

export function calcularAcompanhamentoBancarioDinamico(args: {
  faturamentoAnual: number;
  totalEntradas: number;
  totalSaidas: number;
  numeroSemana: number;
  quantidadeSemanasMes?: number;
  percentualMargem?: number;
  compensacaoSemanaAnterior?: number;
  acumuladoMensalAnterior?: number;
  acumuladoAnualAnterior?: number;
  toleranciaAbaixoRatingPercent?: number;
}): AnaliseAcompanhamentoDinamico {
  const semanas = calcularQuantidadeSemanasDoMes(null, args.quantidadeSemanasMes || 4);
  const numeroSemana = Math.min(Math.max(1, Number(args.numeroSemana || 1)), semanas);
  const refs = calcularReferenciasFaturamento(args.faturamentoAnual, args.percentualMargem ?? 30, semanas);

  const totalEntradas = round2(args.totalEntradas);
  const totalSaidas = round2(args.totalSaidas);
  const compensacaoAnterior = round2(args.compensacaoSemanaAnterior || 0);
  const acumuladoMensalAnterior = round2(args.acumuladoMensalAnterior || 0);
  const acumuladoAnualAnterior = round2(args.acumuladoAnualAnterior || 0);

  const saldoSemanal = round2(totalEntradas - totalSaidas);
  const entradaComCompensacao = round2(totalEntradas - compensacaoAnterior);
  const diferenca = round2(entradaComCompensacao - refs.mediaSemanal);
  const compensacaoProxima = diferenca;

  const acumuladoMensalComSemana = round2(acumuladoMensalAnterior + totalEntradas);
  const acumuladoAnualComSemana = round2(acumuladoAnualAnterior + totalEntradas);
  const saldoFaltanteMes = round2(refs.limiteMensal - acumuladoMensalComSemana);
  const valorExcedenteMes = round2(Math.max(0, acumuladoMensalComSemana - refs.limiteMensal));
  const semanasRestantes = Math.max(0, semanas - numeroSemana);
  const metaDinamicaProximaSemana = semanasRestantes > 0 ? round2(saldoFaltanteMes / semanasRestantes) : 0;

  const percentualSemanal = refs.mediaSemanal > 0 ? round2((entradaComCompensacao / refs.mediaSemanal) * 100) : 0;
  const percentualMensal = refs.limiteMensal > 0 ? round2((acumuladoMensalComSemana / refs.limiteMensal) * 100) : 0;
  const percentualAnual = Number(args.faturamentoAnual || 0) > 0 ? round2((acumuladoAnualComSemana / Number(args.faturamentoAnual || 0)) * 100) : 0;

  const projecaoMensal = numeroSemana > 0 ? round2((acumuladoMensalComSemana / numeroSemana) * semanas) : 0;
  const limiteRating = refs.limiteMensal * ((args.toleranciaAbaixoRatingPercent ?? 80) / 100);

  const alertaAderencia = percentualMensal > 100 || percentualSemanal > 150;
  const alertaRating = projecaoMensal > 0 && projecaoMensal < limiteRating;

  let status: StatusCompensacao = "dentro_referencia";
  if (percentualMensal > 120 || percentualSemanal > 200) status = "critico";
  else if (alertaAderencia) status = "alerta_aderencia";
  else if (alertaRating) status = "risco_rating";
  else if (diferenca > 0) status = "acima_referencia";
  else if (diferenca < 0) status = "abaixo_referencia";

  const motivo = alertaAderencia
    ? "Movimentação acima da referência configurada para o período. Recomenda-se revisar os lançamentos e a documentação comprobatória."
    : alertaRating
      ? "Movimentação projetada abaixo da referência esperada para análise de crédito. Recomenda-se revisar a estratégia de movimentação do período."
      : null;

  const diagnostico = gerarDiagnosticoCompensacao({
    faturamentoAnual: Number(args.faturamentoAnual || 0),
    totalEntradas,
    totalSaidas,
    acumuladoMensalComSemana,
    projecaoMensal,
    ...refs,
    compensacao_semana_anterior: compensacaoAnterior,
    entrada_com_compensacao: entradaComCompensacao,
    diferenca_referencia_semanal: diferenca,
    compensacao_necessaria_proxima: compensacaoProxima,
    saldo_faltante_mes: saldoFaltanteMes,
    meta_dinamica_proxima_semana: metaDinamicaProximaSemana,
    percentual_limite_semanal: percentualSemanal,
    percentual_limite_mensal: percentualMensal,
    status_compensacao: status,
  });

  return {
    media_mensal_referencia: refs.mediaMensal,
    limite_mensal_referencia: refs.limiteMensal,
    media_semanal_referencia: refs.mediaSemanal,
    quantidade_semanas_mes: semanas,
    compensacao_semana_anterior: compensacaoAnterior,
    entrada_com_compensacao: entradaComCompensacao,
    diferenca_referencia_semanal: diferenca,
    compensacao_necessaria_proxima: compensacaoProxima,
    saldo_semanal: saldoSemanal,
    saldo_faltante_mes: saldoFaltanteMes,
    meta_dinamica_proxima_semana: metaDinamicaProximaSemana,
    valor_excedente_mes: valorExcedenteMes,
    percentual_limite_semanal: percentualSemanal,
    percentual_limite_mensal: percentualMensal,
    percentual_limite_anual: percentualAnual,
    alerta_aderencia: alertaAderencia,
    alerta_rating: alertaRating,
    motivo_alerta_aderencia: motivo,
    status_compensacao: status,
    diagnostico_compensacao: diagnostico,
  };
}

export function gerarDiagnosticoCompensacao(data: Record<string, any>): string {
  const fmt = (v: unknown) => round2(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (v: unknown) => `${round2(v).toFixed(2).replace(".", ",")}%`;
  const linhas: string[] = [];

  linhas.push(`Faturamento anual declarado: ${fmt(data.faturamentoAnual)}.`);
  linhas.push(`Média mensal base: ${fmt(data.media_mensal_referencia)}.`);
  linhas.push(`Movimentação mensal permitida (+30%): ${fmt(data.limite_mensal_referencia)}.`);
  linhas.push(`Meta semanal de referência: ${fmt(data.media_semanal_referencia)}.`);

  if (round2(data.diferenca_referencia_semanal) > 0) {
    linhas.push(`A semana ficou acima da referência em ${fmt(data.diferenca_referencia_semanal)}. Próxima semana deve reduzir/segurar esse valor ou seguir a meta dinâmica.`);
  } else if (round2(data.diferenca_referencia_semanal) < 0) {
    linhas.push(`A semana ficou abaixo da referência em ${fmt(Math.abs(data.diferenca_referencia_semanal))}. Próxima semana deve aumentar esse valor ou seguir a meta dinâmica.`);
  } else {
    linhas.push("A semana ficou exatamente dentro da referência definida.");
  }

  linhas.push(`Saldo faltante para fechar o mês no teto permitido: ${fmt(data.saldo_faltante_mes)}.`);
  if (round2(data.meta_dinamica_proxima_semana) > 0) {
    linhas.push(`Meta dinâmica sugerida para cada semana restante: ${fmt(data.meta_dinamica_proxima_semana)}.`);
  }
  linhas.push(`Uso semanal: ${pct(data.percentual_limite_semanal)}. Uso mensal: ${pct(data.percentual_limite_mensal)}.`);

  if (data.status_compensacao === "alerta_aderencia" || data.status_compensacao === "critico") {
    linhas.push("Alerta de aderência financeira: movimentação acima da referência configurada para o período. Revisar lançamentos e documentação comprobatória.");
  } else if (data.status_compensacao === "risco_rating") {
    linhas.push("Alerta de rating: movimentação projetada abaixo da referência esperada para análise de crédito.");
  }

  return linhas.join("\n");
}

export function classificarStatusCompensacao(
  diferenca: number,
  alertaAderencia: boolean,
  alertaRating = false
): StatusCompensacao {
  if (alertaAderencia) return "alerta_aderencia";
  if (alertaRating) return "risco_rating";
  if (round2(diferenca) > 0) return "acima_referencia";
  if (round2(diferenca) < 0) return "abaixo_referencia";
  return "dentro_referencia";
}

export function calcularCompensacaoSemanal(args: {
  totalEntradas: number;
  totalSaidas: number;
  compensacaoSemanaAnterior: number;
  mediaSemanalReferencia?: number;
  acumuladoMensal?: number;
  limiteMensalReferencia?: number;
  acumuladoAnual?: number;
  faturamentoAnual: number;
  numeroSemana?: number;
  quantidadeSemanasMes?: number;
}) {
  const resultado = calcularAcompanhamentoBancarioDinamico({
    faturamentoAnual: args.faturamentoAnual,
    totalEntradas: args.totalEntradas,
    totalSaidas: args.totalSaidas,
    numeroSemana: args.numeroSemana || 1,
    quantidadeSemanasMes: args.quantidadeSemanasMes || 4,
    compensacaoSemanaAnterior: args.compensacaoSemanaAnterior,
    acumuladoMensalAnterior: Math.max(0, Number(args.acumuladoMensal || 0) - Number(args.totalEntradas || 0)),
    acumuladoAnualAnterior: Math.max(0, Number(args.acumuladoAnual || 0) - Number(args.totalEntradas || 0)),
  });

  return {
    ...resultado,
    entradaComCompensacao: resultado.entrada_com_compensacao,
    diferenca: resultado.diferenca_referencia_semanal,
    compensacaoProxima: resultado.compensacao_necessaria_proxima,
    percentualSemanal: resultado.percentual_limite_semanal,
    percentualMensal: resultado.percentual_limite_mensal,
    percentualAnual: resultado.percentual_limite_anual,
    alertaAderencia: resultado.alerta_aderencia,
  };
}

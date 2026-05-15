export function calcularQuantidadeSemanasDoMes(dataReferencia?: string | Date | null): number {
  const d = dataReferencia ? new Date(dataReferencia) : new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.ceil(last / 7);
}

export function calcularReferenciasFaturamento(faturamentoAnual: number, percentualMargem = 0.3, quantidadeSemanasMes = 4) {
  const mediaMensal = faturamentoAnual / 12;
  const limiteMensal = mediaMensal * (1 + percentualMargem);
  const mediaSemanal = limiteMensal / Math.max(1, quantidadeSemanasMes);
  return { mediaMensal, limiteMensal, mediaSemanal };
}

export function calcularCompensacaoSemanal(args: {
  totalEntradas: number;
  totalSaidas: number;
  compensacaoSemanaAnterior: number;
  mediaSemanalReferencia: number;
  acumuladoMensal: number;
  limiteMensalReferencia: number;
  acumuladoAnual: number;
  faturamentoAnual: number;
}) {
  const entradaComCompensacao = args.totalEntradas - args.compensacaoSemanaAnterior;
  const diferenca = entradaComCompensacao - args.mediaSemanalReferencia;
  const compensacaoProxima = diferenca;
  const saldoSemanal = args.totalEntradas - args.totalSaidas;
  const percentualSemanal = args.mediaSemanalReferencia > 0 ? (entradaComCompensacao / args.mediaSemanalReferencia) * 100 : 0;
  const percentualMensal = args.limiteMensalReferencia > 0 ? (args.acumuladoMensal / args.limiteMensalReferencia) * 100 : 0;
  const percentualAnual = args.faturamentoAnual > 0 ? (args.acumuladoAnual / args.faturamentoAnual) * 100 : 0;
  const alertaAderencia = percentualSemanal > 150 || percentualMensal > 100 || percentualAnual > 100;
  return { entradaComCompensacao, diferenca, compensacaoProxima, saldoSemanal, percentualSemanal, percentualMensal, percentualAnual, alertaAderencia };
}

export function gerarDiagnosticoCompensacao(alertaAderencia: boolean, diferenca: number) {
  if (alertaAderencia) {
    return "Movimentação acima da referência configurada para o período. Recomenda-se revisar os lançamentos e a documentação comprobatória.";
  }
  if (diferenca > 0) return `Acima da referência semanal em R$ ${diferenca.toFixed(2)}. Recomenda-se compensar para baixo na próxima semana.`;
  if (diferenca < 0) return `Abaixo da referência semanal em R$ ${Math.abs(diferenca).toFixed(2)}. Recomenda-se compensar para cima na próxima semana.`;
  return "Dentro da referência semanal. Sem compensação necessária.";
}

export function classificarStatusCompensacao(diferenca: number, alertaAderencia: boolean) {
  if (alertaAderencia) return "atencao";
  if (diferenca > 0) return "acima_referencia";
  if (diferenca < 0) return "abaixo_referencia";
  return "dentro_referencia";
}

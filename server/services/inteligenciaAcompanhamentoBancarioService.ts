/**
 * inteligenciaAcompanhamentoBancarioService.ts
 *
 * Sprint 9 — Inteligência Consultiva no Acompanhamento Bancário.
 *
 * Camada consultiva: preserva a lógica financeira existente do módulo de
 * Acompanhamento Bancário e apenas interpreta os dados já calculados/registrados.
 */

import {
  calcularReferenciasAcompanhamento,
  calcularTotaisSemana,
  calcularCompensacaoMensal,
  calcularAcumulados,
  round2,
  type StatusAderencia,
} from "../funcoes_acompanhamento.ts";

export type StatusInteligenteAcompanhamento = "positivo" | "atencao" | "critico";
export type ImpactoRatingAcompanhamento = "melhora" | "mantem" | "prejudica" | "exige_correcao";
export type ProntidaoCreditoAcompanhamento = "pronta" | "quase_pronta" | "em_preparacao" | "nao_recomendada";

export interface ItemInteligenciaAcompanhamento {
  titulo: string;
  descricao: string;
  prioridade?: "baixa" | "media" | "alta" | "critica";
  impactoEsperado?: string;
}

export interface InteligenciaAcompanhamentoBancarioResultado {
  statusInteligente: StatusInteligenteAcompanhamento;
  impactoNoRating: ImpactoRatingAcompanhamento;
  prontidaoCredito: ProntidaoCreditoAcompanhamento;
  resumoExecutivo: string;
  diagnostico: ItemInteligenciaAcompanhamento[];
  alertas: ItemInteligenciaAcompanhamento[];
  pontosFortes: ItemInteligenciaAcompanhamento[];
  pontosAtencao: ItemInteligenciaAcompanhamento[];
  riscos: ItemInteligenciaAcompanhamento[];
  planoAcao: ItemInteligenciaAcompanhamento[];
  proximaMelhorAcao: string;
  parecerTecnico: string;
  orientacaoInterna: string;
  orientacaoCliente: string;
  metricas: Record<string, number | string | null>;
  geradoEm: string;
  fonte: "deterministica";
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(Boolean) as T[]) : [];
}

function moneyBR(value: unknown): string {
  return asNumber(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percentual(value: unknown): string {
  return `${round2(value).toFixed(1).replace(".", ",")}%`;
}

function dataISO(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || "").trim();
  if (!raw) return null;
  const iso = raw.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function totalEntradas(semana: Record<string, unknown> | null | undefined): number {
  if (!semana) return 0;
  return round2(asNumber(semana.total_entradas) || calcularTotaisSemana(semana).total_entradas);
}

function ordenarSemanas(atualizacoes: unknown): any[] {
  return safeArray<any>(atualizacoes).sort((a, b) => {
    const na = asNumber(a?.numero_semana);
    const nb = asNumber(b?.numero_semana);
    if (na !== nb) return na - nb;
    return String(a?.data_referencia_inicio || "").localeCompare(String(b?.data_referencia_inicio || ""));
  });
}

function escolherSemanaAtual(acompanhamento: any, atualizacoes: any[]): any | null {
  if (!atualizacoes.length) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const emCurso = atualizacoes.find((semana) => {
    const ini = dataISO(semana?.data_referencia_inicio);
    const fim = dataISO(semana?.data_referencia_fim);
    if (!ini || !fim) return false;
    const di = new Date(`${ini}T00:00:00Z`);
    const df = new Date(`${fim}T00:00:00Z`);
    // Usa UTC para preservar o mesmo critério do backend/relatórios.
    const h = new Date(`${hoje.toISOString().slice(0, 10)}T00:00:00Z`);
    return di <= h && h <= df;
  });
  if (emCurso) return emCurso;

  const passadas = atualizacoes.filter((semana) => {
    const fim = dataISO(semana?.data_referencia_fim);
    if (!fim) return false;
    return new Date(`${fim}T00:00:00Z`) <= new Date(`${hoje.toISOString().slice(0, 10)}T00:00:00Z`);
  });
  if (passadas.length) return passadas[passadas.length - 1];

  const numero = asNumber(acompanhamento?.numero_semana_atual || acompanhamento?.semana_atual);
  if (numero > 0) return atualizacoes.find((s) => asNumber(s?.numero_semana) === numero) || atualizacoes[0];
  return atualizacoes[0];
}

function mesAnoDaSemana(semana: any): { ano: number; mes: number } {
  const iso = dataISO(semana?.data_referencia_inicio || semana?.data_atualizacao) || new Date().toISOString().slice(0, 10);
  const [ano, mes] = iso.split("-").map(Number);
  return { ano: ano || new Date().getFullYear(), mes: mes || new Date().getMonth() + 1 };
}

function statusLabel(status: StatusAderencia | string): string {
  const mapa: Record<string, string> = {
    aguardando_atualizacao: "aguardando atualização",
    abaixo_da_referencia: "abaixo da referência",
    dentro_da_faixa: "dentro da faixa",
    acima_do_teto: "acima do teto",
    critico: "crítico",
  };
  return mapa[String(status)] || String(status || "não classificado");
}

function ratingRank(value: unknown): number | null {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/R\s*(\d+)/);
  if (match) return Number(match[1]);
  const n = Number(raw.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function calcularEvolucaoRating(inicial: unknown, atual: unknown): "melhorou" | "piorou" | "estavel" | "nao_informado" {
  const i = ratingRank(inicial);
  const a = ratingRank(atual);
  if (i === null || a === null) return "nao_informado";
  if (a < i) return "melhorou";
  if (a > i) return "piorou";
  return "estavel";
}

function item(titulo: string, descricao: string, prioridade?: ItemInteligenciaAcompanhamento["prioridade"], impactoEsperado?: string): ItemInteligenciaAcompanhamento {
  return { titulo, descricao, ...(prioridade ? { prioridade } : {}), ...(impactoEsperado ? { impactoEsperado } : {}) };
}

export function calcularInteligenciaAcompanhamentoBancario(input: {
  acompanhamento?: any;
  atualizacoes?: any[] | null;
}): InteligenciaAcompanhamentoBancarioResultado {
  const acompanhamento = input?.acompanhamento || {};
  const atualizacoes = ordenarSemanas(input?.atualizacoes ?? acompanhamento?.atualizacoes);
  const semanaAtual = escolherSemanaAtual(acompanhamento, atualizacoes);
  const { ano, mes } = mesAnoDaSemana(semanaAtual || atualizacoes[0] || acompanhamento);

  const faturamentoAnual = asNumber(acompanhamento?.faturamento_anual);
  const percentualOperacional = asNumber(acompanhamento?.percentual_operacional, 30);
  const refs = calcularReferenciasAcompanhamento(faturamentoAnual, ano, mes, percentualOperacional);

  const numeroSemanaAtual = asNumber(semanaAtual?.numero_semana, atualizacoes.length || 1);
  const acumulados = calcularAcumulados(atualizacoes, numeroSemanaAtual, mes, ano);
  const entradasSemana = totalEntradas(semanaAtual);
  const saidasSemana = round2(asNumber(semanaAtual?.total_saidas));
  const saldoSemana = round2(asNumber(semanaAtual?.saldo_semanal, entradasSemana - saidasSemana));
  const comp = semanaAtual
    ? calcularCompensacaoMensal(
        entradasSemana,
        asNumber(semanaAtual?.acumulado_mensal_anterior, acumulados.acumuladoMensalAnterior),
        asNumber(semanaAtual?.acumulado_anual_anterior, acumulados.acumuladoAnual),
        numeroSemanaAtual,
        refs,
      )
    : null;

  const statusAderencia = String(semanaAtual?.status_aderencia || comp?.status_aderencia || "aguardando_atualizacao");
  const pctUsoSemanal = round2(asNumber(semanaAtual?.percentual_uso_semanal, comp?.percentual_uso_semanal || 0));
  const pctUsoMensal = round2(asNumber(semanaAtual?.percentual_uso_mensal, comp?.percentual_uso_mensal || 0));
  const acumuladoMensal = round2(asNumber(semanaAtual?.acumulado_mensal, comp?.acumulado_mensal || acumulados.acumuladoMensalAnterior + entradasSemana));

  const semanasComDados = atualizacoes.filter((s) => totalEntradas(s) > 0 || asNumber(s?.total_saidas) > 0);
  const semanasNegativas = semanasComDados.filter((s) => asNumber(s?.saldo_semanal, totalEntradas(s) - asNumber(s?.total_saidas)) < 0).length;
  const semanasPositivas = semanasComDados.filter((s) => asNumber(s?.saldo_semanal, totalEntradas(s) - asNumber(s?.total_saidas)) > 0).length;
  const semanasCriticas = semanasComDados.filter((s) => String(s?.status_aderencia || "") === "critico").length;
  const semanasDentroFaixa = semanasComDados.filter((s) => String(s?.status_aderencia || "") === "dentro_da_faixa").length;

  const ratingEvolucao = calcularEvolucaoRating(acompanhamento?.rating_interno_inicial, acompanhamento?.rating_interno_atual || semanaAtual?.rating_interno);
  const saldoNegativo = saldoSemana < 0;
  const saidasMaiores = saidasSemana > entradasSemana && saidasSemana > 0;
  const excessoCritico = statusAderencia === "critico" || pctUsoSemanal >= 150;
  const foraFaixa = ["abaixo_da_referencia", "acima_do_teto", "critico"].includes(statusAderencia);
  const mesAcimaTeto = pctUsoMensal > 100;

  let statusInteligente: StatusInteligenteAcompanhamento = "positivo";
  if (saldoNegativo || excessoCritico || semanasCriticas > 0 || (semanasNegativas >= 2 && semanasComDados.length >= 2)) statusInteligente = "critico";
  else if (foraFaixa || saidasMaiores || mesAcimaTeto || semanasNegativas > 0) statusInteligente = "atencao";

  let impactoNoRating: ImpactoRatingAcompanhamento = "mantem";
  if (statusInteligente === "critico") impactoNoRating = "exige_correcao";
  else if (statusInteligente === "atencao") impactoNoRating = "prejudica";
  else if (ratingEvolucao === "melhorou" || (semanasPositivas >= 2 && semanasNegativas === 0)) impactoNoRating = "melhora";

  let prontidaoCredito: ProntidaoCreditoAcompanhamento = "em_preparacao";
  if (statusInteligente === "critico") prontidaoCredito = "nao_recomendada";
  else if (statusInteligente === "atencao") prontidaoCredito = "em_preparacao";
  else if (semanasPositivas >= 3 && semanasDentroFaixa >= 2) prontidaoCredito = "pronta";
  else if (semanasPositivas >= 2 && semanasNegativas === 0) prontidaoCredito = "quase_pronta";

  const diagnostico: ItemInteligenciaAcompanhamento[] = [];
  const alertas: ItemInteligenciaAcompanhamento[] = [];
  const pontosFortes: ItemInteligenciaAcompanhamento[] = [];
  const pontosAtencao: ItemInteligenciaAcompanhamento[] = [];
  const riscos: ItemInteligenciaAcompanhamento[] = [];
  const planoAcao: ItemInteligenciaAcompanhamento[] = [];

  diagnostico.push(item(
    "Acompanhamento mensal alimentado por semanas",
    `A leitura considera o mês como referência principal e a semana ${numeroSemanaAtual || "atual"} como ponto de alimentação operacional. Faturamento anual informado: ${moneyBR(faturamentoAnual)}; média mensal base: ${moneyBR(refs.faturamento_mensal_base)}; teto mensal com margem de ${refs.percentual_operacional}%: ${moneyBR(refs.teto_mensal_movimentacao)}.`,
  ));

  if (!faturamentoAnual) {
    alertas.push(item(
      "Faturamento anual não informado",
      "Sem faturamento anual, a assessoria não consegue comparar a movimentação bancária com a referência mensal/semanal de rating.",
      "alta",
      "Completar faturamento para melhorar a precisão da análise.",
    ));
    pontosAtencao.push(item("Base financeira incompleta", "Informe faturamento anual para calibrar média mensal, teto mensal e aderência semanal.", "alta"));
  }

  if (!semanaAtual) {
    alertas.push(item("Nenhuma semana alimentada", "O acompanhamento ainda não possui semana em evidência para análise consultiva.", "media"));
    planoAcao.push(item("Registrar primeira semana", "Alimente a semana atual com entradas, saídas, saldo, rating e observações.", "alta"));
  } else {
    diagnostico.push(item(
      `Semana ${numeroSemanaAtual} em ${statusLabel(statusAderencia)}`,
      `Entradas: ${moneyBR(entradasSemana)}; saídas: ${moneyBR(saidasSemana)}; saldo semanal: ${moneyBR(saldoSemana)}; uso semanal do teto: ${percentual(pctUsoSemanal)}; uso mensal acumulado: ${percentual(pctUsoMensal)}.`,
    ));
  }

  if (saldoNegativo) {
    alertas.push(item(
      "Saldo semanal negativo",
      `A semana fechou com saldo de ${moneyBR(saldoSemana)}. Para rating interno, a prioridade é evitar sequência de semanas negativas.`,
      "critica",
      "Fechar a próxima semana positiva e reduzir saídas operacionais.",
    ));
    riscos.push(item("Pressão de caixa", "Saídas acima das entradas podem sinalizar desorganização operacional ou pressão financeira para análise bancária.", "alta"));
  }

  if (saidasMaiores) {
    pontosAtencao.push(item(
      "Saídas superaram entradas",
      `As saídas da semana (${moneyBR(saidasSemana)}) ficaram acima das entradas (${moneyBR(entradasSemana)}).`,
      "alta",
    ));
  }

  if (statusAderencia === "critico") {
    alertas.push(item(
      "Movimentação crítica acima do teto",
      `A semana ultrapassou de forma crítica o teto semanal de ${moneyBR(refs.teto_semanal_movimentacao)}.`,
      "critica",
      "Revisar origem dos recursos e compensar as próximas semanas para proteger coerência com o faturamento declarado.",
    ));
    riscos.push(item("Risco de questionamento bancário", "Movimentação muito acima da faixa pode exigir documentação extra ou revisão do faturamento declarado.", "alta"));
  } else if (statusAderencia === "acima_do_teto") {
    pontosAtencao.push(item(
      "Movimentação acima da faixa operacional",
      `A semana superou o teto semanal de ${moneyBR(refs.teto_semanal_movimentacao)}. Ainda é possível compensar no mês, mas exige controle nas próximas atualizações.`,
      "media",
    ));
  } else if (statusAderencia === "abaixo_da_referencia") {
    pontosAtencao.push(item(
      "Movimentação abaixo da referência",
      `A semana ficou abaixo da referência semanal base de ${moneyBR(refs.referencia_semanal_base)}. Isso pode reduzir força de comprovação do faturamento.`,
      "media",
    ));
  } else if (statusAderencia === "dentro_da_faixa" && !saldoNegativo) {
    pontosFortes.push(item(
      "Aderência semanal adequada",
      `A movimentação está dentro da faixa operacional esperada para a regra atual do acompanhamento.`,
      "baixa",
    ));
  }

  if (semanasPositivas >= 2 && semanasNegativas === 0) {
    pontosFortes.push(item("Sequência positiva", `Foram identificadas ${semanasPositivas} semanas positivas sem saldo negativo.`, "baixa"));
  }

  if (ratingEvolucao === "melhorou") {
    pontosFortes.push(item("Rating interno evoluiu", "O rating interno atual está melhor que o rating inicial informado.", "baixa"));
  } else if (ratingEvolucao === "piorou") {
    riscos.push(item("Rating interno piorou", "A classificação interna atual piorou em relação ao início do acompanhamento.", "alta"));
  }

  if (mesAcimaTeto) {
    riscos.push(item("Uso mensal acima do teto", `O uso mensal acumulado está em ${percentual(pctUsoMensal)}, acima do limite operacional configurado.`, "alta"));
  }

  if (semanasNegativas > 0) {
    pontosAtencao.push(item("Semanas negativas no mês", `${semanasNegativas} semana(s) com saldo negativo foram identificadas no histórico alimentado.`, semanasNegativas >= 2 ? "alta" : "media"));
  }

  planoAcao.push(item(
    "Manter a lógica semanal/mensal já configurada",
    "Usar a semana como alimentação operacional e o fechamento mensal como leitura principal do rating.",
    "media",
  ));

  if (saldoNegativo || saidasMaiores) {
    planoAcao.push(item(
      "Corrigir fluxo da próxima semana",
      "Orientar o cliente a reduzir saídas e buscar fechamento semanal positivo antes de avançar para proposta bancária.",
      "alta",
      "Reduz risco operacional e melhora leitura de organização financeira.",
    ));
  }

  if (foraFaixa && faturamentoAnual > 0) {
    planoAcao.push(item(
      "Preservar aderência com o faturamento declarado",
      `Acompanhar as próximas semanas buscando movimentação compatível com a referência semanal de ${moneyBR(refs.referencia_semanal_base)} e teto de ${moneyBR(refs.teto_semanal_movimentacao)}.`,
      statusAderencia === "critico" ? "alta" : "media",
    ));
  }

  if (statusAderencia === "critico" || mesAcimaTeto) {
    planoAcao.push(item(
      "Revisar documentos de suporte",
      "Se a movimentação acima da faixa for recorrente, revisar extratos, origem dos recursos e faturamento declarado antes de apresentar ao banco.",
      "alta",
    ));
  }

  if (semanasPositivas < 3) {
    planoAcao.push(item(
      "Construir histórico favorável",
      "Buscar pelo menos 3 semanas com saldo positivo e comportamento coerente para fortalecer a leitura de rating interno.",
      "media",
    ));
  }

  const proximaMelhorAcao = (() => {
    if (!faturamentoAnual) return "Atualizar faturamento anual para calibrar a análise de rating e aderência bancária.";
    if (!semanaAtual) return "Alimentar a primeira semana do acompanhamento com entradas, saídas, saldo e rating.";
    if (saldoNegativo || saidasMaiores) return "Controlar saídas na próxima atualização e buscar fechamento semanal positivo antes de levar a empresa para proposta bancária.";
    if (statusAderencia === "critico" || statusAderencia === "acima_do_teto") return "Compensar a movimentação nas próximas semanas e organizar documentação que justifique valores acima da faixa.";
    if (statusAderencia === "abaixo_da_referencia") return "Reforçar movimentação comprovada nas próximas semanas para sustentar o faturamento declarado.";
    if (prontidaoCredito === "pronta" || prontidaoCredito === "quase_pronta") return "Preparar proposta preliminar com ressalva de continuidade do acompanhamento até o fechamento mensal.";
    return "Manter acompanhamento semanal e consolidar mais semanas positivas para melhorar rating interno.";
  })();

  const resumoExecutivo = (() => {
    const empresa = String(acompanhamento?.nome_empresa || "A empresa").trim() || "A empresa";
    if (statusInteligente === "critico") {
      return `${empresa} exige correção antes de avançar para crédito. O acompanhamento indica pontos críticos na semana em evidência, especialmente saldo negativo, excesso de movimentação ou uso mensal elevado. A prioridade é estabilizar a operação semanal e proteger a leitura de rating interno.`;
    }
    if (statusInteligente === "atencao") {
      return `${empresa} está em fase de preparação. A lógica de acompanhamento está consistente, mas existem pontos de atenção que precisam ser ajustados para fortalecer o rating interno e o fechamento mensal.`;
    }
    return `${empresa} apresenta acompanhamento favorável no momento. A recomendação é manter a disciplina semanal, preservar saldo positivo e usar o fechamento mensal como base para proposta preliminar.`;
  })();

  const parecerTecnico = [
    resumoExecutivo,
    `A leitura preserva a regra operacional atual: relatório mensal alimentado por semanas, com referência baseada no faturamento anual declarado e margem operacional configurada.`,
    semanaAtual
      ? `Na semana ${numeroSemanaAtual}, a movimentação registrada foi de ${moneyBR(entradasSemana)} em entradas, ${moneyBR(saidasSemana)} em saídas e saldo de ${moneyBR(saldoSemana)}.`
      : `Ainda não há semana válida alimentada para emissão de parecer conclusivo.`,
    `Impacto no rating: ${impactoNoRating.replace(/_/g, " ")}. Prontidão para crédito: ${prontidaoCredito.replace(/_/g, " ")}.`,
    `Próxima melhor ação: ${proximaMelhorAcao}`,
  ].join(" ");

  const orientacaoInterna = `Usar este acompanhamento como insumo de assessoria: verificar aderência semanal, evitar envio ao banco em semana crítica e registrar tarefa operacional quando houver saldo negativo, excesso de movimentação ou dados insuficientes.`;
  const orientacaoCliente = statusInteligente === "positivo"
    ? `Manter a rotina semanal de envio dos dados e preservar saldo positivo até o fechamento do mês.`
    : `Organizar as movimentações da próxima semana, controlar saídas, enviar extratos/comprovantes e buscar fechamento positivo para melhorar a avaliação interna.`;

  return {
    statusInteligente,
    impactoNoRating,
    prontidaoCredito,
    resumoExecutivo,
    diagnostico,
    alertas,
    pontosFortes,
    pontosAtencao,
    riscos,
    planoAcao,
    proximaMelhorAcao,
    parecerTecnico,
    orientacaoInterna,
    orientacaoCliente,
    metricas: {
      faturamento_anual: faturamentoAnual || null,
      media_mensal: refs.faturamento_mensal_base || null,
      teto_mensal: refs.teto_mensal_movimentacao || null,
      referencia_semanal: refs.referencia_semanal_base || null,
      teto_semanal: refs.teto_semanal_movimentacao || null,
      entradas_semana: entradasSemana,
      saidas_semana: saidasSemana,
      saldo_semana: saldoSemana,
      acumulado_mensal: acumuladoMensal,
      percentual_uso_semanal: pctUsoSemanal,
      percentual_uso_mensal: pctUsoMensal,
      status_aderencia: statusAderencia,
      semanas_com_dados: semanasComDados.length,
      semanas_positivas: semanasPositivas,
      semanas_negativas: semanasNegativas,
      semanas_criticas: semanasCriticas,
      rating_evolucao: ratingEvolucao,
      semana_atual: numeroSemanaAtual || null,
      mes_referencia: `${String(mes).padStart(2, "0")}/${ano}`,
    },
    geradoEm: new Date().toISOString(),
    fonte: "deterministica",
  };
}

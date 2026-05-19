
/**
 * analisadorSemanal.ts
 * Motor de inteligência do Acompanhamento Semanal — Destrava Crédito
 *
 * Integra-se com funcoes_acompanhamento.ts (já existente) sem substituí-lo.
 * Adiciona: sazonalidade, alertas graduados, compensação e projeção mensal.
 *
 * Posição no projeto: server/services/analisadorSemanal.ts
 */

import {
  calcularReferenciasAcompanhamento,
  calcularAcumulados,
  type ReferenciasAcompanhamento,
} from "../funcoes_acompanhamento.ts";

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ─────────────────────────────────────────────────────────────────────────────

export type NivelAlerta =
  | "verde"
  | "amarelo_baixo"
  | "amarelo_alto"
  | "vermelho_baixo"
  | "vermelho_alto"
  | "critico";

export type StatusSemana =
  | "dentro_da_faixa"
  | "abaixo_referencia"
  | "abaixo_piso"
  | "acima_teto"
  | "critico";

export interface CanaisEntrada {
  maquininha?: number;
  pix?: number;
  ted?: number;
  boleto?: number;
  dinheiro?: number;
  outros?: number;
}

export interface AcumuladosAnteriores {
  /** Total acumulado no mês ATÉ a semana anterior */
  monthly_total: number;
  /** Total acumulado no ano ATÉ a semana anterior */
  annual_total: number;
}

export interface PayloadAnalise {
  client_id: string;
  annual_revenue_declared: number;
  week_start: string;            // YYYY-MM-DD
  channels: CanaisEntrada;
  previous_accumulated: AcumuladosAnteriores;
  /** Índice de sazonalidade manual (opcional, 0.5–2.0). Padrão: 1.0 */
  seasonal_index?: number;
  /** % de margem operacional. Padrão: 30 */
  operational_margin?: number;
}

export interface CorredorSemanal {
  reference_weekly: number;   // referência pura (sem margem)
  ceiling_weekly: number;     // teto com margem operacional
  floor_weekly: number;       // piso (70 % da referência)
  seasonal_index: number;
}

export interface InfoCompensacao {
  remaining_weeks_in_month: number;
  monthly_ceiling: number;
  accumulated_this_month: number;
  available_for_remaining_weeks: number;
  new_weekly_target: number;
  new_weekly_ceiling: number;
}

export interface Alerta {
  level: NivelAlerta;
  message: string;
  technical_detail: string;
  compensation?: InfoCompensacao;
}

export interface ProjecaoMensal {
  monthly_estimated: number;
  monthly_limit: number;
  percent_of_limit: number;
  on_track: boolean;
}

export interface ResultadoAnalise {
  week_id: string;                // Ex: "2026-W20"
  week_start: string;
  total_week: number;
  corridors: CorredorSemanal;
  status: StatusSemana;
  alerts: Alerta[];
  compensation: InfoCompensacao | null;
  projection: ProjecaoMensal;
  refs: ReferenciasAcompanhamento;
  breakdown: {
    maquininha: number;
    pix: number;
    ted: number;
    boleto: number;
    dinheiro: number;
    outros: number;
  };
  accumulated: {
    month: number;
    year: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

function r2(v: number): number {
  if (!isFinite(v) || isNaN(v)) return 0;
  return Math.round(v * 100) / 100;
}

/** Retorna o número ISO da semana (1–53) para uma data */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Semana operacional no mês (1–4), baseada na semana ISO do mês */
function weekOfMonth(date: Date): number {
  const firstDay = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  const dayOfMonth = date.getUTCDate();
  const firstDayOfWeek = firstDay.getUTCDay() || 7; // seg=1 … dom=7
  return Math.min(4, Math.ceil((dayOfMonth + firstDayOfWeek - 2) / 7));
}

/** Semanas operacionais restantes no mês a partir da semana atual (inclusiva = false) */
function remainingWeeks(date: Date): number {
  return Math.max(0, 4 - weekOfMonth(date));
}

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICE DE SAZONALIDADE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Índice de sazonalidade por mês com base em padrões típicos do varejo/serviços BR.
 * Pode ser sobrescrito via payload.seasonal_index.
 */
const SEASONAL_BY_MONTH: Record<number, number> = {
  1:  0.85,  // jan — pós-festas, recuo
  2:  0.90,  // fev — curto, carnaval
  3:  1.00,  // mar — estável
  4:  0.95,  // abr — Páscoa variável
  5:  1.00,  // mai — estável
  6:  1.05,  // jun — Dia dos Namorados
  7:  0.95,  // jul — férias
  8:  1.00,  // ago — estável
  9:  1.05,  // set — volta às aulas / Dia das Crianças prep
  10: 1.10,  // out — Dia das Crianças
  11: 1.25,  // nov — Black Friday
  12: 1.30,  // dez — Natal
};

function getSeasonalIndex(date: Date, override?: number): number {
  if (override && override >= 0.5 && override <= 2.0) return override;
  return SEASONAL_BY_MONTH[date.getMonth() + 1] ?? 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// CÁLCULO DE CORREDOR
// ─────────────────────────────────────────────────────────────────────────────

function calcularCorredor(
  annual: number,
  date: Date,
  operationalMargin = 30,
  seasonalOverride?: number
): CorredorSemanal {
  const seasonIdx = getSeasonalIndex(date, seasonalOverride);

  // Usa as refs canônicas já validadas de funcoes_acompanhamento
  const refs = calcularReferenciasAcompanhamento(
    annual,
    date.getFullYear(),
    date.getMonth() + 1,
    operationalMargin
  );

  return {
    reference_weekly: r2(refs.referencia_semanal_base * seasonIdx),
    ceiling_weekly:   r2(refs.teto_semanal_movimentacao * seasonIdx),
    floor_weekly:     r2(refs.referencia_semanal_base * 0.7 * seasonIdx),
    seasonal_index:   seasonIdx,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO DE STATUS
// ─────────────────────────────────────────────────────────────────────────────

function classificarStatus(total: number, c: CorredorSemanal): StatusSemana {
  if (total <= 0) return "abaixo_referencia";
  if (total < c.floor_weekly) return "abaixo_piso";
  if (total < c.reference_weekly) return "abaixo_referencia";
  if (total <= c.ceiling_weekly) return "dentro_da_faixa";
  if (total <= c.ceiling_weekly * 1.5) return "acima_teto";
  return "critico";
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPENSAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

function calcularCompensacao(
  totalSemana: number,
  accMonth: number,         // acumulado mês APÓS incluir semana atual
  corridor: CorredorSemanal,
  date: Date
): InfoCompensacao {
  const remaining = remainingWeeks(date);
  const monthlyCeiling = r2(corridor.ceiling_weekly * 4);
  const available = r2(Math.max(0, monthlyCeiling - accMonth));
  const newTarget = remaining > 0 ? r2(available / remaining) : 0;
  const newCeiling = remaining > 0 ? r2(monthlyCeiling / remaining) : 0;

  return {
    remaining_weeks_in_month: remaining,
    monthly_ceiling: monthlyCeiling,
    accumulated_this_month: r2(accMonth),
    available_for_remaining_weeks: available,
    new_weekly_target: Math.max(0, newTarget),
    new_weekly_ceiling: Math.max(0, newCeiling),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO DE ALERTAS
// ─────────────────────────────────────────────────────────────────────────────

function gerarAlertas(
  status: StatusSemana,
  total: number,
  corridor: CorredorSemanal,
  accMonth: number,
  date: Date
): Alerta[] {
  const alerts: Alerta[] = [];
  const comp = calcularCompensacao(total, accMonth, corridor, date);
  const excedente = r2(Math.max(0, total - corridor.ceiling_weekly));
  const faltante = r2(Math.max(0, corridor.reference_weekly - total));
  const pctTeto = corridor.ceiling_weekly > 0
    ? r2((total / corridor.ceiling_weekly) * 100)
    : 0;

  switch (status) {
    case "critico":
      alerts.push({
        level: "critico",
        message: `Semana ultrapassou o teto em ${pctTeto - 100}%. Risco imediato de alerta COAF/PLD. Reduza a movimentação agora.`,
        technical_detail: `Total: R$ ${total.toLocaleString("pt-BR")} | Teto: R$ ${corridor.ceiling_weekly.toLocaleString("pt-BR")} | Excedente: R$ ${excedente.toLocaleString("pt-BR")}`,
        compensation: comp,
      });
      break;

    case "acima_teto":
      alerts.push({
        level: "vermelho_alto",
        message: `Movimentação acima do teto operacional. Controle para evitar inconsistência com faturamento declarado.`,
        technical_detail: `Excedeu R$ ${excedente.toLocaleString("pt-BR")} acima do teto de R$ ${corridor.ceiling_weekly.toLocaleString("pt-BR")}.`,
        compensation: comp,
      });
      break;

    case "abaixo_piso":
      alerts.push({
        level: "vermelho_baixo",
        message: `Movimentação abaixo do piso mínimo (70 % da referência). Risco de corte de crédito por baixa movimentação bancária.`,
        technical_detail: `Total: R$ ${total.toLocaleString("pt-BR")} | Piso: R$ ${corridor.floor_weekly.toLocaleString("pt-BR")} | Faltou: R$ ${faltante.toLocaleString("pt-BR")}`,
        compensation: comp,
      });
      break;

    case "abaixo_referencia":
      alerts.push({
        level: "amarelo_baixo",
        message: `Movimentação abaixo da referência semanal. Monitore para preservar elegibilidade de crédito.`,
        technical_detail: `Faltou R$ ${faltante.toLocaleString("pt-BR")} para atingir a referência de R$ ${corridor.reference_weekly.toLocaleString("pt-BR")}.`,
        compensation: comp,
      });
      break;

    case "dentro_da_faixa":
      alerts.push({
        level: "verde",
        message: `Movimentação dentro da faixa esperada. Ótimo desempenho semanal.`,
        technical_detail: `Total R$ ${total.toLocaleString("pt-BR")} | Ref: R$ ${corridor.reference_weekly.toLocaleString("pt-BR")} – R$ ${corridor.ceiling_weekly.toLocaleString("pt-BR")}`,
      });
      break;
  }

  // Alerta adicional de projeção mensal
  const projMonth = r2((accMonth / Math.max(1, weekOfMonth(date))) * 4);
  const monthlyCeiling = r2(corridor.ceiling_weekly * 4);
  if (projMonth > monthlyCeiling * 1.05) {
    alerts.push({
      level: "amarelo_alto",
      message: `Projeção de fechamento mensal em R$ ${projMonth.toLocaleString("pt-BR")} supera o teto mensal de R$ ${monthlyCeiling.toLocaleString("pt-BR")}.`,
      technical_detail: `Projeção baseada na média das semanas já encerradas × 4 semanas operacionais.`,
    });
  }

  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJEÇÃO MENSAL
// ─────────────────────────────────────────────────────────────────────────────

function calcularProjecao(
  accMonth: number,
  date: Date,
  corridor: CorredorSemanal
): ProjecaoMensal {
  const semAtual = weekOfMonth(date);
  const monthlyCeiling = r2(corridor.ceiling_weekly * 4);
  const estimated = semAtual > 0 ? r2((accMonth / semAtual) * 4) : 0;
  const pct = monthlyCeiling > 0 ? r2((estimated / monthlyCeiling) * 100) : 0;

  return {
    monthly_estimated: estimated,
    monthly_limit: monthlyCeiling,
    percent_of_limit: pct,
    on_track: pct >= 70 && pct <= 105,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL — ANALISAR SEMANA
// ─────────────────────────────────────────────────────────────────────────────

export function analisarSemana(payload: PayloadAnalise): ResultadoAnalise {
  const {
    client_id,
    annual_revenue_declared,
    week_start,
    channels,
    previous_accumulated,
    seasonal_index,
    operational_margin = 30,
  } = payload;

  // Parse de data seguro
  const date = new Date(week_start + "T12:00:00Z");
  if (isNaN(date.getTime())) {
    throw new Error(`week_start inválido: "${week_start}". Use o formato YYYY-MM-DD.`);
  }

  if (!annual_revenue_declared || annual_revenue_declared <= 0) {
    throw new Error("annual_revenue_declared deve ser um número positivo.");
  }

  // Total da semana por canal
  const breakdown = {
    maquininha: r2(channels.maquininha ?? 0),
    pix:        r2(channels.pix ?? 0),
    ted:        r2(channels.ted ?? 0),
    boleto:     r2(channels.boleto ?? 0),
    dinheiro:   r2(channels.dinheiro ?? 0),
    outros:     r2(channels.outros ?? 0),
  };

  const totalWeek = r2(
    breakdown.maquininha + breakdown.pix + breakdown.ted +
    breakdown.boleto + breakdown.dinheiro + breakdown.outros
  );

  // Acumulados incluindo a semana atual
  const accMonth = r2((previous_accumulated.monthly_total ?? 0) + totalWeek);
  const accYear  = r2((previous_accumulated.annual_total ?? 0) + totalWeek);

  // Corredor semanal
  const corridor = calcularCorredor(annual_revenue_declared, date, operational_margin, seasonal_index);

  // Refs canônicas (para retorno completo)
  const refs = calcularReferenciasAcompanhamento(
    annual_revenue_declared,
    date.getFullYear(),
    date.getMonth() + 1,
    operational_margin
  );

  // Classificação
  const status = classificarStatus(totalWeek, corridor);

  // Alertas
  const alerts = gerarAlertas(status, totalWeek, corridor, accMonth, date);

  // Compensação principal (do primeiro alerta com compensação, ou calculada)
  const compensation =
    alerts.find(a => a.compensation)?.compensation ??
    (status !== "dentro_da_faixa"
      ? calcularCompensacao(totalWeek, accMonth, corridor, date)
      : null);

  // Projeção
  const projection = calcularProjecao(accMonth, date, corridor);

  // ID da semana
  const week_id = `${date.getFullYear()}-W${String(isoWeek(date)).padStart(2, "0")}`;

  return {
    week_id,
    week_start,
    total_week: totalWeek,
    corridors: corridor,
    status,
    alerts,
    compensation,
    projection,
    refs,
    breakdown,
    accumulated: {
      month: accMonth,
      year: accYear,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISE EM LOTE — Para o histórico / relatório mensal
// ─────────────────────────────────────────────────────────────────────────────

export interface PayloadLote {
  client_id: string;
  annual_revenue_declared: number;
  operational_margin?: number;
  /** Semanas no formato das atualizações existentes no banco */
  weeks: Array<{
    numero_semana: number;
    data_referencia_inicio: string;
    entrada_maquininha?: number;
    entrada_pix?: number;
    entrada_ted?: number;
    entrada_boleto?: number;
    entrada_dinheiro?: number;
    outras_entradas?: number;
    total_entradas?: number;
    total_saidas?: number;
  }>;
}

export interface ResultadoLote {
  client_id: string;
  analyses: ResultadoAnalise[];
  summary: {
    total_weeks: number;
    weeks_ok: number;
    weeks_alert: number;
    weeks_critical: number;
    month_total: number;
    month_ceiling: number;
    month_percent: number;
  };
}

export function analisarLote(payload: PayloadLote): ResultadoLote {
  const { client_id, annual_revenue_declared, operational_margin = 30, weeks } = payload;

  const sorted = [...weeks].sort((a, b) => a.numero_semana - b.numero_semana);
  const analyses: ResultadoAnalise[] = [];

  let monthlyTotal = 0;
  let annualTotal  = 0;

  for (const w of sorted) {
    const channels: CanaisEntrada = {
      maquininha: w.entrada_maquininha ?? 0,
      pix:        w.entrada_pix ?? 0,
      ted:        w.entrada_ted ?? 0,
      boleto:     w.entrada_boleto ?? 0,
      dinheiro:   w.entrada_dinheiro ?? 0,
      outros:     w.outras_entradas ?? 0,
    };

    try {
      const result = analisarSemana({
        client_id,
        annual_revenue_declared,
        week_start: String(w.data_referencia_inicio).slice(0, 10),
        channels,
        previous_accumulated: {
          monthly_total: monthlyTotal,
          annual_total:  annualTotal,
        },
        operational_margin,
      });

      analyses.push(result);

      // Acumula para próxima iteração
      monthlyTotal = r2(monthlyTotal + result.total_week);
      annualTotal  = r2(annualTotal  + result.total_week);
    } catch {
      // Semana com dados inválidos é ignorada no lote, não quebra o relatório
      continue;
    }
  }

  const monthCeiling = analyses[0]
    ? r2(analyses[0].corridors.ceiling_weekly * 4)
    : 0;

  const summary = {
    total_weeks:     analyses.length,
    weeks_ok:        analyses.filter(a => a.status === "dentro_da_faixa").length,
    weeks_alert:     analyses.filter(a => ["abaixo_referencia", "abaixo_piso", "acima_teto"].includes(a.status)).length,
    weeks_critical:  analyses.filter(a => a.status === "critico").length,
    month_total:     monthlyTotal,
    month_ceiling:   monthCeiling,
    month_percent:   monthCeiling > 0 ? r2((monthlyTotal / monthCeiling) * 100) : 0,
  };

  return { client_id, analyses, summary };
}

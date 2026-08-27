/**
 * Utilitários determinísticos da Máquina de Vendas.
 *
 * Este módulo não consulta nem altera o banco. As consultas ficam no monólito
 * REST para reaproveitar a conexão existente; aqui ficam somente as regras de
 * período, metas e agregação que precisam ser cobertas sem dados de produção.
 */

export interface PeriodoMensal {
  inicio: string;
  fim: string;
  chave: string;
}

export interface MetasInput {
  meta_leads?: unknown;
  meta_convertidos?: unknown;
  meta_valor?: unknown;
}

export interface ForecastBucketRow {
  etapa_funil?: unknown;
  responsavel_id?: unknown;
  responsavel_nome?: unknown;
  total_leads?: unknown;
  pipeline_bruto?: unknown;
  forecast_ponderado?: unknown;
}

export interface ForecastAgregado {
  totais: {
    total_leads: number;
    pipeline_bruto: number;
    forecast_ponderado: number;
  };
  por_etapa: Array<{
    etapa_funil: string;
    total_leads: number;
    pipeline_bruto: number;
    forecast_ponderado: number;
  }>;
  por_responsavel: Array<{
    responsavel_id: string | null;
    responsavel_nome: string | null;
    total_leads: number;
    pipeline_bruto: number;
    forecast_ponderado: number;
  }>;
  detalhamento: Array<{
    etapa_funil: string;
    responsavel_id: string | null;
    responsavel_nome: string | null;
    total_leads: number;
    pipeline_bruto: number;
    forecast_ponderado: number;
  }>;
}

function inteiroNaoNegativo(value: unknown, campo: string): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${campo} deve ser um número inteiro não negativo`);
  }
  return n;
}

function valorNaoNegativo(value: unknown, campo: string): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${campo} deve ser um número não negativo`);
  }
  return Math.round(n * 100) / 100;
}

/** Normaliza YYYY-MM-DD ou YYYY-MM para o primeiro dia do mês em UTC. */
export function normalizarPeriodoMensal(value: unknown, agora = new Date()): PeriodoMensal {
  const bruto = String(value ?? "").trim();
  let ano: number;
  let mes: number;

  if (/^\d{4}-\d{2}$/.test(bruto)) {
    ano = Number(bruto.slice(0, 4));
    mes = Number(bruto.slice(5, 7));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) {
    ano = Number(bruto.slice(0, 4));
    mes = Number(bruto.slice(5, 7));
  } else if (!bruto) {
    ano = agora.getUTCFullYear();
    mes = agora.getUTCMonth() + 1;
  } else {
    throw new Error("período deve estar no formato YYYY-MM ou YYYY-MM-DD");
  }

  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12) {
    throw new Error("período inválido");
  }

  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  return {
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    chave: inicio.toISOString().slice(0, 10),
  };
}

export function normalizarMetas(input: MetasInput): {
  meta_leads: number;
  meta_convertidos: number;
  meta_valor: number;
} {
  return {
    meta_leads: inteiroNaoNegativo(input.meta_leads, "meta_leads"),
    meta_convertidos: inteiroNaoNegativo(input.meta_convertidos, "meta_convertidos"),
    meta_valor: valorNaoNegativo(input.meta_valor, "meta_valor"),
  };
}

export function arredondarMoeda(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function percentualAtingimento(real: unknown, meta: unknown): number | null {
  const alvo = Number(meta ?? 0);
  const atual = Number(real ?? 0);
  if (!Number.isFinite(alvo) || alvo <= 0 || !Number.isFinite(atual)) return null;
  return Math.round((atual / alvo) * 10000) / 100;
}

export function agruparForecast(rows: readonly ForecastBucketRow[]): ForecastAgregado {
  const detalhamento = rows.map((row) => ({
    etapa_funil: String(row.etapa_funil || "novo"),
    responsavel_id: row.responsavel_id ? String(row.responsavel_id) : null,
    responsavel_nome: row.responsavel_nome ? String(row.responsavel_nome) : null,
    total_leads: Number(row.total_leads || 0),
    pipeline_bruto: arredondarMoeda(row.pipeline_bruto),
    forecast_ponderado: arredondarMoeda(row.forecast_ponderado),
  }));

  const porEtapa = new Map<string, ForecastAgregado["por_etapa"][number]>();
  const porResponsavel = new Map<string, ForecastAgregado["por_responsavel"][number]>();
  for (const item of detalhamento) {
    const etapaAtual = porEtapa.get(item.etapa_funil) || {
      etapa_funil: item.etapa_funil,
      total_leads: 0,
      pipeline_bruto: 0,
      forecast_ponderado: 0,
    };
    etapaAtual.total_leads += item.total_leads;
    etapaAtual.pipeline_bruto = arredondarMoeda(etapaAtual.pipeline_bruto + item.pipeline_bruto);
    etapaAtual.forecast_ponderado = arredondarMoeda(etapaAtual.forecast_ponderado + item.forecast_ponderado);
    porEtapa.set(item.etapa_funil, etapaAtual);

    const responsavelKey = item.responsavel_id || "sem_responsavel";
    const responsavelAtual = porResponsavel.get(responsavelKey) || {
      responsavel_id: item.responsavel_id,
      responsavel_nome: item.responsavel_nome,
      total_leads: 0,
      pipeline_bruto: 0,
      forecast_ponderado: 0,
    };
    responsavelAtual.total_leads += item.total_leads;
    responsavelAtual.pipeline_bruto = arredondarMoeda(responsavelAtual.pipeline_bruto + item.pipeline_bruto);
    responsavelAtual.forecast_ponderado = arredondarMoeda(responsavelAtual.forecast_ponderado + item.forecast_ponderado);
    porResponsavel.set(responsavelKey, responsavelAtual);
  }

  const totais = [...porEtapa.values()].reduce(
    (acc, row) => ({
      total_leads: acc.total_leads + row.total_leads,
      pipeline_bruto: arredondarMoeda(acc.pipeline_bruto + row.pipeline_bruto),
      forecast_ponderado: arredondarMoeda(acc.forecast_ponderado + row.forecast_ponderado),
    }),
    { total_leads: 0, pipeline_bruto: 0, forecast_ponderado: 0 },
  );

  return {
    totais,
    por_etapa: [...porEtapa.values()].sort((a, b) => b.forecast_ponderado - a.forecast_ponderado),
    por_responsavel: [...porResponsavel.values()].sort((a, b) => b.forecast_ponderado - a.forecast_ponderado),
    detalhamento,
  };
}

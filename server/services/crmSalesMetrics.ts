/**
 * Utilitários determinísticos da Máquina de Vendas.
 *
 * Este módulo não consulta nem altera o banco. As consultas ficam no monólito
 * REST para reaproveitar a conexão existente; aqui ficam somente as regras de
 * período e normalização que precisam ser cobertas sem dados de produção.
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

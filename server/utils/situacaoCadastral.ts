/**
 * situacaoCadastral.ts
 *
 * Utilitário central para normalização e classificação da situação cadastral.
 *
 * Motivo: não usar includes("ativa") diretamente, porque "inativa" contém
 * "ativa" e pode gerar diagnósticos incorretos em crédito, relatórios,
 * pendências e esteira.
 */

export type SituacaoCadastralClassificacao = "ativa" | "irregular" | "inativa" | "desconhecida";

const TERMOS_ATIVOS = new Set([
  "ativa",
  "ativo",
  "regular",
  "habilitada",
  "habilitado",
  "apta",
  "apto",
]);

const TERMOS_INATIVOS = new Set([
  "inativa",
  "inativo",
  "baixada",
  "baixado",
  "suspensa",
  "suspenso",
  "inapta",
  "inapto",
  "nula",
  "nulo",
  "cancelada",
  "cancelado",
  "paralisada",
  "paralisado",
]);

const FRASES_DESCONHECIDAS = new Set([
  "",
  "nao informado",
  "nao informada",
  "não informado",
  "não informada",
  "pendente",
  "desconhecida",
  "desconhecido",
  "sem informacao",
  "sem informação",
]);

export function normalizarSituacaoCadastral(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(valor: unknown): string[] {
  const normalizado = normalizarSituacaoCadastral(valor);
  if (!normalizado) return [];
  return normalizado.split(" ").filter(Boolean);
}

export function isSituacaoInativa(valor: unknown): boolean {
  const normalizado = normalizarSituacaoCadastral(valor);
  if (!normalizado || FRASES_DESCONHECIDAS.has(normalizado)) return false;
  return tokens(normalizado).some((token) => TERMOS_INATIVOS.has(token));
}

export function isSituacaoAtiva(valor: unknown): boolean {
  const normalizado = normalizarSituacaoCadastral(valor);
  if (!normalizado || FRASES_DESCONHECIDAS.has(normalizado)) return false;

  // A checagem de irregularidade vem primeiro para impedir falsos positivos:
  // "inativa", "inapta" e similares nunca podem ser tratados como ativos.
  if (isSituacaoInativa(normalizado)) return false;

  return tokens(normalizado).some((token) => TERMOS_ATIVOS.has(token));
}

export function isSituacaoIrregular(valor: unknown): boolean {
  const normalizado = normalizarSituacaoCadastral(valor);
  if (!normalizado || FRASES_DESCONHECIDAS.has(normalizado)) return false;
  if (isSituacaoInativa(normalizado)) return true;

  // Se existe um valor informado e ele não é reconhecido como ativo, tratar como
  // atenção/irregularidade para diagnóstico consultivo, sem inventar status.
  return !isSituacaoAtiva(normalizado);
}

export function classificarSituacaoCadastral(valor: unknown): SituacaoCadastralClassificacao {
  const normalizado = normalizarSituacaoCadastral(valor);
  if (!normalizado || FRASES_DESCONHECIDAS.has(normalizado)) return "desconhecida";
  if (isSituacaoInativa(normalizado)) return "inativa";
  if (isSituacaoAtiva(normalizado)) return "ativa";
  return "irregular";
}

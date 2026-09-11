/**
 * currency.ts — Utilitário centralizado de formatação e parsing de valores monetários BRL.
 *
 * Comportamento da máscara "digitação automática":
 *   - O usuário digita apenas dígitos (ex: 1, 10, 100, 1000000).
 *   - A cada dígito, o valor é dividido por 100 e formatado com separadores pt-BR.
 *   - Resultado: 1 → "0,01" | 100 → "1,00" | 1000000 → "10.000,00"
 *   - Ao digitar 1000000 (7 dígitos) → "10.000,00"
 *   - Para 1 milhão exato: digitar 100000000 → "1.000.000,00"
 *
 * Exportações:
 *   - parseBRLCurrency(v)   → converte string formatada para número float
 *   - formatBRLCurrency(v)  → formata número para string pt-BR (ex: "1.234,56")
 *   - maskCurrencyInput(v)  → aplica a máscara ao evento onChange (retorna string formatada)
 */

/**
 * Converte qualquer string digitada pelo usuário para float.
 * Suporta formatos: "1.234,56" | "1234,56" | "1234.56" | "1234"
 */
export function parseBRLCurrency(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const s = String(raw).replace(/\s|R\$\s*/g, "").trim();
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  if (lastSep === -1) {
    return parseFloat(s.replace(/\D/g, "")) || 0;
  }

  const afterLastSep = s.slice(lastSep + 1);

  // Se após o último separador há exatamente 3 dígitos, é separador de milhar
  if (/^\d{3}$/.test(afterLastSep)) {
    return parseFloat(s.replace(/[.,]/g, "")) || 0;
  }

  // Caso geral: o último separador é decimal
  const intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
  const decPart = afterLastSep.replace(/\D/g, "");
  const normalized = decPart ? `${intPart}.${decPart}` : intPart;
  return parseFloat(normalized) || 0;
}

/**
 * Formata um número para exibição em pt-BR sem o símbolo R$.
 * Ex: 1234.56 → "1.234,56"
 */
export function formatBRLCurrency(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "";
  if (n === 0) return "";
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formata um número para exibição em pt-BR com o símbolo R$.
 * Ex: 1234.56 → "R$ 1.234,56"
 */
export function formatBRLWithSymbol(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Aplica a máscara de digitação automática a um valor de input.
 *
 * Comportamento:
 *   - Remove tudo que não é dígito.
 *   - Divide por 100 para posicionar as casas decimais automaticamente.
 *   - Formata com separadores de milhar e 2 casas decimais.
 *
 * Exemplos de digitação:
 *   "1"        → "0,01"
 *   "10"       → "0,10"
 *   "100"      → "1,00"
 *   "1000"     → "10,00"
 *   "10000"    → "100,00"
 *   "100000"   → "1.000,00"
 *   "1000000"  → "10.000,00"
 *   "10000000" → "100.000,00"
 *   "100000000"→ "1.000.000,00"
 *
 * @param rawInput - Valor bruto do evento onChange (e.target.value)
 * @returns String formatada para exibir no input
 */
export function maskCurrencyInput(rawInput: string): string {
  // Remove tudo que não é dígito
  const digits = rawInput.replace(/\D/g, "");
  if (!digits) return "";

  // Converte para centavos e depois para reais
  const cents = parseInt(digits, 10);
  if (isNaN(cents)) return "";

  const reais = cents / 100;
  return reais.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Converte o valor exibido pela máscara de volta para número.
 * Equivalente a parseBRLCurrency mas otimizado para o formato da máscara.
 * Ex: "1.000.000,00" → 1000000
 */
export function unmaskCurrencyInput(masked: string): number {
  if (!masked) return 0;
  // Remove pontos de milhar, troca vírgula por ponto
  const normalized = masked.replace(/\./g, "").replace(",", ".");
  return parseFloat(normalized) || 0;
}

/**
 * useCurrencyInput — Hook para campos de entrada de valores monetários BRL.
 *
 * Comportamento de digitação automática:
 *   - Ao digitar dígitos, o campo formata automaticamente com separadores pt-BR.
 *   - Ex: digitar "1000000" → exibe "10.000,00"
 *   - Para R$ 1.000.000,00: digitar "100000000"
 *
 * Uso:
 *   const { displayValue, numericValue, handleChange, setValue } = useCurrencyInput(initialValue);
 *
 *   <input
 *     value={displayValue}
 *     onChange={handleChange}
 *     inputMode="numeric"
 *     placeholder="0,00"
 *   />
 *
 *   // Para obter o número: numericValue (ex: 1000000.00)
 *   // Para definir um valor programaticamente: setValue(1000000)
 */

import { useState, useCallback } from "react";
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from "../lib/currency";

interface UseCurrencyInputOptions {
  /** Valor inicial (número). Padrão: 0 */
  initialValue?: number | null;
}

interface UseCurrencyInputReturn {
  /** Valor formatado para exibir no input (ex: "1.000.000,00") */
  displayValue: string;
  /** Valor numérico atual (ex: 1000000) */
  numericValue: number;
  /** Handler para o evento onChange do input */
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Define o valor programaticamente a partir de um número */
  setValue: (value: number | null | undefined) => void;
}

export function useCurrencyInput(
  options: UseCurrencyInputOptions = {}
): UseCurrencyInputReturn {
  const { initialValue } = options;

  const [displayValue, setDisplayValue] = useState<string>(() => {
    if (initialValue == null || initialValue === 0) return "";
    return formatBRLCurrency(initialValue);
  });

  const [numericValue, setNumericValue] = useState<number>(
    () => initialValue ?? 0
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = maskCurrencyInput(e.target.value);
      setDisplayValue(formatted);
      setNumericValue(unmaskCurrencyInput(formatted));
    },
    []
  );

  const setValue = useCallback((value: number | null | undefined) => {
    if (value == null || value === 0) {
      setDisplayValue("");
      setNumericValue(0);
    } else {
      setDisplayValue(formatBRLCurrency(value));
      setNumericValue(value);
    }
  }, []);

  return { displayValue, numericValue, handleChange, setValue };
}

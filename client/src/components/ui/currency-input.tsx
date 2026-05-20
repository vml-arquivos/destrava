/**
 * CurrencyInput — Componente de input monetário BRL com máscara automática.
 *
 * Comportamento:
 *   - Ao digitar dígitos, formata automaticamente com separadores pt-BR.
 *   - Ex: digitar "1000000" → exibe "10.000,00"
 *   - Para R$ 1.000.000,00: digitar "100000000"
 *   - Aceita valor numérico via prop `value` e retorna número via `onValueChange`.
 *
 * Props:
 *   - value: número atual (controlado externamente)
 *   - onValueChange: callback com o número atualizado
 *   - label: rótulo do campo (opcional)
 *   - placeholder: texto de placeholder (padrão: "0,00")
 *   - className: classes CSS adicionais
 *   - disabled: desabilita o campo
 *   - required: campo obrigatório
 *   - id: id do input
 *   - name: name do input
 *
 * Uso básico:
 *   <CurrencyInput
 *     label="Faturamento Anual (R$)"
 *     value={faturamento}
 *     onValueChange={(num) => setFaturamento(num)}
 *   />
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from "../../lib/currency";
import { cn } from "../../lib/utils";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Valor numérico controlado externamente */
  value?: number | null;
  /** Callback chamado com o valor numérico atualizado */
  onValueChange?: (value: number) => void;
  /** Rótulo do campo */
  label?: string;
  /** Classes CSS adicionais para o wrapper */
  wrapperClassName?: string;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onValueChange,
      label,
      placeholder = "0,00",
      className,
      wrapperClassName,
      disabled,
      required,
      id,
      name,
      ...rest
    },
    ref
  ) => {
    // displayValue: o que aparece no input
    const [displayValue, setDisplayValue] = useState<string>(() => {
      if (value == null || value === 0) return "";
      return formatBRLCurrency(value);
    });

    // Controla se o componente está montado para evitar updates em componentes desmontados
    const isMounted = useRef(true);
    useEffect(() => {
      isMounted.current = true;
      return () => { isMounted.current = false; };
    }, []);

    // Sincroniza o displayValue quando o valor externo muda (ex: reset de formulário)
    const prevValueRef = useRef<number | null | undefined>(value);
    useEffect(() => {
      if (!isMounted.current) return;
      // Só sincroniza se o valor externo mudou e não está sendo editado pelo usuário
      if (prevValueRef.current !== value) {
        prevValueRef.current = value;
        if (value == null || value === 0) {
          setDisplayValue("");
        } else {
          setDisplayValue(formatBRLCurrency(value));
        }
      }
    }, [value]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = maskCurrencyInput(e.target.value);
        setDisplayValue(formatted);
        prevValueRef.current = unmaskCurrencyInput(formatted);
        onValueChange?.(unmaskCurrencyInput(formatted));
      },
      [onValueChange]
    );

    const inputElement = (
      <input
        ref={ref}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={cn(
          "w-full rounded border border-gray-300 px-3 py-2 text-right font-mono text-sm tabular-nums",
          "focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400",
          disabled && "cursor-not-allowed bg-gray-50 opacity-60",
          className
        )}
        autoComplete="off"
        {...rest}
      />
    );

    if (label) {
      return (
        <div className={cn("space-y-1", wrapperClassName)}>
          <label
            htmlFor={id}
            className="block text-xs font-semibold text-gray-600"
          >
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
          {inputElement}
        </div>
      );
    }

    return inputElement;
  }
);

CurrencyInput.displayName = "CurrencyInput";

/**
 * CurrencyInput.tsx — máscara brasileira estável para valores monetários
 *
 * Regra de digitação:
 * - usuário digita apenas números;
 * - o valor é formatado automaticamente como 0,01 / 1,23 / 12,34 / 1.234,56;
 * - o cursor permanece no final, evitando saltos para o meio do texto;
 * - o componente retorna o número limpo em onValueChange.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value?: number | string;
  onValueChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  noPrefix?: boolean;
  size?: "sm" | "md" | "lg";
  decimalPlaces?: number;
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function parseCurrencyValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const cleaned = raw
    .replace(/[R$US$\s]/g, "")
    .replace(/[^\d,.-]/g, "");

  if (!cleaned) return 0;

  // Formato BR: 1.234,56
  if (cleaned.includes(",")) {
    const parsed = Number.parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrencyInput(value: number, decimalPlaces = 2): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value);
}

function maskDigitsToCurrency(digits: string, decimalPlaces = 2): string {
  const clean = onlyDigits(digits);
  if (!clean) return "";

  const padded = clean.padStart(decimalPlaces + 1, "0");
  const integerPart = padded.slice(0, padded.length - decimalPlaces);
  const decimalPart = padded.slice(padded.length - decimalPlaces);
  const integerNumber = Number.parseInt(integerPart, 10);

  if (!Number.isFinite(integerNumber)) return "";

  return `${new Intl.NumberFormat("pt-BR").format(integerNumber)},${decimalPart}`;
}

function maskedStringToNumber(masked: string, decimalPlaces = 2): number {
  const clean = onlyDigits(masked);
  if (!clean) return 0;
  return Number.parseInt(clean, 10) / Math.pow(10, decimalPlaces);
}

export function CurrencyInput({
  value,
  onValueChange,
  placeholder = "0,00",
  disabled = false,
  className,
  id,
  name,
  noPrefix = false,
  size = "md",
  decimalPlaces = 2,
}: CurrencyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const [displayValue, setDisplayValue] = useState(() =>
    formatCurrencyInput(parseCurrencyValue(value), decimalPlaces),
  );

  useEffect(() => {
    if (focusedRef.current) return;
    const formatted = formatCurrencyInput(parseCurrencyValue(value), decimalPlaces);
    setDisplayValue((current) => (current === formatted ? current : formatted));
  }, [value, decimalPlaces]);

  const keepCursorAtEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const digits = onlyDigits(event.target.value);
      const masked = maskDigitsToCurrency(digits, decimalPlaces);
      setDisplayValue(masked);
      onValueChange(maskedStringToNumber(masked, decimalPlaces));
      keepCursorAtEnd();
    },
    [decimalPlaces, keepCursorAtEnd, onValueChange],
  );

  const handleFocus = useCallback(() => {
    focusedRef.current = true;
    keepCursorAtEnd();
  }, [keepCursorAtEnd]);

  const handleBlur = useCallback(() => {
    focusedRef.current = false;
    const valueNumber = maskedStringToNumber(displayValue, decimalPlaces);
    setDisplayValue(formatCurrencyInput(valueNumber, decimalPlaces));
  }, [decimalPlaces, displayValue]);

  const sizeClass = {
    sm: "h-8 text-sm",
    md: "h-9 text-sm",
    lg: "h-10 text-base",
  }[size];

  return (
    <div className="relative flex items-center">
      {!noPrefix && (
        <span className="absolute left-3 z-10 select-none font-mono text-xs text-muted-foreground pointer-events-none">
          R$
        </span>
      )}
      <Input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cn(
          sizeClass,
          !noPrefix && "pl-9",
          "font-mono tabular-nums",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      />
    </div>
  );
}

export function CurrencyInputCompact({
  value,
  onValueChange,
  disabled,
  className,
}: Pick<CurrencyInputProps, "value" | "onValueChange" | "disabled" | "className">) {
  return (
    <CurrencyInput
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className={cn("h-8 text-sm", className)}
      noPrefix
      placeholder="0,00"
    />
  );
}

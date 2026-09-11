import { useState, useCallback, useRef } from 'react';
import { fetchCNPJData, cleanDigits, type CNPJData } from '../utils/cnpj';

// Este hook fornece uma API simples para consulta de CNPJ. Ele mantém
// internamente o status da consulta (idle, loading, found, error) e
// permite debouncing das requisições. Utilização típica:
// const { status, error, lookup, reset } = useCNPJLookup();
// lookup('00.000.000/0001-00', data => {/* ... preencher formulário ... */});

type Status = 'idle' | 'loading' | 'found' | 'error';

interface UseCNPJLookupReturn {
  status: Status;
  error: string | null;
  lookup: (cnpj: string, onSuccess: (data: CNPJData) => void) => void;
  reset: () => void;
}

export function useCNPJLookup(): UseCNPJLookupReturn {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookup = useCallback(
    (cnpj: string, onSuccess: (data: CNPJData) => void) => {
      const clean = cleanDigits(cnpj);
      // Só consulta quando houver 14 dígitos válidos
      if (clean.length !== 14) return;
      // Cancela qualquer consulta pendente
      if (timerRef.current) clearTimeout(timerRef.current);
      setStatus('loading');
      setError(null);
      // Debounce de 600ms para evitar múltiplas requisições em sequência
      timerRef.current = setTimeout(async () => {
        try {
          const data = await fetchCNPJData(cnpj);
          onSuccess(data);
          setStatus('found');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Erro ao buscar CNPJ';
          setError(msg);
          setStatus('error');
        }
      }, 600);
    },
    [],
  );

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, lookup, reset };
}

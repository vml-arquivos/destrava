import { useCallback, useRef, useState } from 'react';
import { cleanDigits, fetchCNPJData, type CNPJData } from '../utils/cnpj';

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

  const lookup = useCallback((cnpj: string, onSuccess: (data: CNPJData) => void) => {
    const clean = cleanDigits(cnpj);
    if (clean.length !== 14) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    setStatus('loading');
    setError(null);

    timerRef.current = setTimeout(async () => {
      try {
        const data = await fetchCNPJData(clean);
        onSuccess(data);
        setStatus('found');
      } catch (err: unknown) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Erro ao consultar CNPJ');
      }
    }, 450);
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('idle');
    setError(null);
  }, []);

  return { status, error, lookup, reset };
}

import { useState, useEffect, useRef } from 'react';
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from '../../lib/currency';

interface RegistroHistorico {
  competencia: string;
  valor: number | string;
  origem?: string;
}

interface Props {
  registros: RegistroHistorico[];
  onChange: (index: number, campo: keyof RegistroHistorico, valor: string) => void;
}

const formatMesAno = (ds: string) => {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

/**
 * ValorCell — célula de edição de valor com máscara automática de digitação.
 */
function ValorCell({
  valor,
  onChange,
}: {
  valor: number | string;
  onChange: (v: string) => void;
}) {
  const numericValue = typeof valor === 'number' ? valor : (parseFloat(String(valor || '0')) || 0);
  const [displayValue, setDisplayValue] = useState<string>(() =>
    numericValue ? formatBRLCurrency(numericValue) : ''
  );
  const prevRef = useRef<number>(numericValue);
  useEffect(() => {
    if (prevRef.current !== numericValue) {
      prevRef.current = numericValue;
      setDisplayValue(numericValue ? formatBRLCurrency(numericValue) : '');
    }
  }, [numericValue]);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = maskCurrencyInput(e.target.value);
    setDisplayValue(formatted);
    const num = unmaskCurrencyInput(formatted);
    prevRef.current = num;
    onChange(String(num));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      placeholder="0,00"
      autoComplete="off"
      className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

export function TabelaHistorico({ registros, onChange }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-600">Competência</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Faturamento (R$)</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Origem</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((reg, idx) => (
            <tr key={reg.competencia} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 px-3 text-gray-700 capitalize">
                {formatMesAno(reg.competencia)}
              </td>
              <td className="py-2 px-3">
                <ValorCell
                  valor={reg.valor}
                  onChange={v => onChange(idx, 'valor', v)}
                />
              </td>
              <td className="py-2 px-3">
                <select
                  value={reg.origem || 'manual'}
                  onChange={e => onChange(idx, 'origem', e.target.value)}
                  className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="manual">Manual</option>
                  <option value="importado">Importado</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

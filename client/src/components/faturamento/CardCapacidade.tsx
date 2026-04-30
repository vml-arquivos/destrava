import { } from 'lucide-react';

interface Props {
  min: number;
  max: number;
  modelo: string;
  aviso?: string;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function CardCapacidade({ min, max, modelo }: Props) {
  const cor = max > 50000 ? 'green' : max > 20000 ? 'yellow' : 'red';
  const cores = {
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
    red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-800' },
  }[cor];

  const modeloLabel = modelo === 'linear_fallback' ? 'LINEAR' : modelo.toUpperCase();

  return (
    <div className={`rounded-xl border-2 p-5 ${cores.bg} ${cores.border}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-gray-800">Capacidade de Pagamento</h3>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cores.badge}`}>
          Modelo: {modeloLabel}
        </span>
      </div>
      <p className={`text-2xl font-bold ${cores.text}`}>
        {formatBRL(min)} – {formatBRL(max)}
        <span className="text-sm font-normal text-gray-500"> /mês</span>
      </p>
      <p className="text-xs text-gray-500 mt-2">
        Parcela ideal comprometendo entre 15% e 25% do faturamento futuro previsto
      </p>
    </div>
  );
}

import { formatBRLWithSymbol } from '../../lib/currency';

interface Props {
  min: number;
  max: number;
  modelo: string;
  aviso?: string;
}

const formatBRL = (v: number) => formatBRLWithSymbol(v);

export function CardCapacidade({ min, max, modelo }: Props) {
  const cor = max > 50000 ? 'green' : max > 20000 ? 'yellow' : 'red';
  const cores = {
    green: { bg: 'bg-success/10', border: 'border-success/20', text: 'text-success', badge: 'bg-success/20 text-success' },
    yellow: { bg: 'bg-warning/10', border: 'border-warning/20', text: 'text-warning', badge: 'bg-warning/20 text-warning' },
    red: { bg: 'bg-destructive/10', border: 'border-destructive/20', text: 'text-destructive', badge: 'bg-destructive/20 text-destructive' },
  }[cor];

  const modeloLabel = modelo === 'linear_fallback' ? 'LINEAR' : modelo.toUpperCase();

  return (
    <div className={`rounded-xl border-2 p-5 ${cores.bg} ${cores.border}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-foreground">Capacidade de Pagamento</h3>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${cores.badge}`}>
          Modelo: {modeloLabel}
        </span>
      </div>
      <p className={`text-2xl font-bold ${cores.text}`}>
        {formatBRL(min)} – {formatBRL(max)}
        <span className="text-sm font-normal text-muted-foreground"> /mês</span>
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Parcela ideal comprometendo entre 15% e 25% do faturamento futuro previsto
      </p>
    </div>
  );
}

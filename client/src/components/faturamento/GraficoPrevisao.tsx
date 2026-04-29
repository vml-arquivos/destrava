import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface PontoGrafico {
  ds: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
  is_historico: boolean;
}

interface Props {
  pontos: PontoGrafico[];
  capacidadeMin: number;
  capacidadeMax: number;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(v);

const formatMesAno = (ds: string) => {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
};

export function GraficoPrevisao({ pontos }: Props) {
  const dados = pontos.map(p => ({
    ...p,
    mesAno: formatMesAno(p.ds),
    historico: p.is_historico ? p.yhat : undefined,
    previsao: !p.is_historico ? p.yhat : undefined,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        {payload.map((entry: any) => (
          entry.value != null && (
            <p key={entry.name} style={{ color: entry.color }}>
              {entry.name}: {formatBRL(entry.value)}
            </p>
          )
        ))}
      </div>
    );
  };

  const indexDivisor = dados.findIndex(d => !d.is_historico);

  return (
    <ResponsiveContainer width="100%" height={380}>
      <ComposedChart data={dados} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="mesAno"
          tick={{ fontSize: 11 }}
          interval={2}
        />
        <YAxis
          tickFormatter={formatBRL}
          tick={{ fontSize: 11 }}
          width={80}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />

        {/* Intervalo de confiança (área sombreada) */}
        <Area
          type="monotone"
          dataKey="yhat_upper"
          stroke="none"
          fill="#94a3b8"
          fillOpacity={0.2}
          name="Limite superior"
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="yhat_lower"
          stroke="none"
          fill="#ffffff"
          fillOpacity={1}
          name="Intervalo de confiança"
          legendType="square"
        />

        {/* Linha histórica (sólida azul) */}
        <Line
          type="monotone"
          dataKey="historico"
          stroke="#2563eb"
          strokeWidth={2.5}
          dot={false}
          name="Histórico real"
          connectNulls={false}
        />

        {/* Linha de previsão (tracejada laranja) */}
        <Line
          type="monotone"
          dataKey="previsao"
          stroke="#ea580c"
          strokeWidth={2}
          strokeDasharray="6 3"
          dot={false}
          name="Previsão IA"
          connectNulls={false}
        />

        {/* Linha divisória histórico/previsão */}
        {indexDivisor > 0 && (
          <ReferenceLine
            x={dados[indexDivisor]?.mesAno}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{ value: 'Hoje', position: 'top', fontSize: 10, fill: '#6b7280' }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

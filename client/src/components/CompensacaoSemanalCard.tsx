import { AlertTriangle, CheckCircle2, Target, TrendingDown, TrendingUp } from "lucide-react";

type Props = {
  semana: any;
};

function moneyBR(value: unknown): string {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percentBR(value: unknown): string {
  const n = Number(value || 0);
  return `${n.toFixed(2).replace(".", ",")}%`;
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    dentro_referencia: "Dentro da referência",
    acima_referencia: "Acima da referência",
    abaixo_referencia: "Abaixo da referência",
    risco_rating: "Risco de rating",
    alerta_aderencia: "Alerta de aderência",
    critico: "Crítico",
    aguardando_atualizacao: "Aguardando atualização",
  };

  return labels[String(status || "")] || "Acompanhamento";
}

export default function CompensacaoSemanalCard({ semana }: Props) {
  if (!semana) return null;

  const alertaAderencia = Boolean(semana.alerta_aderencia);
  const alertaRating = Boolean(semana.alerta_rating);
  const diferenca = Number(semana.diferenca_referencia_semanal || 0);
  const metaDinamica = Number(semana.meta_dinamica_proxima_semana || 0);
  const excedente = Number(semana.valor_excedente_mes || 0);
  const faltante = Number(semana.saldo_faltante_mes || 0);

  return (
    <div className="space-y-4">
      {(alertaAderencia || alertaRating) && (
        <div
          className={`rounded-xl border p-4 ${
            alertaAderencia
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h3 className="font-bold">
                {alertaAderencia ? "Alerta de aderência financeira" : "Alerta de rating"}
              </h3>
              <p className="text-sm">
                {semana.motivo_alerta_aderencia ||
                  (alertaAderencia
                    ? "Movimentação acima da referência configurada para o período."
                    : "Movimentação projetada abaixo da referência esperada para análise de crédito.")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-700" />
            <h3 className="font-bold text-slate-900">Acompanhamento Bancário Dinâmico</h3>
          </div>
          <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
            {statusLabel(semana.status_compensacao)}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Média mensal base</p>
            <p className="mt-1 text-lg font-bold">{moneyBR(semana.media_mensal_referencia)}</p>
          </div>
          <div className="rounded-xl bg-blue-50 p-3">
            <p className="text-xs font-semibold uppercase text-blue-600">Teto mensal +30%</p>
            <p className="mt-1 text-lg font-bold text-blue-900">{moneyBR(semana.limite_mensal_referencia)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Meta semanal</p>
            <p className="mt-1 text-lg font-bold">{moneyBR(semana.media_semanal_referencia)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Entrada da semana</p>
            <p className="mt-1 text-lg font-bold">{moneyBR(semana.total_entradas)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className={`rounded-xl p-3 ${diferenca > 0 ? "bg-red-50" : diferenca < 0 ? "bg-amber-50" : "bg-green-50"}`}>
            <div className="flex items-center gap-2">
              {diferenca > 0 ? (
                <TrendingUp className="h-4 w-4 text-red-700" />
              ) : diferenca < 0 ? (
                <TrendingDown className="h-4 w-4 text-amber-700" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-700" />
              )}
              <p className="text-xs font-semibold uppercase">Diferença da referência</p>
            </div>
            <p className="mt-1 text-lg font-bold">{moneyBR(Math.abs(diferenca))}</p>
            <p className="mt-1 text-xs">
              {diferenca > 0
                ? "Acima: próxima semana deve segurar/reduzir."
                : diferenca < 0
                  ? "Abaixo: próxima semana deve aumentar."
                  : "Sem compensação necessária."}
            </p>
          </div>

          <div className="rounded-xl bg-blue-50 p-3">
            <p className="text-xs font-semibold uppercase text-blue-600">Meta dinâmica próxima semana</p>
            <p className="mt-1 text-lg font-bold text-blue-900">{moneyBR(metaDinamica)}</p>
            <p className="mt-1 text-xs text-blue-700">Valor sugerido para nivelar o mês nas semanas restantes.</p>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">
              {excedente > 0 ? "Valor excedente" : "Saldo faltante"}
            </p>
            <p className={`mt-1 text-lg font-bold ${excedente > 0 ? "text-red-700" : "text-slate-900"}`}>
              {moneyBR(excedente > 0 ? excedente : faltante)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Uso semanal</p>
            <p className="mt-1 font-bold">{percentBR(semana.percentual_limite_semanal)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Uso mensal</p>
            <p className="mt-1 font-bold">{percentBR(semana.percentual_limite_mensal)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Uso anual</p>
            <p className="mt-1 font-bold">{percentBR(semana.percentual_limite_anual)}</p>
          </div>
        </div>

        {semana.diagnostico_compensacao && (
          <div className="mt-4 whitespace-pre-line rounded-xl border-l-4 border-blue-700 bg-blue-50 p-3 text-sm text-slate-700">
            {semana.diagnostico_compensacao}
          </div>
        )}
      </div>
    </div>
  );
}

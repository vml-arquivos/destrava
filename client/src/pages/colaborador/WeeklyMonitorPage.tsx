/**
 * WeeklyMonitorPage.tsx
 * Página do Monitor Semanal Inteligente
 *
 * Posição no projeto: client/src/pages/colaborador/WeeklyMonitorPage.tsx
 */

import { useState, useEffect } from "react";
import ColaboradorLayout from "./Layout";
import WeeklyMonitorDashboard from "@/components/faturamento/WeeklyMonitorDashboard";
import { apiFetch } from "@/lib/api";
import { Building2, ChevronDown } from "lucide-react";

interface Acompanhamento {
  id: string;
  nome_empresa: string;
  faturamento_anual: number;
  status: string;
}

export default function WeeklyMonitorPage() {
  const [acompanhamentos, setAcompanhamentos] = useState<Acompanhamento[]>([]);
  const [selecionado, setSelecionado]         = useState<Acompanhamento | null>(null);
  const [carregando, setCarregando]           = useState(true);

  useEffect(() => {
    apiFetch("/api/acompanhamentos-bancarios?limit=100")
      .then((data: any) => {
        const lista = Array.isArray(data) ? data : data?.acompanhamentos ?? [];
        setAcompanhamentos(lista);
        if (lista.length === 1) setSelecionado(lista[0]);
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  return (
    <ColaboradorLayout title="Monitor Semanal Inteligente">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">

        {/* Seletor de empresa */}
        {!carregando && acompanhamentos.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <Building2 className="w-3.5 h-3.5 inline mr-1" />
              Selecionar empresa
            </label>
            <div className="relative">
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none pr-8"
                value={selecionado?.id ?? ""}
                onChange={e => {
                  const found = acompanhamentos.find(a => a.id === e.target.value);
                  setSelecionado(found ?? null);
                }}
              >
                <option value="">Selecione um acompanhamento...</option>
                {acompanhamentos.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nome_empresa} —{" "}
                    {Number(a.faturamento_anual).toLocaleString("pt-BR", {
                      style: "currency", currency: "BRL",
                    })}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          </div>
        )}

        {carregando && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Carregando acompanhamentos...
          </div>
        )}

        {/* Dashboard — modo manual se não houver acompanhamento selecionado */}
        {!carregando && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
            {selecionado ? (
              <WeeklyMonitorDashboard
                key={selecionado.id}
                acompanhamentoId={selecionado.id}
                faturamentoAnual={Number(selecionado.faturamento_anual)}
              />
            ) : (
              <WeeklyMonitorDashboard
                faturamentoAnual={0}
                manualMode
              />
            )}
          </div>
        )}

      </div>
    </ColaboradorLayout>
  );
}

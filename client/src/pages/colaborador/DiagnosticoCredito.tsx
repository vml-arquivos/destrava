import { useEffect, useState, useCallback } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  ClipboardCheck, Search, RefreshCw, Loader2, ShieldCheck, ShieldAlert,
  ShieldX, Zap, TrendingUp, AlertTriangle, CheckCircle2, XCircle,
  Building2, ChevronRight, Sparkles, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";

interface EmpresaDiagnostico {
  id: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  score_interno?: number;
  risco_classificacao?: string;
  situacao_cadastral?: string;
  porte?: string;
  capital_social?: number;
  ultima_analise?: string | null;
  alertas_criticos?: number;
  pontos_impeditivos?: number;
  pontos_positivos?: number;
  status_credito?: "apto" | "pendencias_leves" | "pendencias_graves" | "inapto" | "nao_analisado";
}

const STATUS_CONFIG: Record<string, { label: string; cor: string; bg: string; icone: React.ElementType }> = {
  apto:             { label: "Apto ao crédito",     cor: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icone: ShieldCheck },
  pendencias_leves: { label: "Pendências leves",    cor: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     icone: ShieldAlert },
  pendencias_graves:{ label: "Pendências graves",   cor: "text-orange-700",  bg: "bg-orange-50 border-orange-200",   icone: ShieldAlert },
  inapto:           { label: "Inapto — ação urgente", cor: "text-red-700",   bg: "bg-red-50 border-red-200",         icone: ShieldX },
  nao_analisado:    { label: "Não analisado",       cor: "text-slate-500",   bg: "bg-slate-50 border-slate-200",     icone: ShieldAlert },
};

function calcularStatusCredito(emp: EmpresaDiagnostico): string {
  if (emp.status_credito) return emp.status_credito;
  const score = Number(emp.score_interno ?? 0);
  const impedimentos = Number(emp.pontos_impeditivos ?? 0);
  const alertas = Number(emp.alertas_criticos ?? 0);
  const temAnalise = Boolean(emp.ultima_analise || emp.risco_classificacao || emp.score_interno !== undefined);
  if (!temAnalise) return "nao_analisado";
  if (impedimentos >= 2 || score < 30 || emp.risco_classificacao === "critico") return "inapto";
  if (impedimentos === 1 || alertas >= 3 || score < 50 || emp.risco_classificacao === "alto") return "pendencias_graves";
  if (alertas >= 1 || score < 70 || emp.risco_classificacao === "medio") return "pendencias_leves";
  return "apto";
}

export default function DiagnosticoCredito() {
  const [empresas, setEmpresas] = useState<EmpresaDiagnostico[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [carregando, setCarregando] = useState(true);
  const [analisandoTodas, setAnalisandoTodas] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await apiFetch(`/api/diagnostico-credito?limite=500${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`);
      const lista = Array.isArray(data?.items || data) ? (data?.items || data) : [];
      setEmpresas(lista);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar diagnóstico");
    } finally {
      setCarregando(false);
    }
  }, [busca]);

  useEffect(() => { void carregar(); }, [carregar]);

  const empresasComStatus = empresas.map(emp => ({
    ...emp,
    status_credito: calcularStatusCredito(emp),
  }));

  const filtradas = filtroStatus === "todos"
    ? empresasComStatus
    : empresasComStatus.filter(e => e.status_credito === filtroStatus);

  const stats = {
    apto:              empresasComStatus.filter(e => e.status_credito === "apto").length,
    pendencias_leves:  empresasComStatus.filter(e => e.status_credito === "pendencias_leves").length,
    pendencias_graves: empresasComStatus.filter(e => e.status_credito === "pendencias_graves").length,
    inapto:            empresasComStatus.filter(e => e.status_credito === "inapto").length,
    nao_analisado:     empresasComStatus.filter(e => e.status_credito === "nao_analisado").length,
  };

  return (
    <Layout title="Diagnóstico de Crédito">
      <div className="h-full overflow-y-auto bg-slate-50 p-4 lg:p-6">
        <div className="max-w-6xl mx-auto space-y-4">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-100">
                <ClipboardCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-900">Diagnóstico de Crédito</h1>
                <p className="text-xs text-slate-500">Visão consolidada da aptidão de todas as empresas</p>
              </div>
            </div>
            <Link href="/colaborador/assessoria">
              <button className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm">
                <Sparkles className="h-4 w-4" />
                Central de Assessoria IA
              </button>
            </Link>
          </div>

          {/* Cards de status */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(Object.entries(STATUS_CONFIG) as [string, typeof STATUS_CONFIG[string]][]).map(([key, conf]) => {
              const Icon = conf.icone;
              const count = stats[key as keyof typeof stats] || 0;
              return (
                <button
                  key={key}
                  onClick={() => setFiltroStatus(filtroStatus === key ? "todos" : key)}
                  className={`rounded-2xl border p-3 text-center transition-all ${
                    filtroStatus === key ? conf.bg + " ring-2 ring-offset-1" : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Icon className={`h-5 w-5 mx-auto mb-1 ${conf.cor}`} />
                  <div className={`text-xl font-black ${conf.cor}`}>{count}</div>
                  <div className="text-[10px] text-slate-500 font-semibold leading-tight mt-0.5">{conf.label}</div>
                </button>
              );
            })}
          </div>

          {/* Busca e filtro */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar empresa ou CNPJ..."
                className="w-full pl-9 pr-3 h-10 rounded-2xl border border-slate-200 bg-white text-sm outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
              />
            </div>
            <button onClick={carregar} className="h-10 w-10 rounded-2xl border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 shrink-0">
              <RefreshCw className={`h-4 w-4 text-slate-500 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Lista de empresas */}
          {carregando ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-50">
                {filtradas.length === 0 ? (
                  <div className="py-16 text-center text-sm text-slate-400">Nenhuma empresa encontrada</div>
                ) : filtradas
                    .sort((a, b) => {
                      const ordem = { inapto: 0, pendencias_graves: 1, pendencias_leves: 2, nao_analisado: 3, apto: 4 };
                      return (ordem[a.status_credito as keyof typeof ordem] ?? 5) - (ordem[b.status_credito as keyof typeof ordem] ?? 5);
                    })
                    .map(emp => {
                      const conf = STATUS_CONFIG[emp.status_credito || "nao_analisado"];
                      const Icon = conf.icone;
                      const score = emp.score_interno || 0;
                      const corScore = score >= 70 ? "text-emerald-700" : score >= 50 ? "text-amber-600" : score >= 30 ? "text-orange-600" : "text-red-600";
                      return (
                        <Link key={emp.id} href={`/colaborador/assessoria`}>
                          <div
                            onClick={() => {/* abre assessoria com empresa selecionada */}}
                            className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-all cursor-pointer"
                          >
                            <div className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-600 text-sm shrink-0">
                              {(emp.razao_social || "?").charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-900 truncate">{emp.razao_social || emp.nome_fantasia}</p>
                                {emp.porte && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">{emp.porte}</span>}
                              </div>
                              <p className="text-xs text-slate-400 truncate">{emp.cnpj}</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {emp.ultima_analise && (
                                <div className={`text-center ${corScore}`}>
                                  <div className="text-lg font-black">{score}</div>
                                  <div className="text-[10px] font-semibold leading-none">score</div>
                                </div>
                              )}
                              <div className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold ${conf.bg} ${conf.cor}`}>
                                <Icon className="h-3.5 w-3.5" />
                                {conf.label}
                              </div>
                              <ChevronRight className="h-4 w-4 text-slate-300" />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
              </div>
            </div>
          )}

          {filtradas.length > 0 && (
            <p className="text-center text-xs text-slate-400">{filtradas.length} empresa{filtradas.length !== 1 ? "s" : ""} · {filtroStatus !== "todos" ? STATUS_CONFIG[filtroStatus]?.label : "todos os status"}</p>
          )}
        </div>
      </div>
    </Layout>
  );
}

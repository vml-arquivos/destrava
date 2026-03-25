import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import ColaboradorLayout from "./Layout";
import {
  Calculator, FileText, TrendingUp, DollarSign, Clock,
  CheckCircle2, XCircle, Plus, ArrowRight, Users, Zap,
  RefreshCw, Loader2, AlertCircle, MessageSquare
} from "lucide-react";

const ADMIN_KEY = "destrava2024admin";

interface Stats {
  leads: {
    total: number;
    byStatus: Record<string, number>;
    byProduto: Record<string, number>;
  };
  simulacoes: {
    total: number;
    totalValorSimulado: number;
    totalCustoSimulado: number;
  };
  contatos: { total: number };
  n8n: { configured: boolean };
}

interface Lead {
  id: string;
  nome: string;
  empresa?: string;
  telefone: string;
  produto?: string;
  valorSolicitado?: number;
  status: string;
  criadoEm: string;
}

interface Simulacao {
  id: string;
  nome: string;
  empresa?: string;
  produto: string;
  valorSolicitado: number;
  parcelaMensal?: number;
  custoTotal?: number;
  criadoEm: string;
}

const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "R$ 0,00";
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const STATUS_LEAD_COLOR: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  em_atendimento: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-green-100 text-green-700",
  reprovado: "bg-red-100 text-red-700",
  convertido: "bg-purple-100 text-purple-700",
};

export default function Dashboard() {
  const { colaborador } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leadsRecentes, setLeadsRecentes] = useState<Lead[]>([]);
  const [simulacoesRecentes, setSimulacoesRecentes] = useState<Simulacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setLoading(true);
    setErro(null);
    try {
      const headers = { "x-admin-key": ADMIN_KEY };

      const [statsRes, leadsRes, simsRes] = await Promise.all([
        fetch("/api/stats", { headers }),
        fetch("/api/leads", { headers }),
        fetch("/api/simulacoes", { headers }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeadsRecentes((data.leads || []).slice(0, 5));
      }
      if (simsRes.ok) {
        const data = await simsRes.json();
        setSimulacoesRecentes((data.simulacoes || []).slice(0, 5));
      }
    } catch (e) {
      setErro("Erro ao carregar dados. Verifique a conexão.");
    }
    setLoading(false);
  }

  const nomeColaborador = colaborador?.nome?.split(" ")[0] || "Colaborador";

  return (
    <ColaboradorLayout title="Dashboard">
      <div className="space-y-6 p-6">
        {/* Boas-vindas */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Olá, {nomeColaborador}! 👋
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={carregarDados}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Atualizar dados"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link href="/colaborador/calculadora">
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Plus className="w-4 h-4" />
                Nova Simulação
              </button>
            </Link>
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {erro}
          </div>
        )}

        {/* Cards de estatísticas */}
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Total de Leads</p>
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats?.leads.total ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">
                {stats?.leads.byStatus?.novo ?? 0} novos
              </p>
            </div>

            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Simulações</p>
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-green-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats?.simulacoes.total ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">realizadas</p>
            </div>

            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Volume Simulado</p>
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-yellow-600" />
                </div>
              </div>
              <p className="text-2xl font-bold text-yellow-600">
                {fmt(stats?.simulacoes.totalValorSimulado ?? 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">em crédito</p>
            </div>

            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Contatos</p>
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-purple-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats?.contatos.total ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">mensagens recebidas</p>
            </div>
          </div>
        )}

        {/* Atalhos rápidos */}
        <div className="grid md:grid-cols-4 gap-3">
          {[
            { href: "/colaborador/calculadora", icon: Calculator, label: "Calculadora", desc: "Nova simulação", color: "blue" },
            { href: "/colaborador/clientes", icon: Users, label: "Clientes CRM", desc: "Gestão de clientes", color: "green" },
            { href: "/colaborador/simulacoes", icon: FileText, label: "Simulações", desc: "Histórico completo", color: "yellow" },
            { href: "/colaborador/integracoes", icon: Zap, label: "n8n", desc: stats?.n8n?.configured ? "✅ Conectado" : "⚠️ Configurar", color: "purple" },
          ].map(item => (
            <Link key={item.href} href={item.href}>
              <div className={`bg-white rounded-xl border-2 p-4 hover:shadow-md transition-all cursor-pointer group ${
                item.color === "blue" ? "hover:border-blue-300" :
                item.color === "green" ? "hover:border-green-300" :
                item.color === "yellow" ? "hover:border-yellow-300" : "hover:border-purple-300"
              }`}>
                <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
                  item.color === "blue" ? "bg-blue-100" :
                  item.color === "green" ? "bg-green-100" :
                  item.color === "yellow" ? "bg-yellow-100" : "bg-purple-100"
                }`}>
                  <item.icon className={`w-5 h-5 ${
                    item.color === "blue" ? "text-blue-600" :
                    item.color === "green" ? "text-green-600" :
                    item.color === "yellow" ? "text-yellow-600" : "text-purple-600"
                  }`} />
                </div>
                <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Leads e Simulações recentes */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Leads Recentes */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Leads Recentes</h3>
                <p className="text-xs text-gray-500">Últimos 5 leads capturados</p>
              </div>
              <Link href="/colaborador/clientes">
                <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  Ver todos <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            <div className="divide-y">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
              ) : leadsRecentes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Nenhum lead ainda</p>
                  <p className="text-xs mt-1">Os leads do simulador aparecerão aqui</p>
                </div>
              ) : (
                leadsRecentes.map(lead => (
                  <div key={lead.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0">
                      {lead.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{lead.nome}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {lead.empresa || lead.telefone} · {lead.produto || "—"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_LEAD_COLOR[lead.status] || "bg-gray-100 text-gray-600"}`}>
                        {lead.status}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(lead.criadoEm)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Simulações Recentes */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Simulações Recentes</h3>
                <p className="text-xs text-gray-500">Últimas 5 simulações realizadas</p>
              </div>
              <Link href="/colaborador/simulacoes">
                <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  Ver todas <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            <div className="divide-y">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
              ) : simulacoesRecentes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Calculator className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Nenhuma simulação ainda</p>
                  <Link href="/colaborador/calculadora">
                    <button className="mt-2 text-xs text-blue-600 hover:underline">
                      + Criar simulação
                    </button>
                  </Link>
                </div>
              ) : (
                simulacoesRecentes.map(sim => (
                  <div key={sim.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Calculator className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{sim.nome}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {sim.produto} · {sim.empresa || "—"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{fmt(sim.valorSolicitado)}</p>
                      <p className="text-xs text-gray-400">{fmtDate(sim.criadoEm)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Leads por produto */}
        {stats && stats.leads.total > 0 && (
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Leads por Produto</h3>
            <div className="space-y-3">
              {Object.entries(stats.leads.byProduto)
                .sort(([, a], [, b]) => b - a)
                .map(([produto, count]) => {
                  const pct = Math.round((count / stats.leads.total) * 100);
                  return (
                    <div key={produto}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700">{produto || "Não informado"}</span>
                        <span className="text-gray-500 font-medium">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </ColaboradorLayout>
  );
}

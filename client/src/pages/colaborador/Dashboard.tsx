import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import ColaboradorLayout from "./Layout";
import {
  Calculator, FileText, TrendingUp, DollarSign, Clock,
  CheckCircle2, XCircle, Plus, ArrowRight, Users, Zap,
  RefreshCw, Loader2, AlertCircle, MessageSquare, ShieldAlert,
  Building2, UserCheck
} from "lucide-react";

// Interfaces alinhadas com os shapes reais do banco
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

interface LeadRow {
  id: string;
  nome: string;
  empresa?: string;
  telefone: string;
  produto_interesse?: string;
  valor_solicitado?: number;
  status: string;
  created_at: string;
}

interface SimulacaoRow {
  id: string;
  cliente_nome: string;
  empresa?: string;
  linha_credito?: string;
  banco?: string;
  valor_solicitado?: number;
  valor_parcela?: number;
  criado_em: string;
  status?: string;
}

interface EmpresaRow {
  id: string;
  razao_social: string;
  status?: string;
  captador_nome?: string;
  analista_nome?: string;
  updated_at?: string;
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

// Cargos com visão total
const CARGOS_GESTOR = ["administrador", "diretor", "gerente comercial"];
// Cargos que captam mas não atende (veem apenas suas captações)
const CARGOS_CAPTADOR = ["captador externo"];
// Cargos que atendem (veem apenas suas empresas vinculadas)
const CARGOS_ANALISTA = ["analista de crédito", "consultor de crédito", "estagiário"];

export default function Dashboard() {
  const { colaborador } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leadsRecentes, setLeadsRecentes] = useState<LeadRow[]>([]);
  const [simulacoesRecentes, setSimulacoesRecentes] = useState<SimulacaoRow[]>([]);
  const [empresasRecentes, setEmpresasRecentes] = useState<EmpresaRow[]>([]);
  const [triagemPendente, setTriagemPendente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const cargo = (colaborador?.cargo || "").toLowerCase();
  const isGestor = CARGOS_GESTOR.includes(cargo);
  const isCaptador = CARGOS_CAPTADOR.includes(cargo);
  const isAnalista = CARGOS_ANALISTA.includes(cargo);
  const isAdmin = cargo === "administrador";

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setLoading(true);
    setErro(null);
    try {
      const promises: Promise<any>[] = [
        apiFetch("/api/stats").catch(() => null),
        apiFetch("/api/leads").catch(() => []),
        apiFetch("/api/simulacoes").catch(() => []),
        apiFetch("/api/triagem/stats").catch(() => ({})),
      ];

      // Captadores e analistas também carregam suas empresas vinculadas
      if (isCaptador || isAnalista) {
        promises.push(apiFetch("/api/empresas").catch(() => []));
      }

      const results = await Promise.all(promises);
      const [statsData, leadsData, simsData, triagemData, empresasData] = results;

      if (statsData) setStats(statsData);

      const leadsArr: LeadRow[] = Array.isArray(leadsData)
        ? leadsData
        : (leadsData?.leads ?? []);
      setLeadsRecentes(leadsArr.slice(0, 5));

      const simsArr: SimulacaoRow[] = Array.isArray(simsData)
        ? simsData
        : (simsData?.simulacoes ?? []);
      setSimulacoesRecentes(simsArr);

      if (empresasData) {
        const empArr: EmpresaRow[] = Array.isArray(empresasData)
          ? empresasData
          : (empresasData?.empresas ?? []);
        setEmpresasRecentes(empArr.slice(0, 5));
      }

      setTriagemPendente(triagemData?.pendente ?? 0);
    } catch (e) {
      setErro("Erro ao carregar dados. Verifique a conexão.");
    }
    setLoading(false);
  }

  const nomeColaborador = colaborador?.nome?.split(" ")[0] || "Colaborador";

  // Atalhos rápidos filtrados por cargo
  const atalhos = [
    { href: "/colaborador/calculadora", icon: Calculator, label: "Calculadora", desc: "Nova simulação", color: "blue", visivel: true },
    { href: "/colaborador/clientes", icon: Users, label: "Clientes CRM", desc: "Gestão de clientes", color: "green", visivel: isGestor || isAnalista },
    { href: "/colaborador/empresas", icon: Building2, label: "Empresas", desc: "Carteira de empresas", color: "teal", visivel: true },
    { href: "/colaborador/simulacoes", icon: FileText, label: "Simulações", desc: "Histórico completo", color: "yellow", visivel: true },
    { href: "/colaborador/integracoes", icon: Zap, label: "n8n", desc: stats?.n8n?.configured ? "✅ Conectado" : "⚠️ Configurar", color: "purple", visivel: isAdmin },
  ].filter(a => a.visivel);

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
            {/* Badge de cargo */}
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              {colaborador?.cargo || ""}
            </span>
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
            {/* Card de Leads — apenas para gestores e analistas */}
            {(isGestor || isAnalista) && (
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">Total de Leads</p>
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{stats?.leads.total ?? leadsRecentes.length}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {stats?.leads.byStatus?.novo ?? 0} novos
                </p>
              </div>
            )}

            {/* Card de Empresas — para captadores */}
            {isCaptador && (
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">Minhas Captações</p>
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-orange-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{empresasRecentes.length}</p>
                <p className="text-xs text-gray-400 mt-1">empresas captadas</p>
              </div>
            )}

            {/* Card de Empresas em Atendimento — para analistas */}
            {isAnalista && (
              <div className="bg-white rounded-xl border p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">Minhas Empresas</p>
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                    <UserCheck className="w-4 h-4 text-teal-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{empresasRecentes.length}</p>
                <p className="text-xs text-gray-400 mt-1">em atendimento</p>
              </div>
            )}

            <div className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">Simulações</p>
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <Calculator className="w-4 h-4 text-green-600" />
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats?.simulacoes.total ?? simulacoesRecentes.length}</p>
              <p className="text-xs text-gray-400 mt-1">realizadas</p>
            </div>

            {/* Triagem — apenas para gestores e analistas */}
            {(isGestor || isAnalista) && (
              <Link href="/colaborador/triagem">
                <div className={`rounded-xl border p-5 shadow-sm cursor-pointer transition-all hover:shadow-md ${triagemPendente > 0 ? "bg-yellow-50 border-yellow-300" : "bg-white"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-500">Triagem Pendente</p>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${triagemPendente > 0 ? "bg-yellow-200" : "bg-gray-100"}`}>
                      <ShieldAlert className={`w-4 h-4 ${triagemPendente > 0 ? "text-yellow-700" : "text-gray-400"}`} />
                    </div>
                  </div>
                  <p className={`text-3xl font-bold ${triagemPendente > 0 ? "text-yellow-700" : "text-gray-900"}`}>{triagemPendente}</p>
                  <p className="text-xs text-gray-400 mt-1">aguardando qualificação</p>
                </div>
              </Link>
            )}

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
        <div className={`grid gap-3 ${atalhos.length <= 3 ? "md:grid-cols-3" : atalhos.length === 4 ? "md:grid-cols-4" : "md:grid-cols-5"}`}>
          {atalhos.map(item => (
            <Link key={item.href} href={item.href}>
              <div className={`bg-white rounded-xl border-2 p-4 hover:shadow-md transition-all cursor-pointer group ${
                item.color === "blue" ? "hover:border-blue-300" :
                item.color === "green" ? "hover:border-green-300" :
                item.color === "teal" ? "hover:border-teal-300" :
                item.color === "yellow" ? "hover:border-yellow-300" : "hover:border-purple-300"
              }`}>
                <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${
                  item.color === "blue" ? "bg-blue-100" :
                  item.color === "green" ? "bg-green-100" :
                  item.color === "teal" ? "bg-teal-100" :
                  item.color === "yellow" ? "bg-yellow-100" : "bg-purple-100"
                }`}>
                  <item.icon className={`w-5 h-5 ${
                    item.color === "blue" ? "text-blue-600" :
                    item.color === "green" ? "text-green-600" :
                    item.color === "teal" ? "text-teal-600" :
                    item.color === "yellow" ? "text-yellow-600" : "text-purple-600"
                  }`} />
                </div>
                <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Visão de Captador — Empresas captadas */}
        {isCaptador && (
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Minhas Captações</h3>
                <p className="text-xs text-gray-500">Empresas que você captou</p>
              </div>
              <Link href="/colaborador/empresas">
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
              ) : empresasRecentes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Nenhuma empresa captada ainda</p>
                </div>
              ) : (
                empresasRecentes.map(emp => (
                  <div key={emp.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-xs flex-shrink-0">
                      {(emp.razao_social || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{emp.razao_social}</p>
                      <p className="text-xs text-gray-500 truncate">
                        Analista: {emp.analista_nome || "—"}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${emp.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {emp.status || "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Visão de Analista — Empresas em atendimento */}
        {isAnalista && (
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Minhas Empresas</h3>
                <p className="text-xs text-gray-500">Empresas sob seu atendimento</p>
              </div>
              <Link href="/colaborador/empresas">
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
              ) : empresasRecentes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Nenhuma empresa vinculada ainda</p>
                  <p className="text-xs mt-1">Peça ao gestor para vincular você como Responsável pelo Atendimento</p>
                </div>
              ) : (
                empresasRecentes.map(emp => (
                  <div key={emp.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs flex-shrink-0">
                      {(emp.razao_social || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{emp.razao_social}</p>
                      <p className="text-xs text-gray-500 truncate">
                        Captador: {emp.captador_nome || "—"}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${emp.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {emp.status || "—"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Visão de Gestor — Leads e Simulações recentes */}
        {(isGestor || isAnalista) && (
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
                  </div>
                ) : (
                  leadsRecentes.map(lead => (
                    <div key={lead.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0">
                        {(lead.nome || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.nome}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {lead.empresa || lead.telefone} · {lead.produto_interesse || "—"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_LEAD_COLOR[lead.status] || "bg-gray-100 text-gray-600"}`}>
                          {lead.status}
                        </span>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(lead.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Simulações Recentes */}
            <div className="bg-white rounded-xl border shadow-sm flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="font-semibold text-gray-900">Simulações</h3>
                  <p className="text-xs text-gray-500">
                    {simulacoesRecentes.length > 0
                      ? `${simulacoesRecentes.length} simulação${simulacoesRecentes.length !== 1 ? "ões" : ""} salva${simulacoesRecentes.length !== 1 ? "s" : ""}`
                      : "Nenhuma simulação ainda"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/colaborador/calculadora">
                    <button className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
                      <Plus className="w-3 h-3" /> Nova
                    </button>
                  </Link>
                  <Link href="/colaborador/simulacoes">
                    <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      Ver todas <ArrowRight className="w-3 h-3" />
                    </button>
                  </Link>
                </div>
              </div>
              <div className="divide-y overflow-y-auto" style={{ maxHeight: "320px" }}>
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
                        + Criar primeira simulação
                      </button>
                    </Link>
                  </div>
                ) : (
                  simulacoesRecentes.slice(0, 5).map(sim => (
                    <div key={sim.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Calculator className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{sim.cliente_nome}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {sim.linha_credito || sim.banco || "—"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{fmt(sim.valor_solicitado ?? 0)}</p>
                        <p className="text-xs text-gray-400">{fmtDate(sim.criado_em)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Simulações para captadores (só simulações, sem leads) */}
        {isCaptador && (
          <div className="bg-white rounded-xl border shadow-sm flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-gray-900">Minhas Simulações</h3>
                <p className="text-xs text-gray-500">
                  {simulacoesRecentes.length > 0
                    ? `${simulacoesRecentes.length} simulação${simulacoesRecentes.length !== 1 ? "ões" : ""} salva${simulacoesRecentes.length !== 1 ? "s" : ""}`
                    : "Nenhuma simulação ainda"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/colaborador/calculadora">
                  <button className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium">
                    <Plus className="w-3 h-3" /> Nova
                  </button>
                </Link>
                <Link href="/colaborador/simulacoes">
                  <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    Ver todas <ArrowRight className="w-3 h-3" />
                  </button>
                </Link>
              </div>
            </div>
            <div className="divide-y overflow-y-auto" style={{ maxHeight: "280px" }}>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
              ) : simulacoesRecentes.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Calculator className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Nenhuma simulação ainda</p>
                </div>
              ) : (
                simulacoesRecentes.slice(0, 5).map(sim => (
                  <div key={sim.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Calculator className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{sim.cliente_nome}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {sim.linha_credito || sim.banco || "—"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{fmt(sim.valor_solicitado ?? 0)}</p>
                      <p className="text-xs text-gray-400">{fmtDate(sim.criado_em)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Leads por produto — apenas gestores */}
        {isGestor && stats && stats.leads.total > 0 && (
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

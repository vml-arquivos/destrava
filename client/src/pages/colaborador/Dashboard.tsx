import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import ColaboradorLayout from "./Layout";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Calculator, FileText, TrendingUp, DollarSign,
  CheckCircle2, XCircle, Plus, ArrowRight, Users,
  RefreshCw, Loader2, AlertCircle, MessageSquare, ShieldAlert,
  Building2, UserCheck, Trophy, Filter,
} from "lucide-react";

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface EvolucaoDia { dia: string; total: number; }
interface RankingItem {
  id: string; nome: string; cargo: string;
  totalLeads: number; convertidos: number; taxaConversao: number;
  totalEmpresas?: number; empresasAtendidas?: number;
}
interface Stats {
  leads: { total: number; byStatus: Record<string, number>; byProduto: Record<string, number>; };
  simulacoes: { total: number; totalValorSimulado: number; totalCustoSimulado: number; };
  contatos: { total: number };
  n8n: { configured: boolean };
  evolucaoDiaria?: EvolucaoDia[];
  rankingCaptadores?: RankingItem[];
  rankingAnalistas?: RankingItem[];
  periodo?: string;
}
interface LeadRow {
  id: string; nome: string; empresa?: string; telefone: string;
  produto_interesse?: string; valor_solicitado?: number; status: string; created_at: string;
}
interface SimulacaoRow {
  id: string; cliente_nome: string; empresa?: string; linha_credito?: string;
  banco?: string; valor_solicitado?: number; valor_parcela?: number; criado_em: string; status?: string;
}
interface EmpresaRow {
  id: string; razao_social: string; status?: string;
  captador_nome?: string; analista_nome?: string; updated_at?: string;
}
interface Colaborador { id: string; nome: string; cargo: string; }
interface ColaboradoresFiltro { captacao: Colaborador[]; atendimento: Colaborador[]; }
interface FunilEtapa { etapa: string; total: number; taxa_conversao: number | null; }
interface FunilStats {
  etapas: FunilEtapa[];
  total_ativos: number;
  total_ganho: number;
  total_perdido: number;
  taxa_fechamento: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "R$ 0,00";
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtDia = (d: string) => {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
};

const STATUS_LEAD_COLOR: Record<string, string> = {
  novo: "bg-primary/10 text-primary",
  em_atendimento: "bg-secondary/30 text-secondary-foreground",
  aprovado: "bg-success/10 text-success",
  reprovado: "bg-destructive/10 text-destructive",
  convertido: "bg-chart-4/10 text-chart-4",
};

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
];

const CARGOS_GESTOR  = ["administrador", "diretor", "gerente comercial"];
const CARGOS_CAPTADOR = ["captador externo"];
const CARGOS_ANALISTA = ["analista de crédito", "consultor de crédito", "estagiário"];

type Periodo = "7d" | "30d" | "90d" | "all";

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const { colaborador } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [leadsRecentes, setLeadsRecentes] = useState<LeadRow[]>([]);
  const [simulacoesRecentes, setSimulacoesRecentes] = useState<SimulacaoRow[]>([]);
  const [empresasRecentes, setEmpresasRecentes] = useState<EmpresaRow[]>([]);
  const [triagemPendente, setTriagemPendente] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros do dashboard
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [captadorFiltro, setCaptadorFiltro] = useState<string>("");
  const [analistaFiltro, setAnalistaFiltro] = useState<string>("");
  const [captadores, setCaptadores] = useState<Colaborador[]>([]);
  const [analistas, setAnalistas] = useState<Colaborador[]>([]);

  // Aba ativa do ranking
  const [rankingAba, setRankingAba] = useState<"captadores" | "analistas">("captadores");
  const [funilStats, setFunilStats] = useState<FunilStats | null>(null);

  const cargo = (colaborador?.cargo || "").toLowerCase();
  const isGestor  = CARGOS_GESTOR.includes(cargo);
  const isCaptador = CARGOS_CAPTADOR.includes(cargo);
  const isAnalista = CARGOS_ANALISTA.includes(cargo);
  const isAdmin   = cargo === "administrador";

  // Carrega lista de colaboradores para os filtros (apenas gestores)
  // Usa /api/colaboradores/para-empresa que já filtra por ativo=true e separa por cargo
  useEffect(() => {
    if (isGestor) {
      apiFetch("/api/colaboradores/para-empresa")
        .then((data: ColaboradoresFiltro) => {
          setCaptadores(Array.isArray(data?.captacao) ? data.captacao : []);
          setAnalistas(Array.isArray(data?.atendimento) ? data.atendimento : []);
        })
        .catch(() => {
          // Fallback: tenta a rota geral e filtra manualmente
          apiFetch("/api/colaboradores")
            .then((data: any) => {
              const lista: Colaborador[] = Array.isArray(data) ? data : [];
              setCaptadores(lista.filter(c =>
                !["analista de crédito", "analista de credito", "estagiário", "estagiario"]
                  .includes(c.cargo.toLowerCase())
              ));
              setAnalistas(lista.filter(c =>
                !["captador externo", "estagiário", "estagiario"]
                  .includes(c.cargo.toLowerCase())
              ));
            })
            .catch(() => {});
        });
    }
  }, [isGestor]);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ periodo });
      if (captadorFiltro) params.set("captador_id", captadorFiltro);
      if (analistaFiltro) params.set("analista_id", analistaFiltro);

      const promises: Promise<any>[] = [
        apiFetch(`/api/stats?${params}`).catch(() => null),
        apiFetch("/api/leads").catch(() => []),
        apiFetch("/api/simulacoes").catch(() => []),
        apiFetch("/api/triagem/stats").catch(() => ({})),
        apiFetch(`/api/stats/funil?${params}`).catch(() => null),
      ];
      if (isCaptador || isAnalista) {
        promises.push(apiFetch("/api/empresas").catch(() => []));
      }

      const results = await Promise.all(promises);
      const [statsData, leadsData, simsData, triagemData, funilData, empresasData] = results;

      if (statsData) setStats(statsData);
      if (funilData) setFunilStats(funilData);

      const leadsArr: LeadRow[] = Array.isArray(leadsData) ? leadsData : (leadsData?.leads ?? []);
      setLeadsRecentes(leadsArr.slice(0, 5));

      const simsArr: SimulacaoRow[] = Array.isArray(simsData) ? simsData : (simsData?.simulacoes ?? []);
      setSimulacoesRecentes(simsArr);

      if (empresasData) {
        const empArr: EmpresaRow[] = Array.isArray(empresasData) ? empresasData : (empresasData?.empresas ?? []);
        setEmpresasRecentes(empArr.slice(0, 5));
      }
      setTriagemPendente(triagemData?.pendente ?? 0);
    } catch {
      setErro("Erro ao carregar dados. Verifique a conexão.");
    }
    setLoading(false);
  }, [periodo, captadorFiltro, analistaFiltro, isCaptador, isAnalista]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const nomeColaborador = colaborador?.nome?.split(" ")[0] || "Colaborador";

  const atalhos = [
    { href: "/colaborador/calculadora", icon: Calculator, label: "Simulação Premium", desc: "Calculadora e proposta", color: "blue",  visivel: true },
    { href: "/colaborador/crm",         icon: TrendingUp, label: "Funil",             desc: "Pipeline comercial",    color: "green", visivel: isGestor || isAnalista },
    { href: "/colaborador/empresas",    icon: Building2,  label: "Empresas",          desc: "Carteira PJ",           color: "teal",  visivel: true },
    { href: "/colaborador/triagem",     icon: ShieldAlert,label: "Triagem",           desc: "Qualificar leads",      color: "yellow",visivel: isGestor || isAnalista },
  ].filter(a => a.visivel);

  const atalhoStyles: Record<string, { card: string; icon: string; text: string }> = {
    blue: { card: "hover:border-primary/40", icon: "bg-primary/10", text: "text-primary" },
    green: { card: "hover:border-success/40", icon: "bg-success/10", text: "text-success" },
    teal: { card: "hover:border-chart-2/40", icon: "bg-chart-2/10", text: "text-chart-2" },
    yellow: { card: "hover:border-secondary/60", icon: "bg-secondary/30", text: "text-secondary-foreground" },
  };

  // Dados para o gráfico de pizza (distribuição por produto)
  const pieData = stats
    ? Object.entries(stats.leads.byProduto)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([name, value]) => ({ name: name || "Não informado", value }))
    : [];

  // Dados para o gráfico de barras (status dos leads)
  const barStatusData = stats
    ? Object.entries(stats.leads.byStatus).map(([status, total]) => ({
        status: status.replace(/_/g, " "),
        total,
      }))
    : [];

  return (
    <ColaboradorLayout title="Dashboard">
      <div className="space-y-4 p-4 lg:p-5">

        {/* ── Cabeçalho ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Olá, {nomeColaborador}! 👋</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
              {colaborador?.cargo || ""}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={carregarDados} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Atualizar dados">
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link href="/colaborador/calculadora">
              <button className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-xs font-bold">
                <Plus className="w-4 h-4" /> Simulação Premium
              </button>
            </Link>
          </div>
        </div>

        {/* ── Filtros Dinâmicos (apenas gestores) ── */}
        {isGestor && (
          <div className="bg-card rounded-xl border shadow-sm p-3">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-card-foreground">Filtros do Dashboard</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {/* Filtro de período */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(["7d","30d","90d","all"] as Periodo[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriodo(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      periodo === p ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : p === "90d" ? "90 dias" : "Tudo"}
                  </button>
                ))}
              </div>

              {/* Filtro por captador */}
              <select
                value={captadorFiltro}
                onChange={e => setCaptadorFiltro(e.target.value)}
                className="text-xs border rounded-lg px-3 py-1.5 text-card-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Todos os captadores</option>
                {captadores.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>

              {/* Filtro por analista */}
              <select
                value={analistaFiltro}
                onChange={e => setAnalistaFiltro(e.target.value)}
                className="text-xs border rounded-lg px-3 py-1.5 text-card-foreground bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Todos os analistas</option>
                {analistas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>

              {(captadorFiltro || analistaFiltro) && (
                <button
                  onClick={() => { setCaptadorFiltro(""); setAnalistaFiltro(""); }}
                  className="text-xs text-destructive hover:text-destructive px-2 py-1 rounded-lg hover:bg-destructive/10 transition-colors"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Erro ── */}
        {erro && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {erro}
          </div>
        )}

        {/* ── Cards de estatísticas ── */}
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(isGestor || isAnalista) && (
              <div className="bg-card rounded-xl border p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Total de Leads</p>
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-3.5 h-3.5 text-primary" />
                  </div>
                </div>
                <p className="text-2xl font-black text-foreground">{stats?.leads.total ?? leadsRecentes.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats?.leads.byStatus?.novo ?? 0} novos</p>
              </div>
            )}
            {isCaptador && (
              <div className="bg-card rounded-xl border p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Minhas Captações</p>
                  <div className="w-7 h-7 rounded-full bg-warning/10 flex items-center justify-center">
                    <Building2 className="w-3.5 h-3.5 text-warning" />
                  </div>
                </div>
                <p className="text-2xl font-black text-foreground">{empresasRecentes.length}</p>
                <p className="text-xs text-muted-foreground mt-1">empresas captadas</p>
              </div>
            )}
            {isAnalista && (
              <div className="bg-card rounded-xl border p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Minhas Empresas</p>
                  <div className="w-7 h-7 rounded-full bg-chart-2/10 flex items-center justify-center">
                    <UserCheck className="w-3.5 h-3.5 text-chart-2" />
                  </div>
                </div>
                <p className="text-2xl font-black text-foreground">{empresasRecentes.length}</p>
                <p className="text-xs text-muted-foreground mt-1">em atendimento</p>
              </div>
            )}
            <div className="bg-card rounded-xl border p-3 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Simulações</p>
                <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center">
                  <Calculator className="w-3.5 h-3.5 text-success" />
                </div>
              </div>
              <p className="text-2xl font-black text-foreground">{stats?.simulacoes.total ?? simulacoesRecentes.length}</p>
              <p className="text-xs text-muted-foreground mt-1">realizadas</p>
            </div>
            {(isGestor || isAnalista) && (
              <Link href="/colaborador/triagem">
                <div className="bg-card rounded-xl border p-3 shadow-sm cursor-pointer hover:border-warning/40 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground">Triagem Pendente</p>
                    <div className="w-7 h-7 rounded-full bg-warning/10 flex items-center justify-center">
                      <ShieldAlert className="w-3.5 h-3.5 text-warning" />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-foreground">{triagemPendente}</p>
                  <p className="text-xs text-muted-foreground mt-1">aguardando triagem</p>
                </div>
              </Link>
            )}
            {isGestor && (
              <div className="bg-card rounded-xl border p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Valor Simulado</p>
                  <div className="w-7 h-7 rounded-full bg-chart-4/10 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-chart-4" />
                  </div>
                </div>
                <p className="text-xl font-black text-foreground">{fmt(stats?.simulacoes.totalValorSimulado ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">total simulado</p>
              </div>
            )}
          </div>
        )}

        {/* ── Atalhos rápidos ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {atalhos.map(a => {
            const style = atalhoStyles[a.color] || atalhoStyles.blue;
            return (
              <Link key={a.href} href={a.href}>
                <div className={`bg-card rounded-xl border p-3 shadow-sm ${style.card} hover:shadow-md transition-all cursor-pointer`}>
                  <div className={`w-8 h-8 rounded-lg ${style.icon} flex items-center justify-center mb-1.5`}>
                    <a.icon className={`w-5 h-5 ${style.text}`} />
                  </div>
                  <p className="text-xs font-black text-card-foreground">{a.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* ── Gráficos (apenas gestores) ── */}
        {isGestor && !loading && stats && (
          <>
            {/* Gráfico de linha — evolução de leads por dia */}
            {stats.evolucaoDiaria && stats.evolucaoDiaria.length > 0 && (
              <div className="bg-card rounded-xl border shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-foreground">Evolução de Leads</h3>
                    <p className="text-xs text-muted-foreground">Novos leads por dia no período selecionado</p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={stats.evolucaoDiaria} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="dia" tickFormatter={fmtDia} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: number) => [v, "Leads"]}
                      labelFormatter={(l: string) => `Dia: ${fmtDia(l)}`}
                    />
                    <Line
                      type="monotone" dataKey="total" stroke="var(--color-chart-1)"
                      strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Gráficos de pizza e barras lado a lado */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Pizza — distribuição por produto */}
              {pieData.length > 0 && (
                <div className="bg-card rounded-xl border shadow-sm p-5">
                  <h3 className="font-semibold text-foreground mb-1">Distribuição por Produto</h3>
                  <p className="text-xs text-muted-foreground mb-4">Proporção de leads por produto de interesse</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData} cx="50%" cy="50%" outerRadius={80}
                        dataKey="value" nameKey="name"
                        label={({ name, percent }) => `${name.slice(0, 12)} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number, n: string) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Barras — leads por status */}
              {barStatusData.length > 0 && (
                <div className="bg-card rounded-xl border shadow-sm p-5">
                  <h3 className="font-semibold text-foreground mb-1">Leads por Status</h3>
                  <p className="text-xs text-muted-foreground mb-4">Quantidade de leads em cada etapa do funil</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barStatusData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip formatter={(v: number) => [v, "Leads"]} />
                      <Bar dataKey="total" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Funil de Conversão */}
              {funilStats && funilStats.etapas.length > 0 && (
                <div className="bg-card rounded-xl border shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-foreground">Funil de Conversão</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Taxa de passagem entre etapas</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-success">{funilStats.taxa_fechamento}%</p>
                      <p className="text-xs text-muted-foreground">taxa de fechamento</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {funilStats.etapas.map((etapa, i) => {
                      const maxTotal = Math.max(...funilStats.etapas.map(e => e.total));
                      const pct = maxTotal > 0 ? Math.round((etapa.total / maxTotal) * 100) : 0;
                      const colors = ['ganho','aprovado'].includes(etapa.etapa)
                        ? 'bg-success' : etapa.etapa === 'perdido'
                        ? 'bg-destructive' : 'bg-primary';
                      return (
                        <div key={etapa.etapa} className="flex items-center gap-3">
                          <div className="w-24 text-xs text-muted-foreground capitalize text-right shrink-0">
                            {etapa.etapa.replace(/_/g, ' ')}
                          </div>
                          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colors} transition-all duration-700 flex items-center justify-end pr-2`}
                              style={{ width: `${Math.max(pct, 4)}%` }}
                            >
                              <span className="text-[10px] text-white font-bold">{etapa.total}</span>
                            </div>
                          </div>
                          {etapa.taxa_conversao !== null && i > 0 && (
                            <div className="w-12 text-xs text-right shrink-0">
                              <span className={etapa.taxa_conversao >= 50 ? 'text-success font-semibold' : 'text-warning'}>
                                {etapa.taxa_conversao}%
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-3 border-t flex gap-4 text-xs text-muted-foreground">
                    <span><span className="font-semibold text-card-foreground">{funilStats.total_ativos}</span> ativos</span>
                    <span><span className="font-semibold text-success">{funilStats.total_ganho}</span> ganhos</span>
                    <span><span className="font-semibold text-destructive">{funilStats.total_perdido}</span> perdidos</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Ranking de Performance ── */}
            {((stats.rankingCaptadores && stats.rankingCaptadores.length > 0) ||
              (stats.rankingAnalistas && stats.rankingAnalistas.length > 0)) && (
              <div className="bg-card rounded-xl border shadow-sm">
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-secondary-foreground" />
                    <h3 className="font-semibold text-foreground">Ranking de Performance</h3>
                  </div>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    <button
                      onClick={() => setRankingAba("captadores")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        rankingAba === "captadores" ? "bg-card shadow text-primary" : "text-muted-foreground hover:text-card-foreground"
                      }`}
                    >
                      Captadores
                    </button>
                    <button
                      onClick={() => setRankingAba("analistas")}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        rankingAba === "analistas" ? "bg-card shadow text-primary" : "text-muted-foreground hover:text-card-foreground"
                      }`}
                    >
                      Analistas
                    </button>
                  </div>
                </div>

                {rankingAba === "captadores" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="text-left px-4 py-3">#</th>
                          <th className="text-left px-4 py-3">Colaborador</th>
                          <th className="text-center px-4 py-3">Leads</th>
                          <th className="text-center px-4 py-3">Empresas</th>
                          <th className="text-center px-4 py-3">Convertidos</th>
                          <th className="text-center px-4 py-3">Taxa Conv.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(stats.rankingCaptadores ?? []).map((r, i) => (
                          <tr key={r.id} className="hover:bg-muted transition-colors">
                            <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">{r.nome}</p>
                              <p className="text-xs text-muted-foreground">{r.cargo}</p>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-primary">{r.totalLeads}</td>
                            <td className="px-4 py-3 text-center text-card-foreground">{r.totalEmpresas ?? 0}</td>
                            <td className="px-4 py-3 text-center text-success font-semibold">{r.convertidos}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                r.taxaConversao >= 50 ? "bg-success/10 text-success" :
                                r.taxaConversao >= 20 ? "bg-secondary/30 text-secondary-foreground" :
                                "bg-muted text-muted-foreground"
                              }`}>
                                {r.taxaConversao}%
                              </span>
                            </td>
                          </tr>
                        ))}
                        {(stats.rankingCaptadores ?? []).length === 0 && (
                          <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhum dado disponível</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {rankingAba === "analistas" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted text-xs text-muted-foreground uppercase tracking-wide">
                          <th className="text-left px-4 py-3">#</th>
                          <th className="text-left px-4 py-3">Colaborador</th>
                          <th className="text-center px-4 py-3">Empresas</th>
                          <th className="text-center px-4 py-3">Leads</th>
                          <th className="text-center px-4 py-3">Convertidos</th>
                          <th className="text-center px-4 py-3">Taxa Conv.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(stats.rankingAnalistas ?? []).map((r, i) => (
                          <tr key={r.id} className="hover:bg-muted transition-colors">
                            <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-foreground">{r.nome}</p>
                              <p className="text-xs text-muted-foreground">{r.cargo}</p>
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-chart-2">{r.empresasAtendidas ?? 0}</td>
                            <td className="px-4 py-3 text-center text-primary font-semibold">{r.totalLeads}</td>
                            <td className="px-4 py-3 text-center text-success font-semibold">{r.convertidos}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                r.taxaConversao >= 50 ? "bg-success/10 text-success" :
                                r.taxaConversao >= 20 ? "bg-secondary/30 text-secondary-foreground" :
                                "bg-muted text-muted-foreground"
                              }`}>
                                {r.taxaConversao}%
                              </span>
                            </td>
                          </tr>
                        ))}
                        {(stats.rankingAnalistas ?? []).length === 0 && (
                          <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Nenhum dado disponível</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Gráfico de barras — comparativo de captadores */}
                {rankingAba === "captadores" && (stats.rankingCaptadores ?? []).filter(r => r.totalLeads > 0).length > 0 && (
                  <div className="p-5 border-t">
                    <p className="text-xs text-muted-foreground mb-3 font-medium">Comparativo visual — Leads captados</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={(stats.rankingCaptadores ?? []).filter(r => r.totalLeads > 0).slice(0, 10)}
                        margin={{ top: 5, right: 10, left: 0, bottom: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip formatter={(v: number) => [v, "Leads"]} />
                        <Bar dataKey="totalLeads" name="Leads" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="convertidos" name="Convertidos" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {rankingAba === "analistas" && (stats.rankingAnalistas ?? []).filter(r => r.empresasAtendidas! > 0 || r.totalLeads > 0).length > 0 && (
                  <div className="p-5 border-t">
                    <p className="text-xs text-muted-foreground mb-3 font-medium">Comparativo visual — Empresas atendidas</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart
                        data={(stats.rankingAnalistas ?? []).filter(r => r.empresasAtendidas! > 0 || r.totalLeads > 0).slice(0, 10)}
                        margin={{ top: 5, right: 10, left: 0, bottom: 30 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="nome" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="empresasAtendidas" name="Empresas" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="convertidos" name="Convertidos" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Leads recentes (gestores e analistas) ── */}
        {(isGestor || isAnalista) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border shadow-sm flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="font-semibold text-foreground">Leads Recentes</h3>
                  <p className="text-xs text-muted-foreground">{leadsRecentes.length} mais recentes</p>
                </div>
                <Link href="/colaborador/clientes">
                  <button className="text-xs text-primary hover:underline flex items-center gap-1">
                    Ver todos <ArrowRight className="w-3 h-3" />
                  </button>
                </Link>
              </div>
              <div className="divide-y overflow-y-auto" style={{ maxHeight: "280px" }}>
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
                ) : leadsRecentes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Nenhum lead ainda</p>
                  </div>
                ) : leadsRecentes.map(lead => (
                  <div key={lead.id} className="flex items-center gap-3 p-3 hover:bg-muted">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{lead.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{lead.empresa || lead.produto_interesse || "—"}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LEAD_COLOR[lead.status] || "bg-muted text-muted-foreground"}`}>
                        {lead.status?.replace(/_/g, " ")}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">{fmtDate(lead.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-xl border shadow-sm flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="font-semibold text-foreground">Simulações Recentes</h3>
                  <p className="text-xs text-muted-foreground">{simulacoesRecentes.length > 0 ? `${simulacoesRecentes.length} simulações` : "Nenhuma ainda"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/colaborador/calculadora">
                    <button className="flex items-center gap-1 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 font-medium">
                      <Plus className="w-3 h-3" /> Nova
                    </button>
                  </Link>
                  <Link href="/colaborador/simulacoes">
                    <button className="text-xs text-primary hover:underline flex items-center gap-1">
                      Ver todas <ArrowRight className="w-3 h-3" />
                    </button>
                  </Link>
                </div>
              </div>
              <div className="divide-y overflow-y-auto" style={{ maxHeight: "280px" }}>
                {loading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
                ) : simulacoesRecentes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calculator className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Nenhuma simulação ainda</p>
                  </div>
                ) : simulacoesRecentes.slice(0, 5).map(sim => (
                  <div key={sim.id} className="flex items-center gap-3 p-3 hover:bg-muted">
                    <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                      <Calculator className="w-3.5 h-3.5 text-success" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{sim.cliente_nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{sim.linha_credito || sim.banco || "—"}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-foreground">{fmt(sim.valor_solicitado ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(sim.criado_em)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Simulações para captadores ── */}
        {isCaptador && (
          <div className="bg-card rounded-xl border shadow-sm flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-semibold text-foreground">Minhas Simulações</h3>
                <p className="text-xs text-muted-foreground">
                  {simulacoesRecentes.length > 0
                    ? `${simulacoesRecentes.length} simulação${simulacoesRecentes.length !== 1 ? "ões" : ""} salva${simulacoesRecentes.length !== 1 ? "s" : ""}`
                    : "Nenhuma simulação ainda"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/colaborador/calculadora">
                  <button className="flex items-center gap-1 text-xs bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 font-medium">
                    <Plus className="w-3 h-3" /> Nova
                  </button>
                </Link>
                <Link href="/colaborador/simulacoes">
                  <button className="text-xs text-primary hover:underline flex items-center gap-1">
                    Ver todas <ArrowRight className="w-3 h-3" />
                  </button>
                </Link>
              </div>
            </div>
            <div className="divide-y overflow-y-auto" style={{ maxHeight: "280px" }}>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
              ) : simulacoesRecentes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calculator className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Nenhuma simulação ainda</p>
                </div>
              ) : simulacoesRecentes.slice(0, 5).map(sim => (
                <div key={sim.id} className="flex items-center gap-3 p-3 hover:bg-muted">
                  <div className="w-7 h-7 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                    <Calculator className="w-3.5 h-3.5 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{sim.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground truncate">{sim.linha_credito || sim.banco || "—"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-foreground">{fmt(sim.valor_solicitado ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(sim.criado_em)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Leads por produto (gestores — barra de progresso clássica) ── */}
        {isGestor && stats && stats.leads.total > 0 && (
          <div className="bg-card rounded-xl border shadow-sm p-5">
            <h3 className="font-semibold text-foreground mb-4">Leads por Produto — Detalhamento</h3>
            <div className="space-y-3">
              {Object.entries(stats.leads.byProduto)
                .sort(([, a], [, b]) => b - a)
                .map(([produto, count]) => {
                  const pct = Math.round((count / stats.leads.total) * 100);
                  return (
                    <div key={produto}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-card-foreground">{produto || "Não informado"}</span>
                        <span className="text-muted-foreground font-medium">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
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

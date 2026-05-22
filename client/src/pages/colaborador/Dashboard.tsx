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
  CheckCircle2, XCircle, Plus, ArrowRight, Users, Zap,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "R$ 0,00";
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
const fmtDia = (d: string) => {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
};

const STATUS_LEAD_COLOR: Record<string, string> = {
  novo: "bg-blue-100 text-blue-700",
  em_atendimento: "bg-yellow-100 text-yellow-700",
  aprovado: "bg-green-100 text-green-700",
  reprovado: "bg-red-100 text-red-700",
  convertido: "bg-purple-100 text-purple-700",
};

const PIE_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

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

  // Filtros
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [captadorFiltro, setCaptadorFiltro] = useState<string>("");
  const [analistaFiltro, setAnalistaFiltro] = useState<string>("");
  const [captadores, setCaptadores] = useState<Colaborador[]>([]);
  const [analistas, setAnalistas] = useState<Colaborador[]>([]);

  const [rankingAba, setRankingAba] = useState<"captadores" | "analistas">("captadores");

  const cargo = (colaborador?.cargo || "").toLowerCase();
  const isGestor  = CARGOS_GESTOR.includes(cargo);
  const isCaptador = CARGOS_CAPTADOR.includes(cargo);
  const isAnalista = CARGOS_ANALISTA.includes(cargo);
  const isAdmin   = cargo === "administrador";

  useEffect(() => {
    if (isGestor) {
      apiFetch("/api/colaboradores/para-empresa")
        .then((data: ColaboradoresFiltro) => {
          setCaptadores(Array.isArray(data?.captacao) ? data.captacao : []);
          setAnalistas(Array.isArray(data?.atendimento) ? data.atendimento : []);
        })
        .catch(() => {
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
      ];
      if (isCaptador || isAnalista) {
      [...]

      // dados de pizza e barras
      const pieData = stats?.leads?.byProduto
        ? Object.entries(stats.leads.byProduto)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([name, value]) => ({ name: name || "Não informado", value }))
        : [];

      const barStatusData = stats?.leads?.byStatus
        ? Object.entries(stats.leads.byStatus).map(([status, total]) => ({
            status: status.replace(/_/g, " "),
            total,
          }))
        : [];

      return (
        <ColaboradorLayout title="Dashboard">
          {/* resto do dashboard: cards de estatística, filtros, gráficos e listas de leads/simulações */}
        </ColaboradorLayout>
      );
}

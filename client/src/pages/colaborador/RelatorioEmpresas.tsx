import { useState, useEffect, useCallback } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  FileDown,
  Search,
  RefreshCw,
  Building2,
  Filter,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  TrendingUp,
  Users,
  FileText,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface EmpresaResumo {
  id: string;
  razao_social: string;
  nome_fantasia?: string;
  cnpj?: string;
  situacao_cadastral?: string;
  porte?: string;
  regime_tributario?: string;
  cidade?: string;
  estado?: string;
  cnae_principal?: string;
  data_abertura?: string;
  capital_social?: number;
  ultima_sincronizacao_receita?: string;
  status_cadastro?: string;
  responsavel_nome?: string;
  criado_em?: string;
}

interface Resumo {
  total: number;
  ativas: number;
  inativas: number;
  pendentes: number;
  sincronizadas: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    const s = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return value;
    const d = new Date(s + "T00:00:00Z");
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  } catch {
    return "-";
  }
}

function formatCNPJ(cnpj?: string | null): string {
  if (!cnpj) return "-";
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return cnpj;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatCurrency(value?: number | null): string {
  if (value == null || isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function situacaoBadge(situacao?: string | null) {
  const s = (situacao || "").toLowerCase();
  if (s.includes("ativa")) return { cls: "bg-emerald-50 text-emerald-700 border-emerald-100", label: "Ativa" };
  if (s.includes("baixada") || s.includes("cancelada")) return { cls: "bg-red-50 text-red-700 border-red-100", label: situacao || "Baixada" };
  if (s.includes("suspensa") || s.includes("inapta")) return { cls: "bg-amber-50 text-amber-700 border-amber-100", label: situacao || "Suspensa" };
  return { cls: "bg-slate-50 text-slate-600 border-slate-200", label: situacao || "Não informada" };
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function RelatorioEmpresas() {
  const [empresas, setEmpresas] = useState<EmpresaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroPorte, setFiltroPorte] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [resumo, setResumo] = useState<Resumo>({ total: 0, ativas: 0, inativas: 0, pendentes: 0, sincronizadas: 0 });

  const carregarEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/api/empresas?limit=500");
      const lista: EmpresaResumo[] = Array.isArray(data) ? data : (data?.empresas || []);
      setEmpresas(lista);
      // Calcular resumo
      const ativas = lista.filter((e) => (e.situacao_cadastral || "").toLowerCase().includes("ativa")).length;
      const sincronizadas = lista.filter((e) => e.ultima_sincronizacao_receita).length;
      const pendentes = lista.filter((e) => !e.cnpj || !e.situacao_cadastral).length;
      setResumo({
        total: lista.length,
        ativas,
        inativas: lista.length - ativas,
        pendentes,
        sincronizadas,
      });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar empresas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarEmpresas();
  }, [carregarEmpresas]);

  // Filtros aplicados
  const empresasFiltradas = empresas.filter((e) => {
    const q = busca.toLowerCase().trim();
    if (q && !e.razao_social?.toLowerCase().includes(q) && !e.nome_fantasia?.toLowerCase().includes(q) && !e.cnpj?.includes(q)) return false;
    if (filtroStatus !== "todos") {
      const s = (e.situacao_cadastral || "").toLowerCase();
      if (filtroStatus === "ativa" && !s.includes("ativa")) return false;
      if (filtroStatus === "inativa" && s.includes("ativa")) return false;
    }
    if (filtroPorte !== "todos" && (e.porte || "").toLowerCase() !== filtroPorte.toLowerCase()) return false;
    if (filtroEstado !== "todos" && (e.estado || "").toUpperCase() !== filtroEstado.toUpperCase()) return false;
    return true;
  });

  // Estados únicos para filtro
  const estados = Array.from(new Set(empresas.map((e) => e.estado).filter(Boolean))).sort() as string[];

  // Exportar CSV
  async function exportarCSV() {
    setExportando(true);
    try {
      const token = localStorage.getItem("destrava_token") || localStorage.getItem("token") || "";
      const params = new URLSearchParams({ formato: "csv" });
      if (filtroStatus !== "todos") params.set("status", filtroStatus);
      if (filtroPorte !== "todos") params.set("porte", filtroPorte);
      if (busca.trim()) params.set("busca", busca.trim());
      const res = await fetch(`/api/empresas/relatorio?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Fallback: gerar CSV client-side
        gerarCSVClientSide();
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `relatorio-empresas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Relatório CSV exportado com sucesso!");
    } catch {
      gerarCSVClientSide();
    } finally {
      setExportando(false);
    }
  }

  function gerarCSVClientSide() {
    const headers = [
      "Razão Social", "Nome Fantasia", "CNPJ", "Situação Cadastral", "Porte",
      "Regime Tributário", "CNAE Principal", "Data Abertura", "Capital Social",
      "Cidade", "Estado", "Última Sincronização", "Status Cadastro", "Responsável",
    ];
    const rows = empresasFiltradas.map((e) => [
      e.razao_social || "",
      e.nome_fantasia || "",
      formatCNPJ(e.cnpj),
      e.situacao_cadastral || "",
      e.porte || "",
      e.regime_tributario || "",
      e.cnae_principal || "",
      formatDate(e.data_abertura),
      e.capital_social != null ? String(e.capital_social) : "",
      e.cidade || "",
      e.estado || "",
      formatDate(e.ultima_sincronizacao_receita),
      e.status_cadastro || "",
      e.responsavel_nome || "",
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-empresas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Relatório CSV gerado com sucesso!");
  }

  return (
    <Layout>
      <div className="w-full space-y-3 p-3 md:p-4 overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Relatório de Empresas
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Visão consolidada · exportação CSV · {empresas.length} empresa(s) cadastrada(s)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={carregarEmpresas}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <button
              onClick={exportarCSV}
              disabled={exportando || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 disabled:opacity-60"
            >
              {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { label: "Total", value: resumo.total, icon: Building2, color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" },
            { label: "Ativas", value: resumo.ativas, icon: CheckCircle, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
            { label: "Inativas", value: resumo.inativas, icon: XCircle, color: "text-red-700", bg: "bg-red-50", border: "border-red-100" },
            { label: "Pendentes", value: resumo.pendentes, icon: AlertCircle, color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
            { label: "Sincronizadas", value: resumo.sincronizadas, icon: TrendingUp, color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-100" },
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className={`rounded-xl border ${border} ${bg} px-3 py-2.5 flex items-center gap-2.5`}>
              <div className={`w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`text-xl font-black ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="h-8 rounded-lg border border-slate-200 pl-8 pr-3 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-52"
                placeholder="Buscar por nome ou CNPJ..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select
              className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="todos">Todas as situações</option>
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa/Baixada</option>
            </select>
            <select
              className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filtroPorte}
              onChange={(e) => setFiltroPorte(e.target.value)}
            >
              <option value="todos">Todos os portes</option>
              <option value="mei">MEI</option>
              <option value="micro empresa">Micro Empresa</option>
              <option value="empresa de pequeno porte">Pequeno Porte</option>
              <option value="demais">Demais</option>
            </select>
            {estados.length > 0 && (
              <select
                className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
              >
                <option value="todos">Todos os estados</option>
                {estados.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            )}
            <span className="text-xs text-slate-400 ml-auto">{empresasFiltradas.length} resultado(s)</span>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-800">Lista de Empresas</p>
            <button
              onClick={gerarCSVClientSide}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <FileDown className="w-3 h-3" /> Exportar visível
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando empresas...
            </div>
          ) : empresasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Building2 className="w-8 h-8 text-slate-200" />
              <p className="text-sm text-slate-500">Nenhuma empresa encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[200px]">Empresa</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[140px]">CNPJ</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[100px]">Situação</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[100px]">Porte</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[120px]">CNAE Principal</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[100px]">Cidade/UF</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[110px]">Capital Social</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 min-w-[110px]">Última Sinc.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {empresasFiltradas.map((empresa) => {
                    const badge = situacaoBadge(empresa.situacao_cadastral);
                    return (
                      <tr key={empresa.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-800 truncate max-w-[200px]">{empresa.razao_social}</p>
                          {empresa.nome_fantasia && empresa.nome_fantasia !== empresa.razao_social && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{empresa.nome_fantasia}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-600">{formatCNPJ(empresa.cnpj)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{empresa.porte || "-"}</td>
                        <td className="px-3 py-2.5 text-slate-600 truncate max-w-[120px]">{empresa.cnae_principal || "-"}</td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {empresa.cidade && empresa.estado ? `${empresa.cidade}/${empresa.estado}` : empresa.cidade || empresa.estado || "-"}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{formatCurrency(empresa.capital_social)}</td>
                        <td className="px-3 py-2.5">
                          {empresa.ultima_sincronizacao_receita ? (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              {formatDate(empresa.ultima_sincronizacao_receita)}
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Pendente
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé informativo */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <FileText className="w-3 h-3" />
            Relatório gerado em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR")} ·
            {empresasFiltradas.length} empresa(s) exibida(s) de {empresas.length} cadastrada(s) ·
            Exportação CSV inclui todos os campos cadastrais
          </p>
        </div>
      </div>
    </Layout>
  );
}

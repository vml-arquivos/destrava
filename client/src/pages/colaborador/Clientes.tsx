import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, Plus, Search, Phone, Mail, Building2,
  ChevronRight, Clock, CheckCircle, AlertCircle,
  MessageSquare, Eye, Trash2, Star,
  Calendar, RefreshCw, UserCheck, Loader2,
  GitMerge, Filter, SlidersHorizontal, Globe, Megaphone,
  UserPlus, Smartphone, TrendingUp, BarChart3,
} from "lucide-react";
import DocumentosEntidade from "@/components/documentos/DocumentosEntidade";

// ─── Tipos ────────────────────────────────────────────────────
interface Cliente {
  id: string;
  api_id?: string;
  tipo_registro?: "lead" | "cliente_pf";
  nome: string;
  empresa?: string;
  cpf_cnpj?: string;
  cpf?: string;
  rg?: string;
  data_nascimento?: string;
  telefone: string;
  email?: string;
  tipo: "pf" | "pj";
  tipo_pessoa?: "pf" | "pj";
  cidade?: string;
  estado?: string;
  uf?: string;
  endereco?: string;
  cep?: string;
  profissao?: string;
  estado_civil?: string;
  faturamento_anual?: number;
  segmento?: string;
  status: "lead" | "contato" | "analise" | "aprovado" | "reprovado" | "cancelado" | "convertido";
  origem: string;
  origem_normalizada?: string;
  canal_origem?: string;
  fonte_cadastro?: string;
  cadastrado_por_nome?: string;
  prioridade: "baixa" | "media" | "alta";
  observacoes?: string;
  observacoes_ia?: string;
  proximo_contato?: string;
  proximo_followup?: string;
  n8n_notificado?: boolean;
  cadastro_incompleto?: boolean;
  etapa_funil?: string;
  temperatura?: string;
  score_ia?: number;
  tags?: string;
  created_at: string;
  updated_at: string;
}

interface Atividade {
  id: string;
  cliente_id: string;
  lead_id?: string;
  tipo: "ligacao" | "email" | "whatsapp" | "reuniao" | "nota" | "simulacao" | "status_change";
  descricao: string;
  resultado?: string;
  created_at: string;
}

// ─── Configurações visuais ────────────────────────────────────
const STATUS_CONFIG = {
  lead:       { label: "Lead",        color: "bg-gray-100 text-gray-700",    dot: "bg-gray-400",   order: 1 },
  contato:    { label: "Em Contato",  color: "bg-blue-100 text-blue-700",    dot: "bg-blue-500",   order: 2 },
  analise:    { label: "Em Análise",  color: "bg-amber-100 text-amber-700",  dot: "bg-amber-500",  order: 3 },
  aprovado:   { label: "Aprovado",    color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", order: 4 },
  convertido: { label: "Convertido",  color: "bg-purple-100 text-purple-700", dot: "bg-purple-500", order: 5 },
  reprovado:  { label: "Reprovado",   color: "bg-red-100 text-red-700",      dot: "bg-red-500",    order: 6 },
  cancelado:  { label: "Cancelado",   color: "bg-gray-100 text-gray-400",    dot: "bg-gray-300",   order: 7 },
} as const;

const PRIORIDADE_CONFIG = {
  alta:  { label: "Alta",  color: "text-red-600",    bg: "bg-red-50 border-red-200",    dot: "bg-red-500" },
  media: { label: "Média", color: "text-amber-600",  bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  baixa: { label: "Baixa", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500" },
} as const;

const ORIGEM_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  whatsapp:  { label: "WhatsApp",   icon: <Smartphone className="w-3 h-3" />, color: "text-green-700",  bg: "bg-green-50 border-green-200" },
  site:      { label: "Site",       icon: <Globe className="w-3 h-3" />,      color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  campanha:  { label: "Campanha",   icon: <Megaphone className="w-3 h-3" />,  color: "text-purple-700", bg: "bg-purple-50 border-purple-200" },
  indicacao: { label: "Indicação",  icon: <UserCheck className="w-3 h-3" />,  color: "text-teal-700",   bg: "bg-teal-50 border-teal-200" },
  manual:    { label: "Manual",     icon: <UserPlus className="w-3 h-3" />,   color: "text-gray-700",   bg: "bg-gray-50 border-gray-200" },
};

const TIPO_ATIVIDADE = {
  ligacao:       { label: "Ligação",    icon: "📞" },
  email:         { label: "E-mail",     icon: "📧" },
  whatsapp:      { label: "WhatsApp",   icon: "💬" },
  reuniao:       { label: "Reunião",    icon: "🤝" },
  nota:          { label: "Nota",       icon: "📝" },
  simulacao:     { label: "Simulação",  icon: "🧮" },
  status_change: { label: "Status",     icon: "🔄" },
} as const;

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—";
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

function normalizarOrigem(origem: string): string {
  const o = (origem || "").toLowerCase();
  if (o.includes("campanha") || o.includes("utm") || o.includes("ads")) return "campanha";
  if (o.includes("site") || o.includes("formulario") || o.includes("landing") || o.includes("simulador")) return "site";
  if (o.includes("whatsapp") || o.includes("zap")) return "whatsapp";
  if (o.includes("indicacao") || o.includes("indicação") || o.includes("referral")) return "indicacao";
  if (o.includes("painel") || o.includes("manual") || o === "") return "manual";
  return o || "manual";
}

function getOrigem(c: Cliente): string {
  return c.origem_normalizada || normalizarOrigem(c.origem);
}

function getTipo(c: Cliente): "pf" | "pj" {
  return c.tipo || c.tipo_pessoa || "pj";
}

function getObs(c: Cliente): string {
  return c.observacoes || c.observacoes_ia || "";
}

function getProximoContato(c: Cliente): string {
  return c.proximo_contato || c.proximo_followup || "";
}

function isClientePF(c: Cliente): boolean {
  return c.tipo_registro === "cliente_pf";
}

function getApiId(c: Cliente): string {
  return c.api_id || c.id.replace(/^pf:/, "").replace(/^lead:/, "");
}

function getFonteCadastro(c: Cliente): string {
  if (c.fonte_cadastro) return c.fonte_cadastro;
  const origem = getOrigem(c);
  if (origem === "campanha") return "Cliente vindo de campanha";
  if (origem === "site") return "Cliente vindo do site/formulário";
  if (origem === "whatsapp") return "Cliente vindo do WhatsApp";
  if (origem === "indicacao") return "Cliente vindo de indicação";
  if (isClientePF(c)) return "Cliente PF cadastrado manualmente";
  return "Cliente cadastrado no painel interno";
}

function normalizeClientePF(c: any): Cliente {
  return {
    ...c,
    id: `pf:${c.id}`,
    api_id: c.id,
    tipo_registro: "cliente_pf",
    cpf_cnpj: c.cpf,
    telefone: c.telefone || "",
    tipo: "pf",
    tipo_pessoa: "pf",
    status: "convertido",
    origem: c.origem || "painel_interno",
    origem_normalizada: c.origem_normalizada || "manual",
    fonte_cadastro: c.fonte_cadastro || "Cliente PF cadastrado manualmente",
    prioridade: "media",
    observacoes: c.observacoes || "",
    created_at: c.created_at,
    updated_at: c.updated_at || c.created_at,
    cadastro_incompleto: c.cadastro_status === "incompleto" || c.cadastro_completo === false || c.bloqueado_operacional === true,
  } as Cliente;
}

function normalizeLead(c: any): Cliente {
  return {
    ...c,
    api_id: c.id,
    tipo_registro: "lead",
    telefone: c.telefone || "",
    tipo: c.tipo || c.tipo_pessoa || "pj",
    tipo_pessoa: c.tipo_pessoa || c.tipo || "pj",
    origem: c.origem || "painel_interno",
    fonte_cadastro: c.fonte_cadastro || undefined,
  } as Cliente;
}

// ─── Componente principal ─────────────────────────────────────
export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todos");
  const [filtroOrigem, setFiltroOrigem] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroIncompleto, setFiltroIncompleto] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loadingAtividades, setLoadingAtividades] = useState(false);
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [modalAtividade, setModalAtividade] = useState(false);
  const [novaAtividade, setNovaAtividade] = useState({ tipo: "nota", descricao: "", resultado: "" });
  const [salvando, setSalvando] = useState(false);
  const [deduplicando, setDeduplicando] = useState(false);
  const [showFiltros, setShowFiltros] = useState(false);

  const [form, setForm] = useState({
    nome: "", empresa: "", cpf_cnpj: "", telefone: "", email: "",
    tipo: "pf", cidade: "", estado: "", faturamento_anual: "",
    segmento: "", status: "lead", prioridade: "media", observacoes: "",
    proximo_contato: ""
  });

  useEffect(() => { carregarClientes(); }, []);

  async function carregarClientes() {
    setLoading(true);
    try {
      const [leadsResult, clientesPfResult] = await Promise.allSettled([
        apiFetch("/api/leads"),
        apiFetch("/api/clientes-pf"),
      ]);

      const leads = leadsResult.status === "fulfilled" && Array.isArray(leadsResult.value)
        ? leadsResult.value.map(normalizeLead)
        : [];
      const clientesPf = clientesPfResult.status === "fulfilled" && Array.isArray(clientesPfResult.value)
        ? clientesPfResult.value.map(normalizeClientePF)
        : [];

      const unidos = [...leads, ...clientesPf].sort((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return db - da;
      });
      setClientes(unidos);
    } catch (err) {
      console.error(err);
      setClientes([]);
    }
    setLoading(false);
  }

  async function carregarAtividades(clienteId: string) {
    setLoadingAtividades(true);
    try {
      const data = await apiFetch(`/api/crm/atividades?lead_id=${clienteId}`);
      setAtividades(data as Atividade[]);
    } catch (err) {
      setAtividades([]);
    }
    setLoadingAtividades(false);
  }

  async function selecionarCliente(cliente: Cliente) {
    setClienteSelecionado(cliente);
    if (isClientePF(cliente)) {
      setAtividades([]);
      return;
    }
    await carregarAtividades(getApiId(cliente));
  }

  async function atualizarStatus(clienteId: string, novoStatus: string) {
    const cliente = clientes.find(c => c.id === clienteId);
    if (cliente && isClientePF(cliente)) return;
    const apiId = cliente ? getApiId(cliente) : clienteId;
    try {
      await apiFetch(`/api/leads/${apiId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: novoStatus }),
      });
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, status: novoStatus as any } : c));
      if (clienteSelecionado?.id === clienteId) {
        setClienteSelecionado(prev => prev ? { ...prev, status: novoStatus as any } : null);
      }
      await apiFetch("/api/crm/atividades", {
        method: "POST",
        body: JSON.stringify({
          lead_id: apiId,
          tipo: "status_change",
          descricao: `Status alterado para: ${STATUS_CONFIG[novoStatus as keyof typeof STATUS_CONFIG]?.label}`,
          resultado: "concluido",
        }),
      });
      toast.success("Status atualizado.");
    } catch (err) {
      toast.error("Erro ao atualizar status.");
    }
  }

  async function salvarAtividade() {
    if (!clienteSelecionado || !novaAtividade.descricao) return;
    setSalvando(true);
    try {
      const data = await apiFetch("/api/crm/atividades", {
        method: "POST",
        body: JSON.stringify({
          lead_id: getApiId(clienteSelecionado),
          tipo: novaAtividade.tipo,
          descricao: novaAtividade.descricao,
          resultado: novaAtividade.resultado || null,
        }),
      });
      if (data) {
        setAtividades(prev => [data as Atividade, ...prev]);
        setNovaAtividade({ tipo: "nota", descricao: "", resultado: "" });
        setModalAtividade(false);
        toast.success("Atividade registrada.");
      }
    } catch (err) {
      toast.error("Erro ao salvar atividade.");
    }
    setSalvando(false);
  }

  async function salvarNovoCliente() {
    const documento = form.cpf_cnpj.replace(/\D/g, "");
    if (!form.nome || !form.telefone) return;
    if (form.tipo === "pf" && documento.length !== 11) {
      toast.error("CPF válido é obrigatório para cadastrar cliente pessoa física.");
      return;
    }
    if (form.tipo === "pj" && documento.length !== 14) {
      toast.error("CNPJ válido é obrigatório para cadastrar cliente pessoa jurídica.");
      return;
    }
    setSalvando(true);
    try {
      let data: any;
      if (form.tipo === "pf") {
        data = await apiFetch("/api/clientes-pf", {
          method: "POST",
          body: JSON.stringify({
            nome: form.nome,
            cpf: form.cpf_cnpj,
            telefone: form.telefone,
            email: form.email || null,
            cidade: form.cidade || null,
            uf: form.estado || null,
            profissao: form.segmento || null,
            observacoes: form.observacoes || null,
            origem: "painel_interno",
            fonte_cadastro: "Cliente PF cadastrado manualmente",
          }),
        });
        setClientes(prev => [normalizeClientePF(data), ...prev]);
      } else {
        data = await apiFetch("/api/leads", {
          method: "POST",
          body: JSON.stringify({
            nome: form.nome,
            empresa: form.empresa || null,
            cpf_cnpj: form.cpf_cnpj || null,
            telefone: form.telefone,
            email: form.email || null,
            tipo_pessoa: form.tipo as "pf" | "pj",
            cidade: form.cidade || null,
            estado: form.estado || null,
            segmento: form.segmento || null,
            faturamento_anual: form.faturamento_anual ? Number(form.faturamento_anual) : null,
            status: form.status,
            prioridade: form.prioridade,
            observacoes_ia: form.observacoes || null,
            proximo_followup: form.proximo_contato || null,
            origem: "painel_interno",
            etapa_funil: "Novo",
            temperatura: "frio",
            score_ia: 0,
          }),
        });
        setClientes(prev => [normalizeLead(data), ...prev]);
      }
      setModalNovoCliente(false);
      setForm({
        nome: "", empresa: "", cpf_cnpj: "", telefone: "", email: "",
        tipo: "pf", cidade: "", estado: "", faturamento_anual: "",
        segmento: "", status: "lead", prioridade: "media", observacoes: "",
        proximo_contato: ""
      });
      toast.success("Cliente criado com sucesso.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar cliente.");
    }
    setSalvando(false);
  }

  async function excluirCliente(clienteId: string) {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    const cliente = clientes.find(c => c.id === clienteId);
    const endpoint = cliente && isClientePF(cliente)
      ? `/api/clientes-pf/${getApiId(cliente)}`
      : `/api/leads/${cliente ? getApiId(cliente) : clienteId}`;
    try {
      await apiFetch(endpoint, { method: "DELETE" });
      setClientes(prev => prev.filter(c => c.id !== clienteId));
      if (clienteSelecionado?.id === clienteId) setClienteSelecionado(null);
      toast.success("Cliente excluído.");
    } catch (err) {
      toast.error("Erro ao excluir cliente.");
    }
  }

  async function executarDeduplicacao() {
    if (!confirm("Isso vai mesclar leads duplicados com o mesmo telefone. Continuar?")) return;
    setDeduplicando(true);
    try {
      const result = await apiFetch("/api/leads/deduplicar", { method: "POST" }) as any;
      toast.success(`Deduplicação concluída: ${result.mesclados} duplicatas mescladas.`);
      await carregarClientes();
    } catch (err) {
      toast.error("Erro ao deduplicar leads.");
    }
    setDeduplicando(false);
  }

  // ─── Filtros client-side ──────────────────────────────────
  const clientesFiltrados = clientes.filter(c => {
    const matchBusca = !busca ||
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.empresa?.toLowerCase().includes(busca.toLowerCase()) ||
      (c.telefone || "").includes(busca) ||
      c.email?.toLowerCase().includes(busca.toLowerCase()) ||
      c.cpf_cnpj?.replace(/\D/g, "").includes(busca.replace(/\D/g, ""));
    const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
    const matchPrioridade = filtroPrioridade === "todos" || c.prioridade === filtroPrioridade;
    const matchOrigem = filtroOrigem === "todos" || getOrigem(c) === filtroOrigem;
    const matchTipo = filtroTipo === "todos" || getTipo(c) === filtroTipo;
    const matchIncompleto = !filtroIncompleto || c.cadastro_incompleto || !c.email || !c.cpf_cnpj;
    return matchBusca && matchStatus && matchPrioridade && matchOrigem && matchTipo && matchIncompleto;
  });

  // ─── Estatísticas ─────────────────────────────────────────
  const stats = {
    total: clientes.length,
    leads: clientes.filter(c => c.status === "lead").length,
    analise: clientes.filter(c => c.status === "analise").length,
    aprovados: clientes.filter(c => c.status === "aprovado" || c.status === "convertido").length,
    alta: clientes.filter(c => c.prioridade === "alta").length,
    incompletos: clientes.filter(c => c.cadastro_incompleto).length,
    whatsapp: clientes.filter(c => getOrigem(c) === "whatsapp").length,
    site: clientes.filter(c => getOrigem(c) === "site").length,
  };

  // ─── Detecta duplicatas por telefone ─────────────────────
  const telefoneCounts = clientes.reduce((acc, c) => {
    const t = c.telefone?.replace(/\D/g, "");
    if (t) acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalDuplicatas = Object.values(telefoneCounts).filter(v => v > 1).length;

  return (
    <Layout>
      <div className="flex h-full">
        {/* ── Painel principal ── */}
        <div className={`flex flex-col flex-1 overflow-hidden transition-all ${clienteSelecionado ? "w-[55%]" : "w-full"}`}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  Clientes
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">Unificado</span>
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  {clientesFiltrados.length} de {clientes.length} clientes unificados
                  {totalDuplicatas > 0 && (
                    <span className="ml-2 text-orange-600 font-medium">
                      · {totalDuplicatas} telefones duplicados
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={carregarClientes}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Atualizar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {totalDuplicatas > 0 && (
                <button
                  onClick={executarDeduplicacao}
                  disabled={deduplicando}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                  title="Mesclar leads duplicados por telefone"
                >
                  {deduplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5" />}
                  Deduplicar ({totalDuplicatas})
                </button>
              )}
              <button
                onClick={() => setShowFiltros(f => !f)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${showFiltros ? "bg-blue-600 text-white border-blue-600" : "text-gray-600 border-gray-200 hover:bg-gray-50"}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filtros
              </button>
              <button
                onClick={() => setModalNovoCliente(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Novo Cliente
              </button>
            </div>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-3 px-6 py-3 bg-gray-50 border-b">
            {[
              { label: "Total",          value: stats.total,      color: "text-gray-800",    sub: "clientes" },
              { label: "Leads Novos",    value: stats.leads,      color: "text-gray-600",    sub: "aguardando" },
              { label: "Em Análise",     value: stats.analise,    color: "text-amber-600",   sub: "em processo" },
              { label: "Aprovados",      value: stats.aprovados,  color: "text-emerald-600", sub: "convertidos" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs font-medium text-gray-600">{s.label}</div>
                <div className="text-xs text-gray-400">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Badges de origem */}
          <div className="flex items-center gap-2 px-6 py-2 bg-gray-50 border-b overflow-x-auto">
            <span className="text-xs text-gray-500 shrink-0">Origem:</span>
            {Object.entries(ORIGEM_CONFIG).map(([key, cfg]) => {
              const count = clientes.filter(c => getOrigem(c) === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFiltroOrigem(filtroOrigem === key ? "todos" : key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all shrink-0 ${
                    filtroOrigem === key
                      ? "bg-blue-600 text-white border-blue-600"
                      : `${cfg.color} ${cfg.bg} border`
                  }`}
                >
                  {cfg.icon}
                  {cfg.label}
                  <span className={`ml-0.5 font-bold ${filtroOrigem === key ? "text-white" : ""}`}>{count}</span>
                </button>
              );
            })}
            {filtroIncompleto ? (
              <button
                onClick={() => setFiltroIncompleto(false)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-orange-600 text-white border-orange-600 shrink-0"
              >
                <AlertCircle className="w-3 h-3" />
                Incompletos: {stats.incompletos}
              </button>
            ) : stats.incompletos > 0 ? (
              <button
                onClick={() => setFiltroIncompleto(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border text-orange-700 bg-orange-50 border-orange-200 shrink-0"
              >
                <AlertCircle className="w-3 h-3" />
                Incompletos: {stats.incompletos}
              </button>
            ) : null}
          </div>

          {/* Painel de filtros expandível */}
          {showFiltros && (
            <div className="flex flex-wrap gap-3 px-6 py-3 bg-white border-b">
              <div className="flex-1 min-w-48 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, empresa, telefone..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <select
                value={filtroStatus}
                onChange={e => setFiltroStatus(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos os status</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={filtroTipo}
                onChange={e => setFiltroTipo(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">PF e PJ</option>
                <option value="pj">Pessoa Jurídica</option>
                <option value="pf">Pessoa Física</option>
              </select>
              <select
                value={filtroPrioridade}
                onChange={e => setFiltroPrioridade(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todas as prioridades</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
              {(busca || filtroStatus !== "todos" || filtroTipo !== "todos" || filtroPrioridade !== "todos" || filtroOrigem !== "todos" || filtroIncompleto) && (
                <button
                  onClick={() => {
                    setBusca(""); setFiltroStatus("todos"); setFiltroTipo("todos");
                    setFiltroPrioridade("todos"); setFiltroOrigem("todos"); setFiltroIncompleto(false);
                  }}
                  className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {/* Barra de busca sempre visível (quando filtros fechados) */}
          {!showFiltros && (
            <div className="px-6 py-2 bg-white border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, empresa, telefone, e-mail..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Lista de Clientes */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <Users className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Nenhum cliente encontrado</p>
                <button
                  onClick={() => setModalNovoCliente(true)}
                  className="mt-3 text-blue-600 text-sm hover:underline"
                >
                  + Adicionar primeiro cliente
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {clientesFiltrados.map(cliente => {
                  const origemNorm = getOrigem(cliente);
                  const origemCfg = ORIGEM_CONFIG[origemNorm] || ORIGEM_CONFIG.manual;
                  const priorCfg = PRIORIDADE_CONFIG[cliente.prioridade] || PRIORIDADE_CONFIG.media;
                  const statusCfg = STATUS_CONFIG[cliente.status] || STATUS_CONFIG.lead;
                  const incompleto = !!cliente.cadastro_incompleto;
                  const isDuplicado = (telefoneCounts[cliente.telefone?.replace(/\D/g, "")] || 0) > 1;

                  return (
                    <div
                      key={cliente.id}
                      onClick={() => selecionarCliente(cliente)}
                      className={`flex items-center gap-3 px-6 py-3.5 hover:bg-blue-50/50 cursor-pointer transition-colors ${
                        clienteSelecionado?.id === cliente.id ? "bg-blue-50 border-l-4 border-l-blue-600" : "border-l-4 border-l-transparent"
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                        getTipo(cliente) === "pj" ? "bg-blue-600" : "bg-violet-600"
                      }`}>
                        {cliente.nome.charAt(0).toUpperCase()}
                      </div>

                      {/* Info principal */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm truncate">{cliente.nome}</span>
                          {/* Badge tipo */}
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            getTipo(cliente) === "pj"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-violet-50 text-violet-700"
                          }`}>
                            {getTipo(cliente) === "pj" ? "PJ" : "PF"}
                          </span>
                          {/* Badge prioridade */}
                          {cliente.prioridade === "alta" && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium border ${priorCfg.bg} ${priorCfg.color}`}>
                              Alta
                            </span>
                          )}
                          {/* Badge incompleto */}
                          {incompleto && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5" /> Incompleto
                            </span>
                          )}
                          {/* Badge duplicado */}
                          {isDuplicado && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium flex items-center gap-0.5">
                              <GitMerge className="w-2.5 h-2.5" /> Duplicado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500 truncate">
                            {cliente.empresa ? `${cliente.empresa} · ` : ""}{cliente.telefone}
                          </span>
                          {/* Badge origem */}
                          <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border font-medium ${origemCfg.color} ${origemCfg.bg}`}>
                            {origemCfg.icon}
                            {origemCfg.label}
                          </span>
                        </div>
                      </div>

                      {/* Status + data */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusCfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                        <span className="text-xs text-gray-400">{fmtDate(cliente.created_at)}</span>
                      </div>

                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Painel de Detalhes ── */}
        {clienteSelecionado && (
          <div className="flex-1 border-l bg-white flex flex-col overflow-hidden min-w-0">
            {/* Header do cliente */}
            <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-900 to-blue-700 text-white">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold truncate">{clienteSelecionado.nome}</h2>
                  {clienteSelecionado.empresa && (
                    <p className="text-blue-200 text-sm truncate">{clienteSelecionado.empresa}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/20 text-white">
                      {STATUS_CONFIG[clienteSelecionado.status]?.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-blue-100">
                      {getTipo(clienteSelecionado) === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}
                    </span>
                    <span className="text-xs text-blue-200">
                      Desde {fmtDate(clienteSelecionado.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setClienteSelecionado(null)}
                  className="text-blue-200 hover:text-white text-lg ml-3 flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Ações rápidas */}
              <div className="px-4 py-3 border-b bg-gray-50">
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`https://wa.me/55${clienteSelecionado.telefone.replace(/\D/g, "")}?text=Olá ${clienteSelecionado.nome}, sou da Destrava Crédito!`}
                    target="_blank"
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                  >
                    💬 WhatsApp
                  </a>
                  {clienteSelecionado.email && (
                    <a
                      href={`mailto:${clienteSelecionado.email}`}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
                    >
                      📧 E-mail
                    </a>
                  )}
                  {!isClientePF(clienteSelecionado) && (
                    <button
                      onClick={() => setModalAtividade(true)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-white text-gray-700 border rounded-lg text-xs font-medium hover:bg-gray-50"
                    >
                      📝 Registrar
                    </button>
                  )}
                  <Link
                    href="/colaborador/calculadora"
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600"
                  >
                    🧮 Simulação
                  </Link>
                  <button
                    onClick={() => excluirCliente(clienteSelecionado.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100"
                  >
                    <Trash2 className="w-3 h-3" /> Excluir
                  </button>
                </div>
              </div>

              {/* Alterar Status */}
              <div className="px-4 py-3 border-b">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{isClientePF(clienteSelecionado) ? "Origem do cadastro" : "Alterar Status"}</p>
                {isClientePF(clienteSelecionado) ? (
                  <div className="text-sm text-gray-700">
                    {getFonteCadastro(clienteSelecionado)} · Cadastrado em {fmtDate(clienteSelecionado.created_at)}
                    {clienteSelecionado.cadastrado_por_nome ? ` por ${clienteSelecionado.cadastrado_por_nome}` : ""}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => atualizarStatus(clienteSelecionado.id, k)}
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all flex items-center gap-1 ${
                          clienteSelecionado.status === k
                            ? `${v.color} border-current ring-2 ring-offset-1 ring-blue-400`
                            : "border-gray-200 text-gray-500 hover:border-gray-400 hover:bg-gray-50"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dados do cliente */}
              <div className="px-4 py-3 border-b">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Dados do Cliente</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400 text-xs block">Telefone</span>
                    <p className="font-medium">{clienteSelecionado.telefone}</p>
                  </div>
                  {clienteSelecionado.email ? (
                    <div>
                      <span className="text-gray-400 text-xs block">E-mail</span>
                      <p className="font-medium truncate">{clienteSelecionado.email}</p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-gray-400 text-xs block">E-mail</span>
                      <p className="text-orange-500 text-xs font-medium">⚠️ Não informado</p>
                    </div>
                  )}
                  {clienteSelecionado.cpf_cnpj ? (
                    <div>
                      <span className="text-gray-400 text-xs block">CPF/CNPJ</span>
                      <p className="font-medium">{clienteSelecionado.cpf_cnpj}</p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-gray-400 text-xs block">CPF/CNPJ</span>
                      <p className="text-orange-500 text-xs font-medium">⚠️ Não informado</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 text-xs block">Tipo</span>
                    <p className="font-medium">{getTipo(clienteSelecionado) === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}</p>
                  </div>
                  {clienteSelecionado.cidade && (
                    <div>
                      <span className="text-gray-400 text-xs block">Cidade/UF</span>
                      <p className="font-medium">{clienteSelecionado.cidade}{clienteSelecionado.estado ? `/${clienteSelecionado.estado}` : ""}</p>
                    </div>
                  )}
                  {clienteSelecionado.faturamento_anual && (
                    <div>
                      <span className="text-gray-400 text-xs block">Faturamento Anual</span>
                      <p className="font-medium">{fmt(clienteSelecionado.faturamento_anual)}</p>
                    </div>
                  )}
                  {clienteSelecionado.segmento && (
                    <div>
                      <span className="text-gray-400 text-xs block">Segmento</span>
                      <p className="font-medium">{clienteSelecionado.segmento}</p>
                    </div>
                  )}
                  {getProximoContato(clienteSelecionado) && (
                    <div>
                      <span className="text-gray-400 text-xs block">Próximo Contato</span>
                      <p className="font-medium text-blue-600">{fmtDate(getProximoContato(clienteSelecionado))}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 text-xs block">Origem / Canal</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {(() => {
                        const cfg = ORIGEM_CONFIG[getOrigem(clienteSelecionado)] || ORIGEM_CONFIG.manual;
                        return (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color} ${cfg.bg}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block">Cadastro</span>
                    <p className="font-medium text-sm">{getFonteCadastro(clienteSelecionado)}</p>
                    <p className="text-xs text-gray-500">
                      {fmtDate(clienteSelecionado.created_at)}{clienteSelecionado.cadastrado_por_nome ? ` · ${clienteSelecionado.cadastrado_por_nome}` : ""}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block">Prioridade</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {(() => {
                        const cfg = PRIORIDADE_CONFIG[clienteSelecionado.prioridade] || PRIORIDADE_CONFIG.media;
                        return (
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color} ${cfg.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs block">n8n Notificado</span>
                    <p className="font-medium text-sm">{clienteSelecionado.n8n_notificado ? "✅ Sim" : "❌ Não"}</p>
                  </div>
                </div>
                {getObs(clienteSelecionado) && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-400 text-xs block mb-1">Observações</span>
                    <p className="text-sm text-gray-700">{getObs(clienteSelecionado)}</p>
                  </div>
                )}
              </div>

              {/* Documentos do cliente/lead */}
              <div className="px-4 py-3 border-t">
                <DocumentosEntidade
                  entidadeTipo={isClientePF(clienteSelecionado) ? "cliente_pf" : "lead"}
                  entidadeId={getApiId(clienteSelecionado)}
                  clientePfId={isClientePF(clienteSelecionado) ? getApiId(clienteSelecionado) : undefined}
                  tiposPermitidos={isClientePF(clienteSelecionado)
                    ? ["cpf", "rg", "cnh", "comprovante_residencia", "imposto_renda", "outros"]
                    : ["comprovante_faturamento", "extrato_bancario", "certidao", "procuracao", "outros"]}
                  titulo={isClientePF(clienteSelecionado) ? "Documentos do Cliente PF" : "Documentos do Lead"}
                  permitirUpload
                  permitirExcluir
                  permitirValidar
                />
              </div>

              {/* Histórico de Atividades */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Histórico de Atividades</p>
                  {!isClientePF(clienteSelecionado) && (
                    <button
                      onClick={() => setModalAtividade(true)}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Registrar
                    </button>
                  )}
                </div>

                {loadingAtividades ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  </div>
                ) : atividades.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">{isClientePF(clienteSelecionado) ? "Cliente PF cadastrado diretamente. Histórico comercial será criado quando houver atendimento." : "Nenhuma atividade registrada"}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {atividades.map(a => (
                      <div key={a.id} className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                          {TIPO_ATIVIDADE[a.tipo]?.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">{TIPO_ATIVIDADE[a.tipo]?.label}</span>
                            <span className="text-xs text-gray-400">{fmtDate(a.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-600">{a.descricao}</p>
                          {a.resultado && (
                            <p className="text-xs text-emerald-600 mt-0.5">→ {a.resultado}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Nova Atividade ── */}
      {modalAtividade && clienteSelecionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b">
              <h3 className="font-bold text-gray-900">Registrar Atividade</h3>
              <p className="text-sm text-gray-500">{clienteSelecionado.nome}</p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={novaAtividade.tipo}
                  onChange={e => setNovaAtividade(p => ({ ...p, tipo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(TIPO_ATIVIDADE).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                <textarea
                  value={novaAtividade.descricao}
                  onChange={e => setNovaAtividade(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Descreva o que aconteceu..."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resultado (opcional)</label>
                <input
                  type="text"
                  value={novaAtividade.resultado}
                  onChange={e => setNovaAtividade(p => ({ ...p, resultado: e.target.value }))}
                  placeholder="Ex: Cliente interessado, aguardando documentos..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <button
                onClick={() => setModalAtividade(false)}
                className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvarAtividade}
                disabled={salvando || !novaAtividade.descricao}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Novo Cliente ── */}
      {modalNovoCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-900 text-lg">Novo Cliente</h3>
              <p className="text-sm text-gray-500">Cadastro manual — origem: painel interno</p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { label: "Nome Completo *", key: "nome", type: "text", placeholder: "Nome do cliente" },
                { label: "Empresa / Razão Social", key: "empresa", type: "text", placeholder: "Nome da empresa" },
                { label: "Telefone / WhatsApp *", key: "telefone", type: "tel", placeholder: "(61) 9 9999-9999" },
                { label: "E-mail", key: "email", type: "email", placeholder: "email@empresa.com" },
                { label: form.tipo === "pf" ? "CPF *" : "CNPJ *", key: "cpf_cnpj", type: "text", placeholder: form.tipo === "pf" ? "000.000.000-00" : "00.000.000/0001-00" },
                { label: "Segmento", key: "segmento", type: "text", placeholder: "Ex: Agronegócio, Varejo..." },
                { label: "Cidade", key: "cidade", type: "text", placeholder: "Brasília" },
                { label: "Estado", key: "estado", type: "text", placeholder: "DF" },
                { label: "Faturamento Anual (R$)", key: "faturamento_anual", type: "number", placeholder: "500000" },
                { label: "Próximo Contato", key: "proximo_contato", type: "date", placeholder: "" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Pessoa</label>
                <select
                  value={form.tipo}
                  onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pf">Pessoa Física</option>
                  <option value="pj">Pessoa Jurídica</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                <select
                  value={form.prioridade}
                  onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Informações adicionais sobre o cliente..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="p-5 border-t flex gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => setModalNovoCliente(false)}
                className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={salvarNovoCliente}
                disabled={salvando || !form.nome || !form.telefone || !form.cpf_cnpj}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Criar Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

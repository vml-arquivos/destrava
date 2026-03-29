import { useState, useEffect } from "react";
import { Link } from "wouter";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import {
  Users, Plus, Search, Filter, Phone, Mail, Building2,
  ChevronRight, Clock, CheckCircle, XCircle, AlertCircle,
  MessageSquare, TrendingUp, Eye, Edit2, Trash2, Star,
  Calendar, RefreshCw, ArrowUpDown, UserCheck, Loader2
} from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  empresa?: string;
  cpf_cnpj?: string;
  telefone: string;
  email?: string;
  tipo: "pf" | "pj";
  cidade?: string;
  estado?: string;
  faturamento_anual?: number;
  segmento?: string;
  status: "lead" | "contato" | "analise" | "aprovado" | "reprovado" | "cancelado" | "convertido";
  origem: string;
  prioridade: "baixa" | "media" | "alta";
  observacoes?: string;
  proximo_contato?: string;
  n8n_notificado?: boolean;
  created_at: string;
  updated_at: string;
}

interface Atividade {
  id: string;
  cliente_id: string;
  tipo: "ligacao" | "email" | "whatsapp" | "reuniao" | "nota" | "simulacao" | "status_change";
  descricao: string;
  resultado?: string;
  created_at: string;
}

const STATUS_CONFIG = {
  lead:       { label: "Lead",        color: "bg-gray-100 text-gray-700",   icon: "⚪", order: 1 },
  contato:    { label: "Em Contato",  color: "bg-blue-100 text-blue-700",   icon: "🔵", order: 2 },
  analise:    { label: "Em Análise",  color: "bg-yellow-100 text-yellow-700", icon: "🟡", order: 3 },
  aprovado:   { label: "Aprovado",    color: "bg-green-100 text-green-700", icon: "🟢", order: 4 },
  convertido: { label: "Convertido",  color: "bg-purple-100 text-purple-700", icon: "🟣", order: 5 },
  reprovado:  { label: "Reprovado",   color: "bg-red-100 text-red-700",     icon: "🔴", order: 6 },
  cancelado:  { label: "Cancelado",   color: "bg-gray-100 text-gray-500",   icon: "⚫", order: 7 },
};

const PRIORIDADE_CONFIG = {
  alta:  { label: "Alta",  color: "text-red-600",    bg: "bg-red-50" },
  media: { label: "Média", color: "text-yellow-600", bg: "bg-yellow-50" },
  baixa: { label: "Baixa", color: "text-green-600",  bg: "bg-green-50" },
};

const TIPO_ATIVIDADE = {
  ligacao:      { label: "Ligação",    icon: "📞" },
  email:        { label: "E-mail",     icon: "📧" },
  whatsapp:     { label: "WhatsApp",   icon: "💬" },
  reuniao:      { label: "Reunião",    icon: "🤝" },
  nota:         { label: "Nota",       icon: "📝" },
  simulacao:    { label: "Simulação",  icon: "🧮" },
  status_change:{ label: "Status",     icon: "🔄" },
};

const fmt = (v: number) => v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—";
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todos");
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loadingAtividades, setLoadingAtividades] = useState(false);
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [modalAtividade, setModalAtividade] = useState(false);
  const [novaAtividade, setNovaAtividade] = useState({ tipo: "nota", descricao: "", resultado: "" });
  const [salvando, setSalvando] = useState(false);
  const [view, setView] = useState<"lista" | "kanban">("lista");

  // Formulário novo cliente
  const [form, setForm] = useState({
    nome: "", empresa: "", cpf_cnpj: "", telefone: "", email: "",
    tipo: "pj", cidade: "", estado: "", faturamento_anual: "",
    segmento: "", status: "lead", prioridade: "media", observacoes: "",
    proximo_contato: ""
  });

  useEffect(() => { carregarClientes(); }, []);

  async function carregarClientes() {
    setLoading(true);
    // tabela 'clientes' não existe — usar 'leads' como entidade canônica
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setClientes(data as any);
    setLoading(false);
  }

  async function carregarAtividades(clienteId: string) {
    setLoadingAtividades(true);
    // tabela 'atividades_crm' não existe — usar 'crm_atividades' com campo lead_id
    const { data, error } = await supabase
      .from("crm_atividades")
      .select("*")
      .eq("lead_id", clienteId)
      .order("created_at", { ascending: false });

    if (!error && data) setAtividades(data as any);
    setLoadingAtividades(false);
  }

  async function selecionarCliente(cliente: Cliente) {
    setClienteSelecionado(cliente);
    await carregarAtividades(cliente.id);
  }

  async function atualizarStatus(clienteId: string, novoStatus: string) {
    const { error } = await supabase
      .from("leads")
      .update({ status: novoStatus })
      .eq("id", clienteId);

    if (!error) {
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, status: novoStatus as any } : c));
      if (clienteSelecionado?.id === clienteId) {
        setClienteSelecionado(prev => prev ? { ...prev, status: novoStatus as any } : null);
      }
      // Registrar atividade de mudança de status em crm_atividades
      await apiFetch("/api/crm/atividades", { method: "POST", body: JSON.stringify({
        lead_id: clienteId,
        tipo: "status_change",
        titulo: `Status alterado para: ${STATUS_CONFIG[novoStatus as keyof typeof STATUS_CONFIG]?.label}`,
        concluido: true,
      });
    }
  }

  async function salvarAtividade() {
    if (!clienteSelecionado || !novaAtividade.descricao) return;
    setSalvando(true);

    const { data, error } = await supabase
      .from("crm_atividades")
      .insert({
        lead_id: clienteSelecionado.id,
        tipo: novaAtividade.tipo,
        titulo: novaAtividade.descricao.substring(0, 100),
        descricao: novaAtividade.descricao,
        resultado: novaAtividade.resultado || null,
        concluido: true,
      })
      .select()
      .single();

    if (!error && data) {
      setAtividades(prev => [data, ...prev]);
      setNovaAtividade({ tipo: "nota", descricao: "", resultado: "" });
      setModalAtividade(false);
    }
    setSalvando(false);
  }

  async function salvarNovoCliente() {
    if (!form.nome || !form.telefone) return;
    setSalvando(true);

    // User obtained from useAuth hook
    if (!userData?.user) {
      alert("Sessão expirada. Faça login novamente.");
      setSalvando(false);
      return;
    }
    // Inserir em 'leads' (tabela 'clientes' não existe no schema real)
    const { data, error } = await supabase
      .from("leads")
      .insert({
        nome: form.nome,
        empresa: form.empresa || null,
        cpf_cnpj: form.cpf_cnpj || null,
        telefone: form.telefone,
        email: form.email || null,
        tipo_pessoa: form.tipo as "pf" | "pj",
        cidade: form.cidade || null,
        estado: form.estado || null,
        status: form.status,
        responsavel_id: userData.user.id,
        observacoes_ia: form.observacoes || null,
        proximo_followup: form.proximo_contato || null,
        origem: "painel_interno",
        etapa_funil: "Novo",
        temperatura: "frio",
        score_ia: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[Clientes] Erro ao salvar cliente:", error);
      alert(`Erro ao salvar cliente: ${error.message}`);
    } else if (data) {
      setClientes(prev => [data, ...prev]);
      setModalNovoCliente(false);
      setForm({
        nome: "", empresa: "", cpf_cnpj: "", telefone: "", email: "",
        tipo: "pj", cidade: "", estado: "", faturamento_anual: "",
        segmento: "", status: "lead", prioridade: "media", observacoes: "",
        proximo_contato: ""
      });
    }
    setSalvando(false);
  }

  async function excluirCliente(clienteId: string) {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    await apiFetch(`/api/leads/${clienteId}`, { method: "DELETE" });
    if (!error) {
      setClientes(prev => prev.filter(c => c.id !== clienteId));
      if (clienteSelecionado?.id === clienteId) setClienteSelecionado(null);
    }
  }

  const clientesFiltrados = clientes.filter(c => {
    const matchBusca = !busca || 
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.empresa?.toLowerCase().includes(busca.toLowerCase()) ||
      c.telefone.includes(busca) ||
      c.email?.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = filtroStatus === "todos" || c.status === filtroStatus;
    const matchPrioridade = filtroPrioridade === "todos" || c.prioridade === filtroPrioridade;
    return matchBusca && matchStatus && matchPrioridade;
  });

  // Estatísticas
  const stats = {
    total: clientes.length,
    leads: clientes.filter(c => c.status === "lead").length,
    analise: clientes.filter(c => c.status === "analise").length,
    aprovados: clientes.filter(c => c.status === "aprovado" || c.status === "convertido").length,
    alta: clientes.filter(c => c.prioridade === "alta").length,
  };

  return (
    <Layout>
      <div className="flex h-full">
        {/* Painel principal */}
        <div className={`flex flex-col flex-1 overflow-hidden ${clienteSelecionado ? "w-1/2" : "w-full"}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b bg-white">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-6 h-6 text-blue-600" />
                CRM — Gestão de Clientes
              </h1>
              <p className="text-sm text-gray-500 mt-1">{clientes.length} clientes cadastrados</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={carregarClientes}
                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Atualizar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView(view === "lista" ? "kanban" : "lista")}
                className="px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 flex items-center gap-1"
              >
                <ArrowUpDown className="w-4 h-4" />
                {view === "lista" ? "Kanban" : "Lista"}
              </button>
              <button
                onClick={() => setModalNovoCliente(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Novo Cliente
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3 p-4 bg-gray-50 border-b">
            {[
              { label: "Total", value: stats.total, color: "text-gray-700" },
              { label: "Leads", value: stats.leads, color: "text-gray-600" },
              { label: "Em Análise", value: stats.analise, color: "text-yellow-600" },
              { label: "Aprovados", value: stats.aprovados, color: "text-green-600" },
              { label: "Alta Prioridade", value: stats.alta, color: "text-red-600" },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-lg p-3 text-center shadow-sm">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex gap-3 p-4 bg-white border-b">
            <div className="flex-1 relative">
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
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
            <select
              value={filtroPrioridade}
              onChange={e => setFiltroPrioridade(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="todos">Todas as prioridades</option>
              <option value="alta">🔴 Alta</option>
              <option value="media">🟡 Média</option>
              <option value="baixa">🟢 Baixa</option>
            </select>
          </div>

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
              <div className="divide-y">
                {clientesFiltrados.map(cliente => (
                  <div
                    key={cliente.id}
                    onClick={() => selecionarCliente(cliente)}
                    className={`flex items-center gap-4 p-4 hover:bg-blue-50 cursor-pointer transition-colors ${
                      clienteSelecionado?.id === cliente.id ? "bg-blue-50 border-l-4 border-blue-600" : ""
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                      {cliente.nome.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{cliente.nome}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORIDADE_CONFIG[cliente.prioridade]?.color} ${PRIORIDADE_CONFIG[cliente.prioridade]?.bg}`}>
                          {cliente.prioridade === "alta" ? "🔴" : cliente.prioridade === "media" ? "🟡" : "🟢"}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        {cliente.empresa && <span>{cliente.empresa} · </span>}
                        {cliente.telefone}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_CONFIG[cliente.status]?.color}`}>
                        {STATUS_CONFIG[cliente.status]?.label}
                      </span>
                      <span className="text-xs text-gray-400">{fmtDate(cliente.created_at)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Painel de Detalhes */}
        {clienteSelecionado && (
          <div className="w-1/2 border-l bg-white flex flex-col overflow-hidden">
            {/* Header do cliente */}
            <div className="p-5 border-b bg-gradient-to-r from-blue-900 to-blue-700 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{clienteSelecionado.nome}</h2>
                  {clienteSelecionado.empresa && (
                    <p className="text-blue-200 text-sm">{clienteSelecionado.empresa}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium bg-white/20 text-white`}>
                      {STATUS_CONFIG[clienteSelecionado.status]?.icon} {STATUS_CONFIG[clienteSelecionado.status]?.label}
                    </span>
                    <span className="text-xs text-blue-200">
                      Desde {fmtDate(clienteSelecionado.created_at)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setClienteSelecionado(null)}
                  className="text-blue-200 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Ações rápidas */}
              <div className="p-4 border-b">
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`https://wa.me/55${clienteSelecionado.telefone.replace(/\D/g, "")}?text=Olá ${clienteSelecionado.nome}, sou da Destrava Crédito...`}
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
                  <button
                    onClick={() => setModalAtividade(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200"
                  >
                    📝 Registrar Atividade
                  </button>
                  <Link
                    href="/colaborador/calculadora"
                    className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-xs font-medium hover:bg-yellow-600"
                  >
                    🧮 Nova Simulação
                  </Link>
                  <button
                    onClick={() => excluirCliente(clienteSelecionado.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100"
                  >
                    <Trash2 className="w-3 h-3" /> Excluir
                  </button>
                </div>
              </div>

              {/* Alterar Status */}
              <div className="p-4 border-b">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Alterar Status</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => atualizarStatus(clienteSelecionado.id, k)}
                      className={`text-xs px-2 py-1 rounded-full border font-medium transition-all ${
                        clienteSelecionado.status === k
                          ? `${v.color} border-current font-bold ring-2 ring-offset-1`
                          : "border-gray-200 text-gray-500 hover:border-gray-400"
                      }`}
                    >
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dados do cliente */}
              <div className="p-4 border-b">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Dados</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-400 text-xs">Telefone</span>
                    <p className="font-medium">{clienteSelecionado.telefone}</p>
                  </div>
                  {clienteSelecionado.email && (
                    <div>
                      <span className="text-gray-400 text-xs">E-mail</span>
                      <p className="font-medium truncate">{clienteSelecionado.email}</p>
                    </div>
                  )}
                  {clienteSelecionado.cpf_cnpj && (
                    <div>
                      <span className="text-gray-400 text-xs">CPF/CNPJ</span>
                      <p className="font-medium">{clienteSelecionado.cpf_cnpj}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 text-xs">Tipo</span>
                    <p className="font-medium">{clienteSelecionado.tipo === "pj" ? "Pessoa Jurídica" : "Pessoa Física"}</p>
                  </div>
                  {clienteSelecionado.cidade && (
                    <div>
                      <span className="text-gray-400 text-xs">Cidade/UF</span>
                      <p className="font-medium">{clienteSelecionado.cidade}{clienteSelecionado.estado ? `/${clienteSelecionado.estado}` : ""}</p>
                    </div>
                  )}
                  {clienteSelecionado.faturamento_anual && (
                    <div>
                      <span className="text-gray-400 text-xs">Faturamento Anual</span>
                      <p className="font-medium">{fmt(clienteSelecionado.faturamento_anual)}</p>
                    </div>
                  )}
                  {clienteSelecionado.segmento && (
                    <div>
                      <span className="text-gray-400 text-xs">Segmento</span>
                      <p className="font-medium">{clienteSelecionado.segmento}</p>
                    </div>
                  )}
                  {clienteSelecionado.proximo_contato && (
                    <div>
                      <span className="text-gray-400 text-xs">Próximo Contato</span>
                      <p className="font-medium text-blue-600">{fmtDate(clienteSelecionado.proximo_contato)}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-400 text-xs">Origem</span>
                    <p className="font-medium capitalize">{clienteSelecionado.origem}</p>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs">n8n Notificado</span>
                    <p className="font-medium">{clienteSelecionado.n8n_notificado ? "✅ Sim" : "❌ Não"}</p>
                  </div>
                </div>
                {clienteSelecionado.observacoes && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-400 text-xs block mb-1">Observações</span>
                    <p className="text-sm text-gray-700">{clienteSelecionado.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Histórico de Atividades */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Histórico de Atividades</p>
                  <button
                    onClick={() => setModalAtividade(true)}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Registrar
                  </button>
                </div>

                {loadingAtividades ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  </div>
                ) : atividades.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Nenhuma atividade registrada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {atividades.map(a => (
                      <div key={a.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm flex-shrink-0">
                          {TIPO_ATIVIDADE[a.tipo]?.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">{TIPO_ATIVIDADE[a.tipo]?.label}</span>
                            <span className="text-xs text-gray-400">{fmtDate(a.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-600">{a.descricao}</p>
                          {a.resultado && (
                            <p className="text-xs text-green-600 mt-0.5">→ {a.resultado}</p>
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

      {/* Modal: Nova Atividade */}
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

      {/* Modal: Novo Cliente */}
      {modalNovoCliente && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-gray-900 text-lg">Novo Cliente</h3>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4">
              {[
                { label: "Nome Completo *", key: "nome", type: "text", placeholder: "Nome do cliente" },
                { label: "Empresa / Razão Social", key: "empresa", type: "text", placeholder: "Nome da empresa" },
                { label: "Telefone / WhatsApp *", key: "telefone", type: "tel", placeholder: "(61) 9 9999-9999" },
                { label: "E-mail", key: "email", type: "email", placeholder: "email@empresa.com" },
                { label: "CPF / CNPJ", key: "cpf_cnpj", type: "text", placeholder: "00.000.000/0001-00" },
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
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="pj">Pessoa Jurídica</option>
                  <option value="pf">Pessoa Física</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                <select value={form.prioridade} onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="alta">🔴 Alta</option>
                  <option value="media">🟡 Média</option>
                  <option value="baixa">🟢 Baixa</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={form.observacoes}
                  onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
                  placeholder="Informações adicionais sobre o cliente..."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="p-5 border-t flex gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setModalNovoCliente(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={salvarNovoCliente}
                disabled={salvando || !form.nome || !form.telefone}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Salvar Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

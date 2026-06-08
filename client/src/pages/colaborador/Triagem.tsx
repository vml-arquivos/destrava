import { useState, useEffect, useCallback } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  Filter, Search, RefreshCw, UserCheck, UserX, HelpCircle,
  AlertTriangle, CheckCircle2, Clock, Phone, Mail, Building2,
  ChevronRight, Eye, X, MessageSquare, ArrowRight, Trash2,
  TrendingUp, Users, ShieldAlert, ShieldCheck,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TriagemItem {
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  empresa?: string;
  cpf_cnpj?: string;
  tipo_pessoa?: string;
  produto?: string;
  valor?: number;
  prazo?: number;
  parcela?: number;
  taxa?: number;
  cidade?: string;
  estado?: string;
  status: "pendente" | "possivel_cliente" | "curioso" | "sem_perfil" | "convertido" | "descartado";
  classificacao?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
}

interface Stats {
  pendente?: number;
  possivel_cliente?: number;
  curioso?: number;
  sem_perfil?: number;
  convertido?: number;
  descartado?: number;
}

// ─── Configurações de status ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; badge: string; icon: React.ElementType }> = {
  pendente:         { label: "Pendente",          color: "border-yellow-300 bg-yellow-50",  badge: "bg-yellow-100 text-yellow-800",  icon: Clock },
  possivel_cliente: { label: "Possível Cliente",  color: "border-green-300 bg-green-50",   badge: "bg-green-100 text-green-800",    icon: UserCheck },
  curioso:          { label: "Curioso",            color: "border-blue-300 bg-blue-50",     badge: "bg-blue-100 text-blue-800",      icon: HelpCircle },
  sem_perfil:       { label: "Sem Perfil",         color: "border-orange-300 bg-orange-50", badge: "bg-orange-100 text-orange-800",  icon: AlertTriangle },
  convertido:       { label: "Convertido",         color: "border-emerald-300 bg-emerald-50",badge: "bg-emerald-100 text-emerald-800",icon: CheckCircle2 },
  descartado:       { label: "Descartado",         color: "border-gray-300 bg-gray-50",     badge: "bg-gray-100 text-gray-500",      icon: Trash2 },
};

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

// ─── Modal de Detalhe / Qualificação ─────────────────────────────────────────

function ModalQualificacao({
  item,
  onClose,
  onAtualizar,
  onConverter,
}: {
  item: TriagemItem;
  onClose: () => void;
  onAtualizar: (id: string, dados: Partial<TriagemItem>) => Promise<void>;
  onConverter: (id: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(item.status);
  const [classificacao, setClassificacao] = useState(item.classificacao || "");
  const [observacoes, setObservacoes] = useState(item.observacoes || "");
  const [salvando, setSalvando] = useState(false);
  const [convertendo, setConvertendo] = useState(false);
  const [qualificandoIA, setQualificandoIA] = useState(false);
  const [analiseIA, setAnaliseIA] = useState<{
    classificacao: string; score: number; temperatura: string;
    resumo: string; pontos_positivos: string[]; pontos_atencao: string[]; proxima_acao: string;
  } | null>(() => {
    try { return (item as any).observacoes_ia ? JSON.parse((item as any).observacoes_ia) : null; } catch { return null; }
  });

  async function handleQualificarIA() {
    setQualificandoIA(true);
    try {
      const res = await apiFetch(`/api/triagem/${item.id}/qualificar-ia`, { method: "POST" });
      if (res.analise) {
        setAnaliseIA(res.analise);
        setStatus(res.analise.classificacao === "possivel_cliente" ? "possivel_cliente"
          : res.analise.classificacao === "curioso" ? "curioso"
          : res.analise.classificacao === "sem_perfil" ? "sem_perfil" : "pendente");
        toast.success("Qualificado pela IA com sucesso!");
      }
    } catch { toast.error("Erro ao qualificar com IA."); }
    setQualificandoIA(false);
  }

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
  const CfgIcon = cfg.icon;

  async function handleSalvar() {
    setSalvando(true);
    await onAtualizar(item.id, { status, classificacao, observacoes });
    setSalvando(false);
    onClose();
  }

  async function handleConverter() {
    if (!confirm(`Confirmar conversão de "${item.nome}" em Lead no CRM?`)) return;
    setConvertendo(true);
    await onConverter(item.id);
    setConvertendo(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{item.nome}</h2>
            <p className="text-sm text-gray-500">{item.empresa || "Empresa não informada"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Dados da simulação */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 text-sm">
            {item.telefone && (
              <a href={`tel:${item.telefone}`} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors">
                <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-gray-700 truncate">{item.telefone}</span>
              </a>
            )}
            {item.email && (
              <a href={`mailto:${item.email}`} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl hover:bg-blue-50 transition-colors">
                <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <span className="text-gray-700 truncate">{item.email}</span>
              </a>
            )}
            {item.cpf_cnpj && (
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-700 truncate">{item.cpf_cnpj}</span>
              </div>
            )}
            {(item.cidade || item.estado) && (
              <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                <span className="text-gray-500 text-xs">{[item.cidade, item.estado].filter(Boolean).join(" / ")}</span>
              </div>
            )}
          </div>

          {/* Dados da simulação — sem exibir valores do simulador público */}
          {item.produto && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Produto de Interesse</p>
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Produto</p><p className="font-semibold text-gray-800">{item.produto}</p></div>
                {item.prazo && <div><p className="text-xs text-gray-400">Prazo desejado</p><p className="font-semibold text-gray-800">{item.prazo} meses</p></div>}
              </div>
            </div>
          )}

          {/* Botão Qualificar com IA */}
          <button
            onClick={handleQualificarIA}
            disabled={qualificandoIA}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-all shadow-sm"
          >
            {qualificandoIA
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analisando com IA...</>
              : <><TrendingUp className="w-4 h-4" /> {analiseIA ? "Re-analisar com IA" : "Qualificar com IA"}</>
            }
          </button>

          {/* Resultado da análise IA */}
          {analiseIA && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Análise da IA
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    analiseIA.temperatura === "quente" ? "bg-red-100 text-red-700" :
                    analiseIA.temperatura === "morno" ? "bg-orange-100 text-orange-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>{analiseIA.temperatura === "quente" ? "🔥 Quente" : analiseIA.temperatura === "morno" ? "🌞 Morno" : "❄️ Frio"}</span>
                  <span className="text-sm font-bold text-violet-700">{analiseIA.score}/100</span>
                </div>
              </div>
              <p className="text-sm text-gray-700">{analiseIA.resumo}</p>
              {analiseIA.pontos_positivos?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">Pontos positivos</p>
                  <ul className="space-y-0.5">
                    {analiseIA.pontos_positivos.map((p, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-green-500 mt-0.5">✓</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analiseIA.pontos_atencao?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-700 mb-1">Pontos de atenção</p>
                  <ul className="space-y-0.5">
                    {analiseIA.pontos_atencao.map((p, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-orange-500 mt-0.5">⚠</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analiseIA.proxima_acao && (
                <div className="bg-white border border-violet-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-violet-700 mb-0.5">Próxima ação recomendada</p>
                  <p className="text-sm text-gray-700">{analiseIA.proxima_acao}</p>
                </div>
              )}
            </div>
          )}

          {/* Qualificação */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Qualificação</p>

            {/* Botões de status */}
            <div className="grid grid-cols-2 gap-2">
              {(["possivel_cliente", "curioso", "sem_perfil", "pendente"] as const).map(s => {
                const c = STATUS_CONFIG[s];
                const Icon = c.icon;
                return (
                  <button
                    key={s}
                    onClick={async () => {
                      setStatus(s);
                      setSalvando(true);
                      await onAtualizar(item.id, { status: s, classificacao, observacoes });
                      setSalvando(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                      status === s ? `${c.color} border-current` : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {c.label}
                  </button>
                );
              })}
            </div>

            {/* Classificação livre */}
            <input
              value={classificacao}
              onChange={e => setClassificacao(e.target.value)}
              placeholder="Classificação livre (ex: MEI sem faturamento, PJ ativa...)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Observações */}
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Observações internas sobre este contato..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Ações */}
        <div className="p-4 border-t flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {salvando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Salvar Qualificação
          </button>
          {status === "possivel_cliente" && (
            <button
              onClick={handleConverter}
              disabled={convertendo}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {convertendo ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              Converter em Lead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Card da fila ─────────────────────────────────────────────────────────────

function CardTriagem({
  item,
  onClick,
}: {
  item: TriagemItem;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pendente;
  const CfgIcon = cfg.icon;

  return (
    <div
      onClick={onClick}
      className={`border-l-4 ${item.status === "pendente" ? "border-l-yellow-400" : item.status === "possivel_cliente" ? "border-l-green-500" : item.status === "curioso" ? "border-l-blue-400" : item.status === "sem_perfil" ? "border-l-orange-400" : item.status === "convertido" ? "border-l-emerald-500" : "border-l-gray-300"} bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all hover:border-blue-200 group`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-gray-900 truncate">{item.nome}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>
              {cfg.label}
            </span>
          </div>
          {item.empresa && <p className="text-xs text-gray-500 truncate mb-1">{item.empresa}</p>}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{item.telefone}</span>
            {item.produto && <span className="flex items-center gap-1 text-blue-600 font-medium">· {item.produto}</span>}
            {item.valor && <span className="text-green-600 font-medium">· {fmtBRL.format(item.valor)}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="text-xs text-gray-400">{fmtData(item.created_at)}</span>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Triagem() {
  const [itens, setItens] = useState<TriagemItem[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [selecionado, setSelecionado] = useState<TriagemItem | null>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStatus !== "todos") params.set("status", filtroStatus);
      if (busca.trim()) params.set("busca", busca.trim());
      const [data, statsData] = await Promise.all([
        apiFetch(`/api/triagem?${params}`),
        apiFetch("/api/triagem/stats"),
      ]);
      setItens(Array.isArray(data) ? data : []);
      setStats(statsData || {});
    } catch {
      toast.error("Erro ao carregar fila de triagem.");
    }
    setLoading(false);
  }, [filtroStatus, busca]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => carregarDados(), 400);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line

  async function handleAtualizar(id: string, dados: Partial<TriagemItem>) {
    try {
      await apiFetch(`/api/triagem/${id}`, { method: "PATCH", body: JSON.stringify(dados) });
      toast.success("Qualificação salva.");
      carregarDados();
    } catch {
      toast.error("Erro ao salvar qualificação.");
    }
  }

  async function handleConverter(id: string) {
    try {
      const result = await apiFetch(`/api/triagem/${id}/converter`, { method: "POST" });
      toast.success(`Lead criado no CRM: ${result?.lead?.nome || ""}`);
      carregarDados();
    } catch {
      toast.error("Erro ao converter para lead.");
    }
  }

  const pendentes = stats.pendente || 0;
  const possiveis = stats.possivel_cliente || 0;
  const convertidos = stats.convertido || 0;
  const total = Object.values(stats).reduce((a, b) => a + (b || 0), 0);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-yellow-100 rounded-xl">
              <ShieldAlert className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Triagem de Leads</h1>
              <p className="text-sm text-gray-500">Qualifique os contatos do simulador antes de enviar ao CRM</p>
            </div>
          </div>
          <button
            onClick={carregarDados}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Cards de métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500 font-medium">Total Recebido</span>
            </div>
            <p className="text-2xl font-black text-gray-900">{total}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-yellow-500" />
              <span className="text-xs text-yellow-700 font-medium">Aguardando</span>
            </div>
            <p className="text-2xl font-black text-yellow-700">{pendentes}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <UserCheck className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-700 font-medium">Possíveis Clientes</span>
            </div>
            <p className="text-2xl font-black text-green-700">{possiveis}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span className="text-xs text-emerald-700 font-medium">Convertidos</span>
            </div>
            <p className="text-2xl font-black text-emerald-700">{convertidos}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, empresa, telefone ou CNPJ..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="todos">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="possivel_cliente">Possível Cliente</option>
              <option value="curioso">Curioso</option>
              <option value="sem_perfil">Sem Perfil</option>
              <option value="convertido">Convertido</option>
              <option value="descartado">Descartado</option>
            </select>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShieldCheck className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nenhum item na fila</p>
            <p className="text-sm text-gray-400 mt-1">
              {filtroStatus !== "todos" || busca
                ? "Tente outros filtros"
                : "Os leads do simulador público aparecerão aqui para qualificação"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 font-medium">{itens.length} {itens.length === 1 ? "item" : "itens"}</p>
            {itens.map(item => (
              <CardTriagem
                key={item.id}
                item={item}
                onClick={() => setSelecionado(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal de qualificação */}
      {selecionado && (
        <ModalQualificacao
          item={selecionado}
          onClose={() => setSelecionado(null)}
          onAtualizar={handleAtualizar}
          onConverter={handleConverter}
        />
      )}
    </Layout>
  );
}

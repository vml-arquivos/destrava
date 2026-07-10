/**
 * Historico360.tsx
 *
 * Componente de Histórico 360 do Cliente.
 * Exibe uma linha do tempo consolidada de todos os eventos da empresa,
 * agrupados por data, com filtro por tipo e separação de eventos sem data.
 */

import { useState, useCallback } from "react";
import {
  History, FileText, TrendingUp, FileSignature, ClipboardList,
  MessageSquare, Building2, Banknote, RefreshCw, ChevronDown,
  ChevronUp, Calendar, User, ExternalLink, AlertCircle, Info,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoEvento =
  | "cadastro" | "atualizacao_cadastral" | "documento" | "simulacao"
  | "contrato" | "orcamento" | "followup" | "nota"
  | "acompanhamento_bancario" | "analise" | "sistema";

type ModuloEvento =
  | "cadastro_empresa" | "acervo_documental" | "simulacoes" | "contratos"
  | "orcamentos" | "followup" | "inteligencia_360" | "acompanhamento_bancario" | "sistema";

interface EventoHistorico {
  id: string;
  data: string | null;
  data_valida: boolean;
  tipo: TipoEvento;
  titulo: string;
  descricao: string;
  origem: string;
  usuario: string | null;
  modulo: ModuloEvento;
  link_acao: string | null;
  metadados?: Record<string, string | number | boolean | null>;
}

interface HistoricoResult {
  empresa_id: string;
  calculado_em: string;
  total_eventos: number;
  total_sem_data: number;
  eventos_com_data: EventoHistorico[];
  eventos_sem_data: EventoHistorico[];
  resumo_por_tipo: Record<string, number>;
  primeiro_evento: string | null;
  ultimo_evento: string | null;
  fonte: "consolidado_360";
}

interface Props {
  empresaId: string;
  onNavegar?: (aba: string) => void;
  /** Quando true, exibe como bloco compacto para a aba Inteligência 360 */
  modoCompacto?: boolean;
}

// ─── Configurações visuais por tipo de evento ─────────────────────────────────

const CONFIG_TIPO: Record<TipoEvento, {
  cor: string;
  bg: string;
  borda: string;
  icone: React.ElementType;
  label: string;
}> = {
  cadastro:             { cor: "text-blue-700",   bg: "bg-blue-100",   borda: "border-blue-300",  icone: Building2,     label: "Cadastro" },
  atualizacao_cadastral:{ cor: "text-indigo-700", bg: "bg-indigo-100", borda: "border-indigo-300",icone: RefreshCw,     label: "Atualização" },
  documento:            { cor: "text-amber-700",  bg: "bg-amber-100",  borda: "border-amber-300", icone: FileText,      label: "Documento" },
  simulacao:            { cor: "text-emerald-700",bg: "bg-emerald-100",borda: "border-emerald-300",icone: TrendingUp,   label: "Simulação" },
  contrato:             { cor: "text-purple-700", bg: "bg-purple-100", borda: "border-purple-300",icone: FileSignature, label: "Contrato" },
  orcamento:            { cor: "text-orange-700", bg: "bg-orange-100", borda: "border-orange-300",icone: ClipboardList, label: "Orçamento" },
  followup:             { cor: "text-sky-700",    bg: "bg-sky-100",    borda: "border-sky-300",   icone: MessageSquare, label: "Follow-up" },
  nota:                 { cor: "text-slate-700",  bg: "bg-slate-100",  borda: "border-slate-300", icone: MessageSquare, label: "Nota" },
  acompanhamento_bancario:{ cor: "text-teal-700", bg: "bg-teal-100",  borda: "border-teal-300",  icone: Banknote,      label: "Bancário" },
  analise:              { cor: "text-violet-700", bg: "bg-violet-100", borda: "border-violet-300",icone: Info,          label: "Análise" },
  sistema:              { cor: "text-slate-500",  bg: "bg-slate-50",   borda: "border-slate-200", icone: RefreshCw,     label: "Sistema" },
};

const MODULO_LABEL: Record<ModuloEvento, string> = {
  cadastro_empresa:        "Dados da Empresa",
  acervo_documental:       "Acervo Documental",
  simulacoes:              "Simulações",
  contratos:               "Contratos",
  orcamentos:              "Orçamentos",
  followup:                "Follow-up",
  inteligencia_360:        "Inteligência 360",
  acompanhamento_bancario: "Acompanhamento Bancário",
  sistema:                 "Sistema",
};

const ABA_MODULO: Partial<Record<ModuloEvento, string>> = {
  cadastro_empresa:        "visao_geral",
  acervo_documental:       "documentos",
  simulacoes:              "simulacoes",
  contratos:               "contratos",
  orcamentos:              "visao_geral",
  followup:                "followup",
  inteligencia_360:        "inteligencia_360",
};

// ─── Utilitários ──────────────────────────────────────────────────────────────

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatarDataCurta(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function agruparPorDia(eventos: EventoHistorico[]): Map<string, EventoHistorico[]> {
  const mapa = new Map<string, EventoHistorico[]>();
  for (const e of eventos) {
    if (!e.data) continue;
    const chave = new Date(e.data).toISOString().slice(0, 10);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave)!.push(e);
  }
  return mapa;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function CardEvento({ evento, onNavegar }: { evento: EventoHistorico; onNavegar?: (aba: string) => void }) {
  const cfg = CONFIG_TIPO[evento.tipo] ?? CONFIG_TIPO.nota;
  const Icone = cfg.icone;
  const abaDestino = ABA_MODULO[evento.modulo];

  return (
    <div className={`flex gap-3 group`}>
      {/* Ícone */}
      <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5 border ${cfg.borda}`}>
        <Icone className={`w-3.5 h-3.5 ${cfg.cor}`} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-800 leading-snug">{evento.titulo}</p>
            <p className="text-[12px] text-slate-500 mt-0.5 leading-relaxed">{evento.descricao}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.cor} border ${cfg.borda}`}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Metadados */}
        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          {evento.data && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Calendar className="w-3 h-3" />
              {formatarData(evento.data)}
            </span>
          )}
          {evento.usuario && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <User className="w-3 h-3" />
              {evento.usuario}
            </span>
          )}
          <span className="text-[11px] text-slate-300">
            {MODULO_LABEL[evento.modulo] ?? evento.modulo}
          </span>
          {abaDestino && onNavegar && (
            <button
              onClick={() => onNavegar(abaDestino)}
              className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Ir para módulo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GrupoDia({ data, eventos, onNavegar }: {
  data: string;
  eventos: EventoHistorico[];
  onNavegar?: (aba: string) => void;
}) {
  const [expandido, setExpandido] = useState(true);

  return (
    <div className="mb-2">
      {/* Cabeçalho do dia */}
      <button
        onClick={() => setExpandido(v => !v)}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
          <span className="text-[12px] font-bold text-slate-600 uppercase tracking-wide">
            {formatarDataCurta(data)}
          </span>
          <span className="text-[11px] text-slate-400">
            {eventos.length} evento{eventos.length !== 1 ? "s" : ""}
          </span>
        </div>
        {expandido
          ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        }
      </button>

      {expandido && (
        <div className="ml-4 pl-4 border-l-2 border-slate-100 space-y-0">
          {eventos.map(e => (
            <CardEvento key={e.id} evento={e} onNavegar={onNavegar} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Historico360({ empresaId, onNavegar, modoCompacto = false }: Props) {
  const [dados, setDados] = useState<HistoricoResult | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<TipoEvento | "todos">("todos");
  const [mostrarSemData, setMostrarSemData] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    setErro(null);
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/historico-360`);
      setDados(res);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar histórico 360");
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  // ── Filtragem ──────────────────────────────────────────────────────────────

  const eventosFiltrados = (dados?.eventos_com_data ?? []).filter(e =>
    filtroTipo === "todos" || e.tipo === filtroTipo
  );

  const eventosSemDataFiltrados = (dados?.eventos_sem_data ?? []).filter(e =>
    filtroTipo === "todos" || e.tipo === filtroTipo
  );

  const gruposDia = agruparPorDia(eventosFiltrados);
  const diasOrdenados = Array.from(gruposDia.keys()).sort((a, b) => b.localeCompare(a));

  // ── Tipos presentes para o filtro ─────────────────────────────────────────

  const tiposPresentes = dados
    ? Array.from(new Set([
        ...(dados.eventos_com_data ?? []).map(e => e.tipo),
        ...(dados.eventos_sem_data ?? []).map(e => e.tipo),
      ]))
    : [];

  // ── Estado inicial (não carregado) ────────────────────────────────────────

  if (!dados && !carregando) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${modoCompacto ? "p-4" : "p-5"}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
              <History className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Linha do Tempo</p>
              <h3 className="text-sm font-black text-slate-900">Histórico 360 do Cliente</h3>
            </div>
          </div>
          <button
            onClick={carregar}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            Carregar histórico
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Consolida eventos de documentos, simulações, contratos, orçamentos, follow-ups, acompanhamentos bancários e atualizações cadastrais em uma linha do tempo unificada.
        </p>
      </div>
    );
  }

  // ── Carregando ────────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-8 flex flex-col items-center gap-3">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        <p className="text-sm text-slate-500">Consolidando histórico 360...</p>
      </div>
    );
  }

  // ── Erro ──────────────────────────────────────────────────────────────────

  if (erro) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">Erro ao carregar histórico</p>
          <p className="text-xs text-red-500 mt-0.5">{erro}</p>
        </div>
        <button onClick={carregar} className="ml-auto text-xs text-red-600 hover:underline">Tentar novamente</button>
      </div>
    );
  }

  if (!dados) return null;

  // ── Renderização principal ────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
              <History className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Linha do Tempo</p>
              <h3 className="text-sm font-black text-slate-900">Histórico 360 do Cliente</h3>
            </div>
          </div>
          <button
            onClick={carregar}
            title="Atualizar"
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {[
            { label: "Total de eventos", valor: dados.total_eventos },
            { label: "Sem data", valor: dados.total_sem_data },
            { label: "Primeiro evento", valor: dados.primeiro_evento ? formatarDataCurta(dados.primeiro_evento) : "—" },
            { label: "Último evento", valor: dados.ultimo_evento ? formatarDataCurta(dados.ultimo_evento) : "—" },
          ].map(m => (
            <div key={m.label} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-medium">{m.label}</p>
              <p className="text-sm font-black text-slate-800 mt-0.5">{m.valor}</p>
            </div>
          ))}
        </div>

        {/* Resumo por tipo */}
        {Object.keys(dados.resumo_por_tipo).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(dados.resumo_por_tipo).map(([tipo, qtd]) => {
              const cfg = CONFIG_TIPO[tipo as TipoEvento] ?? CONFIG_TIPO.nota;
              return (
                <span key={tipo} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.cor} border ${cfg.borda}`}>
                  {cfg.label}: {qtd}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Filtro por tipo */}
      {tiposPresentes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltroTipo("todos")}
            className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${
              filtroTipo === "todos"
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            Todos ({dados.total_eventos})
          </button>
          {tiposPresentes.map(tipo => {
            const cfg = CONFIG_TIPO[tipo] ?? CONFIG_TIPO.nota;
            const qtd = dados.resumo_por_tipo[tipo] ?? 0;
            return (
              <button
                key={tipo}
                onClick={() => setFiltroTipo(tipo)}
                className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-colors ${
                  filtroTipo === tipo
                    ? `${cfg.bg} ${cfg.cor} ${cfg.borda}`
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                {cfg.label} ({qtd})
              </button>
            );
          })}
        </div>
      )}

      {/* Linha do tempo */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
        {eventosFiltrados.length === 0 && eventosSemDataFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <History className="w-10 h-10 text-slate-200" />
            <p className="text-sm text-slate-400">Nenhum evento encontrado para o filtro selecionado.</p>
          </div>
        ) : (
          <div>
            {/* Eventos com data */}
            {diasOrdenados.length > 0 && (
              <div className="space-y-1">
                {diasOrdenados.map(dia => (
                  <GrupoDia
                    key={dia}
                    data={dia}
                    eventos={gruposDia.get(dia)!}
                    onNavegar={onNavegar}
                  />
                ))}
              </div>
            )}

            {/* Eventos sem data */}
            {eventosSemDataFiltrados.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setMostrarSemData(v => !v)}
                  className="flex items-center gap-2 text-[12px] font-bold text-slate-500 hover:text-slate-700 transition-colors mb-2"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  Data não informada ({eventosSemDataFiltrados.length} evento{eventosSemDataFiltrados.length !== 1 ? "s" : ""})
                  {mostrarSemData ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {mostrarSemData && (
                  <div className="ml-4 pl-4 border-l-2 border-amber-100 space-y-0">
                    {eventosSemDataFiltrados.map(e => (
                      <CardEvento key={e.id} evento={e} onNavegar={onNavegar} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <p className="text-[10px] text-slate-400 text-center">
        Histórico consolidado de {dados.total_eventos} evento{dados.total_eventos !== 1 ? "s" : ""} · Calculado em {new Date(dados.calculado_em).toLocaleString("pt-BR")} · Fonte: {dados.fonte}
      </p>
    </div>
  );
}

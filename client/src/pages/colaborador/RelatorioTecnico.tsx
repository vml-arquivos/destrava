/**
 * RelatorioTecnico.tsx
 *
 * Bloco "Relatório Técnico Premium" integrado à aba Inteligência 360.
 * Inclui pré-visualização modal, botões de ação e layout premium.
 *
 * REGRA: ZERO REGRESSÃO — não altera dados, apenas leitura.
 */

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  FileText, RefreshCw, FileDown, Send, MessageCircle,
  Copy, Eye, X, CheckCheck, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, XCircle, Info,
  Building2, Users, BarChart3, ShieldAlert, ShieldCheck,
  ShieldX, Clock, ArrowRight, Star, Zap, BookOpen,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface RelatorioData {
  empresa_id: string;
  gerado_em: string;
  responsavel_analise: string;
  versao: string;
  fonte: string;
  identificacao: {
    razao_social: string;
    nome_fantasia: string;
    cnpj: string;
    situacao_cadastral: string;
    data_abertura: string;
    natureza_juridica: string;
    porte: string;
    regime_tributario: string;
    cnae_principal: string;
    segmento: string;
    capital_social: string;
    numero_funcionarios: string;
    site: string;
  };
  contato: {
    responsavel_nome: string;
    responsavel_cpf: string;
    email: string;
    telefone: string;
    whatsapp: string;
    endereco: string;
    cidade: string;
    estado: string;
    cep: string;
  };
  socios: Array<{
    nome: string;
    cpf: string;
    percentual: string;
    qualificacao: string;
    representante_legal: boolean;
    tem_cpf: boolean;
  }>;
  documentos: Array<{
    tipo: string;
    nome_arquivo: string;
    tem_arquivo: boolean;
    status: string;
    data_upload: string;
    validado: boolean;
  }>;
  analise_credito: {
    score_destrava: number;
    score_interno: string;
    score_serasa: string;
    score_spc: string;
    nivel_risco: string;
    classificacao: string;
    faturamento: string;
    capital_social: string;
    limite_atual: string;
    capacidade_estimada_min: string;
    capacidade_estimada_max: string;
    produto_sugerido: string;
    prazo_sugerido: string;
    valor_sugerido: string;
    parecer: string;
    status_proposta: string;
  };
  analise_documental: {
    total: number;
    com_arquivo: number;
    sem_arquivo: number;
    validados: number;
    pendentes: number;
    percentual_cobertura: number;
    status: string;
    documentos_ausentes: string[];
  };
  analise_cadastral: {
    situacao: string;
    cnpj_valido: boolean;
    tem_socios: boolean;
    socios_com_cpf: number;
    socios_sem_cpf: number;
    tem_responsavel: boolean;
    tem_contato: boolean;
    tem_endereco: boolean;
    status: string;
    observacoes: string[];
  };
  analise_faturamento: {
    faturamento_anual: string;
    capital_social: string;
    limite_atual: string;
    regime_tributario: string;
    numero_funcionarios: string;
    porte: string;
    tem_faturamento: boolean;
    tem_capital: boolean;
    observacoes: string[];
  };
  pendencias: Array<{
    tipo: string;
    descricao: string;
    impacto: string;
    acao_requerida: string;
    prioridade: "critica" | "alta" | "media" | "baixa";
  }>;
  plano_acao: Array<{
    numero: number;
    acao: string;
    modulo: string;
    prazo: string;
    responsavel: string;
  }>;
  recomendacoes: Array<{
    titulo: string;
    descricao: string;
    prioridade: "alta" | "media" | "baixa";
    modulo: string;
  }>;
  simulacoes: Array<{ produto: string; valor: string; prazo: string; status: string }>;
  contratos: Array<{ numero: string; tipo: string; valor: string; status: string; data_assinatura: string }>;
  resumo_executivo: string;
  observacoes_legais: string;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function safeArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return String(v); }
}

// ─── Configs visuais ──────────────────────────────────────────────────────────

const RISCO_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  baixo:   { label: "Baixo",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", Icon: ShieldCheck },
  medio:   { label: "Médio",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     Icon: ShieldAlert },
  alto:    { label: "Alto",    color: "text-orange-700",  bg: "bg-orange-50 border-orange-200",   Icon: ShieldAlert },
  critico: { label: "Crítico", color: "text-red-700",     bg: "bg-red-50 border-red-200",         Icon: ShieldX },
};

const PRIO_CFG: Record<string, { color: string; label: string }> = {
  critica: { color: "bg-red-100 text-red-700 border-red-200",       label: "Crítica" },
  alta:    { color: "bg-orange-100 text-orange-700 border-orange-200", label: "Alta" },
  media:   { color: "bg-amber-100 text-amber-700 border-amber-200",  label: "Média" },
  baixa:   { color: "bg-slate-100 text-slate-600 border-slate-200",  label: "Baixa" },
};

const STATUS_CADASTRAL: Record<string, { color: string; label: string }> = {
  completo:   { color: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "Completo" },
  basico:     { color: "text-blue-700 bg-blue-50 border-blue-200",          label: "Básico" },
  incompleto: { color: "text-amber-700 bg-amber-50 border-amber-200",       label: "Incompleto" },
  critico:    { color: "text-red-700 bg-red-50 border-red-200",             label: "Crítico" },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-slate-800 text-right">{value || "—"}</span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const cor = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : pct >= 30 ? "bg-orange-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-black text-slate-700 w-10 text-right tabular-nums">{score}/100</span>
    </div>
  );
}

function Accordion({ title, icon: Icon, badge, children, defaultOpen = false, badgeColor = "bg-blue-100 text-blue-700" }: {
  title: string; icon: React.ElementType; badge?: number; children: React.ReactNode;
  defaultOpen?: boolean; badgeColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  );
}

// ─── Modal de Pré-visualização ────────────────────────────────────────────────

function ModalPreview({ data, onClose }: { data: RelatorioData; onClose: () => void }) {
  const pendencias = safeArr<any>(data.pendencias);
  const planoAcao = safeArr<any>(data.plano_acao);
  const recomendacoes = safeArr<any>(data.recomendacoes);
  const socios = safeArr<any>(data.socios);
  const documentos = safeArr<any>(data.documentos);
  const simulacoes = safeArr<any>(data.simulacoes);
  const contratos = safeArr<any>(data.contratos);
  const riscoCfg = RISCO_CFG[data.analise_credito?.nivel_risco ?? "medio"] ?? RISCO_CFG.medio;
  const RiscoIcon = riscoCfg.Icon;
  const statusCad = STATUS_CADASTRAL[data.analise_cadastral?.status ?? "incompleto"] ?? STATUS_CADASTRAL.incompleto;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">

        {/* Header do modal */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">Relatório Técnico Premium</h2>
              <p className="text-xs text-slate-500">{data.identificacao?.razao_social} · {fmtDate(data.gerado_em)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* CAPA */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 text-white p-6">
            <p className="text-[11px] font-bold opacity-70 tracking-widest uppercase mb-1">Relatório Técnico Premium</p>
            <h1 className="text-2xl font-black mb-1">{data.identificacao?.razao_social}</h1>
            <p className="text-sm opacity-85">CNPJ: {data.identificacao?.cnpj} · {data.identificacao?.situacao_cadastral}</p>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] opacity-70">Score Destrava</p>
                <p className="text-3xl font-black">{data.analise_credito?.score_destrava}<span className="text-base opacity-60">/100</span></p>
              </div>
              <div>
                <p className="text-[10px] opacity-70">Nível de Risco</p>
                <p className="text-lg font-bold">{(data.analise_credito?.nivel_risco ?? "—").toUpperCase()}</p>
              </div>
              <div>
                <p className="text-[10px] opacity-70">Status</p>
                <p className="text-xs font-semibold opacity-90">{data.analise_credito?.status_proposta}</p>
              </div>
              <div>
                <p className="text-[10px] opacity-70">Gerado em</p>
                <p className="text-xs font-semibold opacity-90">{fmtDate(data.gerado_em)}</p>
              </div>
            </div>
          </div>

          {/* RESUMO EXECUTIVO */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-bold text-slate-800">Resumo Executivo</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{data.resumo_executivo}</p>
          </div>

          {/* IDENTIFICAÇÃO + CONTATO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700">Identificação</h3>
              </div>
              <div className="space-y-0.5">
                <InfoRow label="CNPJ" value={data.identificacao?.cnpj} />
                <InfoRow label="Situação" value={data.identificacao?.situacao_cadastral} />
                <InfoRow label="Abertura" value={data.identificacao?.data_abertura} />
                <InfoRow label="Natureza Jurídica" value={data.identificacao?.natureza_juridica} />
                <InfoRow label="Porte" value={data.identificacao?.porte} />
                <InfoRow label="Regime" value={data.identificacao?.regime_tributario} />
                <InfoRow label="CNAE" value={data.identificacao?.cnae_principal} />
                <InfoRow label="Capital Social" value={data.identificacao?.capital_social} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700">Contato e Endereço</h3>
              </div>
              <div className="space-y-0.5">
                <InfoRow label="Responsável" value={data.contato?.responsavel_nome} />
                <InfoRow label="E-mail" value={data.contato?.email} />
                <InfoRow label="Telefone" value={data.contato?.telefone} />
                <InfoRow label="WhatsApp" value={data.contato?.whatsapp} />
                <InfoRow label="Cidade/UF" value={`${data.contato?.cidade || "—"}${data.contato?.estado && data.contato.estado !== "Não informado" ? ` / ${data.contato.estado}` : ""}`} />
                <InfoRow label="CEP" value={data.contato?.cep} />
              </div>
            </div>
          </div>

          {/* ANÁLISE DE CRÉDITO */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-700">Análise de Crédito</h3>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riscoCfg.bg} ${riscoCfg.color}`}>
                Risco {riscoCfg.label}
              </span>
            </div>
            <ScoreBar score={data.analise_credito?.score_destrava ?? 0} />
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: "Score Interno", value: data.analise_credito?.score_interno },
                { label: "Score Serasa", value: data.analise_credito?.score_serasa },
                { label: "Score SPC", value: data.analise_credito?.score_spc },
                { label: "Faturamento", value: data.analise_credito?.faturamento },
                { label: "Limite Est. Mín.", value: data.analise_credito?.capacidade_estimada_min },
                { label: "Limite Est. Máx.", value: data.analise_credito?.capacidade_estimada_max },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] text-slate-400">{label}</p>
                  <p className="text-xs font-bold text-slate-700">{value || "—"}</p>
                </div>
              ))}
            </div>
            {data.analise_credito?.produto_sugerido && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                <span className="font-bold text-emerald-700">Produto sugerido: </span>
                <span className="text-slate-700">{data.analise_credito.produto_sugerido}</span>
                {data.analise_credito.prazo_sugerido && (
                  <span className="text-slate-500"> · {data.analise_credito.prazo_sugerido}</span>
                )}
              </div>
            )}
          </div>

          {/* SÓCIOS */}
          {socios.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700">Sócios / QSA ({socios.length})</h3>
              </div>
              <div className="space-y-2">
                {socios.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{s.nome}</p>
                      <p className="text-[11px] text-slate-500">{s.cpf} · {s.percentual} · {s.qualificacao}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.tem_cpf ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      {s.representante_legal && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">Rep. Legal</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DOCUMENTOS */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-700">Documentação</h3>
              <span className="text-xs text-slate-500">{data.analise_documental?.com_arquivo}/{data.analise_documental?.total} com arquivo</span>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Cobertura</span>
                <span className="font-bold">{data.analise_documental?.percentual_cobertura ?? 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${(data.analise_documental?.percentual_cobertura ?? 0) >= 80 ? "bg-emerald-500" : (data.analise_documental?.percentual_cobertura ?? 0) >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${data.analise_documental?.percentual_cobertura ?? 0}%` }}
                />
              </div>
            </div>
            {documentos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                {documentos.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                    {d.tem_arquivo ? <CheckCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                    <span className="text-xs text-slate-700 truncate">{d.tipo}</span>
                    {d.validado && <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold shrink-0">✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PENDÊNCIAS */}
          {pendencias.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-700">Pendências ({pendencias.length})</h3>
              </div>
              <div className="space-y-2">
                {pendencias.map((p, i) => {
                  const prio = PRIO_CFG[p.prioridade] ?? PRIO_CFG.baixa;
                  return (
                    <div key={i} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-800">{p.descricao}</p>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${prio.color}`}>{prio.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 flex items-start gap-1">
                        <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />{p.acao_requerida}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PLANO DE AÇÃO */}
          {planoAcao.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700">Plano de Ação</h3>
              </div>
              <ol className="space-y-2">
                {planoAcao.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-5 w-5 rounded-full bg-blue-600 text-white font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">{p.numero}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800">{p.acao}</p>
                      <p className="text-[11px] text-slate-500">{p.modulo} · {p.prazo}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* RECOMENDAÇÕES */}
          {recomendacoes.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-700">Recomendações</h3>
              </div>
              <div className="space-y-2">
                {recomendacoes.map((r, i) => {
                  const prio = PRIO_CFG[r.prioridade] ?? PRIO_CFG.baixa;
                  return (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50">
                      <Zap className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800">{r.titulo}</p>
                        <p className="text-[11px] text-slate-500">{r.descricao}</p>
                      </div>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${prio.color}`}>{prio.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* OBSERVAÇÕES LEGAIS */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-bold text-slate-600">Observações Legais</h3>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">{data.observacoes_legais}</p>
            <p className="text-[10px] text-slate-400 mt-2">
              Relatório gerado em {fmtDate(data.gerado_em)} por {data.responsavel_analise} · Destrava Crédito
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  empresaId: string;
  onNavegar?: (aba: string) => void;
}

export default function RelatorioTecnico({ empresaId, onNavegar }: Props) {
  const [data, setData] = useState<RelatorioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [resumoCopiado, setResumoCopiado] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  const gerarRelatorio = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/relatorio-tecnico`);
      setData(res);
      toast.success("Relatório técnico gerado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar relatório técnico");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  const visualizarRelatorio = useCallback(async () => {
    if (!data) {
      await gerarRelatorio();
    }
    setModalAberto(true);
  }, [data, gerarRelatorio]);

  const baixarPdf = useCallback(async () => {
    if (!empresaId) return;
    setGerandoPdf(true);
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
      const res = await fetch(`/api/empresas/${empresaId}/relatorio-tecnico/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Erro ao gerar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-tecnico-${data?.identificacao?.razao_social?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "empresa"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar PDF");
    } finally {
      setGerandoPdf(false);
    }
  }, [empresaId, data]);

  const copiarResumo = useCallback(() => {
    if (!data?.resumo_executivo) return;
    navigator.clipboard.writeText(data.resumo_executivo).then(() => {
      setResumoCopiado(true);
      toast.success("Resumo executivo copiado!");
      setTimeout(() => setResumoCopiado(false), 3000);
    }).catch(() => toast.error("Não foi possível copiar o resumo"));
  }, [data]);

  const enviarEmail = useCallback(() => {
    toast.info("Envio por e-mail não configurado. Configure o serviço de e-mail (SMTP) nas configurações do sistema para habilitar esta funcionalidade.");
  }, []);

  const enviarWhatsApp = useCallback(() => {
    if (data?.contato?.whatsapp) {
      const tel = data.contato.whatsapp.replace(/\D/g, "");
      const msg = encodeURIComponent(`Olá! Segue o resumo do relatório técnico da empresa ${data.identificacao?.razao_social}:\n\n${data.resumo_executivo}`);
      window.open(`https://wa.me/55${tel}?text=${msg}`, "_blank");
    } else {
      toast.info("WhatsApp não informado no cadastro da empresa. Adicione o número de WhatsApp para usar esta funcionalidade.");
    }
  }, [data]);

  // ── Estado inicial ──
  if (!data && !loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-slate-900">Relatório Técnico Premium</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              Consolida diagnóstico cadastral, documental, societário, financeiro e de crédito em um relatório profissional para clientes, contadores e parceiros bancários.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={gerarRelatorio}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-bold hover:bg-slate-800 active:scale-95 transition-all shadow-md"
              >
                <Zap className="w-4 h-4" />
                Gerar relatório técnico
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Carregando ──
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 flex items-center gap-3 text-slate-700">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm font-semibold">Consolidando dados e gerando relatório técnico...</span>
      </div>
    );
  }

  if (!data) return null;

  const pendencias = safeArr<any>(data.pendencias);
  const criticas = pendencias.filter(p => p.prioridade === "critica");
  const riscoCfg = RISCO_CFG[data.analise_credito?.nivel_risco ?? "medio"] ?? RISCO_CFG.medio;
  const RiscoIcon = riscoCfg.Icon;

  return (
    <>
      {modalAberto && <ModalPreview data={data} onClose={() => setModalAberto(false)} />}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-600 text-white p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-black">Relatório Técnico Premium</h3>
                <p className="text-xs opacity-75 mt-0.5">
                  Gerado em {fmtDate(data.gerado_em)} · Score {data.analise_credito?.score_destrava}/100
                </p>
              </div>
            </div>
            {/* Botões */}
            <div className="flex flex-wrap gap-2">
              <button onClick={visualizarRelatorio} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
                <Eye className="w-3.5 h-3.5" /> Visualizar
              </button>
              <button onClick={baixarPdf} disabled={gerandoPdf} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
                {gerandoPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                {gerandoPdf ? "Gerando..." : "Baixar PDF"}
              </button>
              <button onClick={copiarResumo} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
                {resumoCopiado ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {resumoCopiado ? "Copiado!" : "Copiar resumo"}
              </button>
              <button onClick={enviarEmail} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
                <Send className="w-3.5 h-3.5" /> E-mail
              </button>
              <button onClick={enviarWhatsApp} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-semibold transition-all">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button onClick={gerarRelatorio} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-all">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Recalcular
              </button>
            </div>
          </div>
        </div>

        {/* Resumo rápido */}
        <div className="p-4 space-y-4">
          {/* Chips de status */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${riscoCfg.bg} ${riscoCfg.color}`}>
              <RiscoIcon className="w-3.5 h-3.5" />
              Risco {riscoCfg.label}
            </span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_CADASTRAL[data.analise_cadastral?.status ?? "incompleto"]?.color ?? ""}`}>
              Cadastro: {STATUS_CADASTRAL[data.analise_cadastral?.status ?? "incompleto"]?.label ?? "—"}
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
              Docs: {data.analise_documental?.percentual_cobertura ?? 0}%
            </span>
            {criticas.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-red-50 text-red-700 border-red-200">
                {criticas.length} pendência(s) crítica(s)
              </span>
            )}
          </div>

          {/* Resumo executivo */}
          <p className="text-sm text-slate-700 leading-relaxed">{data.resumo_executivo}</p>

          {/* Métricas rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Score Destrava", value: `${data.analise_credito?.score_destrava}/100`, color: "text-blue-700" },
              { label: "Documentos", value: `${data.analise_documental?.com_arquivo}/${data.analise_documental?.total}`, color: "text-emerald-700" },
              { label: "Sócios", value: String(safeArr(data.socios).length), color: "text-slate-700" },
              { label: "Pendências", value: String(pendencias.length), color: criticas.length > 0 ? "text-red-700" : "text-amber-700" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[11px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={visualizarRelatorio}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-all"
          >
            <Eye className="w-4 h-4" />
            Ver relatório completo
          </button>
        </div>
      </div>
    </>
  );
}

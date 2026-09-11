/**
 * RelatorioTecnico.tsx
 *
 * Bloco "Relatório Técnico Premium" integrado à aba Inteligência 360.
 * Inclui pré-visualização modal, botões de ação e layout premium.
 *
 * REGRA: ZERO REGRESSÃO — não altera dados, apenas leitura.
 */

import { useState, useCallback } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  FileText, RefreshCw, FileDown, Send, MessageCircle,
  Copy, Eye, X, CheckCheck, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, XCircle, Info,
  Building2, Users, BarChart3, ShieldAlert, ShieldCheck,
  ShieldX, Clock, ArrowRight, Star, Zap, BookOpen,
  Paperclip, FileArchive,
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
  baixo:   { label: "Baixo",   color: "text-success", bg: "bg-success/10 border-success/20", Icon: ShieldCheck },
  medio:   { label: "Médio",   color: "text-warning",   bg: "bg-warning/10 border-warning/20",     Icon: ShieldAlert },
  alto:    { label: "Alto",    color: "text-warning",  bg: "bg-warning/10 border-warning/20",   Icon: ShieldAlert },
  critico: { label: "Crítico", color: "text-destructive",     bg: "bg-destructive/10 border-destructive/20",         Icon: ShieldX },
};

const PRIO_CFG: Record<string, { color: string; label: string }> = {
  critica: { color: "bg-destructive/20 text-destructive border-destructive/20",       label: "Crítica" },
  alta:    { color: "bg-warning/20 text-warning border-warning/20", label: "Alta" },
  media:   { color: "bg-warning/20 text-warning border-warning/20",  label: "Média" },
  baixa:   { color: "bg-muted text-muted-foreground border-border",  label: "Baixa" },
};

const STATUS_CADASTRAL: Record<string, { color: string; label: string }> = {
  completo:   { color: "text-success bg-success/10 border-success/20", label: "Completo" },
  basico:     { color: "text-primary bg-primary/10 border-primary/20",          label: "Básico" },
  incompleto: { color: "text-warning bg-warning/10 border-warning/20",       label: "Incompleto" },
  critico:    { color: "text-destructive bg-destructive/10 border-destructive/20",             label: "Crítico" },
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold text-foreground text-right">{value || "—"}</span>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const cor = pct >= 70 ? "bg-success" : pct >= 50 ? "bg-warning" : pct >= 30 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-black text-foreground w-10 text-right tabular-nums">{score}/100</span>
    </div>
  );
}

function Accordion({ title, icon: Icon, badge, children, defaultOpen = false, badgeColor = "bg-primary/20 text-primary" }: {
  title: string; icon: React.ElementType; badge?: number; children: React.ReactNode;
  defaultOpen?: boolean; badgeColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between p-3.5 hover:bg-muted transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-border">{children}</div>}
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
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl">

        {/* Header do modal */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-black text-foreground">Relatório Técnico Premium</h2>
              <p className="text-xs text-muted-foreground">{data.identificacao?.razao_social} · {fmtDate(data.gerado_em)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* CAPA */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-700 to-blue-500 text-primary-foreground p-6">
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
          <div className="rounded-xl border border-primary/20 bg-primary/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Resumo Executivo</h3>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{data.resumo_executivo}</p>
          </div>

          {/* IDENTIFICAÇÃO + CONTATO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">Identificação</h3>
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
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">Contato e Endereço</h3>
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
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">Análise de Crédito</h3>
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
                <div key={label} className="rounded-lg bg-muted p-2.5">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="text-xs font-bold text-foreground">{value || "—"}</p>
                </div>
              ))}
            </div>
            {data.analise_credito?.produto_sugerido && (
              <div className="mt-3 p-3 rounded-lg bg-success/10 border border-success/20 text-xs">
                <span className="font-bold text-success">Produto sugerido: </span>
                <span className="text-foreground">{data.analise_credito.produto_sugerido}</span>
                {data.analise_credito.prazo_sugerido && (
                  <span className="text-muted-foreground"> · {data.analise_credito.prazo_sugerido}</span>
                )}
              </div>
            )}
          </div>

          {/* SÓCIOS */}
          {socios.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">Sócios / QSA ({socios.length})</h3>
              </div>
              <div className="space-y-2">
                {socios.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{s.nome}</p>
                      <p className="text-[11px] text-muted-foreground">{s.cpf} · {s.percentual} · {s.qualificacao}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.tem_cpf ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-destructive" />}
                      {s.representante_legal && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold">Rep. Legal</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DOCUMENTOS */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-bold text-foreground">Documentação</h3>
              <span className="text-xs text-muted-foreground">{data.analise_documental?.com_arquivo}/{data.analise_documental?.total} com arquivo</span>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>Cobertura</span>
                <span className="font-bold">{data.analise_documental?.percentual_cobertura ?? 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${(data.analise_documental?.percentual_cobertura ?? 0) >= 80 ? "bg-success" : (data.analise_documental?.percentual_cobertura ?? 0) >= 50 ? "bg-warning" : "bg-destructive"}`}
                  style={{ width: `${data.analise_documental?.percentual_cobertura ?? 0}%` }}
                />
              </div>
            </div>
            {documentos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto">
                {documentos.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted">
                    {d.tem_arquivo ? <CheckCheck className="w-3.5 h-3.5 text-success shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />}
                    <span className="text-xs text-foreground truncate">{d.tipo}</span>
                    {d.validado && <span className="text-[10px] px-1 py-0.5 rounded bg-success/20 text-success font-bold shrink-0">✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PENDÊNCIAS */}
          {pendencias.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <h3 className="text-sm font-bold text-foreground">Pendências ({pendencias.length})</h3>
              </div>
              <div className="space-y-2">
                {pendencias.map((p, i) => {
                  const prio = PRIO_CFG[p.prioridade] ?? PRIO_CFG.baixa;
                  return (
                    <div key={i} className="p-3 rounded-xl border border-border bg-muted">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">{p.descricao}</p>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${prio.color}`}>{prio.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
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
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">Plano de Ação</h3>
              </div>
              <ol className="space-y-2">
                {planoAcao.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">{p.numero}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">{p.acao}</p>
                      <p className="text-[11px] text-muted-foreground">{p.modulo} · {p.prazo}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* RECOMENDAÇÕES */}
          {recomendacoes.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-bold text-foreground">Recomendações</h3>
              </div>
              <div className="space-y-2">
                {recomendacoes.map((r, i) => {
                  const prio = PRIO_CFG[r.prioridade] ?? PRIO_CFG.baixa;
                  return (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-xl border border-border bg-muted">
                      <Zap className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{r.titulo}</p>
                        <p className="text-[11px] text-muted-foreground">{r.descricao}</p>
                      </div>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${prio.color}`}>{prio.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* OBSERVAÇÕES LEGAIS */}
          <div className="rounded-xl border border-border bg-muted p-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-bold text-muted-foreground">Observações Legais</h3>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{data.observacoes_legais}</p>
            <p className="text-[10px] text-muted-foreground mt-2">
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
  const [gerandoPdfComAnexos, setGerandoPdfComAnexos] = useState(false);
  const [gerandoZip, setGerandoZip] = useState(false);
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
      const { blob, filename } = await apiFetchBlob(`/api/empresas/${empresaId}/relatorio-tecnico/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `relatorio-tecnico-${data?.identificacao?.razao_social?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "empresa"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar PDF");
    } finally {
      setGerandoPdf(false);
    }
  }, [empresaId, data]);

  // Ficha completa "com anexos, no mesmo PDF": mescla os arquivos reais do
  // Acervo Documental (CNPJ, contrato social, CND etc.) como páginas do mesmo
  // arquivo -- não é só uma lista dizendo que o documento existe.
  const baixarPdfComAnexos = useCallback(async () => {
    if (!empresaId) return;
    setGerandoPdfComAnexos(true);
    try {
      const { blob, filename } = await apiFetchBlob(`/api/empresas/${empresaId}/relatorio-tecnico/pdf?anexos=1`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `ficha-completa-${data?.identificacao?.razao_social?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "empresa"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Ficha completa com anexos gerada com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar ficha com anexos");
    } finally {
      setGerandoPdfComAnexos(false);
    }
  }, [empresaId, data]);

  // Pacote ZIP: a ficha em PDF + cada arquivo do Acervo Documental no formato
  // original (útil quando o formato original importa, ex: planilha, imagem em
  // alta resolução) em vez de só embutido como página do PDF.
  const baixarZipCompleto = useCallback(async () => {
    if (!empresaId) return;
    setGerandoZip(true);
    try {
      const { blob, filename } = await apiFetchBlob(`/api/empresas/${empresaId}/relatorio-tecnico/zip`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `ficha-completa-${data?.identificacao?.razao_social?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "empresa"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("ZIP com ficha e arquivos gerado com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar ZIP da ficha completa");
    } finally {
      setGerandoZip(false);
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
      <div className="rounded-2xl border border-border bg-gradient-to-br from-muted to-primary/10 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-black text-foreground">Relatório Técnico Premium</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Consolida diagnóstico cadastral, documental, societário, financeiro e de crédito em um relatório profissional para clientes, contadores e parceiros bancários.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={gerarRelatorio}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-brand-navy active:scale-95 transition-all shadow-md"
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
      <div className="rounded-2xl border border-border bg-muted p-6 flex items-center gap-3 text-foreground">
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

      <div className="rounded-2xl border border-border bg-card overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-600 text-primary-foreground p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-card/20 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5 text-primary-foreground" />
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
              <button onClick={visualizarRelatorio} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
                <Eye className="w-3.5 h-3.5" /> Visualizar
              </button>
              <button onClick={baixarPdf} disabled={gerandoPdf} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
                {gerandoPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                {gerandoPdf ? "Gerando..." : "Baixar PDF"}
              </button>
              <button onClick={baixarPdfComAnexos} disabled={gerandoPdfComAnexos} title="Ficha completa com todos os documentos do Acervo Documental já mesclados nas páginas do mesmo PDF" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
                {gerandoPdfComAnexos ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                {gerandoPdfComAnexos ? "Gerando..." : "Ficha + anexos (PDF único)"}
              </button>
              <button onClick={baixarZipCompleto} disabled={gerandoZip} title="Ficha em PDF + todos os arquivos originais do Acervo Documental, dentro de um ZIP" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
                {gerandoZip ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />}
                {gerandoZip ? "Gerando..." : "Ficha + arquivos (ZIP)"}
              </button>
              <button onClick={copiarResumo} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
                {resumoCopiado ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {resumoCopiado ? "Copiado!" : "Copiar resumo"}
              </button>
              <button onClick={enviarEmail} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
                <Send className="w-3.5 h-3.5" /> E-mail
              </button>
              <button onClick={enviarWhatsApp} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/20 hover:bg-card/30 text-xs font-semibold transition-all">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </button>
              <button onClick={gerarRelatorio} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card/10 hover:bg-card/20 text-xs font-semibold transition-all">
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
            <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-primary/10 text-primary border-primary/20">
              Docs: {data.analise_documental?.percentual_cobertura ?? 0}%
            </span>
            {criticas.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full border bg-destructive/10 text-destructive border-destructive/20">
                {criticas.length} pendência(s) crítica(s)
              </span>
            )}
          </div>

          {/* Resumo executivo */}
          <p className="text-sm text-foreground leading-relaxed">{data.resumo_executivo}</p>

          {/* Métricas rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Score Destrava", value: `${data.analise_credito?.score_destrava}/100`, color: "text-primary" },
              { label: "Documentos", value: `${data.analise_documental?.com_arquivo}/${data.analise_documental?.total}`, color: "text-success" },
              { label: "Sócios", value: String(safeArr(data.socios).length), color: "text-foreground" },
              { label: "Pendências", value: String(pendencias.length), color: criticas.length > 0 ? "text-destructive" : "text-warning" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl border border-border bg-muted p-3 text-center">
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={visualizarRelatorio}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-muted hover:bg-muted text-sm font-semibold text-foreground transition-all"
          >
            <Eye className="w-4 h-4" />
            Ver relatório completo
          </button>
        </div>
      </div>
    </>
  );
}

import { useEffect, useState, useCallback } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  BrainCircuit, Search, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, ChevronRight, Sparkles, Building2, ClipboardList,
  TrendingUp, FileWarning, Loader2, ChevronDown, ChevronUp,
  BadgeAlert, ShieldCheck, ShieldAlert, ShieldX, ArrowRight,
  Zap, FileText, Users,
} from "lucide-react";

interface EmpresaAssessoria {
  id: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  situacao_cadastral?: string;
  score_interno?: number;
  risco_classificacao?: string;
  ultima_analise_ia?: string | null;
  pendencias_count?: number;
  alertas_criticos?: number;
  status_assessoria?: "apto" | "pendente" | "inapto" | "em_analise" | "nao_analisado";
}

interface AnaliseIA {
  empresa_id: string;
  status: string;
  score_cnpj: number;
  risco_cnpj: string;
  alertas: Alerta[];
  pontos_positivos: string[];
  pontos_atencao: string[];
  pontos_impeditivos: string[];
  recomendacoes: string[];
  diagnostico?: string | null;
  divergencias: Divergencia[];
  criado_em: string;
}

interface Alerta {
  codigo: string;
  mensagem: string;
  severidade: "critica" | "alta" | "media" | "baixa";
  recomendacao?: string;
}

interface Divergencia {
  campo: string;
  label: string;
  valor_receita?: string;
  valor_cartao?: string;
  severidade: string;
}

const RISCO_CONFIG: Record<string, { label: string; cor: string; icone: React.ElementType; bg: string }> = {
  baixo:   { label: "Baixo risco",   cor: "text-success", bg: "bg-success/10 border-success/20", icone: ShieldCheck },
  medio:   { label: "Risco médio",   cor: "text-warning",   bg: "bg-warning/10 border-warning/20",     icone: ShieldAlert },
  alto:    { label: "Risco alto",    cor: "text-warning",  bg: "bg-warning/10 border-warning/20",   icone: ShieldAlert },
  critico: { label: "Risco crítico", cor: "text-destructive",     bg: "bg-destructive/10 border-destructive/20",         icone: ShieldX },
  nao_calculado: { label: "Não calculado", cor: "text-muted-foreground", bg: "bg-muted border-border", icone: ShieldAlert },
};

const SEV_CONFIG: Record<string, { cor: string; label: string }> = {
  critica: { cor: "text-destructive bg-destructive/10 border-destructive/20",       label: "Crítico" },
  alta:    { cor: "text-warning bg-warning/10 border-warning/20", label: "Alto" },
  media:   { cor: "text-warning bg-warning/10 border-warning/20",  label: "Médio" },
  baixa:   { cor: "text-muted-foreground bg-muted border-border",  label: "Baixo" },
};

function ScoreBar({ score }: { score: number }) {
  const cor = score >= 70 ? "bg-success" : score >= 50 ? "bg-warning" : score >= 30 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <span className="text-xs font-black text-foreground w-8 text-right">{score}</span>
    </div>
  );
}

export default function AssessoriaIA() {
  const [empresas, setEmpresas] = useState<EmpresaAssessoria[]>([]);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<EmpresaAssessoria | null>(null);
  const [analise, setAnalise] = useState<AnaliseIA | null>(null);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [analisando, setAnalisando] = useState(false);
  const [secaoAberta, setSecaoAberta] = useState<string>("alertas");

  const carregarEmpresas = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const data = await apiFetch(`/api/empresas?limite=200${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`);
      setEmpresas(Array.isArray(data?.items || data) ? (data?.items || data) : []);
    } catch {
      toast.error("Erro ao carregar empresas");
    } finally {
      setCarregandoLista(false);
    }
  }, [busca]);

  useEffect(() => { void carregarEmpresas(); }, [carregarEmpresas]);

  async function abrirEmpresa(emp: EmpresaAssessoria) {
    setSelecionada(emp);
    setAnalise(null);
    try {
      const data = await apiFetch(`/api/documentacao/empresa/${emp.id}/analise-cnpj`);
      if (data?.score_cnpj !== undefined) setAnalise(data);
    } catch { /* sem análise prévia */ }
  }

  async function rodarAnalise() {
    if (!selecionada) return;
    setAnalisando(true);
    setAnalise(null);
    try {
      const data = await apiFetch(`/api/documentacao/empresa/${selecionada.id}/analise-cnpj`, { method: "POST" });
      setAnalise(data);
      toast.success("Análise IA concluída com sucesso!");
      await carregarEmpresas();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao executar análise IA");
    } finally {
      setAnalisando(false);
    }
  }

  const risco = RISCO_CONFIG[analise?.risco_cnpj || "nao_calculado"] || RISCO_CONFIG.nao_calculado;
  const RiscoIcon = risco.icone;

  const alertasCriticos = (analise?.alertas || []).filter(a => a.severidade === "critica" || a.severidade === "alta");
  const alertasMedia    = (analise?.alertas || []).filter(a => a.severidade === "media");
  const alertasBaixa    = (analise?.alertas || []).filter(a => a.severidade === "baixa");

  return (
    <Layout title="Assessoria Inteligente">
      <div className="flex h-full min-h-0 overflow-hidden">

        {/* ── Lista de empresas ──────────────────────────────────────────────── */}
        <aside className="w-72 shrink-0 border-r border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 mb-2">
              <BrainCircuit className="h-5 w-5 text-success" />
              <span className="text-sm font-black text-foreground">Assessoria IA</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar empresa..."
                className="w-full pl-8 pr-3 h-9 rounded-xl border border-border bg-muted text-xs outline-none focus:border-success/30 focus:ring-1 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {carregandoLista ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : empresas.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Nenhuma empresa encontrada</div>
            ) : empresas.map(emp => {
              const isAtiva = selecionada?.id === emp.id;
              const riscoConf = RISCO_CONFIG[emp.risco_classificacao || "nao_calculado"];
              const RIcon = riscoConf?.icone || ShieldAlert;
              return (
                <button
                  key={emp.id}
                  onClick={() => abrirEmpresa(emp)}
                  className={`w-full text-left p-3 transition-all hover:bg-muted ${isAtiva ? "bg-success/10 border-l-2 border-success/30" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{emp.razao_social || emp.nome_fantasia || emp.cnpj}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{emp.cnpj}</p>
                    </div>
                    <RIcon className={`h-4 w-4 shrink-0 ${riscoConf?.cor || "text-muted-foreground"}`} />
                  </div>
                  {emp.score_interno !== undefined && (
                    <div className="mt-2">
                      <ScoreBar score={emp.score_interno || 0} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── Painel de análise ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-muted">
          {!selecionada ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <div className="h-16 w-16 rounded-3xl bg-success/20 flex items-center justify-center">
                <BrainCircuit className="h-8 w-8 text-success" />
              </div>
              <div>
                <h2 className="text-lg font-black text-foreground">Central de Assessoria Inteligente</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Selecione uma empresa para executar a análise IA completa: divergências do CNPJ, inconsistências documentais, impedimentos bancários e plano de ação para elegibilidade ao crédito.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 w-full max-w-lg">
                {[
                  { icon: ClipboardList, label: "Análise de CNPJ", desc: "Receita vs Cartão CNPJ" },
                  { icon: FileWarning,  label: "Inconsistências", desc: "Divergências identificadas" },
                  { icon: TrendingUp,  label: "Plano de Ação",   desc: "Passos para aptidão" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="rounded-2xl border border-border bg-card p-3 text-center">
                    <Icon className="h-6 w-6 text-success mx-auto mb-1.5" />
                    <div className="text-xs font-bold text-foreground">{label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4 max-w-4xl">

              {/* ── Header da empresa ── */}
              <div className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-success/20 flex items-center justify-center font-black text-success text-base">
                    {(selecionada.razao_social || "?").charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-base font-black text-foreground">{selecionada.razao_social || selecionada.nome_fantasia}</h2>
                    <p className="text-xs text-muted-foreground">{selecionada.cnpj}</p>
                  </div>
                </div>
                <button
                  onClick={rodarAnalise}
                  disabled={analisando}
                  className="inline-flex items-center gap-2 rounded-2xl bg-success px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-success disabled:opacity-60 shadow-sm shadow-emerald-100"
                >
                  {analisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {analisando ? "Analisando..." : analise ? "Reanalisar com IA" : "Analisar com IA"}
                </button>
              </div>

              {analisando && (
                <div className="rounded-2xl border border-success/20 bg-success/10 p-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-success mx-auto mb-2" />
                  <p className="text-sm font-bold text-success">Analisando empresa com Inteligência Artificial...</p>
                  <p className="text-xs text-success mt-1">Comparando Receita Federal, Cartão CNPJ, documentos e sócios</p>
                </div>
              )}

              {analise && !analisando && (
                <>
                  {/* ── Score + Risco ── */}
                  <div className={`rounded-2xl border p-4 ${risco.bg}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <RiscoIcon className={`h-8 w-8 ${risco.cor}`} />
                        <div>
                          <div className={`text-lg font-black ${risco.cor}`}>{risco.label}</div>
                          <div className="text-xs text-muted-foreground">Diagnóstico IA — {new Date(analise.criado_em).toLocaleDateString("pt-BR")}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-3xl font-black ${risco.cor}`}>{analise.score_cnpj}<span className="text-base font-bold">/100</span></div>
                        <div className="text-xs text-muted-foreground">Score Destrava</div>
                      </div>
                    </div>
                    {analise.diagnostico && (
                      <p className="mt-3 text-sm text-foreground leading-relaxed border-t border-border pt-3">{analise.diagnostico}</p>
                    )}
                  </div>

                  {/* ── Cards de resumo ── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Impedimentos", valor: (Array.isArray(analise.pontos_impeditivos) ? analise.pontos_impeditivos : []).length, cor: "text-destructive", bg: "bg-destructive/10", icon: XCircle },
                      { label: "Alertas críticos", valor: alertasCriticos.length, cor: "text-warning", bg: "bg-warning/10", icon: AlertTriangle },
                      { label: "Atenções", valor: alertasMedia.length + alertasBaixa.length, cor: "text-warning", bg: "bg-warning/10", icon: BadgeAlert },
                      { label: "Pontos positivos", valor: (Array.isArray(analise.pontos_positivos) ? analise.pontos_positivos : []).length, cor: "text-success", bg: "bg-success/10", icon: CheckCircle2 },
                    ].map(({ label, valor, cor, bg, icon: Icon }) => (
                      <div key={label} className={`rounded-2xl border border-border ${bg} p-3 text-center`}>
                        <Icon className={`h-6 w-6 mx-auto mb-1 ${cor}`} />
                        <div className={`text-2xl font-black ${cor}`}>{valor}</div>
                        <div className="text-[10px] text-muted-foreground font-semibold">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── Seções colapsáveis ── */}
                  {[
                    {
                      id: "impeditivos",
                      titulo: "Impedimentos para crédito",
                      icon: XCircle,
                      corIcon: "text-destructive",
                      hidden: (Array.isArray(analise.pontos_impeditivos) ? analise.pontos_impeditivos : []).length === 0,
                      conteudo: (
                        <ul className="space-y-2">
                          {(Array.isArray(analise.pontos_impeditivos) ? analise.pontos_impeditivos : []).map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-destructive">
                              <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      ),
                    },
                    {
                      id: "alertas",
                      titulo: `Alertas identificados (${(Array.isArray(analise.alertas) ? analise.alertas : []).length})`,
                      icon: AlertTriangle,
                      corIcon: "text-warning",
                      hidden: (Array.isArray(analise.alertas) ? analise.alertas : []).length === 0,
                      conteudo: (
                        <div className="space-y-2">
                          {(Array.isArray(analise.alertas) ? analise.alertas : []).map((a, i) => {
                            const sev = SEV_CONFIG[a.severidade] || SEV_CONFIG.baixa;
                            return (
                              <div key={i} className={`rounded-xl border p-3 ${sev.cor}`}>
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs font-bold">{a.mensagem}</p>
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${sev.cor} shrink-0`}>{sev.label}</span>
                                </div>
                                {a.recomendacao && (
                                  <p className="text-[11px] mt-1.5 opacity-75 flex items-start gap-1">
                                    <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                                    {a.recomendacao}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ),
                    },
                    {
                      id: "divergencias",
                      titulo: `Divergências CNPJ vs Cartão (${(Array.isArray(analise.divergencias) ? analise.divergencias : []).length})`,
                      icon: FileWarning,
                      corIcon: "text-warning",
                      hidden: (Array.isArray(analise.divergencias) ? analise.divergencias : []).length === 0,
                      conteudo: (
                        <div className="space-y-2">
                          {(Array.isArray(analise.divergencias) ? analise.divergencias : []).map((d, i) => (
                            <div key={i} className="rounded-xl border border-warning/20 bg-warning/10 p-3">
                              <p className="text-xs font-bold text-warning">{d.label}</p>
                              <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                                <div className="rounded-lg bg-card border border-warning/20 p-2">
                                  <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Receita Federal</div>
                                  <div className="text-foreground font-semibold">{d.valor_receita || "—"}</div>
                                </div>
                                <div className="rounded-lg bg-card border border-warning/20 p-2">
                                  <div className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Cartão CNPJ</div>
                                  <div className="text-foreground font-semibold">{d.valor_cartao || "—"}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ),
                    },
                    {
                      id: "plano",
                      titulo: "Plano de ação para aptidão",
                      icon: TrendingUp,
                      corIcon: "text-primary",
                      hidden: (Array.isArray(analise.recomendacoes) ? analise.recomendacoes : []).length === 0,
                      conteudo: (
                        <ol className="space-y-2">
                          {(Array.isArray(analise.recomendacoes) ? analise.recomendacoes : []).map((r, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                              <span className="h-5 w-5 rounded-full bg-primary/20 text-primary font-black text-[11px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                              {r}
                            </li>
                          ))}
                        </ol>
                      ),
                    },
                    {
                      id: "positivos",
                      titulo: `Pontos positivos (${(Array.isArray(analise.pontos_positivos) ? analise.pontos_positivos : []).length})`,
                      icon: CheckCircle2,
                      corIcon: "text-success",
                      hidden: (Array.isArray(analise.pontos_positivos) ? analise.pontos_positivos : []).length === 0,
                      conteudo: (
                        <ul className="space-y-2">
                          {(Array.isArray(analise.pontos_positivos) ? analise.pontos_positivos : []).map((p, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-success">
                              <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      ),
                    },
                  ]
                    .filter(s => !s.hidden)
                    .map(secao => {
                      const Icon = secao.icon;
                      const open = secaoAberta === secao.id;
                      return (
                        <div key={secao.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                          <button
                            onClick={() => setSecaoAberta(open ? "" : secao.id)}
                            className="w-full flex items-center justify-between p-4 hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${secao.corIcon}`} />
                              <span className="text-sm font-bold text-foreground">{secao.titulo}</span>
                            </div>
                            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </button>
                          {open && <div className="px-4 pb-4">{secao.conteudo}</div>}
                        </div>
                      );
                    })}
                </>
              )}

              {!analise && !analisando && (
                <div className="rounded-2xl border-2 border-dashed border-border bg-card p-10 text-center">
                  <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-bold text-foreground">Nenhuma análise disponível</p>
                  <p className="text-xs text-muted-foreground mt-1">Clique em "Analisar com IA" para gerar o diagnóstico completo desta empresa.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

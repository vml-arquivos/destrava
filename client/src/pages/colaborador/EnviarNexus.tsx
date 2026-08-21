/**
 * EnviarNexus.tsx
 *
 * Componente de integração Nexus/n8n para envio de pendências como tarefas.
 *
 * Sprint 8 — Hardening:
 * - O frontend envia APENAS { confirmed: true, pendenciaId }.
 * - O backend busca a empresa real, recalcula as pendências e monta o payload oficial.
 * - cnpj, razão social, título, descrição e categoria NÃO são mais enviados pelo frontend.
 * - ZERO REGRESSÃO — não altera dados existentes.
 */

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import {
  Zap, AlertTriangle, CheckCircle2, XCircle, Loader2,
  ExternalLink, Send, ShieldAlert, Info, RefreshCw,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PendenciaNexus {
  pendenciaId: string;
  prioridade: "alta" | "media" | "baixa";
  categoria: string;
  titulo: string;
  descricao: string;
  moduloOrigem: string;
  acaoRecomendada: string;
}

interface ConfiguracaoNexus {
  nexusConfigurado: boolean;
  n8nConfigurado: boolean;
  algumConfigurado: boolean;
  destino: "nexus" | "n8n" | "nenhum";
  mensagemStatus: string;
}

interface ResultadoEnvio {
  sucesso: boolean;
  destino: "nexus" | "n8n" | null;
  idempotencyKey: string;
  jaEnviado: boolean;
  mensagem: string;
  detalhe?: string;
  timestamp: string;
}

interface Props {
  empresaId: string;
  /** cnpj e razaoSocial não são mais usados no payload (Sprint 8 hardening). */
  cnpj?: string | null;
  razaoSocial?: string;
  pendencias: PendenciaNexus[];
  /** Callback chamado após envio bem-sucedido */
  onEnviado?: (pendenciaId: string, resultado: ResultadoEnvio) => void;
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const PRIORIDADE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alta:  { label: "Alta",  color: "text-destructive",   bg: "bg-destructive/10 border-destructive/20" },
  media: { label: "Média", color: "text-warning", bg: "bg-warning/10 border-warning/20" },
  baixa: { label: "Baixa", color: "text-muted-foreground", bg: "bg-muted border-border" },
};

// Sprint 8: idempotencyKey gerada server-side. Função mantida apenas para compatibilidade.
function gerarIdempotencyKey(_empresaId: string, _pendenciaId: string): string {
  return "";
}

// ─── Sub-componente: Status da integração ─────────────────────────────────────

function StatusIntegracao({ config }: { config: ConfiguracaoNexus | null }) {
  if (!config) return null;

  if (!config.algumConfigurado) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-warning">Integração não configurada</p>
          <p className="text-xs text-warning mt-0.5">{config.mensagemStatus}</p>
        </div>
      </div>
    );
  }

  const destinoLabel = config.destino === "nexus" ? "Nexus" : "n8n";
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-success/10 border border-success/20">
      <div className="w-2 h-2 rounded-full bg-success shrink-0" />
      <p className="text-xs font-semibold text-success">
        Integração {destinoLabel} ativa e pronta para uso
      </p>
    </div>
  );
}

// ─── Sub-componente: Modal de confirmação ────────────────────────────────────

interface ModalConfirmacaoProps {
  pendencia: PendenciaNexus;
  razaoSocial?: string;
  destino: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  enviando: boolean;
}

function ModalConfirmacao({
  pendencia, razaoSocial = "Empresa", destino, onConfirmar, onCancelar, enviando,
}: ModalConfirmacaoProps) {
  const priorCfg = PRIORIDADE_CFG[pendencia.prioridade] ?? PRIORIDADE_CFG.media;
  const destinoLabel = destino === "nexus" ? "Nexus" : destino === "n8n" ? "n8n" : "Nexus/n8n";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Zap className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground">Criar tarefa no {destinoLabel}</h3>
            <p className="text-xs text-muted-foreground">Confirme antes de enviar</p>
          </div>
        </div>

        {/* Corpo */}
        <div className="p-4 space-y-3">
          {/* Aviso de confirmação */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-primary">
              Esta ação criará uma tarefa no <strong>{destinoLabel}</strong> para a equipe resolver
              a pendência abaixo. A tarefa não será duplicada se já tiver sido enviada hoje.
            </p>
          </div>

          {/* Dados da tarefa */}
          <div className="rounded-xl border border-border bg-muted p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Empresa</span>
              <span className="text-xs font-semibold text-foreground text-right">{razaoSocial}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Tarefa</span>
              <span className="text-xs font-semibold text-foreground text-right">{pendencia.titulo}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Categoria</span>
              <span className="text-xs font-semibold text-foreground text-right capitalize">{pendencia.categoria}</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Prioridade</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${priorCfg.bg} ${priorCfg.color}`}>
                {priorCfg.label}
              </span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Ação</span>
              <span className="text-xs font-semibold text-foreground text-right">{pendencia.acaoRecomendada}</span>
            </div>
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-2 p-4 pt-0">
          <button
            onClick={onCancelar}
            disabled={enviando}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-foreground bg-muted hover:bg-muted rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={enviando}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary rounded-xl transition-colors disabled:opacity-50"
          >
            {enviando ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Confirmar e Enviar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EnviarNexus({ empresaId, pendencias, onEnviado }: Props) {
  const [config, setConfig] = useState<ConfiguracaoNexus | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [pendenciaSelecionada, setPendenciaSelecionada] = useState<PendenciaNexus | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<Record<string, ResultadoEnvio>>({});
  const [expandido, setExpandido] = useState(false);

  // Carregar status da integração
  const carregarConfig = useCallback(async () => {
    if (!empresaId) return;
    setLoadingConfig(true);
    try {
      const res = await apiFetch(`/api/empresas/${empresaId}/pendencias/nexus-status`);
      setConfig(res);
    } catch {
      setConfig({
        nexusConfigurado: false,
        n8nConfigurado: false,
        algumConfigurado: false,
        destino: "nenhum",
        mensagemStatus: "Não foi possível verificar a configuração da integração.",
      });
    } finally {
      setLoadingConfig(false);
    }
  }, [empresaId]);

  useEffect(() => { void carregarConfig(); }, [carregarConfig]);

  // Enviar pendência confirmada
  const confirmarEnvio = async () => {
    if (!pendenciaSelecionada || !config?.algumConfigurado) return;

    setEnviando(true);
    try {
      // Sprint 8: enviar apenas confirmed + pendenciaId.
      // O backend busca a empresa real e monta o payload oficial.
      const resultado: ResultadoEnvio = await apiFetch(
        `/api/empresas/${empresaId}/pendencias/enviar-nexus`,
        {
          method: "POST",
          body: JSON.stringify({
            confirmed: true,
            pendenciaId: pendenciaSelecionada.pendenciaId,
          }),
        }
      );

      setResultados(prev => ({
        ...prev,
        [pendenciaSelecionada.pendenciaId]: resultado,
      }));

      onEnviado?.(pendenciaSelecionada.pendenciaId, resultado);
    } catch (err: any) {
      setResultados(prev => ({
        ...prev,
        [pendenciaSelecionada!.pendenciaId]: {
          sucesso: false,
          destino: null,
          idempotencyKey: "",
          jaEnviado: false,
          mensagem: err?.message || "Erro ao enviar tarefa. Tente novamente.",
          timestamp: new Date().toISOString(),
        },
      }));
    } finally {
      setEnviando(false);
      setPendenciaSelecionada(null);
    }
  };

  // Filtrar apenas pendências de alta prioridade por padrão
  const pendenciasAlta = pendencias.filter(p => p.prioridade === "alta");
  const pendenciasMedia = pendencias.filter(p => p.prioridade === "media");
  const pendenciasVisiveis = expandido
    ? pendencias
    : [...pendenciasAlta, ...pendenciasMedia].slice(0, 5);

  if (loadingConfig) {
    return (
      <div className="flex items-center gap-2 p-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-xs">Verificando integração Nexus...</span>
      </div>
    );
  }

  if (!pendencias || pendencias.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <p className="text-xs font-semibold text-success">
          Nenhuma pendência identificada para envio ao Nexus.
        </p>
      </div>
    );
  }

  const destinoLabel = config?.destino === "n8n" ? "n8n" : "Nexus";

  return (
    <>
      {/* Modal de confirmação */}
      {pendenciaSelecionada && (
        <ModalConfirmacao
          pendencia={pendenciaSelecionada}
          destino={config?.destino || "nexus"}
          onConfirmar={confirmarEnvio}
          onCancelar={() => setPendenciaSelecionada(null)}
          enviando={enviando}
        />
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Criar Tarefas no {destinoLabel}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {pendencias.length} pendência{pendencias.length !== 1 ? "s" : ""} disponível{pendencias.length !== 1 ? "is" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={carregarConfig}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="Verificar status da integração"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Status da integração */}
          <StatusIntegracao config={config} />

          {/* Lista de pendências */}
          {config?.algumConfigurado && (
            <div className="space-y-2">
              {pendenciasVisiveis.map((p) => {
                const priorCfg = PRIORIDADE_CFG[p.prioridade] ?? PRIORIDADE_CFG.media;
                const resultado = resultados[p.pendenciaId];

                return (
                  <div
                    key={p.pendenciaId}
                    className={`rounded-xl border p-3 transition-colors ${
                      resultado?.sucesso
                        ? "bg-success/10 border-success/20"
                        : resultado && !resultado.sucesso
                        ? "bg-destructive/10 border-destructive/20"
                        : "bg-card border-border hover:border-input"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${priorCfg.bg} ${priorCfg.color}`}>
                            {priorCfg.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize">{p.categoria}</span>
                        </div>
                        <p className="text-xs font-semibold text-foreground leading-tight">{p.titulo}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.descricao}</p>

                        {/* Resultado do envio */}
                        {resultado && (
                          <div className={`flex items-start gap-1.5 mt-2 ${resultado.sucesso ? "text-success" : "text-destructive"}`}>
                            {resultado.sucesso ? (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            )}
                            <p className="text-[11px] font-semibold leading-tight">
                              {resultado.jaEnviado ? "Já enviado anteriormente" : resultado.mensagem}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Botão de envio */}
                      <div className="shrink-0">
                        {resultado?.sucesso || resultado?.jaEnviado ? (
                          <div className="flex items-center gap-1 text-success">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-[10px] font-bold">Enviado</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => setPendenciaSelecionada(p)}
                            disabled={!config.algumConfigurado || enviando}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Send className="w-3 h-3" />
                            {destinoLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Expandir / recolher */}
              {pendencias.length > 5 && (
                <button
                  onClick={() => setExpandido(e => !e)}
                  className="w-full text-xs font-semibold text-primary hover:text-primary py-1.5 text-center transition-colors"
                >
                  {expandido
                    ? "Mostrar menos"
                    : `Ver mais ${pendencias.length - 5} pendência${pendencias.length - 5 !== 1 ? "s" : ""}`}
                </button>
              )}
            </div>
          )}

          {/* Aviso de não configurado com instrução */}
          {!config?.algumConfigurado && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted border border-border">
              <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">Como configurar a integração</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Adicione <code className="bg-slate-200 px-1 rounded text-[10px]">NEXUS_WEBHOOK_URL</code> ou{" "}
                  <code className="bg-slate-200 px-1 rounded text-[10px]">N8N_WEBHOOK_URL</code> nas variáveis
                  de ambiente do servidor Destrava. Opcionalmente, adicione{" "}
                  <code className="bg-slate-200 px-1 rounded text-[10px]">NEXUS_API_TOKEN</code> para
                  autenticação segura.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useState, useEffect } from "react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import {
  Zap, CheckCircle, XCircle, AlertCircle, Play, Settings,
  Copy, ExternalLink, Loader2, RefreshCw, Info, ChevronDown, ChevronUp
} from "lucide-react";

interface N8nStatus {
  configured: boolean;
  webhookUrl: string | null;
  eventos: string[];
}

const EVENTOS_INFO = {
  novo_lead: {
    label: "Novo Lead",
    descricao: "Disparado quando um visitante preenche o formulário de captura no simulador.",
    campos: ["evento", "timestamp", "id", "nome", "telefone", "empresa", "email", "produto", "valorSolicitado", "prazo", "origem"],
    cor: "blue",
  },
  nova_simulacao: {
    label: "Nova Simulação",
    descricao: "Disparado quando uma simulação de crédito é concluída.",
    campos: ["evento", "timestamp", "id", "nome", "telefone", "empresa", "email", "produto", "valorSolicitado", "prazo", "parcelaMensal", "custoTotal"],
    cor: "green",
  },
  novo_contato: {
    label: "Novo Contato",
    descricao: "Disparado quando alguém envia uma mensagem pelo formulário de contato.",
    campos: ["evento", "timestamp", "id", "nome", "email", "telefone", "assunto", "mensagem"],
    cor: "purple",
  },
};

const PAYLOAD_EXEMPLO = {
  novo_lead: {
    evento: "novo_lead",
    timestamp: "2025-01-15T10:30:00.000Z",
    id: "1736937000000-abc123",
    nome: "João Silva",
    telefone: "(61) 9 9999-9999",
    empresa: "Empresa Ltda",
    email: "joao@empresa.com",
    produto: "PRONAMPE",
    valorSolicitado: 150000,
    prazo: 48,
    origem: "simulador",
  },
  nova_simulacao: {
    evento: "nova_simulacao",
    timestamp: "2025-01-15T10:35:00.000Z",
    id: "1736937300000-def456",
    nome: "João Silva",
    telefone: "(61) 9 9999-9999",
    empresa: "Empresa Ltda",
    email: "joao@empresa.com",
    produto: "PRONAMPE",
    valorSolicitado: 150000,
    prazo: 48,
    parcelaMensal: 3850.00,
    custoTotal: 184800.00,
    criadoEm: "2025-01-15T10:35:00.000Z",
  },
  novo_contato: {
    evento: "novo_contato",
    timestamp: "2025-01-15T11:00:00.000Z",
    id: "1736939000000-ghi789",
    nome: "Maria Santos",
    email: "maria@email.com",
    telefone: "(11) 9 8888-7777",
    assunto: "Dúvida sobre PRONAMPE",
    mensagem: "Gostaria de saber mais sobre os requisitos...",
    criadoEm: "2025-01-15T11:00:00.000Z",
  },
};

export default function Integracoes() {
  const [status, setStatus] = useState<N8nStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ success: boolean; message: string } | null>(null);
  const [sincronizandoChatwoot, setSincronizandoChatwoot] = useState(false);
  const [resultadoSyncChatwoot, setResultadoSyncChatwoot] = useState<{
    ok: boolean;
    conversas_lidas: number;
    conversas_atualizadas: number;
    conversas_sem_mapeamento_de_agente: number;
    conversas_sem_lead_vinculado: number;
    paginas_percorridas: number;
  } | null>(null);
  const [eventoAberto, setEventoAberto] = useState<string | null>("novo_lead");
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => { carregarStatus(); }, []);

  async function carregarStatus() {
    setLoading(true);
    try {
      const data = await apiFetch("/api/n8n/status");
      setStatus(data);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  async function testarWebhook() {
    setTestando(true);
    setResultadoTeste(null);
    try {
      const data = await apiFetch("/api/n8n/test", { method: "POST" });
      setResultadoTeste(data);
    } catch {
      setResultadoTeste({ success: false, message: "Erro de conexão ao testar webhook." });
    }
    setTestando(false);
  }

  async function sincronizarChatwoot() {
    setSincronizandoChatwoot(true);
    setResultadoSyncChatwoot(null);
    try {
      const data = await apiFetch("/api/chatwoot/sincronizar", {
        method: "POST",
        body: JSON.stringify({
          status: "all",
          assignee_type: "assigned",
          max_paginas: 10,
        }),
      });
      setResultadoSyncChatwoot(data);
    } catch {
      setResultadoSyncChatwoot({
        ok: false,
        conversas_lidas: 0,
        conversas_atualizadas: 0,
        conversas_sem_mapeamento_de_agente: 0,
        conversas_sem_lead_vinculado: 0,
        paginas_percorridas: 0,
      });
    }
    setSincronizandoChatwoot(false);
  }

  function copiar(texto: string, chave: string) {
    navigator.clipboard.writeText(texto);
    setCopiado(chave);
    setTimeout(() => setCopiado(null), 2000);
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-6 h-6 text-warning" />
            Integrações — n8n Webhook
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure automações para receber notificações de novos leads e simulações em tempo real.
          </p>
        </div>

        {/* Status Card */}
        <div className={`rounded-xl border-2 p-5 ${
          loading ? "border-border bg-muted" :
          status?.configured ? "border-success/20 bg-success/10" : "border-warning/20 bg-warning/10"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {loading ? (
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              ) : status?.configured ? (
                <CheckCircle className="w-6 h-6 text-success" />
              ) : (
                <AlertCircle className="w-6 h-6 text-warning" />
              )}
              <div>
                <p className="font-semibold text-foreground">
                  {loading ? "Verificando..." : status?.configured ? "n8n Conectado" : "n8n Não Configurado"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {loading ? "Aguarde..." :
                   status?.configured ? "Webhook ativo — eventos serão enviados automaticamente" :
                   "Configure a variável N8N_WEBHOOK_URL no Coolify para ativar"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <button
                onClick={carregarStatus}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-card rounded-lg transition-colors"
                title="Atualizar status"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={sincronizarChatwoot}
                disabled={sincronizandoChatwoot}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary disabled:opacity-50"
              >
                {sincronizandoChatwoot ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sincronizar Chatwoot
              </button>
              {status?.configured && (
                <button
                  onClick={testarWebhook}
                  disabled={testando}
                  className="flex items-center gap-2 px-4 py-2 bg-success text-primary-foreground rounded-lg text-sm font-medium hover:bg-success disabled:opacity-50"
                >
                  {testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Testar Webhook
                </button>
              )}
            </div>
          </div>

          {resultadoTeste && (
            <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
              resultadoTeste.success ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
            }`}>
              {resultadoTeste.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <span className="text-sm">{resultadoTeste.message}</span>
            </div>
          )}

          {resultadoSyncChatwoot && (
            <div className={`mt-4 rounded-lg border p-4 ${
              resultadoSyncChatwoot.ok ? "border-primary/20 bg-primary/10 text-primary" : "border-destructive/20 bg-destructive/10 text-destructive"
            }`}>
              <p className="text-sm font-semibold">
                {resultadoSyncChatwoot.ok ? "Sincronização do Chatwoot concluída." : "Falha ao sincronizar o Chatwoot."}
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-card/70 p-3 border border-current/10">
                  <p className="text-xs uppercase tracking-wide opacity-70">Conversas lidas</p>
                  <p className="text-lg font-bold">{resultadoSyncChatwoot.conversas_lidas}</p>
                </div>
                <div className="rounded-lg bg-card/70 p-3 border border-current/10">
                  <p className="text-xs uppercase tracking-wide opacity-70">Conversas atualizadas</p>
                  <p className="text-lg font-bold">{resultadoSyncChatwoot.conversas_atualizadas}</p>
                </div>
                <div className="rounded-lg bg-card/70 p-3 border border-current/10">
                  <p className="text-xs uppercase tracking-wide opacity-70">Sem mapeamento de agente</p>
                  <p className="text-lg font-bold">{resultadoSyncChatwoot.conversas_sem_mapeamento_de_agente}</p>
                </div>
                <div className="rounded-lg bg-card/70 p-3 border border-current/10">
                  <p className="text-xs uppercase tracking-wide opacity-70">Sem lead vinculado</p>
                  <p className="text-lg font-bold">{resultadoSyncChatwoot.conversas_sem_lead_vinculado}</p>
                </div>
              </div>
              <p className="mt-3 text-xs opacity-80">
                Páginas percorridas: <strong>{resultadoSyncChatwoot.paginas_percorridas}</strong>. Antes de executar em produção, confirme que os colaboradores possuem <code>chatwoot_agente_id</code> preenchido.
              </p>
            </div>
          )}
        </div>

        {/* Como Configurar */}
        {!status?.configured && !loading && (
          <div className="bg-card rounded-xl border p-5 space-y-4">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Como Configurar
            </h2>

            <div className="space-y-4">
              {[
                {
                  num: "1",
                  titulo: "Crie um Workflow no n8n",
                  desc: "No seu n8n, crie um novo workflow e adicione o nó 'Webhook'. Copie a URL gerada pelo nó.",
                },
                {
                  num: "2",
                  titulo: "Configure no Coolify",
                  desc: 'Acesse o painel do Coolify → Aplicação Destrava Crédito → Variáveis de Ambiente. Adicione:',
                  codigo: "N8N_WEBHOOK_URL=https://seu-n8n.com/webhook/destrava",
                },
                {
                  num: "3",
                  titulo: "Faça o Redeploy",
                  desc: "Após salvar a variável, clique em 'Redeploy' no Coolify para aplicar as mudanças.",
                },
                {
                  num: "4",
                  titulo: "Teste a Integração",
                  desc: "Volte aqui e clique em 'Testar Webhook' para confirmar que está funcionando.",
                },
              ].map(step => (
                <div key={step.num} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {step.num}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{step.titulo}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{step.desc}</p>
                    {step.codigo && (
                      <div className="mt-2 flex items-center gap-2">
                        <code className="flex-1 bg-brand-navy text-success text-xs px-3 py-2 rounded-lg font-mono">
                          {step.codigo}
                        </code>
                        <button
                          onClick={() => copiar(step.codigo!, `step-${step.num}`)}
                          className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg"
                        >
                          {copiado === `step-${step.num}` ? <CheckCircle className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Eventos Disponíveis */}
        <div className="bg-card rounded-xl border p-5 space-y-3">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-warning" />
            Eventos Disponíveis
          </h2>
          <p className="text-sm text-muted-foreground">
            Todos os eventos abaixo são enviados automaticamente para o seu webhook n8n.
          </p>

          <div className="space-y-3">
            {Object.entries(EVENTOS_INFO).map(([chave, info]) => (
              <div key={chave} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setEventoAberto(eventoAberto === chave ? null : chave)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${
                      info.cor === "blue" ? "bg-primary" :
                      info.cor === "green" ? "bg-success" : "bg-primary/100"
                    }`} />
                    <div>
                      <p className="font-medium text-foreground">{info.label}</p>
                      <p className="text-xs text-muted-foreground">{info.descricao}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground font-mono">{chave}</code>
                    {eventoAberto === chave ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {eventoAberto === chave && (
                  <div className="border-t p-4 bg-muted">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Exemplo de Payload JSON</p>
                      <button
                        onClick={() => copiar(JSON.stringify(PAYLOAD_EXEMPLO[chave as keyof typeof PAYLOAD_EXEMPLO], null, 2), chave)}
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {copiado === chave ? <CheckCircle className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                        {copiado === chave ? "Copiado!" : "Copiar"}
                      </button>
                    </div>
                    <pre className="bg-brand-navy text-success text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">
                      {JSON.stringify(PAYLOAD_EXEMPLO[chave as keyof typeof PAYLOAD_EXEMPLO], null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Painel Nexus/n8n — Inteligência 360 */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Nexus/n8n — Tarefas de Pendências (Inteligência 360)</h2>
              <p className="text-xs text-muted-foreground">Integração para criar tarefas no Nexus ou n8n a partir de pendências críticas da empresa</p>
            </div>
          </div>

          {/* Status das variáveis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label: "NEXUS_WEBHOOK_URL",
                descricao: "URL do webhook do Nexus (prioridade)",
                status: "Configure no servidor para ativar",
                cor: "amber",
              },
              {
                label: "NEXUS_API_TOKEN",
                descricao: "Token Bearer para autenticar no Nexus",
                status: "Opcional — recomendado para produção",
                cor: "slate",
              },
              {
                label: "N8N_WEBHOOK_URL",
                descricao: "Fallback: n8n recebe se Nexus não estiver configurado",
                status: status?.configured ? "Configurada" : "Não configurada",
                cor: status?.configured ? "emerald" : "slate",
              },
            ].map(v => (
              <div key={v.label} className={`rounded-xl border p-3 ${
                v.cor === "emerald" ? "bg-success/10 border-success/20" :
                v.cor === "amber" ? "bg-warning/10 border-warning/20" :
                "bg-muted border-border"
              }`}>
                <code className={`text-[11px] font-bold block mb-1 ${
                  v.cor === "emerald" ? "text-success" :
                  v.cor === "amber" ? "text-warning" :
                  "text-muted-foreground"
                }`}>{v.label}</code>
                <p className="text-[11px] text-muted-foreground">{v.descricao}</p>
                <p className={`text-[11px] font-semibold mt-1 ${
                  v.cor === "emerald" ? "text-success" :
                  v.cor === "amber" ? "text-warning" :
                  "text-muted-foreground"
                }`}>{v.status}</p>
              </div>
            ))}
          </div>

          {/* Como funciona */}
          <div className="rounded-xl bg-muted border border-border p-4 space-y-2">
            <p className="text-xs font-bold text-foreground">Como funciona</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>1. Na aba <strong>Inteligência 360</strong> de qualquer empresa, o usuário visualiza as pendências críticas calculadas em tempo real.</p>
              <p>2. Ao clicar em <strong>"Criar tarefa no Nexus"</strong>, um modal de confirmação exibe os detalhes da pendência.</p>
              <p>3. Após confirmar, o backend busca os dados reais da empresa, recalcula as pendências e monta o payload oficial.</p>
              <p>4. O payload é enviado para <code className="bg-border px-1 rounded">NEXUS_WEBHOOK_URL</code> (ou <code className="bg-border px-1 rounded">N8N_WEBHOOK_URL</code> como fallback).</p>
              <p>5. A tarefa é registrada com <strong>idempotência dupla</strong> (memória + banco) para evitar duplicatas.</p>
            </div>
          </div>

          {/* Payload de exemplo */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Exemplo de Payload enviado ao Nexus/n8n</p>
              <button
                onClick={() => copiar(JSON.stringify({
                  evento: "tarefa_nexus",
                  timestamp: new Date().toISOString(),
                  empresaId: "123",
                  cnpj: "12345678000195",
                  razaoSocial: "Empresa Exemplo Ltda",
                  pendenciaId: "doc_contrato_social",
                  prioridade: "alta",
                  categoria: "documental",
                  titulo: "Contrato Social não enviado",
                  descricao: "O Contrato Social é obrigatório para análise de crédito.",
                  moduloOrigem: "inteligencia_360",
                  acaoRecomendada: "Solicitar Contrato Social ao cliente",
                  idempotencyKey: "destrava_123_doc_contrato_social_2026-07-10",
                  _meta: { versao: "v2", fonte: "destrava_credito", sprint: "8" },
                }, null, 2), "nexus-payload")}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {copiado === "nexus-payload" ? <CheckCircle className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copiado === "nexus-payload" ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <pre className="bg-brand-navy text-success text-xs p-4 rounded-lg overflow-x-auto font-mono leading-relaxed">{JSON.stringify({
              evento: "tarefa_nexus",
              timestamp: "2026-07-10T10:30:00.000Z",
              empresaId: "123",
              cnpj: "12345678000195",
              razaoSocial: "Empresa Exemplo Ltda",
              pendenciaId: "doc_contrato_social",
              prioridade: "alta",
              categoria: "documental",
              titulo: "Contrato Social não enviado",
              descricao: "O Contrato Social é obrigatório para análise de crédito.",
              moduloOrigem: "inteligencia_360",
              acaoRecomendada: "Solicitar Contrato Social ao cliente",
              idempotencyKey: "destrava_123_doc_contrato_social_2026-07-10",
              _meta: { versao: "v2", fonte: "destrava_credito", sprint: "8" },
            }, null, 2)}</pre>
          </div>
        </div>

        {/* Dicas de uso no n8n */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
          <h3 className="font-bold text-primary flex items-center gap-2 mb-3">
            <Info className="w-5 h-5" />
            Dicas de Automação com n8n
          </h3>
          <div className="space-y-2 text-sm text-primary">
            <p>• <strong>WhatsApp:</strong> Use o nó Evolution API ou Chatwoot para enviar mensagem automática ao lead</p>
            <p>• <strong>Planilha:</strong> Use o nó Google Sheets para registrar todos os leads em uma planilha</p>
            <p>• <strong>E-mail:</strong> Use o nó Gmail/SMTP para enviar e-mail de boas-vindas ao cliente</p>
            <p>• <strong>Filtro por evento:</strong> Use o nó Switch para tratar cada tipo de evento diferente</p>
            <p>• <strong>CRM externo:</strong> Conecte ao HubSpot, Pipedrive ou qualquer CRM via HTTP Request</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
